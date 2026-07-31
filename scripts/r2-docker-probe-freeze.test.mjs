import { deepStrictEqual, match, strictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { helpText, parseArgs } from "../apps/eden/src/args.ts";
import {
  canonicalDockerDiagnosticProbeActionBytes,
  dockerDiagnosticProbeActionDigest,
  dockerDiagnosticProbeProgramIdentity,
} from "../packages/coding-runtime/src/index.ts";
import {
  decodeActionEnvelope,
  decodeDockerDiagnosticProbeAction,
  decodeDockerDiagnosticProbeCommand,
  decodeDockerDiagnosticProbeEvent,
  decodeProductCommand,
  decodeProductEvent,
} from "../packages/contracts/src/index.ts";
import {
  dockerDiagnosticProbeActionDigestFixture,
  dockerDiagnosticProbeActionFixture,
  dockerDiagnosticProbeApprovalCommandFixture,
  dockerDiagnosticProbeApprovalRequiredFixture,
} from "../packages/contracts/test/docker-diagnostic-probe-fixture.ts";

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return keys;
  }
  if (typeof value !== "object" || value === null) return keys;
  for (const [key, nested] of Object.entries(value)) {
    keys.add(key);
    collectKeys(nested, keys);
  }
  return keys;
}

test("accepted standalone Docker probe action fits its frozen canonical budget", () => {
  const bytes = canonicalDockerDiagnosticProbeActionBytes(dockerDiagnosticProbeActionFixture);

  strictEqual(bytes.byteLength, 2_477);
  strictEqual(bytes.byteLength <= 16_384, true);
  strictEqual(
    dockerDiagnosticProbeActionDigest(dockerDiagnosticProbeActionFixture),
    dockerDiagnosticProbeActionDigestFixture,
  );
  deepStrictEqual(dockerDiagnosticProbeProgramIdentity, {
    byteLength: 3_865,
    programId: "eden-docker-diagnostic-probe-v1",
    sha256: "sha256:21a3f9fa698cc1ee547ecf503a64c3d9ced43d89d5fcc501620eb90f1060a19d",
  });
});

test("accepted standalone contracts stay outside run-bound product unions", () => {
  strictEqual(decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture).ok, true);
  strictEqual(
    decodeDockerDiagnosticProbeCommand(dockerDiagnosticProbeApprovalCommandFixture).ok,
    true,
  );
  strictEqual(
    decodeDockerDiagnosticProbeEvent(dockerDiagnosticProbeApprovalRequiredFixture).ok,
    true,
  );
  strictEqual(decodeActionEnvelope(dockerDiagnosticProbeActionFixture).ok, false);
  strictEqual(decodeProductCommand(dockerDiagnosticProbeApprovalCommandFixture).ok, false);
  strictEqual(decodeProductEvent(dockerDiagnosticProbeApprovalRequiredFixture).ok, false);
});

test("accepted CLI grammar exposes only explicit preview forms", async () => {
  deepStrictEqual(await parseArgs(["doctor", "--probe-docker"]), {
    ok: true,
    value: { format: "plain", mode: "doctor-probe" },
  });
  deepStrictEqual(await parseArgs(["doctor", "--probe-docker", "--json"]), {
    ok: true,
    value: { format: "json", mode: "doctor-probe" },
  });
  deepStrictEqual(await parseArgs(["doctor", "--probe-docker", "--context", "eden-fresh-userns"]), {
    ok: true,
    value: {
      dockerContext: "eden-fresh-userns",
      format: "plain",
      mode: "doctor-probe",
    },
  });
  deepStrictEqual(
    await parseArgs(["doctor", "--probe-docker", "--context", "eden-fresh-userns", "--json"]),
    {
      ok: true,
      value: {
        dockerContext: "eden-fresh-userns",
        format: "json",
        mode: "doctor-probe",
      },
    },
  );
  for (const argv of [
    ["doctor", "--json", "--probe-docker"],
    ["doctor", "--probe-docker", "--probe-docker"],
    ["doctor", "--probe-docker", "--yes"],
    ["doctor", "--probe-docker", "--context", "unix:///tmp/docker.sock"],
    ["doctor", "--probe-docker", "--json", "--context", "default"],
    ["doctor", "--probe-docker", "--host", "unix:///tmp/docker.sock"],
  ]) {
    strictEqual((await parseArgs(argv)).ok, false);
  }
  match(helpText, /doctor --probe-docker \[--context <safe-name>\] \[--json\]/u);
});

test("accepted action contains no synthetic run, repository, provider, or broader authority", () => {
  const keys = collectKeys(dockerDiagnosticProbeActionFixture);
  for (const forbidden of [
    "runId",
    "workspace",
    "catalog",
    "repositorySnapshot",
    "staging",
    "provider",
    "credential",
    "mounts",
    "shell",
    "dockerCommand",
  ]) {
    strictEqual(keys.has(forbidden), false);
  }
  deepStrictEqual(dockerDiagnosticProbeActionFixture.scope, {
    capability: "docker.diagnostic.probe",
    paths: "none",
    repository: "none",
  });
  strictEqual(dockerDiagnosticProbeActionFixture.authority.network, "none");
  strictEqual(dockerDiagnosticProbeActionFixture.authority.remediation, "none");
});

test("visible checkpoint records the accepted boundary and passing real probe", () => {
  const amendment = readFileSync(
    new URL(
      "../docs/research/2026-07-31-r2-docker-diagnostic-probe-freeze-amendment.md",
      import.meta.url,
    ),
    "utf8",
  );
  const evidence = JSON.parse(
    readFileSync(
      new URL(
        "../docs/benchmark-results/2026-07-31-r2-docker-probe-freeze-amendment.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const cliDispatcher = readFileSync(new URL("../apps/eden/src/index.ts", import.meta.url), "utf8");

  match(amendment, /Status: Accepted; owner approved 2026-07-31/u);
  match(amendment, /Build status: Slice 4 complete/u);
  match(cliDispatcher, /parsed\.value\.mode === "doctor-probe"/u);
  match(cliDispatcher, /new DockerCliDoctorPort/u);
  match(cliDispatcher, /new DockerCliDiagnosticProbePort/u);
  match(cliDispatcher, /runDockerDiagnosticProbe\(parsed\.value/u);
  strictEqual(cliDispatcher.match(/dockerContext: parsed\.value\.dockerContext/gu)?.length, 2);
  strictEqual(evidence.status, "slice4-complete-real-probe-passed-with-exact-object-recovery");
  deepStrictEqual(evidence.canonicalFixture, {
    encodedBytes: 2_477,
    independentEncoder: true,
    maximumBytes: 16_384,
    sha256: dockerDiagnosticProbeActionDigestFixture,
  });
  strictEqual(
    evidence.authority.dockerExecution,
    "one-create-one-start-passed-receipted-and-cleaned",
  );
  strictEqual(
    evidence.authority.probeContractBuild,
    "deterministic-runner-recovery-named-context-classic-store-and-closed-environment-complete",
  );
  strictEqual(
    evidence.currentProductionBoundary.dockerRunner,
    "deterministic-and-real-probe-passed",
  );
  strictEqual(evidence.currentProductionBoundary.crashRecoveryExecutor, "deterministic-complete");
  strictEqual(
    evidence.matchingSurfaceAttempt.status,
    "failed-closed-after-create-before-start-environment-inspection-mismatch",
  );
  strictEqual(evidence.matchingSurfaceAttempt.dockerDiagnosticProbeCommandCount, 2);
  strictEqual(evidence.matchingSurfaceAttempt.containerCreateCount, 1);
  strictEqual(evidence.matchingSurfaceAttempt.containerStartCount, 0);
  strictEqual(evidence.passingProbe.status, "passed");
  strictEqual(evidence.passingProbe.recovery.sameContainerRecovered, true);
  strictEqual(evidence.passingProbe.recovery.additionalApprovalConsumed, false);
  strictEqual(evidence.passingProbe.recovery.duplicateCreate, false);
  strictEqual(evidence.passingProbe.cleanup.receiptBeforeCleanup, true);
  strictEqual(evidence.passingProbe.cleanup.containerCountAfter, 0);
  deepStrictEqual(evidence.amendment.closedEnvironment, {
    additionalValues: "blocked",
    comparison: "exact-unique-set-order-independent",
    hostEnvironmentInheritance: false,
    values: [
      "HOME=/tmp",
      "LANG=C.UTF-8",
      "PATH=/usr/local/bin:/usr/bin:/bin",
      "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
    ],
  });
  strictEqual(evidence.authority.credential, "temporary-ghcr-read-use-complete-and-removed");
  strictEqual(evidence.authority.commit, "not-run");
  strictEqual(evidence.authority.push, "not-run");
});

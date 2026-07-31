import { deepStrictEqual, throws } from "node:assert";
import { test } from "node:test";

import {
  dockerRepositoryCheckEvidenceConstants,
  validateDockerRepositoryCheckEvidence,
} from "./r2-docker-repository-check-evidence.mjs";

const hash = `sha256:${"a".repeat(64)}`;

function scenario(name, outcome, character) {
  return {
    actionDigest: character.repeat(64),
    approvalConsumed: true,
    catalogSha256: hash,
    cleanup: "complete",
    containerId: character.repeat(64),
    dockerObjectsAfter: 0,
    duplicateExecutions: 0,
    edit:
      name === "initial-fail"
        ? { performed: false }
        : {
            afterSha256: `sha256:${character.repeat(64)}`,
            beforeSha256: hash,
            performed: true,
            reviewOutcome: "completed",
          },
    fixtureHead: "b".repeat(40),
    independentOracle: {
      exitCode: outcome === "passed" ? 0 : 1,
      outcome,
      stderrSha256: hash,
      stdoutSha256: hash,
    },
    journalSha256: hash,
    lifecycle: [...dockerRepositoryCheckEvidenceConstants.lifecycle],
    localRawOutputVisible: true,
    manifestDigest: `sha256:${character.repeat(64)}`,
    modelCalls: 2,
    providerCalls: 0,
    rawOutputWithheld: true,
    receiptBeforeCleanup: true,
    resultOutcome: outcome,
    secretCanaryAbsent: true,
    status: "passed",
    terminalOutcome: "completed",
    transcriptSha256: hash,
  };
}

const valid = {
  archive: {
    applicationHash: hash,
    harnessHash: hash,
    noticesHash: hash,
    ripgrepHash: hash,
    sourceTreeRequiredAtRuntime: false,
  },
  authority: {
    credential: "non-secret-fixture-only",
    credentialValueCaptured: false,
    externalNetwork: "not_requested",
    provider: "deterministic-local-fixture",
    verifierSuccessClaimed: false,
  },
  backend: {
    architecture: "amd64",
    cgroupNamespace: true,
    clientApiVersion: "1.51",
    clientVersion: "28.3.3",
    contextEndpointSha256: hash,
    contextName: "fixture-context",
    daemonApiVersion: "1.55",
    daemonVersion: "29.6.2",
    osType: "linux",
    seccomp: true,
    userNamespace: true,
  },
  evidenceVersion: 1,
  fixture: {
    dependencyInstall: "not-run",
    network: "none",
    secretCanaryTracked: false,
    sourceTreeSha256: hash,
  },
  rows: Object.fromEntries(
    dockerRepositoryCheckEvidenceConstants.requiredRows.map((row) => [row, "passed"]),
  ),
  scenarios: {
    "correct-pass": scenario("correct-pass", "passed", "c"),
    "initial-fail": scenario("initial-fail", "failed", "d"),
    "wrong-fail": scenario("wrong-fail", "failed", "e"),
  },
  sourceSha: "f".repeat(40),
  status: "passed",
  toolchain: {
    indexDigest: dockerRepositoryCheckEvidenceConstants.image.indexDigest,
    platformManifestDigest: dockerRepositoryCheckEvidenceConstants.image.linuxAmd64ManifestDigest,
    pullPolicy: "never",
  },
};

test("Docker repository-check evidence accepts one complete closed Ubuntu candidate", () => {
  deepStrictEqual(validateDockerRepositoryCheckEvidence(valid, valid.sourceSha), valid);
});

test("Docker repository-check evidence rejects every required adversarial omission or overclaim", () => {
  for (const invalid of [
    { ...valid, rows: { ...valid.rows, approval: undefined } },
    { ...valid, sourceSha: "0".repeat(40) },
    { ...valid, backend: { ...valid.backend, userNamespace: false } },
    { ...valid, toolchain: { ...valid.toolchain, indexDigest: hash } },
    { ...valid, authority: { ...valid.authority, credentialValueCaptured: true } },
    { ...valid, authority: { ...valid.authority, verifierSuccessClaimed: true } },
    {
      ...valid,
      scenarios: {
        ...valid.scenarios,
        "initial-fail": { ...valid.scenarios["initial-fail"], cleanup: "not-run" },
      },
    },
    {
      ...valid,
      scenarios: {
        ...valid.scenarios,
        "correct-pass": { ...valid.scenarios["correct-pass"], secretCanaryAbsent: false },
      },
    },
  ]) {
    throws(() => validateDockerRepositoryCheckEvidence(invalid, valid.sourceSha));
  }
});

test("Docker repository-check evidence rejects open nested records", () => {
  throws(() =>
    validateDockerRepositoryCheckEvidence(
      { ...valid, backend: { ...valid.backend, rawEndpoint: "unix:///var/run/docker.sock" } },
      valid.sourceSha,
    ),
  );
});

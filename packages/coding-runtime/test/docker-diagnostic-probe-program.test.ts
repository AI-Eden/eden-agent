import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { dockerDiagnosticProbeReceiptFixture } from "../../contracts/test/docker-diagnostic-probe-fixture.ts";
import {
  decodeDockerDiagnosticProbeContainerInspection,
  decodeDockerDiagnosticProbeProgramOutput,
  dockerDiagnosticProbeProgramIdentity,
  dockerDiagnosticProbeProgramSource,
} from "../src/index.ts";

const validProgramOutput =
  '{"protocolVersion":1,"observations":[{"check":"process_user","gid":65532,"status":"passed","uid":65532},{"check":"user_namespace","mapping":"remapped","status":"passed"},{"check":"capabilities","effectiveMask":"0000000000000000","status":"passed"},{"check":"no_new_privileges","enabled":true,"status":"passed"},{"check":"seccomp","mode":"filter","status":"passed"},{"access":"read_only","check":"root_filesystem","status":"passed"},{"check":"temporary_filesystem","filesystem":"tmpfs","nodev":true,"noexec":true,"nosuid":true,"sizeBytes":1048576,"status":"passed","writable":true},{"check":"resource_limits","cpuPeriodMicros":100000,"cpuQuotaMicros":50000,"fileDescriptors":64,"memoryBytes":67108864,"memorySwapBytes":67108864,"pids":16,"status":"passed"}]}';

test("fixed dependency-free program stays bounded and decodes one closed nine-row result", () => {
  strictEqual(dockerDiagnosticProbeProgramIdentity.programId, "eden-docker-diagnostic-probe-v1");
  strictEqual(dockerDiagnosticProbeProgramIdentity.byteLength, 3_865);
  strictEqual(
    dockerDiagnosticProbeProgramIdentity.sha256,
    "sha256:21a3f9fa698cc1ee547ecf503a64c3d9ced43d89d5fcc501620eb90f1060a19d",
  );
  for (const forbidden of ["child_process", "exec(", "spawn(", "fetch(", "http:", "https:"]) {
    strictEqual(dockerDiagnosticProbeProgramSource.includes(forbidden), false);
  }

  const decoded = decodeDockerDiagnosticProbeProgramOutput(
    new TextEncoder().encode(validProgramOutput),
  );
  strictEqual(decoded.ok, true);
  if (!decoded.ok) return;
  strictEqual(decoded.observations.length, 9);
  deepStrictEqual(decoded.observations[8], {
    byteLength: 757,
    check: "result_protocol",
    protocolVersion: 1,
    sha256: "sha256:e4d6e6bc90c81e362235e2725628fce100cf0e5c54f94fe4655c461bfce219c3",
    status: "passed",
  });
});

test("program output parser fails closed on malformed, reordered, raw, and over-budget values", () => {
  const valid = JSON.parse(validProgramOutput);
  const invalid = [
    new Uint8Array(),
    new TextEncoder().encode("{"),
    new TextEncoder().encode(JSON.stringify({ ...valid, rawProc: "hidden" })),
    new TextEncoder().encode(
      JSON.stringify({ ...valid, observations: [...valid.observations].reverse() }),
    ),
    new TextEncoder().encode(
      JSON.stringify({
        ...valid,
        observations: [{ ...valid.observations[0], raw: "/proc/self/status" }],
      }),
    ),
    new Uint8Array(4_097).fill(0x20),
    Uint8Array.from([0xff]),
  ];
  for (const bytes of invalid)
    strictEqual(decodeDockerDiagnosticProbeProgramOutput(bytes).ok, false);
});

test("scripted Docker inspection parser accepts only the exact labelled containment profile", () => {
  const inspection = {
    Config: {
      Entrypoint: ["/nodejs/bin/node"],
      Env: [
        "LANG=C.UTF-8",
        "PATH=/usr/local/bin:/usr/bin:/bin",
        "HOME=/tmp",
        "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
      ],
      Labels: {
        "eden.action-id": dockerDiagnosticProbeReceiptFixture.labels.actionId,
        "eden.config-digest": dockerDiagnosticProbeReceiptFixture.labels.configDigest,
        "eden.effect-id": dockerDiagnosticProbeReceiptFixture.labels.effectId,
        "eden.image-index-digest": dockerDiagnosticProbeReceiptFixture.labels.imageIndexDigest,
        "eden.platform-manifest-digest":
          dockerDiagnosticProbeReceiptFixture.labels.platformManifestDigest,
        "eden.probe-id": dockerDiagnosticProbeReceiptFixture.labels.probeId,
        "eden.profile-revision": dockerDiagnosticProbeReceiptFixture.labels.profileRevision,
        "eden.schema": dockerDiagnosticProbeReceiptFixture.labels.schema,
      },
      User: "65532:65532",
      WorkingDir: "/tmp",
    },
    HostConfig: {
      AutoRemove: false,
      CapDrop: ["ALL"],
      CpuPeriod: 100_000,
      CpuQuota: 50_000,
      IpcMode: "private",
      Memory: 67_108_864,
      MemorySwap: 67_108_864,
      NetworkMode: "none",
      PidMode: "",
      PidsLimit: 16,
      Privileged: false,
      ReadonlyRootfs: true,
      RestartPolicy: { Name: "no" },
      SecurityOpt: ["no-new-privileges"],
      Tmpfs: { "/tmp": "rw,noexec,nosuid,nodev,size=1048576" },
      UTSMode: "",
      Ulimits: [{ Hard: 64, Name: "nofile", Soft: 64 }],
      UsernsMode: "",
    },
    Id: dockerDiagnosticProbeReceiptFixture.container.id,
    Name: `/${dockerDiagnosticProbeReceiptFixture.container.name}`,
    State: { ExitCode: 0, OOMKilled: false, Running: false, Status: "exited" },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(inspection));

  const decoded = decodeDockerDiagnosticProbeContainerInspection(
    bytes,
    dockerDiagnosticProbeReceiptFixture.labels,
  );
  strictEqual(decoded.ok, true);
  if (!decoded.ok) return;
  strictEqual(decoded.value.name, dockerDiagnosticProbeReceiptFixture.container.name);
  strictEqual(decoded.value.state, "exited");

  for (const changed of [
    { ...inspection, Shell: "/bin/sh" },
    {
      ...inspection,
      HostConfig: { ...inspection.HostConfig, NetworkMode: "bridge" },
    },
    {
      ...inspection,
      Config: {
        ...inspection.Config,
        Labels: { ...inspection.Config.Labels, "eden.effect-id": "other" },
      },
    },
    {
      ...inspection,
      HostConfig: { ...inspection.HostConfig, Memory: 134_217_728 },
    },
    {
      ...inspection,
      Config: { ...inspection.Config, Env: [...inspection.Config.Env, "EXTRA=value"] },
    },
    {
      ...inspection,
      Config: { ...inspection.Config, Env: [...inspection.Config.Env, "HOME=/tmp"] },
    },
    {
      ...inspection,
      Config: { ...inspection.Config, Labels: { ...inspection.Config.Labels, extra: "blocked" } },
    },
  ]) {
    strictEqual(
      decodeDockerDiagnosticProbeContainerInspection(
        new TextEncoder().encode(JSON.stringify(changed)),
        dockerDiagnosticProbeReceiptFixture.labels,
      ).ok,
      false,
    );
  }
});

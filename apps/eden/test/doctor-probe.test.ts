import { match, strictEqual } from "node:assert";
import { lstat, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  type DockerDiagnosticProbeExecutionPlan,
  DockerDiagnosticProbeJournal,
  type DockerDiagnosticProbeRecoveryPort,
  type DockerDoctorPort,
  projectDockerDiagnosticProbeJournal,
} from "@eden/coding-runtime";
import { decodeDockerDiagnosticProbeEvent } from "@eden/contracts";

import { runDockerDiagnosticProbe, runDockerDiagnosticProbePreview } from "../src/doctor-probe.ts";
import {
  dockerDiagnosticProbeApprovalRequiredFixture,
  dockerDoctorObservationFixture,
} from "./fixtures/docker-diagnostic-probe.ts";

function output() {
  let stderr = "";
  let stdout = "";
  return {
    io: {
      stderr: (value: string) => {
        stderr += value;
      },
      stdout: (value: string) => {
        stdout += value;
      },
    },
    read: () => ({ stderr, stdout }),
  };
}

async function missingState(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "eden-doctor-probe-cli-")), "state");
}

test("JSON probe preview emits one closed approval value without prompting or mutation ports", async () => {
  const writes = output();
  let prompts = 0;

  const exitCode = await runDockerDiagnosticProbePreview(
    { format: "json", mode: "doctor-probe" },
    {
      approvalRequired: dockerDiagnosticProbeApprovalRequiredFixture,
      confirm: async () => {
        prompts += 1;
        return "deny";
      },
      io: writes.io,
    },
  );

  strictEqual(exitCode, 2);
  strictEqual(prompts, 0);
  strictEqual(writes.read().stderr, "");
  strictEqual(
    writes.read().stdout,
    `${JSON.stringify(dockerDiagnosticProbeApprovalRequiredFixture)}\n`,
  );
});

test("interactive denial presents the complete action and creates no effect authority", async () => {
  const writes = output();
  let prompts = 0;

  const exitCode = await runDockerDiagnosticProbePreview(
    { format: "plain", mode: "doctor-probe" },
    {
      approvalRequired: dockerDiagnosticProbeApprovalRequiredFixture,
      confirm: async () => {
        prompts += 1;
        return "deny";
      },
      io: writes.io,
    },
  );

  strictEqual(exitCode, 2);
  strictEqual(prompts, 1);
  strictEqual(writes.read().stderr, "");
  match(writes.read().stdout, /policy: ask · r2\.docker-diagnostic-probe\.exact/u);
  match(
    writes.read().stdout,
    new RegExp(dockerDiagnosticProbeApprovalRequiredFixture.actionDigest, "u"),
  );
  strictEqual(
    writes
      .read()
      .stdout.includes(JSON.stringify(dockerDiagnosticProbeApprovalRequiredFixture.action)),
    true,
  );
  match(writes.read().stdout, /decision: denied · mutation: none/u);
});

test("integrated JSON preview performs one read-only preflight and creates no state inode", async () => {
  const stateDirectory = await missingState();
  const writes = output();
  let inspections = 0;
  let prompts = 0;
  const port: DockerDoctorPort = {
    inspect: async () => {
      inspections += 1;
      return dockerDoctorObservationFixture;
    },
  };

  const exitCode = await runDockerDiagnosticProbe(
    { format: "json", mode: "doctor-probe" },
    {
      confirm: async () => {
        prompts += 1;
        return "deny";
      },
      identity: {
        actionId: "action-docker-probe-1",
        approvalId: "approval-probe-1",
        eventId: "event-probe-approval-1",
        probeId: "probe-example-1",
        revision: 1,
      },
      io: writes.io,
      observedAt: "2026-07-31T00:00:00.000Z",
      port,
      recoveryEventId: "event-probe-recovery-1",
      stateDirectory,
    },
  );

  strictEqual(exitCode, 2);
  strictEqual(inspections, 1);
  strictEqual(prompts, 0);
  strictEqual(writes.read().stderr, "");
  strictEqual(decodeDockerDiagnosticProbeEvent(JSON.parse(writes.read().stdout)).ok, true);
  strictEqual(
    await lstat(stateDirectory).then(
      () => "present",
      (error: unknown) =>
        error instanceof Error && "code" in error ? String(error.code) : "unknown",
    ),
    "ENOENT",
  );
});

test("unresolved JSON recovery projects the first effect identity without Docker inspection", async () => {
  const stateDirectory = await missingState();
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  await journal.append({
    eventId: "event-action-prepared",
    payload: {
      action: dockerDiagnosticProbeApprovalRequiredFixture.action,
      actionDigest: dockerDiagnosticProbeApprovalRequiredFixture.actionDigest,
      approvalId: "approval-probe-1",
      effectId: "effect-docker-probe-1",
    },
    probeId: "probe-example-1",
    recordedAt: "2026-07-31T00:00:00.000Z",
    redaction: "closed_no_raw_docker",
    type: "docker.probe.action.prepared",
  });
  const before = await readFile(journal.path, "utf8");
  let inspections = 0;
  const writes = output();

  const exitCode = await runDockerDiagnosticProbe(
    { format: "json", mode: "doctor-probe" },
    {
      confirm: async () => "deny",
      identity: {
        actionId: "action-new",
        approvalId: "approval-new",
        eventId: "event-new",
        probeId: "probe-new",
        revision: 1,
      },
      io: writes.io,
      observedAt: "2026-07-31T00:00:01.000Z",
      port: {
        inspect: async () => {
          inspections += 1;
          return dockerDoctorObservationFixture;
        },
      },
      recoveryEventId: "event-probe-recovery-1",
      stateDirectory,
    },
  );
  const recovery = JSON.parse(writes.read().stdout);

  strictEqual(exitCode, 2);
  strictEqual(inspections, 0);
  strictEqual(decodeDockerDiagnosticProbeEvent(recovery).ok, true);
  strictEqual(recovery.type, "docker.probe.recovery.required");
  strictEqual(recovery.effectId, "effect-docker-probe-1");
  strictEqual(await readFile(journal.path, "utf8"), before);
});

test("interactive recovery closes not-started before presenting a new exact proposal", async () => {
  const stateDirectory = await missingState();
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  await journal.append({
    eventId: "event-action-prepared",
    payload: {
      action: dockerDiagnosticProbeApprovalRequiredFixture.action,
      actionDigest: dockerDiagnosticProbeApprovalRequiredFixture.actionDigest,
      approvalId: "approval-probe-1",
      effectId: "effect-docker-probe-1",
    },
    probeId: "probe-example-1",
    recordedAt: "2026-07-31T01:00:00.000Z",
    redaction: "closed_no_raw_docker",
    type: "docker.probe.action.prepared",
  });
  const writes = output();
  let dockerCalls = 0;
  let doctorInspections = 0;
  let prompts = 0;
  const unused = async () => {
    dockerCalls += 1;
    return { status: "spawn-failed" as const };
  };
  const executionPort: DockerDiagnosticProbeRecoveryPort = {
    create: unused,
    inspect: unused,
    kill: unused,
    locate: unused,
    logs: unused,
    remove: unused,
    start: unused,
    stop: unused,
    wait: unused,
  };

  const exitCode = await runDockerDiagnosticProbe(
    { format: "plain", mode: "doctor-probe" },
    {
      clock: () => "2026-07-31T01:00:01.000Z",
      confirm: async () => {
        prompts += 1;
        return "deny";
      },
      executionPort,
      id: () => "event-recovery-closed",
      identity: {
        actionId: "action-new",
        approvalId: "approval-new",
        eventId: "event-new",
        probeId: "probe-new",
        revision: 1,
      },
      io: writes.io,
      observedAt: "2026-07-31T01:00:02.000Z",
      port: {
        inspect: async () => {
          doctorInspections += 1;
          return dockerDoctorObservationFixture;
        },
      },
      recoveryEventId: "event-probe-recovery-1",
      stateDirectory,
    },
  );

  strictEqual(exitCode, 2);
  strictEqual(dockerCalls, 0);
  strictEqual(doctorInspections, 1);
  strictEqual(prompts, 1);
  strictEqual(writes.read().stderr, "");
  match(writes.read().stdout, /docker diagnostic probe: recovery resolved/u);
  match(writes.read().stdout, /outcome: not_started/u);
  match(writes.read().stdout, /docker diagnostic probe: approval required/u);
  match(writes.read().stdout, /decision: denied · mutation: none/u);
});

const programOutput = new TextEncoder().encode(
  '{"protocolVersion":1,"observations":[{"check":"process_user","gid":65532,"status":"passed","uid":65532},{"check":"user_namespace","mapping":"remapped","status":"passed"},{"check":"capabilities","effectiveMask":"0000000000000000","status":"passed"},{"check":"no_new_privileges","enabled":true,"status":"passed"},{"check":"seccomp","mode":"filter","status":"passed"},{"access":"read_only","check":"root_filesystem","status":"passed"},{"check":"temporary_filesystem","filesystem":"tmpfs","nodev":true,"noexec":true,"nosuid":true,"sizeBytes":1048576,"status":"passed","writable":true},{"check":"resource_limits","cpuPeriodMicros":100000,"cpuQuotaMicros":50000,"fileDescriptors":64,"memoryBytes":67108864,"memorySwapBytes":67108864,"pids":16,"status":"passed"}]}',
);

function inspection(
  plan: DockerDiagnosticProbeExecutionPlan,
  id: string,
  state: "created" | "exited",
): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      Config: {
        Entrypoint: ["/nodejs/bin/node"],
        Env: [
          "LANG=C.UTF-8",
          "PATH=/usr/local/bin:/usr/bin:/bin",
          "HOME=/tmp",
          "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
        ],
        Labels: {
          "eden.action-id": plan.labels.actionId,
          "eden.config-digest": plan.labels.configDigest,
          "eden.effect-id": plan.labels.effectId,
          "eden.image-index-digest": plan.labels.imageIndexDigest,
          "eden.platform-manifest-digest": plan.labels.platformManifestDigest,
          "eden.probe-id": plan.labels.probeId,
          "eden.profile-revision": plan.labels.profileRevision,
          "eden.schema": plan.labels.schema,
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
      Id: id,
      Name: `/${plan.containerName}`,
      State: { ExitCode: 0, OOMKilled: false, Running: false, Status: state },
    }),
  );
}

test("interactive approval dispatches one exact transaction and exits zero only on terminal pass", async () => {
  const stateDirectory = await missingState();
  const writes = output();
  const containerId = "5".repeat(64);
  let started = false;
  const executionPort: DockerDiagnosticProbeRecoveryPort = {
    create: async () => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: new TextEncoder().encode(`${containerId}\n`),
    }),
    inspect: async (plan) => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: inspection(plan, containerId, started ? "exited" : "created"),
    }),
    kill: async () => ({ status: "spawn-failed" }),
    locate: async () => ({ status: "spawn-failed" }),
    logs: async () => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: programOutput,
    }),
    remove: async () => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: new Uint8Array(),
    }),
    start: async () => {
      started = true;
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new Uint8Array(),
      };
    },
    stop: async () => ({ status: "spawn-failed" }),
    wait: async () => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: new TextEncoder().encode("0\n"),
    }),
  };
  const ids = [
    "command-probe-cli",
    "event-action-prepared-cli",
    "event-approval-consumed-cli",
    "event-effect-intent-cli",
    "event-container-created-cli",
    "event-dispatch-started-cli",
    "receipt-probe-cli",
    "event-receipt-recorded-cli",
    "event-cleanup-recorded-cli",
    "event-terminal-cli",
  ];
  let tick = 0;

  const exitCode = await runDockerDiagnosticProbe(
    { format: "plain", mode: "doctor-probe" },
    {
      clock: () => `2026-07-31T02:00:${String(tick++).padStart(2, "0")}.000Z`,
      confirm: async () => "approve",
      effectId: "effect-probe-cli",
      executionPort,
      id: () => ids.shift() ?? "unexpected-id",
      identity: {
        actionId: "action-docker-probe-cli",
        approvalId: "approval-probe-cli",
        eventId: "event-probe-approval-cli",
        probeId: "probe-cli",
        revision: 1,
      },
      io: writes.io,
      observedAt: "2026-07-31T02:00:00.000Z",
      port: { inspect: async () => dockerDoctorObservationFixture },
      recoveryEventId: "event-probe-recovery-cli",
      stateDirectory,
    },
  );

  strictEqual(exitCode, 0);
  strictEqual(writes.read().stderr, "");
  match(writes.read().stdout, /docker diagnostic probe: passed/u);
  match(writes.read().stdout, /cleanup: complete/u);
  strictEqual(
    projectDockerDiagnosticProbeJournal(
      await new DockerDiagnosticProbeJournal({ stateDirectory }).load(),
    ).status,
    "resolved",
  );
});

test("interactive not-started recovery can approve and execute one later proposal", async () => {
  const stateDirectory = await missingState();
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  await journal.append({
    eventId: "event-old-action-prepared",
    payload: {
      action: dockerDiagnosticProbeApprovalRequiredFixture.action,
      actionDigest: dockerDiagnosticProbeApprovalRequiredFixture.actionDigest,
      approvalId: "approval-probe-1",
      effectId: "effect-docker-probe-1",
    },
    probeId: "probe-example-1",
    recordedAt: "2026-07-31T04:00:00.000Z",
    redaction: "closed_no_raw_docker",
    type: "docker.probe.action.prepared",
  });
  const writes = output();
  const containerId = "5".repeat(64);
  let started = false;
  const executionPort: DockerDiagnosticProbeRecoveryPort = {
    create: async () => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: new TextEncoder().encode(`${containerId}\n`),
    }),
    inspect: async (plan) => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: inspection(plan, containerId, started ? "exited" : "created"),
    }),
    kill: async () => ({ status: "spawn-failed" }),
    locate: async () => ({ status: "spawn-failed" }),
    logs: async () => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: programOutput,
    }),
    remove: async () => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: new Uint8Array(),
    }),
    start: async () => {
      started = true;
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new Uint8Array(),
      };
    },
    stop: async () => ({ status: "spawn-failed" }),
    wait: async () => ({
      exitCode: 0,
      status: "exited",
      stderr: new Uint8Array(),
      stdout: new TextEncoder().encode("0\n"),
    }),
  };
  const ids = [
    "event-recovery-closed",
    "command-probe-new",
    "event-action-prepared-new",
    "event-approval-consumed-new",
    "event-effect-intent-new",
    "event-container-created-new",
    "event-dispatch-started-new",
    "receipt-probe-new",
    "event-receipt-recorded-new",
    "event-cleanup-recorded-new",
    "event-terminal-new",
  ];
  let tick = 1;

  const exitCode = await runDockerDiagnosticProbe(
    { format: "plain", mode: "doctor-probe" },
    {
      clock: () => `2026-07-31T04:00:${String(tick++).padStart(2, "0")}.000Z`,
      confirm: async () => "approve",
      effectId: "effect-probe-new",
      executionPort,
      id: () => ids.shift() ?? "unexpected-id",
      identity: {
        actionId: "action-docker-probe-new",
        approvalId: "approval-probe-new",
        eventId: "event-probe-approval-new",
        probeId: "probe-new",
        revision: 1,
      },
      io: writes.io,
      observedAt: "2026-07-31T04:00:02.000Z",
      port: { inspect: async () => dockerDoctorObservationFixture },
      recoveryEventId: "event-probe-recovery-new",
      stateDirectory,
    },
  );

  strictEqual(exitCode, 0);
  strictEqual(writes.read().stderr, "");
  match(writes.read().stdout, /recovery resolved/u);
  match(writes.read().stdout, /docker diagnostic probe: passed/u);
  strictEqual(projectDockerDiagnosticProbeJournal(await journal.load()).status, "resolved");
});

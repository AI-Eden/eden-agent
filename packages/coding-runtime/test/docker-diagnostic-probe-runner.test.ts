import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";

import {
  decodeDockerDiagnosticProbeAction,
  decodeDockerDiagnosticProbeCommand,
  decodeDockerDiagnosticProbeEvent,
} from "@eden/contracts";
import {
  dockerDiagnosticProbeActionDigestFixture,
  dockerDiagnosticProbeActionFixture,
  dockerDiagnosticProbeObservationsFixture,
} from "../../contracts/test/docker-diagnostic-probe-fixture.ts";
import {
  createDockerDiagnosticProbeExecutionPlan,
  DockerCliDiagnosticProbePort,
  type DockerDiagnosticProbeExecutionPlan,
  type DockerDiagnosticProbeExecutionPort,
  DockerDiagnosticProbeJournal,
  type DockerDoctorObservation,
  type DockerDoctorPort,
  dockerDiagnosticProbeProgramSource,
  executeDockerDiagnosticProbe,
  type NativeProcessPort,
  type NativeProcessRequest,
  prepareDockerDiagnosticProbeApproval,
  recoverDockerDiagnosticProbe,
} from "../src/index.ts";

function skipWithoutPosix(context: TestContext): boolean {
  if (process.platform !== "win32") return false;
  context.skip("requires POSIX filesystem permission semantics");
  return true;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

test("execution plan closes one exact pull-never container configuration", () => {
  const expectedConfiguration = {
    arguments: ["-e", dockerDiagnosticProbeProgramSource],
    autoRemove: false,
    capDrop: ["ALL"],
    cpuPeriodMicros: 100_000,
    cpuQuotaMicros: 50_000,
    environment: [
      "HOME=/tmp",
      "LANG=C.UTF-8",
      "PATH=/usr/local/bin:/usr/bin:/bin",
      "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
    ],
    fileDescriptors: 64,
    imageReference:
      "ghcr.io/ai-eden/eden-node24-check@sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
    ipcMode: "private",
    memoryBytes: 67_108_864,
    memorySwapBytes: 67_108_864,
    networkMode: "none",
    pids: 16,
    platform: "linux/amd64",
    privileged: false,
    pull: "never",
    readOnlyRootFilesystem: true,
    restart: "no",
    securityOptions: ["no-new-privileges"],
    temporaryFilesystems: {
      "/tmp": "rw,noexec,nosuid,nodev,size=1048576",
    },
    user: "65532:65532",
    usernsMode: "daemon_default",
    utsMode: "",
    workingDirectory: "/tmp",
  } as const;
  const expectedConfigDigest = `sha256:${createHash("sha256")
    .update("eden.docker-diagnostic-config.v1\0")
    .update(canonicalJson(expectedConfiguration))
    .digest("hex")}`;

  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const result = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");

  strictEqual(result.ok, true);
  if (!result.ok) return;
  strictEqual(result.plan.containerName, "eden-probe-42ba9aae031b7d9f22546eaf");
  deepStrictEqual(result.plan.configuration, expectedConfiguration);
  strictEqual(result.plan.configDigest, expectedConfigDigest);
  deepStrictEqual(result.plan.labels, {
    actionId: "action-docker-probe-1",
    configDigest: expectedConfigDigest,
    effectId: "effect-docker-probe-1",
    imageIndexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
    platformManifestDigest:
      "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
    probeId: "probe-example-1",
    profileRevision: "r2-docker-diagnostic-probe-v1",
    schema: "eden.docker-diagnostic-probe.v1",
  });
});

test("Docker create uses only the frozen argv against one explicit independent daemon", async () => {
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const requests: NativeProcessRequest[] = [];
  const nativeProcess: NativeProcessPort = {
    run: async (request) => {
      requests.push(request);
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new TextEncoder().encode(`${"5".repeat(64)}\n`),
      };
    },
  };
  const port = new DockerCliDiagnosticProbePort({
    cwd: "/workspace",
    dockerExecutable: "/opt/eden-docker/docker",
    dockerHost: "unix:///tmp/eden-fresh/docker.sock",
    nativeProcess,
  });

  const observation = await port.create(planned.plan);

  strictEqual(observation.status, "exited");
  deepStrictEqual(requests, [
    {
      arguments: [
        "--host",
        "unix:///tmp/eden-fresh/docker.sock",
        "create",
        "--pull",
        "never",
        "--name",
        "eden-probe-42ba9aae031b7d9f22546eaf",
        "--label",
        "eden.schema=eden.docker-diagnostic-probe.v1",
        "--label",
        "eden.probe-id=probe-example-1",
        "--label",
        "eden.action-id=action-docker-probe-1",
        "--label",
        "eden.effect-id=effect-docker-probe-1",
        "--label",
        "eden.image-index-digest=sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
        "--label",
        "eden.platform-manifest-digest=sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
        "--label",
        "eden.profile-revision=r2-docker-diagnostic-probe-v1",
        "--label",
        `eden.config-digest=${planned.plan.configDigest}`,
        "--platform",
        "linux/amd64",
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,nodev,size=1048576",
        "--user",
        "65532:65532",
        "--workdir",
        "/tmp",
        "--entrypoint",
        "/nodejs/bin/node",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "67108864",
        "--memory-swap",
        "67108864",
        "--cpu-period",
        "100000",
        "--cpu-quota",
        "50000",
        "--pids-limit",
        "16",
        "--ulimit",
        "nofile=64:64",
        "--restart",
        "no",
        "--ipc",
        "private",
        "--env",
        "HOME=/tmp",
        "--env",
        "LANG=C.UTF-8",
        "--env",
        "PATH=/usr/local/bin:/usr/bin:/bin",
        "--env",
        "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
        planned.plan.configuration.imageReference,
        "-e",
        dockerDiagnosticProbeProgramSource,
      ],
      cwd: "/workspace",
      environment: {},
      executable: "/opt/eden-docker/docker",
      maxStderrBytes: 4_096,
      maxStdoutBytes: 4_096,
      timeoutMs: 5_000,
    },
  ]);
});

test("active-context adapter does not invent a Docker host override", async () => {
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const requests: NativeProcessRequest[] = [];
  const port = new DockerCliDiagnosticProbePort({
    cwd: "/workspace",
    nativeProcess: {
      run: async (request) => {
        requests.push(request);
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new TextEncoder().encode(`${"5".repeat(64)}\n`),
        };
      },
    },
  });

  await port.create(planned.plan);

  deepStrictEqual(requests[0]?.arguments.slice(0, 4), ["create", "--pull", "never", "--name"]);
});

test("named-context adapter binds every Docker operation to the same context", async () => {
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const requests: NativeProcessRequest[] = [];
  const port = new DockerCliDiagnosticProbePort({
    cwd: "/workspace",
    dockerContext: "eden-fresh-userns",
    nativeProcess: {
      run: async (request) => {
        requests.push(request);
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
    },
  });

  await port.create(planned.plan);
  await port.inspect(planned.plan);
  await port.locate(planned.plan);
  await port.start(planned.plan);
  await port.wait(planned.plan);
  await port.logs(planned.plan);
  await port.stop(planned.plan);
  await port.kill(planned.plan);
  await port.remove(planned.plan);

  strictEqual(requests.length, 9);
  strictEqual(
    requests.every(
      (request) =>
        request.arguments[0] === "--context" && request.arguments[1] === "eden-fresh-userns",
    ),
    true,
  );
});

test("Docker adapter rejects ambiguous raw-host and named-context selection", () => {
  throws(
    () =>
      new DockerCliDiagnosticProbePort({
        cwd: "/workspace",
        dockerContext: "eden-fresh-userns",
        dockerHost: "unix:///tmp/eden-fresh/docker.sock",
        nativeProcess: { run: async () => ({ status: "spawn-failed" }) },
      }),
    /mutually exclusive/u,
  );
});

test("Docker lifecycle adapter exposes only exact locate inspect start wait stop kill logs and remove operations", async () => {
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const requests: NativeProcessRequest[] = [];
  const nativeProcess: NativeProcessPort = {
    run: async (request) => {
      requests.push(request);
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new Uint8Array(),
      };
    },
  };
  const port = new DockerCliDiagnosticProbePort({
    cwd: "/workspace",
    dockerExecutable: "/opt/eden-docker/docker",
    dockerHost: "unix:///tmp/eden-fresh/docker.sock",
    nativeProcess,
  });

  await port.inspect(planned.plan);
  await port.locate(planned.plan);
  await port.start(planned.plan);
  await port.wait(planned.plan);
  await port.logs(planned.plan);
  await port.stop(planned.plan);
  await port.kill(planned.plan);
  await port.remove(planned.plan);

  const prefix = ["--host", "unix:///tmp/eden-fresh/docker.sock"];
  deepStrictEqual(
    requests.map((request) => request.arguments),
    [
      [
        ...prefix,
        "inspect",
        "--format",
        '{"Config":{"Entrypoint":{{json .Config.Entrypoint}},"Env":{{json .Config.Env}},"Labels":{{json .Config.Labels}},"User":{{json .Config.User}},"WorkingDir":{{json .Config.WorkingDir}}},"HostConfig":{"AutoRemove":{{json .HostConfig.AutoRemove}},"CapDrop":{{json .HostConfig.CapDrop}},"CpuPeriod":{{json .HostConfig.CpuPeriod}},"CpuQuota":{{json .HostConfig.CpuQuota}},"IpcMode":{{json .HostConfig.IpcMode}},"Memory":{{json .HostConfig.Memory}},"MemorySwap":{{json .HostConfig.MemorySwap}},"NetworkMode":{{json .HostConfig.NetworkMode}},"PidMode":{{json .HostConfig.PidMode}},"PidsLimit":{{json .HostConfig.PidsLimit}},"Privileged":{{json .HostConfig.Privileged}},"ReadonlyRootfs":{{json .HostConfig.ReadonlyRootfs}},"RestartPolicy":{"Name":{{json .HostConfig.RestartPolicy.Name}}},"SecurityOpt":{{json .HostConfig.SecurityOpt}},"Tmpfs":{{json .HostConfig.Tmpfs}},"UTSMode":{{json .HostConfig.UTSMode}},"Ulimits":{{json .HostConfig.Ulimits}},"UsernsMode":{{json .HostConfig.UsernsMode}}},"Id":{{json .Id}},"Name":{{json .Name}},"State":{"ExitCode":{{json .State.ExitCode}},"OOMKilled":{{json .State.OOMKilled}},"Running":{{json .State.Running}},"Status":{{json .State.Status}}}}',
        planned.plan.containerName,
      ],
      [
        ...prefix,
        "container",
        "ls",
        "--all",
        "--no-trunc",
        "--filter",
        `name=^/${planned.plan.containerName}$`,
        "--format",
        '{"ID":{{json .ID}},"Names":{{json .Names}}}',
      ],
      [...prefix, "start", planned.plan.containerName],
      [...prefix, "wait", planned.plan.containerName],
      [...prefix, "logs", planned.plan.containerName],
      [...prefix, "stop", "--time", "2", planned.plan.containerName],
      [...prefix, "kill", planned.plan.containerName],
      [...prefix, "rm", planned.plan.containerName],
    ],
  );
  deepStrictEqual(
    requests.map(({ maxStderrBytes, maxStdoutBytes, timeoutMs }) => ({
      maxStderrBytes,
      maxStdoutBytes,
      timeoutMs,
    })),
    [
      { maxStderrBytes: 4_096, maxStdoutBytes: 65_536, timeoutMs: 5_000 },
      { maxStderrBytes: 4_096, maxStdoutBytes: 4_096, timeoutMs: 5_000 },
      { maxStderrBytes: 4_096, maxStdoutBytes: 4_096, timeoutMs: 5_000 },
      { maxStderrBytes: 4_096, maxStdoutBytes: 4_096, timeoutMs: 10_000 },
      { maxStderrBytes: 4_096, maxStdoutBytes: 4_096, timeoutMs: 5_000 },
      { maxStderrBytes: 4_096, maxStdoutBytes: 4_096, timeoutMs: 7_000 },
      { maxStderrBytes: 4_096, maxStdoutBytes: 4_096, timeoutMs: 5_000 },
      { maxStderrBytes: 4_096, maxStdoutBytes: 4_096, timeoutMs: 5_000 },
    ],
  );
});

const readyObservation: DockerDoctorObservation = {
  client: {
    status: "ready",
    value: {
      apiVersion: "1.55",
      architecture: "amd64",
      operatingSystem: "linux",
      version: "29.6.2",
    },
  },
  context: {
    status: "ready",
    value: { endpoint: "unix:///tmp/eden-fresh/docker.sock", name: "eden-fresh-userns" },
  },
  daemon: {
    status: "ready",
    value: {
      apiVersion: "1.55",
      architecture: "amd64",
      cgroupVersion: "2",
      cpuCfsPeriod: true,
      cpuCfsQuota: true,
      memoryLimit: true,
      minApiVersion: "1.44",
      operatingSystem: "Docker Engine - Community",
      osType: "linux",
      pidsLimit: true,
      platformName: "Docker Engine - Community",
      securityOptions: ["name=seccomp,profile=builtin", "name=userns", "name=cgroupns"],
      serverVersion: "29.6.2",
      swapLimit: true,
    },
  },
  image: {
    status: "ready",
    value: {
      architecture: "amd64",
      configDigest: "sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443",
      entrypoint: ["/nodejs/bin/node", "/opt/eden/wrapper.mjs"],
      indexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
      manifestDigest: "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
      manifestEvidence: "frozen_config_mapping",
      operatingSystem: "linux",
      user: "65532:65532",
      workingDirectory: "/workspace",
    },
  },
  orphans: { status: "ready", value: [] },
};

const validProgramOutput = new TextEncoder().encode(
  '{"protocolVersion":1,"observations":[{"check":"process_user","gid":65532,"status":"passed","uid":65532},{"check":"user_namespace","mapping":"remapped","status":"passed"},{"check":"capabilities","effectiveMask":"0000000000000000","status":"passed"},{"check":"no_new_privileges","enabled":true,"status":"passed"},{"check":"seccomp","mode":"filter","status":"passed"},{"access":"read_only","check":"root_filesystem","status":"passed"},{"check":"temporary_filesystem","filesystem":"tmpfs","nodev":true,"noexec":true,"nosuid":true,"sizeBytes":1048576,"status":"passed","writable":true},{"check":"resource_limits","cpuPeriodMicros":100000,"cpuQuotaMicros":50000,"fileDescriptors":64,"memoryBytes":67108864,"memorySwapBytes":67108864,"pids":16,"status":"passed"}]}',
);

function inspection(
  plan: DockerDiagnosticProbeExecutionPlan,
  id: string,
  state: "created" | "exited" | "running",
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
      State: {
        ExitCode: 0,
        OOMKilled: false,
        Running: state === "running",
        Status: state,
      },
    }),
  );
}

async function appendRecoveryExecutionPrefix(
  journal: DockerDiagnosticProbeJournal,
  plan: DockerDiagnosticProbeExecutionPlan,
  containerId: string,
  through: "container_created" | "dispatch_started" | "effect_intent",
): Promise<void> {
  const records = [
    {
      eventId: "event-action-prepared",
      payload: {
        action: plan.action,
        actionDigest: dockerDiagnosticProbeActionDigestFixture,
        approvalId: "approval-probe-1",
        effectId: plan.effectId,
      },
      probeId: plan.action.probeId,
      recordedAt: "2026-07-31T03:00:00.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.action.prepared" as const,
    },
    {
      eventId: "event-approval-consumed",
      payload: {
        actionDigest: dockerDiagnosticProbeActionDigestFixture,
        actionId: plan.action.actionId,
        approvalId: "approval-probe-1",
        decision: "approve",
      },
      probeId: plan.action.probeId,
      recordedAt: "2026-07-31T03:00:01.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.approval.consumed" as const,
    },
    {
      eventId: "event-effect-intent",
      payload: {
        actionId: plan.action.actionId,
        configDigest: plan.configDigest,
        containerName: plan.containerName,
        effectId: plan.effectId,
      },
      probeId: plan.action.probeId,
      recordedAt: "2026-07-31T03:00:02.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.effect.intent" as const,
    },
    {
      eventId: "event-container-created",
      payload: {
        container: { id: containerId, name: plan.containerName },
        effectId: plan.effectId,
        labels: plan.labels,
      },
      probeId: plan.action.probeId,
      recordedAt: "2026-07-31T03:00:03.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.container.created" as const,
    },
    {
      eventId: "event-dispatch-started",
      payload: { containerId, effectId: plan.effectId },
      probeId: plan.action.probeId,
      recordedAt: "2026-07-31T03:00:04.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.dispatch.started" as const,
    },
  ];
  const count = through === "effect_intent" ? 3 : through === "container_created" ? 4 : 5;
  for (const record of records.slice(0, count)) await journal.append(record);
}

async function appendRecoveryReceiptPrefix(
  journal: DockerDiagnosticProbeJournal,
  plan: DockerDiagnosticProbeExecutionPlan,
  containerId: string,
): Promise<void> {
  await appendRecoveryExecutionPrefix(journal, plan, containerId, "dispatch_started");
  const receipt = {
    actionId: plan.action.actionId,
    configDigest: plan.configDigest,
    container: { id: containerId, name: plan.containerName },
    effectId: plan.effectId,
    labels: plan.labels,
    lifecycleState: "exited" as const,
    probeId: plan.action.probeId,
    receiptId: "receipt-before-cleanup",
    receiptVersion: 1 as const,
    recordedAt: "2026-07-31T03:20:05.000Z",
    resultDigest: dockerDiagnosticProbeObservationsFixture[8].sha256,
    resultOutcome: "passed" as const,
  };
  await journal.append({
    eventId: "event-receipt-recorded",
    payload: {
      receipt,
      terminalDraft: {
        endedAt: receipt.recordedAt,
        observations: dockerDiagnosticProbeObservationsFixture,
        outcome: "passed",
        startedAt: "2026-07-31T03:00:04.000Z",
      },
    },
    probeId: plan.action.probeId,
    recordedAt: receipt.recordedAt,
    redaction: "closed_no_raw_docker",
    type: "docker.probe.receipt.recorded",
  });
}

test("approved transaction records receipt before exact cleanup and resolves one effect", async (context) => {
  if (skipWithoutPosix(context)) return;
  const prepared = prepareDockerDiagnosticProbeApproval({
    identity: {
      actionId: "action-docker-probe-transaction",
      approvalId: "approval-probe-transaction",
      eventId: "event-probe-approval-transaction",
      probeId: "probe-transaction",
      revision: 1,
    },
    observation: readyObservation,
    observedAt: "2026-07-31T01:00:00.000Z",
  });
  strictEqual(prepared.ok, true);
  if (!prepared.ok) return;
  const command = decodeDockerDiagnosticProbeCommand({
    actionDigest: prepared.event.actionDigest,
    approvalId: prepared.event.approval.approvalId,
    commandId: "command-probe-transaction",
    decision: "approve",
    expectedRevision: 1,
    probeId: prepared.event.probeId,
    protocolVersion: 1,
    type: "docker.probe.approval.resolve",
  });
  strictEqual(command.ok, true);
  if (!command.ok) return;
  const containerId = "5".repeat(64);
  const calls: string[] = [];
  let activeContainerName: string | null = null;
  let activeEffectId: string | null = null;
  const executionPort: DockerDiagnosticProbeExecutionPort = {
    create: async (plan) => {
      calls.push("create");
      activeContainerName = plan.containerName;
      activeEffectId = plan.effectId;
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new TextEncoder().encode(`${containerId}\n`),
      };
    },
    inspect: async (plan) => {
      calls.push("inspect");
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: inspection(plan, containerId, calls.includes("start") ? "exited" : "created"),
      };
    },
    logs: async () => {
      calls.push("logs");
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: validProgramOutput,
      };
    },
    remove: async (plan) => {
      calls.push(`remove:${plan.containerName}`);
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new TextEncoder().encode(`${plan.containerName}\n`),
      };
    },
    start: async () => {
      calls.push("start");
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new Uint8Array(),
      };
    },
    wait: async () => {
      calls.push("wait");
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: new TextEncoder().encode("0\n"),
      };
    },
  };
  let doctorInspections = 0;
  const doctorPort: DockerDoctorPort = {
    inspect: async () => {
      doctorInspections += 1;
      return readyObservation;
    },
  };
  const stateDirectory = join(await mkdtemp(join(tmpdir(), "eden-docker-probe-runner-")), "state");
  const ids = [
    "event-action-prepared",
    "event-approval-consumed",
    "event-effect-intent",
    "event-container-created",
    "event-dispatch-started",
    "receipt-probe-transaction",
    "event-receipt-recorded",
    "event-cleanup-recorded",
    "event-terminal",
  ];
  let tick = 0;

  const executed = await executeDockerDiagnosticProbe(
    {
      approvalCommand: command.value,
      approvalRequired: prepared.event,
      effectId: "effect-probe-transaction",
    },
    {
      clock: () => `2026-07-31T01:00:${String(tick++).padStart(2, "0")}.000Z`,
      doctorPort,
      executionPort,
      id: () => ids.shift() ?? "unexpected-id",
      stateDirectory,
    },
  );

  strictEqual(executed.ok, true);
  if (!executed.ok) return;
  strictEqual(doctorInspections, 1);
  strictEqual(activeEffectId, "effect-probe-transaction");
  deepStrictEqual(calls, [
    "create",
    "inspect",
    "start",
    "wait",
    "inspect",
    "logs",
    `remove:${activeContainerName}`,
  ]);
  strictEqual(executed.result.outcome, "passed");
  strictEqual(executed.result.cleanup.status, "complete");
  strictEqual(decodeDockerDiagnosticProbeEvent(executed.event).ok, true);
  const records = await new DockerDiagnosticProbeJournal({ stateDirectory }).load();
  deepStrictEqual(
    records.map((record) => record.type),
    [
      "docker.probe.action.prepared",
      "docker.probe.approval.consumed",
      "docker.probe.effect.intent",
      "docker.probe.container.created",
      "docker.probe.dispatch.started",
      "docker.probe.receipt.recorded",
      "docker.probe.cleanup.recorded",
      "docker.probe.terminal",
    ],
  );
  strictEqual(
    records.findIndex((record) => record.type === "docker.probe.receipt.recorded") <
      records.findIndex((record) => record.type === "docker.probe.cleanup.recorded"),
    true,
  );
});

test("active recovery closes action-prepared as not-started without Docker I/O", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  await journal.append({
    eventId: "event-action-prepared",
    payload: {
      action: dockerDiagnosticProbeActionFixture,
      actionDigest: dockerDiagnosticProbeActionDigestFixture,
      approvalId: "approval-probe-1",
      effectId: "effect-docker-probe-1",
    },
    probeId: "probe-example-1",
    recordedAt: "2026-07-31T02:00:00.000Z",
    redaction: "closed_no_raw_docker",
    type: "docker.probe.action.prepared",
  });
  let dockerCalls = 0;
  const unused = async () => {
    dockerCalls += 1;
    return { status: "spawn-failed" as const };
  };

  const recovered = await recoverDockerDiagnosticProbe({
    clock: () => "2026-07-31T02:00:01.000Z",
    executionPort: {
      create: unused,
      inspect: unused,
      kill: unused,
      locate: unused,
      logs: unused,
      remove: unused,
      start: unused,
      stop: unused,
      wait: unused,
    },
    id: () => "event-recovery-closed",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "not_started");
  strictEqual(recovered.event.type, "docker.probe.recovery.resolved");
  strictEqual(recovered.event.reason, "approval_not_consumed");
  strictEqual(dockerCalls, 0);
  deepStrictEqual(
    (await journal.load()).map((record) => record.type),
    ["docker.probe.action.prepared", "docker.probe.recovery.closed"],
  );
});

test("active recovery closes a proven pre-create absence without creating a container", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  for (const value of [
    {
      eventId: "event-action-prepared",
      payload: {
        action: action.value,
        actionDigest: dockerDiagnosticProbeActionDigestFixture,
        approvalId: "approval-probe-1",
        effectId: "effect-docker-probe-1",
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T02:10:00.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.action.prepared" as const,
    },
    {
      eventId: "event-approval-consumed",
      payload: {
        actionDigest: dockerDiagnosticProbeActionDigestFixture,
        actionId: "action-docker-probe-1",
        approvalId: "approval-probe-1",
        decision: "approve",
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T02:10:01.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.approval.consumed" as const,
    },
    {
      eventId: "event-effect-intent",
      payload: {
        actionId: "action-docker-probe-1",
        configDigest: planned.plan.configDigest,
        containerName: planned.plan.containerName,
        effectId: "effect-docker-probe-1",
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T02:10:02.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.effect.intent" as const,
    },
  ]) {
    await journal.append(value);
  }
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };

  const recovered = await recoverDockerDiagnosticProbe({
    clock: () => "2026-07-31T02:10:03.000Z",
    executionPort: {
      create: unused,
      inspect: unused,
      kill: unused,
      locate: async () => {
        calls.push("locate");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      logs: unused,
      remove: unused,
      start: unused,
      stop: unused,
      wait: unused,
    },
    id: () => "event-recovery-closed",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "not_started");
  strictEqual(recovered.event.reason, "pre_create_absent");
  deepStrictEqual(calls, ["locate"]);
  deepStrictEqual(
    (await journal.load()).map((record) => record.type),
    [
      "docker.probe.action.prepared",
      "docker.probe.approval.consumed",
      "docker.probe.effect.intent",
      "docker.probe.recovery.closed",
    ],
  );
});

test("active recovery fails closed when exact-name discovery is ambiguous", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  await appendRecoveryExecutionPrefix(journal, planned.plan, "5".repeat(64), "effect_intent");
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };

  const recovered = await recoverDockerDiagnosticProbe({
    clock: () => "2026-07-31T03:00:03.000Z",
    executionPort: {
      create: unused,
      inspect: unused,
      kill: unused,
      locate: async () => {
        calls.push("locate");
        const row = JSON.stringify({ ID: "5".repeat(64), Names: planned.plan.containerName });
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new TextEncoder().encode(`${row}\n${row}\n`),
        };
      },
      logs: unused,
      remove: unused,
      start: unused,
      stop: unused,
      wait: unused,
    },
    id: () => "unused-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, false);
  if (recovered.ok) return;
  strictEqual(recovered.error.code, "docker_probe_recovery_unknown");
  deepStrictEqual(calls, ["locate"]);
  strictEqual((await journal.load()).at(-1)?.type, "docker.probe.effect.intent");
});

test("active recovery starts one exact created container without creating a duplicate", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  const prefix = [
    {
      eventId: "event-action-prepared",
      payload: {
        action: action.value,
        actionDigest: dockerDiagnosticProbeActionDigestFixture,
        approvalId: "approval-probe-1",
        effectId: "effect-docker-probe-1",
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T02:20:00.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.action.prepared" as const,
    },
    {
      eventId: "event-approval-consumed",
      payload: {
        actionDigest: dockerDiagnosticProbeActionDigestFixture,
        actionId: "action-docker-probe-1",
        approvalId: "approval-probe-1",
        decision: "approve",
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T02:20:01.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.approval.consumed" as const,
    },
    {
      eventId: "event-effect-intent",
      payload: {
        actionId: "action-docker-probe-1",
        configDigest: planned.plan.configDigest,
        containerName: planned.plan.containerName,
        effectId: "effect-docker-probe-1",
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T02:20:02.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.effect.intent" as const,
    },
    {
      eventId: "event-container-created",
      payload: {
        container: { id: containerId, name: planned.plan.containerName },
        effectId: "effect-docker-probe-1",
        labels: planned.plan.labels,
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T02:20:03.000Z",
      redaction: "closed_no_raw_docker" as const,
      type: "docker.probe.container.created" as const,
    },
  ];
  for (const value of prefix) await journal.append(value);
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };
  const executionPort = {
    create: unused,
    inspect: async (plan: DockerDiagnosticProbeExecutionPlan) => {
      calls.push("inspect");
      return {
        exitCode: 0,
        status: "exited" as const,
        stderr: new Uint8Array(),
        stdout: inspection(plan, containerId, calls.includes("start") ? "exited" : "created"),
      };
    },
    kill: unused,
    locate: unused,
    logs: async () => {
      calls.push("logs");
      return {
        exitCode: 0,
        status: "exited" as const,
        stderr: new Uint8Array(),
        stdout: validProgramOutput,
      };
    },
    remove: async () => {
      calls.push("remove");
      return {
        exitCode: 0,
        status: "exited" as const,
        stderr: new Uint8Array(),
        stdout: new Uint8Array(),
      };
    },
    start: async () => {
      calls.push("start");
      return {
        exitCode: 0,
        status: "exited" as const,
        stderr: new Uint8Array(),
        stdout: new Uint8Array(),
      };
    },
    stop: unused,
    wait: async () => {
      calls.push("wait");
      return {
        exitCode: 0,
        status: "exited" as const,
        stderr: new Uint8Array(),
        stdout: new TextEncoder().encode("0\n"),
      };
    },
  };
  const ids = [
    "event-dispatch-started",
    "receipt-recovered",
    "event-receipt-recorded",
    "event-cleanup-recorded",
    "event-terminal",
  ];
  let tick = 4;

  const recovered = await recoverDockerDiagnosticProbe({
    clock: () => `2026-07-31T02:20:0${tick++}.000Z`,
    executionPort,
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  strictEqual(recovered.result.outcome, "passed");
  deepStrictEqual(calls, ["inspect", "start", "wait", "inspect", "logs", "remove"]);
  deepStrictEqual(
    (await journal.load()).map((record) => record.type),
    [
      "docker.probe.action.prepared",
      "docker.probe.approval.consumed",
      "docker.probe.effect.intent",
      "docker.probe.container.created",
      "docker.probe.dispatch.started",
      "docker.probe.receipt.recorded",
      "docker.probe.cleanup.recorded",
      "docker.probe.terminal",
    ],
  );
});

test("active recovery adopts an exact created object after an effect-intent crash", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  await appendRecoveryExecutionPrefix(journal, planned.plan, containerId, "effect_intent");
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };
  const ids = [
    "event-container-created",
    "event-dispatch-started",
    "receipt-recovered-intent",
    "event-receipt-recorded",
    "event-cleanup-recorded",
    "event-terminal",
  ];

  const recovered = await recoverDockerDiagnosticProbe({
    clock: (() => {
      let tick = 3;
      return () => `2026-07-31T03:15:0${tick++}.000Z`;
    })(),
    executionPort: {
      create: unused,
      inspect: async (plan) => {
        calls.push("inspect");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: inspection(plan, containerId, calls.includes("start") ? "exited" : "created"),
        };
      },
      kill: unused,
      locate: async () => {
        calls.push("locate");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new TextEncoder().encode(
            `${JSON.stringify({ ID: containerId, Names: planned.plan.containerName })}\n`,
          ),
        };
      },
      logs: async () => {
        calls.push("logs");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: validProgramOutput,
        };
      },
      remove: async () => {
        calls.push("remove");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      start: async () => {
        calls.push("start");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      stop: unused,
      wait: async () => {
        calls.push("wait");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new TextEncoder().encode("0\n"),
        };
      },
    },
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  deepStrictEqual(calls, ["locate", "inspect", "start", "wait", "inspect", "logs", "remove"]);
  strictEqual(
    (await journal.load()).filter((record) => record.type === "docker.probe.container.created")
      .length,
    1,
  );
});

test("active recovery observes one running container without starting or creating another", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  await appendRecoveryExecutionPrefix(journal, planned.plan, containerId, "dispatch_started");
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };
  let inspections = 0;
  const ids = [
    "receipt-recovered-running",
    "event-receipt-recorded",
    "event-cleanup-recorded",
    "event-terminal",
  ];

  const recovered = await recoverDockerDiagnosticProbe({
    clock: (() => {
      let tick = 5;
      return () => `2026-07-31T03:00:0${tick++}.000Z`;
    })(),
    executionPort: {
      create: unused,
      inspect: async (plan) => {
        calls.push("inspect");
        inspections += 1;
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: inspection(plan, containerId, inspections === 1 ? "running" : "exited"),
        };
      },
      kill: unused,
      locate: unused,
      logs: async () => {
        calls.push("logs");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: validProgramOutput,
        };
      },
      remove: async () => {
        calls.push("remove");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      start: unused,
      stop: unused,
      wait: async () => {
        calls.push("wait");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new TextEncoder().encode("0\n"),
        };
      },
    },
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  deepStrictEqual(calls, ["inspect", "wait", "inspect", "logs", "remove"]);
});

test("active recovery stops the exact running container after the frozen wait timeout", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  await appendRecoveryExecutionPrefix(journal, planned.plan, containerId, "dispatch_started");
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };
  let inspections = 0;
  const ids = [
    "receipt-recovered-timeout",
    "event-receipt-recorded",
    "event-cleanup-recorded",
    "event-terminal",
  ];

  const recovered = await recoverDockerDiagnosticProbe({
    clock: (() => {
      let tick = 5;
      return () => `2026-07-31T03:05:0${tick++}.000Z`;
    })(),
    executionPort: {
      create: unused,
      inspect: async (plan) => {
        calls.push("inspect");
        inspections += 1;
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: inspection(plan, containerId, inspections === 1 ? "running" : "exited"),
        };
      },
      kill: unused,
      locate: unused,
      logs: async () => {
        calls.push("logs");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: validProgramOutput,
        };
      },
      remove: async () => {
        calls.push("remove");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      start: unused,
      stop: async () => {
        calls.push("stop");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      wait: async () => {
        calls.push("wait");
        return { status: "timed-out" };
      },
    },
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  strictEqual(recovered.result.outcome, "timed_out");
  deepStrictEqual(calls, ["inspect", "wait", "stop", "inspect", "logs", "remove"]);
});

test("active recovery kills the exact container only after frozen stop fails", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  await appendRecoveryExecutionPrefix(journal, planned.plan, containerId, "dispatch_started");
  const calls: string[] = [];
  let inspections = 0;
  const unused = async () => ({ status: "spawn-failed" as const });
  const ids = ["kill-receipt", "kill-receipt-event", "kill-cleanup-event", "kill-terminal"];

  const recovered = await recoverDockerDiagnosticProbe({
    clock: (() => {
      let tick = 5;
      return () => `2026-07-31T03:08:0${tick++}.000Z`;
    })(),
    executionPort: {
      create: unused,
      inspect: async (plan) => {
        calls.push("inspect");
        inspections += 1;
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: inspection(plan, containerId, inspections === 1 ? "running" : "exited"),
        };
      },
      kill: async () => {
        calls.push("kill");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      locate: unused,
      logs: async () => {
        calls.push("logs");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: validProgramOutput,
        };
      },
      remove: async () => {
        calls.push("remove");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      start: unused,
      stop: async () => {
        calls.push("stop");
        return { status: "timed-out" };
      },
      wait: async () => {
        calls.push("wait");
        return { status: "timed-out" };
      },
    },
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  strictEqual(recovered.result.outcome, "timed_out");
  deepStrictEqual(calls, ["inspect", "wait", "stop", "kill", "inspect", "logs", "remove"]);
});

test("active recovery reconstructs an exited result without start or wait", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  await appendRecoveryExecutionPrefix(journal, planned.plan, containerId, "dispatch_started");
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };
  const ids = [
    "receipt-recovered-exited",
    "event-receipt-recorded",
    "event-cleanup-recorded",
    "event-terminal",
  ];

  const recovered = await recoverDockerDiagnosticProbe({
    clock: (() => {
      let tick = 5;
      return () => `2026-07-31T03:10:0${tick++}.000Z`;
    })(),
    executionPort: {
      create: unused,
      inspect: async (plan) => {
        calls.push("inspect");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: inspection(plan, containerId, "exited"),
        };
      },
      kill: unused,
      locate: unused,
      logs: async () => {
        calls.push("logs");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: validProgramOutput,
        };
      },
      remove: async () => {
        calls.push("remove");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      start: unused,
      stop: unused,
      wait: unused,
    },
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  deepStrictEqual(calls, ["inspect", "logs", "remove"]);
});

test("active recovery completes cleanup from a durable receipt draft without rereading logs", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  await appendRecoveryExecutionPrefix(journal, planned.plan, containerId, "dispatch_started");
  const receipt = {
    actionId: action.value.actionId,
    configDigest: planned.plan.configDigest,
    container: { id: containerId, name: planned.plan.containerName },
    effectId: planned.plan.effectId,
    labels: planned.plan.labels,
    lifecycleState: "exited" as const,
    probeId: action.value.probeId,
    receiptId: "receipt-before-cleanup",
    receiptVersion: 1 as const,
    recordedAt: "2026-07-31T03:20:05.000Z",
    resultDigest: dockerDiagnosticProbeObservationsFixture[8].sha256,
    resultOutcome: "passed" as const,
  };
  await journal.append({
    eventId: "event-receipt-recorded",
    payload: {
      receipt,
      terminalDraft: {
        endedAt: receipt.recordedAt,
        observations: dockerDiagnosticProbeObservationsFixture,
        outcome: "passed",
        startedAt: "2026-07-31T03:00:04.000Z",
      },
    },
    probeId: action.value.probeId,
    recordedAt: receipt.recordedAt,
    redaction: "closed_no_raw_docker",
    type: "docker.probe.receipt.recorded",
  });
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };
  const ids = ["event-cleanup-recorded", "event-terminal"];

  const recovered = await recoverDockerDiagnosticProbe({
    clock: (() => {
      let tick = 6;
      return () => `2026-07-31T03:20:0${tick++}.000Z`;
    })(),
    executionPort: {
      create: unused,
      inspect: async (plan) => {
        calls.push("inspect");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: inspection(plan, containerId, "exited"),
        };
      },
      kill: unused,
      locate: async () => {
        calls.push("locate");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new TextEncoder().encode(
            `${JSON.stringify({ ID: containerId, Names: planned.plan.containerName })}\n`,
          ),
        };
      },
      logs: unused,
      remove: async () => {
        calls.push("remove");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      start: unused,
      stop: unused,
      wait: unused,
    },
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  strictEqual(recovered.result.outcome, "passed");
  deepStrictEqual(calls, ["locate", "inspect", "remove"]);
});

test("active recovery records absent cleanup after remove succeeded before its journal fact", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  await appendRecoveryReceiptPrefix(journal, planned.plan, containerId);
  const calls: string[] = [];
  const unused = async () => {
    calls.push("unexpected");
    return { status: "spawn-failed" as const };
  };
  const ids = ["event-cleanup-recorded", "event-terminal"];

  const recovered = await recoverDockerDiagnosticProbe({
    clock: (() => {
      let tick = 6;
      return () => `2026-07-31T03:25:0${tick++}.000Z`;
    })(),
    executionPort: {
      create: unused,
      inspect: unused,
      kill: unused,
      locate: async () => {
        calls.push("locate");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      logs: unused,
      remove: unused,
      start: unused,
      stop: unused,
      wait: unused,
    },
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  strictEqual(recovered.result.cleanup.container.state, "absent");
  deepStrictEqual(calls, ["locate"]);
});

test("active recovery appends terminal after durable cleanup without Docker I/O", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const containerId = "5".repeat(64);
  await appendRecoveryExecutionPrefix(journal, planned.plan, containerId, "dispatch_started");
  const receipt = {
    actionId: action.value.actionId,
    configDigest: planned.plan.configDigest,
    container: { id: containerId, name: planned.plan.containerName },
    effectId: planned.plan.effectId,
    labels: planned.plan.labels,
    lifecycleState: "exited" as const,
    probeId: action.value.probeId,
    receiptId: "receipt-before-terminal",
    receiptVersion: 1 as const,
    recordedAt: "2026-07-31T03:30:05.000Z",
    resultDigest: dockerDiagnosticProbeObservationsFixture[8].sha256,
    resultOutcome: "passed" as const,
  };
  await journal.append({
    eventId: "event-receipt-recorded",
    payload: {
      receipt,
      terminalDraft: {
        endedAt: receipt.recordedAt,
        observations: dockerDiagnosticProbeObservationsFixture,
        outcome: "passed",
        startedAt: "2026-07-31T03:00:04.000Z",
      },
    },
    probeId: action.value.probeId,
    recordedAt: receipt.recordedAt,
    redaction: "closed_no_raw_docker",
    type: "docker.probe.receipt.recorded",
  });
  await journal.append({
    eventId: "event-cleanup-recorded",
    payload: {
      cleanup: {
        actionId: action.value.actionId,
        cleanupVersion: 1,
        completedAt: "2026-07-31T03:30:06.000Z",
        container: { id: containerId, name: planned.plan.containerName, state: "removed" },
        effectId: planned.plan.effectId,
        error: null,
        probeId: action.value.probeId,
        receiptId: receipt.receiptId,
        status: "complete",
      },
    },
    probeId: action.value.probeId,
    recordedAt: "2026-07-31T03:30:06.000Z",
    redaction: "closed_no_raw_docker",
    type: "docker.probe.cleanup.recorded",
  });
  let dockerCalls = 0;
  const unused = async () => {
    dockerCalls += 1;
    return { status: "spawn-failed" as const };
  };

  const recovered = await recoverDockerDiagnosticProbe({
    clock: () => "2026-07-31T03:30:07.000Z",
    executionPort: {
      create: unused,
      inspect: unused,
      kill: unused,
      locate: unused,
      logs: unused,
      remove: unused,
      start: unused,
      stop: unused,
      wait: unused,
    },
    id: () => "event-terminal",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  strictEqual(recovered.result.outcome, "passed");
  strictEqual(dockerCalls, 0);
  strictEqual((await journal.load()).at(-1)?.type, "docker.probe.terminal");
});

test("active recovery builds terminal lifecycle from only the latest durable session", async (context) => {
  if (skipWithoutPosix(context)) return;
  const stateDirectory = join(
    await mkdtemp(join(tmpdir(), "eden-docker-probe-recovery-")),
    "state",
  );
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory });
  const action = decodeDockerDiagnosticProbeAction(dockerDiagnosticProbeActionFixture);
  strictEqual(action.ok, true);
  if (!action.ok) return;
  const planned = createDockerDiagnosticProbeExecutionPlan(action.value, "effect-docker-probe-1");
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  await journal.append({
    eventId: "old-action-prepared",
    payload: {
      action: action.value,
      actionDigest: dockerDiagnosticProbeActionDigestFixture,
      approvalId: "old-approval",
      effectId: "old-effect",
    },
    probeId: action.value.probeId,
    recordedAt: "2026-07-31T02:00:00.000Z",
    redaction: "closed_no_raw_docker",
    type: "docker.probe.action.prepared",
  });
  await journal.append({
    eventId: "old-recovery-closed",
    payload: {
      actionDigest: dockerDiagnosticProbeActionDigestFixture,
      actionId: action.value.actionId,
      effectId: "old-effect",
      lastLifecycleState: "action_prepared",
      outcome: "not_started",
      reason: "approval_not_consumed",
    },
    probeId: action.value.probeId,
    recordedAt: "2026-07-31T02:00:01.000Z",
    redaction: "closed_no_raw_docker",
    type: "docker.probe.recovery.closed",
  });
  const containerId = "5".repeat(64);
  await appendRecoveryExecutionPrefix(journal, planned.plan, containerId, "dispatch_started");
  const calls: string[] = [];
  let inspections = 0;
  const unused = async () => ({ status: "spawn-failed" as const });
  const ids = [
    "latest-receipt",
    "latest-receipt-recorded",
    "latest-cleanup-recorded",
    "latest-terminal",
  ];

  const recovered = await recoverDockerDiagnosticProbe({
    clock: (() => {
      let tick = 5;
      return () => `2026-07-31T03:00:0${tick++}.000Z`;
    })(),
    executionPort: {
      create: unused,
      inspect: async (plan) => {
        calls.push("inspect");
        inspections += 1;
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: inspection(plan, containerId, inspections === 1 ? "running" : "exited"),
        };
      },
      kill: unused,
      locate: unused,
      logs: async () => {
        calls.push("logs");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: validProgramOutput,
        };
      },
      remove: async () => {
        calls.push("remove");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new Uint8Array(),
        };
      },
      start: unused,
      stop: unused,
      wait: async () => {
        calls.push("wait");
        return {
          exitCode: 0,
          status: "exited",
          stderr: new Uint8Array(),
          stdout: new TextEncoder().encode("0\n"),
        };
      },
    },
    id: () => ids.shift() ?? "unexpected-id",
    stateDirectory,
  });

  strictEqual(recovered.ok, true);
  if (!recovered.ok) return;
  strictEqual(recovered.outcome, "terminal");
  deepStrictEqual(
    recovered.event.probe.lifecycle.map((entry) => entry.state),
    [
      "awaiting_approval",
      "approval_consumed",
      "effect_intent",
      "container_created",
      "dispatch_started",
      "receipt_recorded",
      "cleanup_recorded",
      "terminal",
    ],
  );
  deepStrictEqual(calls, ["inspect", "wait", "inspect", "logs", "remove"]);
});

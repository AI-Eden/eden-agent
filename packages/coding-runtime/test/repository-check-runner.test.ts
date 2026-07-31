import { deepStrictEqual, match, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  repositoryCheckActionFixture,
  repositoryCheckInternalResultFixture,
} from "../../contracts/test/repository-check-fixture.ts";
import type { NativeProcessRequest } from "../src/native-process.ts";
import {
  createRepositoryCheckExecutionPlan,
  DockerCliRepositoryCheckPort,
  decodeRepositoryCheckContainerInspection,
  executeRepositoryCheck,
  type RepositoryCheckExecutionPort,
  type RepositoryCheckExecutionState,
  type RepositoryCheckInternalResultV1,
  recoverRepositoryCheck,
} from "../src/repository-check-runner.ts";

const effectId = "effect-repository-check-1";

test("repository-check execution plan closes one exact pull-never container", () => {
  const planned = createRepositoryCheckExecutionPlan(repositoryCheckActionFixture, effectId);
  strictEqual(planned.ok, true);
  if (!planned.ok) return;

  strictEqual(planned.plan.containerName, "eden-check-a143542d2e476509f156de5a");
  strictEqual(
    planned.plan.imageReference,
    "ghcr.io/ai-eden/eden-node24-check@sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
  );
  deepStrictEqual(planned.plan.labels, {
    actionId: "action-repository-check-1",
    effectId,
    imageIndexDigest: repositoryCheckActionFixture.toolchain.imageIndexDigest,
    inputManifestDigest: repositoryCheckActionFixture.repositorySnapshot.digest,
    platformManifestDigest: repositoryCheckActionFixture.toolchain.platformManifestDigest,
    profileRevision: "r2-docker-profile-v1",
    runId: "run-repository-check-1",
    schema: "eden.repository-check.v1",
  });
  deepStrictEqual(planned.plan.request, {
    actionId: "action-repository-check-1",
    budgets: {
      stderrBytes: 16_384,
      stdoutBytes: 16_384,
      stopGraceMs: 2_000,
      timeoutMs: 30_000,
    },
    checkName: "test",
    effectId,
    inputManifestDigest: repositoryCheckActionFixture.repositorySnapshot.digest,
    process: repositoryCheckActionFixture.operation.process,
    requestVersion: 1,
    wrapperProtocolVersion: 1,
  });
  match(planned.plan.configDigest, /^sha256:[a-f0-9]{64}$/u);
  strictEqual(planned.plan.pull, "never");
  strictEqual(
    createRepositoryCheckExecutionPlan(
      {
        ...repositoryCheckActionFixture,
        staging: { identity: `sha256:${"0".repeat(64)}` },
      },
      effectId,
    ).ok,
    false,
  );
});

test("repository-check inspection accepts only the exact external labels and containment", () => {
  const planned = createRepositoryCheckExecutionPlan(repositoryCheckActionFixture, effectId);
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const inspection = {
    Config: {
      Cmd: null,
      Entrypoint: ["/nodejs/bin/node", "/opt/eden/wrapper.mjs"],
      Env: [
        "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
        "CI=1",
        "HOME=/tmp/eden-home",
        "LANG=C.UTF-8",
        "PATH=/usr/local/bin:/usr/bin:/bin",
      ],
      Labels: {
        "eden.action-id": planned.plan.labels.actionId,
        "eden.config-digest": planned.plan.configDigest,
        "eden.effect-id": planned.plan.labels.effectId,
        "eden.image-index-digest": planned.plan.labels.imageIndexDigest,
        "eden.input-manifest-digest": planned.plan.labels.inputManifestDigest,
        "eden.platform-manifest-digest": planned.plan.labels.platformManifestDigest,
        "eden.profile-revision": planned.plan.labels.profileRevision,
        "eden.run-id": planned.plan.labels.runId,
        "eden.schema": planned.plan.labels.schema,
        "eden.staging-identity": repositoryCheckActionFixture.staging.identity,
      },
      User: "65532:65532",
      WorkingDir: "/workspace",
    },
    HostConfig: {
      AutoRemove: false,
      CapDrop: ["ALL"],
      IpcMode: "private",
      Memory: 268_435_456,
      MemorySwap: 268_435_456,
      NanoCpus: 1_000_000_000,
      NetworkMode: "none",
      PidMode: "",
      PidsLimit: 64,
      Privileged: false,
      ReadonlyRootfs: true,
      RestartPolicy: { Name: "no" },
      SecurityOpt: ["no-new-privileges"],
      Tmpfs: { "/tmp": "rw,noexec,nosuid,nodev,size=16777216" },
      UTSMode: "",
      Ulimits: [
        { Hard: 256, Name: "nofile", Soft: 256 },
        { Hard: 16_777_216, Name: "fsize", Soft: 16_777_216 },
      ],
      UsernsMode: "",
    },
    Id: "a".repeat(64),
    Image: "sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443",
    Mounts: [
      { Destination: "/run/eden/request.json", RW: false, Source: "/state/control.json" },
      { Destination: "/run/eden/result.json", RW: true, Source: "/state/result.json" },
      { Destination: "/workspace", RW: false, Source: "/state/workspace" },
    ],
    Name: `/${planned.plan.containerName}`,
    State: { ExitCode: 0, OOMKilled: false, Running: false, Status: "exited" },
  };
  const decoded = decodeRepositoryCheckContainerInspection(
    `${JSON.stringify(inspection)}\n`,
    planned.plan,
    {
      control: "/state/control.json",
      result: "/state/result.json",
      workspace: "/state/workspace",
    },
  );
  strictEqual(decoded.ok, true);
  if (!decoded.ok) return;
  deepStrictEqual(decoded.value, {
    exitCode: 0,
    id: "a".repeat(64),
    name: planned.plan.containerName,
    oomKilled: false,
    state: "exited",
  });

  strictEqual(
    decodeRepositoryCheckContainerInspection(
      JSON.stringify({
        ...inspection,
        Config: {
          ...inspection.Config,
          Labels: { ...inspection.Config.Labels, "eden.extra": "forbidden" },
        },
      }),
      planned.plan,
      {
        control: "/state/control.json",
        result: "/state/result.json",
        workspace: "/state/workspace",
      },
    ).ok,
    false,
  );

  const paths = {
    control: "/state/control.json",
    result: "/state/result.json",
    workspace: "/state/workspace",
  };
  for (const mutate of [
    (value: typeof inspection) => ({ ...value, Image: `sha256:${"0".repeat(64)}` }),
    (value: typeof inspection) => ({ ...value, Name: "/eden-check-forged" }),
    (value: typeof inspection) => ({
      ...value,
      Config: { ...value.Config, User: "0:0" },
    }),
    (value: typeof inspection) => ({
      ...value,
      HostConfig: { ...value.HostConfig, NetworkMode: "bridge" },
    }),
    (value: typeof inspection) => ({
      ...value,
      HostConfig: { ...value.HostConfig, Privileged: true },
    }),
    (value: typeof inspection) => ({
      ...value,
      HostConfig: { ...value.HostConfig, ReadonlyRootfs: false },
    }),
    (value: typeof inspection) => ({
      ...value,
      Mounts: value.Mounts.map((mount) =>
        mount.Destination === "/workspace" ? { ...mount, RW: true } : mount,
      ),
    }),
  ]) {
    strictEqual(
      decodeRepositoryCheckContainerInspection(
        JSON.stringify(mutate(inspection)),
        planned.plan,
        paths,
      ).ok,
      false,
    );
  }
});

test("Docker create uses the exact mounts, containment, and pull-never argv", async () => {
  const planned = createRepositoryCheckExecutionPlan(repositoryCheckActionFixture, effectId);
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const requests: NativeProcessRequest[] = [];
  const port = new DockerCliRepositoryCheckPort({
    cwd: "/repository",
    dockerContext: "eden-r2-goal-pbfbmw",
    nativeProcess: {
      async run(request) {
        requests.push(request);
        return {
          exitCode: 0,
          status: "exited" as const,
          stderr: Buffer.alloc(0),
          stdout: Buffer.from(`${"a".repeat(64)}\n`),
        };
      },
    },
  });
  deepStrictEqual(
    await port.create(planned.plan, {
      control: "/state/control.json",
      result: "/state/result.json",
      workspace: "/state/workspace",
    }),
    { id: "a".repeat(64), name: planned.plan.containerName },
  );
  strictEqual(requests.length, 1);
  const request = requests[0];
  strictEqual(request?.executable, "docker");
  strictEqual(request?.arguments[0], "--context");
  strictEqual(request?.arguments[1], "eden-r2-goal-pbfbmw");
  strictEqual(request?.arguments[2], "create");
  strictEqual(request?.arguments.includes("--pull"), true);
  strictEqual(request?.arguments.includes("never"), true);
  strictEqual(request?.arguments.includes("--read-only"), true);
  strictEqual(request?.arguments.includes("--privileged"), false);
  strictEqual(request?.arguments.includes("--rm"), false);
  strictEqual(request?.arguments.at(-1), planned.plan.imageReference);
  strictEqual(
    request?.arguments.includes("type=bind,source=/state/workspace,target=/workspace,readonly"),
    true,
  );
});

function scriptedEnvironment(options: {
  readonly cleanupOk?: boolean;
  readonly createOk?: boolean;
  readonly dispatchStarted?: boolean;
  readonly exitCode?: number;
  readonly initial: "absent" | "created" | "exited" | "running";
  readonly internalResult?: RepositoryCheckInternalResultV1 | null;
  readonly locateUnknown?: boolean;
  readonly oomKilled?: boolean;
  readonly removeOk?: boolean;
  readonly startOk?: boolean;
  readonly stateValid?: boolean;
  readonly wait?: "exited" | "timeout" | "unknown";
}) {
  const calls: string[] = [];
  const containerId = "a".repeat(64);
  let state: "absent" | "created" | "exited" | "running" = options.initial;
  const port: RepositoryCheckExecutionPort = {
    async create() {
      calls.push("create");
      if (options.createOk === false) return null;
      state = "created";
      return { id: containerId, name: "eden-check-a143542d2e476509f156de5a" };
    },
    async inspect() {
      calls.push("inspect");
      return state === "absent"
        ? { status: "absent" as const }
        : {
            inspection: {
              exitCode: state === "exited" ? (options.exitCode ?? 0) : 0,
              id: containerId,
              name: "eden-check-a143542d2e476509f156de5a",
              oomKilled: options.oomKilled ?? false,
              state,
            },
            status: "found" as const,
          };
    },
    async kill() {
      calls.push("kill");
      state = "exited";
      return true;
    },
    async locate() {
      calls.push("locate");
      if (options.locateUnknown === true) return { status: "unknown" as const };
      return state === "absent"
        ? { status: "absent" as const }
        : {
            id: containerId,
            name: "eden-check-a143542d2e476509f156de5a",
            status: "found" as const,
          };
    },
    async remove(id) {
      calls.push(`remove:${id}`);
      if (options.removeOk === false) return false;
      state = "absent";
      return true;
    },
    async start(id) {
      calls.push(`start:${id}`);
      if (options.startOk === false) return false;
      state = "running";
      return true;
    },
    async stop() {
      calls.push("stop");
      state = "exited";
      return true;
    },
    async wait(id) {
      calls.push(`wait:${id}`);
      if (options.wait === "timeout") return { status: "timeout" as const };
      if (options.wait === "unknown") return { status: "unknown" as const };
      state = "exited";
      return { exitCode: options.exitCode ?? 0, status: "exited" as const };
    },
  };
  let durableReceipt: Parameters<RepositoryCheckExecutionState["recordReceipt"]>[0] | null = null;
  const executionState: RepositoryCheckExecutionState = {
    paths: {
      control: "/state/control.json",
      result: "/state/result.json",
      workspace: "/state/workspace",
    },
    async cleanupStaging() {
      calls.push("cleanup-staging");
      return options.cleanupOk ?? true;
    },
    async readInternalResult() {
      calls.push("read-result");
      if (options.internalResult === null) return null;
      const internalResult = options.internalResult ?? repositoryCheckInternalResultFixture;
      return {
        bytes: Buffer.from(`${JSON.stringify(internalResult)}\n`),
        value: internalResult,
      };
    },
    async readReceipt() {
      calls.push("read-receipt");
      return durableReceipt;
    },
    async recordReceipt(receipt) {
      calls.push("record-receipt");
      durableReceipt = receipt;
    },
    async validate() {
      calls.push("validate-state");
      return options.stateValid ?? true;
    },
  };
  const environment = {
    clock: () => "2026-08-01T03:00:02.000Z",
    id: () => "receipt-repository-check-1",
    port,
    state: executionState,
  };
  return {
    calls,
    dispatchStarted: options.dispatchStarted ?? false,
    environment,
    setReceipt(value: NonNullable<typeof durableReceipt>) {
      durableReceipt = value;
    },
  };
}

test("repository-check runner records a failing child receipt before cleanup when its wrapper exits zero", async () => {
  const scripted = scriptedEnvironment({ initial: "absent" });
  const result = await executeRepositoryCheck(
    { action: repositoryCheckActionFixture, effectId },
    scripted.environment,
  );

  strictEqual(result.ok, true);
  if (!result.ok) return;
  strictEqual(result.event.type, "repository.check.completed");
  if (result.event.type !== "repository.check.completed") return;
  strictEqual(result.event.result.outcome, "failed");
  strictEqual(result.event.result.cleanup.status, "complete");
  strictEqual(result.event.receipt.container.id, "a".repeat(64));
  deepStrictEqual(scripted.calls, [
    "read-receipt",
    "validate-state",
    "locate",
    "create",
    "inspect",
    `start:${"a".repeat(64)}`,
    `wait:${"a".repeat(64)}`,
    "inspect",
    "read-result",
    "record-receipt",
    "locate",
    "inspect",
    `remove:${"a".repeat(64)}`,
    "cleanup-staging",
  ]);
});

test("created recovery requires durable dispatch and never duplicates create", async () => {
  const beforeDispatch = scriptedEnvironment({ initial: "created" });
  deepStrictEqual(
    await recoverRepositoryCheck(
      { action: repositoryCheckActionFixture, dispatchStarted: false, effectId },
      beforeDispatch.environment,
    ),
    { status: "not-started" },
  );
  strictEqual(beforeDispatch.calls.includes("create"), false);
  strictEqual(
    beforeDispatch.calls.some((call) => call.startsWith("start:")),
    false,
  );

  const afterDispatch = scriptedEnvironment({ dispatchStarted: true, initial: "created" });
  const recovered = await recoverRepositoryCheck(
    { action: repositoryCheckActionFixture, dispatchStarted: true, effectId },
    afterDispatch.environment,
  );
  strictEqual(recovered.status, "completed");
  strictEqual(afterDispatch.calls.includes("create"), false);
  strictEqual(afterDispatch.calls.filter((call) => call.startsWith("start:")).length, 1);
});

test("receipt recovery accepts already-absent exact cleanup without rereading output", async () => {
  const scripted = scriptedEnvironment({ initial: "absent" });
  const first = await executeRepositoryCheck(
    { action: repositoryCheckActionFixture, effectId },
    scripted.environment,
  );
  strictEqual(first.ok, true);
  scripted.calls.length = 0;

  const recovered = await recoverRepositoryCheck(
    { action: repositoryCheckActionFixture, dispatchStarted: true, effectId },
    scripted.environment,
  );
  strictEqual(recovered.status, "completed");
  deepStrictEqual(scripted.calls, ["read-receipt", "locate", "cleanup-staging"]);
});

test("repository-check execution fails closed before create for stale or unknown state", async () => {
  const stale = scriptedEnvironment({ initial: "absent", stateValid: false });
  deepStrictEqual(
    await executeRepositoryCheck(
      { action: repositoryCheckActionFixture, effectId },
      stale.environment,
    ),
    { code: "repository_check_staging_invalid", ok: false },
  );
  strictEqual(stale.calls.includes("create"), false);

  const daemonUnknown = scriptedEnvironment({ initial: "absent", locateUnknown: true });
  deepStrictEqual(
    await executeRepositoryCheck(
      { action: repositoryCheckActionFixture, effectId },
      daemonUnknown.environment,
    ),
    { code: "repository_check_container_unknown", ok: false },
  );
  strictEqual(daemonUnknown.calls.includes("create"), false);
});

test("repository-check execution preserves ambiguous create, start, wait, and result states", async () => {
  const createUnknown = scriptedEnvironment({ createOk: false, initial: "absent" });
  deepStrictEqual(
    await executeRepositoryCheck(
      { action: repositoryCheckActionFixture, effectId },
      createUnknown.environment,
    ),
    { code: "repository_check_create_unknown", ok: false },
  );

  const startUnknown = scriptedEnvironment({ initial: "created", startOk: false });
  deepStrictEqual(
    await executeRepositoryCheck(
      { action: repositoryCheckActionFixture, effectId },
      startUnknown.environment,
    ),
    { code: "repository_check_start_unknown", ok: false },
  );
  strictEqual(startUnknown.calls.includes("create"), false);

  const waitUnknown = scriptedEnvironment({ initial: "running", wait: "unknown" });
  deepStrictEqual(
    await executeRepositoryCheck(
      { action: repositoryCheckActionFixture, effectId },
      waitUnknown.environment,
    ),
    { code: "repository_check_wait_unknown", ok: false },
  );
  strictEqual(waitUnknown.calls.includes("create"), false);
  strictEqual(
    waitUnknown.calls.some((call) => call.startsWith("start:")),
    false,
  );

  const resultMissing = scriptedEnvironment({ initial: "exited", internalResult: null });
  deepStrictEqual(
    await executeRepositoryCheck(
      { action: repositoryCheckActionFixture, effectId },
      resultMissing.environment,
    ),
    { code: "repository_check_result_unavailable", ok: false },
  );
  strictEqual(resultMissing.calls.includes("record-receipt"), false);
  strictEqual(
    resultMissing.calls.some((call) => call.startsWith("remove:")),
    false,
  );
});

test("running and exited recovery continue only the exact dispatched object", async () => {
  const running = scriptedEnvironment({ initial: "running" });
  strictEqual(
    (
      await recoverRepositoryCheck(
        { action: repositoryCheckActionFixture, dispatchStarted: true, effectId },
        running.environment,
      )
    ).status,
    "completed",
  );
  strictEqual(running.calls.includes("create"), false);
  strictEqual(
    running.calls.some((call) => call.startsWith("start:")),
    false,
  );
  strictEqual(running.calls.filter((call) => call.startsWith("wait:")).length, 1);

  const exited = scriptedEnvironment({ initial: "exited" });
  strictEqual(
    (
      await recoverRepositoryCheck(
        { action: repositoryCheckActionFixture, dispatchStarted: true, effectId },
        exited.environment,
      )
    ).status,
    "completed",
  );
  strictEqual(exited.calls.includes("create"), false);
  strictEqual(
    exited.calls.some((call) => call.startsWith("start:")),
    false,
  );
  strictEqual(
    exited.calls.some((call) => call.startsWith("wait:")),
    false,
  );

  const preDispatchRunning = scriptedEnvironment({ initial: "running" });
  deepStrictEqual(
    await recoverRepositoryCheck(
      { action: repositoryCheckActionFixture, dispatchStarted: false, effectId },
      preDispatchRunning.environment,
    ),
    { status: "unknown" },
  );
});

test("OOM attribution and ordinary cleanup failure produce closed non-success results", async () => {
  const oomInternal: RepositoryCheckInternalResultV1 = {
    ...repositoryCheckInternalResultFixture,
    exitCode: 137,
    outcome: "engine_failed",
    wrapperReason: "spawn_failed",
  };
  const oom = scriptedEnvironment({
    exitCode: 137,
    initial: "exited",
    internalResult: oomInternal,
    oomKilled: true,
  });
  const oomResult = await executeRepositoryCheck(
    { action: repositoryCheckActionFixture, effectId },
    oom.environment,
  );
  strictEqual(oomResult.ok, true);
  if (!oomResult.ok) return;
  strictEqual(oomResult.event.result.outcome, "oom");
  strictEqual(oomResult.event.result.wrapperReason, "oom_killed");

  const cleanupFailure = scriptedEnvironment({ initial: "exited", removeOk: false });
  const cleanupResult = await executeRepositoryCheck(
    { action: repositoryCheckActionFixture, effectId },
    cleanupFailure.environment,
  );
  strictEqual(cleanupResult.ok, true);
  if (!cleanupResult.ok) return;
  strictEqual(cleanupResult.event.result.outcome, "cleanup_failed");
  strictEqual(cleanupResult.event.result.cleanup.status, "failed");
});

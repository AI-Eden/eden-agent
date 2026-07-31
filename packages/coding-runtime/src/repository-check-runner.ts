import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";

import {
  decodeActionEnvelope,
  decodeRepositoryCheckReceipt,
  decodeRepositoryCheckResult,
  type RepositoryCheckActionEnvelopeV1,
  type RepositoryCheckLifecycleState,
  type RepositoryCheckProcess,
  type RepositoryCheckReceiptV1,
} from "@eden/contracts";
import type { KernelEvent } from "@eden/kernel";
import {
  type NativeProcessObservation,
  type NativeProcessPort,
  NativeProcessRunner,
} from "./native-process.ts";
import { safeActionDigest } from "./policy/index.ts";
import { repositoryCheckStagingIdentity } from "./repository-check-identity.ts";
import {
  repositoryCheckToolchainConfigDigests,
  repositoryCheckToolchainImageRepository,
} from "./repository-check-toolchain.ts";

const fixedImageEnvironment = "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt";

export type RepositoryCheckExecutionPaths = {
  readonly control: string;
  readonly result: string;
  readonly workspace: string;
};

export type RepositoryCheckLabels = {
  readonly actionId: string;
  readonly effectId: string;
  readonly imageIndexDigest: string;
  readonly inputManifestDigest: string;
  readonly platformManifestDigest: string;
  readonly profileRevision: "r2-docker-profile-v1";
  readonly runId: string;
  readonly schema: "eden.repository-check.v1";
};

export type RepositoryCheckWrapperRequestV1 = {
  readonly actionId: string;
  readonly budgets: {
    readonly stderrBytes: 16_384;
    readonly stdoutBytes: 16_384;
    readonly stopGraceMs: 2_000;
    readonly timeoutMs: 30_000;
  };
  readonly checkName: string;
  readonly effectId: string;
  readonly inputManifestDigest: string;
  readonly process: RepositoryCheckProcess;
  readonly requestVersion: 1;
  readonly wrapperProtocolVersion: 1;
};

export type RepositoryCheckExecutionPlan = {
  readonly action: RepositoryCheckActionEnvelopeV1;
  readonly actionDigest: string;
  readonly configDigest: string;
  readonly containerName: string;
  readonly imageConfigDigest: string;
  readonly imageReference: string;
  readonly labels: RepositoryCheckLabels;
  readonly pull: "never";
  readonly request: RepositoryCheckWrapperRequestV1;
};

export type RepositoryCheckExecutionPlanResult =
  | { readonly code: "action_invalid" | "effect_identity_invalid"; readonly ok: false }
  | { readonly ok: true; readonly plan: RepositoryCheckExecutionPlan };

export type RepositoryCheckContainerInspection = {
  readonly exitCode: number;
  readonly id: string;
  readonly name: string;
  readonly oomKilled: boolean;
  readonly state: "created" | "exited" | "running";
};

export type RepositoryCheckContainerInspectionDecodeResult =
  | { readonly code: "inspection_invalid" | "inspection_overflow"; readonly ok: false }
  | { readonly ok: true; readonly value: RepositoryCheckContainerInspection };

export type RepositoryCheckLocation =
  | { readonly status: "absent" }
  | { readonly id: string; readonly name: string; readonly status: "found" }
  | { readonly status: "unknown" };

export type RepositoryCheckPortInspection =
  | { readonly status: "absent" }
  | { readonly inspection: RepositoryCheckContainerInspection; readonly status: "found" }
  | { readonly status: "unknown" };

export interface RepositoryCheckExecutionPort {
  create(
    plan: RepositoryCheckExecutionPlan,
    paths: RepositoryCheckExecutionPaths,
    signal?: AbortSignal,
  ): Promise<{ readonly id: string; readonly name: string } | null>;
  inspect(
    plan: RepositoryCheckExecutionPlan,
    paths: RepositoryCheckExecutionPaths,
    signal?: AbortSignal,
  ): Promise<RepositoryCheckPortInspection>;
  kill(id: string, signal?: AbortSignal): Promise<boolean>;
  locate(
    plan: RepositoryCheckExecutionPlan,
    signal?: AbortSignal,
  ): Promise<RepositoryCheckLocation>;
  remove(id: string, signal?: AbortSignal): Promise<boolean>;
  start(id: string, signal?: AbortSignal): Promise<boolean>;
  stop(id: string, graceMs: number, signal?: AbortSignal): Promise<boolean>;
  wait(
    id: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<
    | { readonly exitCode: number; readonly status: "exited" }
    | { readonly status: "timeout" | "unknown" }
  >;
}

export type RepositoryCheckInternalResultV1 = {
  readonly actionId: string;
  readonly checkName: string;
  readonly effectId: string;
  readonly endedAt: string;
  readonly exitCode: number | null;
  readonly inputManifestDigest: string;
  readonly outcome:
    | "cancelled"
    | "engine_failed"
    | "failed"
    | "output_overflow"
    | "passed"
    | "timed_out";
  readonly resultVersion: 1;
  readonly startedAt: string;
  readonly stderr: string;
  readonly stderrByteLength: number;
  readonly stderrEncoding: "base64";
  readonly stderrSha256: string;
  readonly stdout: string;
  readonly stdoutByteLength: number;
  readonly stdoutEncoding: "base64";
  readonly stdoutSha256: string;
  readonly wrapperProtocolVersion: 1;
  readonly wrapperReason:
    | "cancel_requested"
    | "process_exited"
    | "spawn_failed"
    | "stderr_overflow"
    | "stdout_overflow"
    | "wall_clock_exceeded";
};

export type RepositoryCheckDurableReceipt = {
  readonly internalResult: RepositoryCheckInternalResultV1;
  readonly receipt: RepositoryCheckReceiptV1;
};

export interface RepositoryCheckExecutionState {
  readonly paths: RepositoryCheckExecutionPaths;
  cleanupStaging(): Promise<boolean>;
  readInternalResult(): Promise<{
    readonly bytes: Uint8Array;
    readonly value: RepositoryCheckInternalResultV1;
  } | null>;
  readReceipt(): Promise<RepositoryCheckDurableReceipt | null | "unknown">;
  recordReceipt(value: RepositoryCheckDurableReceipt): Promise<void>;
  validate(plan: RepositoryCheckExecutionPlan): Promise<boolean>;
}

export type RepositoryCheckExecutionEnvironment = {
  readonly clock: () => string;
  readonly id: () => string;
  readonly observe?: (state: RepositoryCheckLifecycleState) => Promise<void>;
  readonly port: RepositoryCheckExecutionPort;
  readonly state: RepositoryCheckExecutionState;
};

type RepositoryCheckCompletedEvent = Extract<
  KernelEvent,
  { readonly type: "repository.check.completed" }
>;

export type ExecuteRepositoryCheckResult =
  | { readonly code: string; readonly ok: false }
  | { readonly event: RepositoryCheckCompletedEvent; readonly ok: true };

export type RecoverRepositoryCheckResult =
  | { readonly event: RepositoryCheckCompletedEvent; readonly status: "completed" }
  | { readonly status: "not-started" | "unknown" };

export type DockerCliRepositoryCheckPortOptions = {
  readonly cwd: string;
  readonly dockerContext?: string;
  readonly dockerExecutable?: string;
  readonly dockerHost?: string;
  readonly nativeProcess?: NativeProcessPort;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0`)
    .update(canonicalJson(value))
    .digest("hex")}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sorted = [...expected].sort();
  return actual.length === sorted.length && actual.every((key, index) => key === sorted[index]);
}

function exactStringSet(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === "string") &&
    new Set(value).size === value.length &&
    value.length === expected.length &&
    expected.every((entry) => value.includes(entry))
  );
}

export function createRepositoryCheckExecutionPlan(
  value: RepositoryCheckActionEnvelopeV1,
  effectId: string,
): RepositoryCheckExecutionPlanResult {
  const decoded = decodeActionEnvelope(value);
  if (!decoded.ok || decoded.value.kind !== "repository_check_v1") {
    return { code: "action_invalid", ok: false };
  }
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/u.test(effectId)) {
    return { code: "effect_identity_invalid", ok: false };
  }
  const action = decoded.value;
  if (
    action.staging.identity !==
    repositoryCheckStagingIdentity({
      effectId,
      inputManifestDigest: action.repositorySnapshot.digest,
      runId: action.runId,
    })
  ) {
    return { code: "action_invalid", ok: false };
  }
  const effectHash = createHash("sha256").update(effectId).digest("hex");
  const labels: RepositoryCheckLabels = {
    actionId: action.actionId,
    effectId,
    imageIndexDigest: action.toolchain.imageIndexDigest,
    inputManifestDigest: action.repositorySnapshot.digest,
    platformManifestDigest: action.toolchain.platformManifestDigest,
    profileRevision: action.profile.profileRevision,
    runId: action.runId,
    schema: "eden.repository-check.v1",
  };
  const request: RepositoryCheckWrapperRequestV1 = {
    actionId: action.actionId,
    budgets: {
      stderrBytes: action.budgets.stderrBytes,
      stdoutBytes: action.budgets.stdoutBytes,
      stopGraceMs: action.budgets.stopGraceMs,
      timeoutMs: action.budgets.timeoutMs,
    },
    checkName: action.operation.checkName,
    effectId,
    inputManifestDigest: action.repositorySnapshot.digest,
    process: action.operation.process,
    requestVersion: 1,
    wrapperProtocolVersion: action.toolchain.wrapperProtocolVersion,
  };
  const configuration = {
    budgets: action.budgets,
    dockerCompatibility: action.dockerCompatibility,
    environment: action.profile.environment,
    imageIndexDigest: action.toolchain.imageIndexDigest,
    labels,
    mounts: action.mounts,
    platform: action.toolchain.requestedPlatform,
    platformManifestDigest: action.toolchain.platformManifestDigest,
    profile: action.profile,
    request,
    stagingIdentity: action.staging.identity,
  };
  return {
    ok: true,
    plan: {
      action,
      actionDigest: safeActionDigest(action),
      configDigest: digest("eden.repository-check-config.v1", configuration),
      containerName: `eden-check-${effectHash.slice(0, 24)}`,
      imageConfigDigest: repositoryCheckToolchainConfigDigests[action.toolchain.requestedPlatform],
      imageReference: `${repositoryCheckToolchainImageRepository}@${action.toolchain.imageIndexDigest}`,
      labels,
      pull: "never",
      request,
    },
  };
}

function labelsMatch(value: unknown, plan: RepositoryCheckExecutionPlan): boolean {
  if (!isPlainObject(value)) return false;
  const expected = {
    "eden.action-id": plan.labels.actionId,
    "eden.config-digest": plan.configDigest,
    "eden.effect-id": plan.labels.effectId,
    "eden.image-index-digest": plan.labels.imageIndexDigest,
    "eden.input-manifest-digest": plan.labels.inputManifestDigest,
    "eden.platform-manifest-digest": plan.labels.platformManifestDigest,
    "eden.profile-revision": plan.labels.profileRevision,
    "eden.run-id": plan.labels.runId,
    "eden.schema": plan.labels.schema,
    "eden.staging-identity": plan.action.staging.identity,
  };
  return (
    exactKeys(value, Object.keys(expected)) &&
    Object.entries(expected).every(([key, expectedValue]) => value[key] === expectedValue)
  );
}

function mountMatch(value: unknown, paths: RepositoryCheckExecutionPaths): boolean {
  if (!Array.isArray(value) || value.length !== 3) return false;
  const expected = new Map([
    ["/run/eden/request.json", { rw: false, source: paths.control }],
    ["/run/eden/result.json", { rw: true, source: paths.result }],
    ["/workspace", { rw: false, source: paths.workspace }],
  ]);
  for (const row of value) {
    if (
      !isPlainObject(row) ||
      !exactKeys(row, ["Destination", "RW", "Source"]) ||
      typeof row.Destination !== "string" ||
      typeof row.RW !== "boolean" ||
      typeof row.Source !== "string"
    ) {
      return false;
    }
    const match = expected.get(row.Destination);
    if (match === undefined || match.rw !== row.RW || match.source !== row.Source) return false;
    expected.delete(row.Destination);
  }
  return expected.size === 0;
}

function tmpfsMatch(value: unknown): boolean {
  if (!isPlainObject(value) || !exactKeys(value, ["/tmp"])) return false;
  const options = value["/tmp"];
  if (typeof options !== "string") return false;
  const rows = options.split(",");
  return (
    new Set(rows).size === rows.length &&
    ["rw", "noexec", "nosuid", "nodev", "size=16777216"].every((row) => rows.includes(row)) &&
    rows.length === 5
  );
}

function ulimitsMatch(value: unknown): boolean {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const normalized = value
    .map((row) =>
      isPlainObject(row) &&
      exactKeys(row, ["Hard", "Name", "Soft"]) &&
      typeof row.Name === "string" &&
      typeof row.Hard === "number" &&
      typeof row.Soft === "number"
        ? `${row.Name}:${row.Soft}:${row.Hard}`
        : null,
    )
    .sort();
  return normalized[0] === "fsize:16777216:16777216" && normalized[1] === "nofile:256:256";
}

export function decodeRepositoryCheckContainerInspection(
  text: string,
  plan: RepositoryCheckExecutionPlan,
  paths: RepositoryCheckExecutionPaths,
): RepositoryCheckContainerInspectionDecodeResult {
  if (Buffer.byteLength(text, "utf8") > 65_536) {
    return { code: "inspection_overflow", ok: false };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { code: "inspection_invalid", ok: false };
  }
  if (
    !isPlainObject(value) ||
    !exactKeys(value, ["Config", "HostConfig", "Id", "Image", "Mounts", "Name", "State"]) ||
    typeof value.Id !== "string" ||
    !/^[a-f0-9]{64}$/u.test(value.Id) ||
    value.Image !== plan.imageConfigDigest ||
    value.Name !== `/${plan.containerName}` ||
    !isPlainObject(value.Config) ||
    !exactKeys(value.Config, ["Cmd", "Entrypoint", "Env", "Labels", "User", "WorkingDir"]) ||
    value.Config.Cmd !== null ||
    !Array.isArray(value.Config.Entrypoint) ||
    value.Config.Entrypoint.length !== 2 ||
    value.Config.Entrypoint[0] !== "/nodejs/bin/node" ||
    value.Config.Entrypoint[1] !== "/opt/eden/wrapper.mjs" ||
    value.Config.User !== `${plan.action.profile.linuxUser}:${plan.action.profile.linuxUser}` ||
    value.Config.WorkingDir !== "/workspace" ||
    !exactStringSet(value.Config.Env, [
      fixedImageEnvironment,
      `CI=${plan.action.profile.environment.CI}`,
      `HOME=${plan.action.profile.environment.HOME}`,
      `LANG=${plan.action.profile.environment.LANG}`,
      `PATH=${plan.action.profile.environment.PATH}`,
    ]) ||
    !labelsMatch(value.Config.Labels, plan) ||
    !mountMatch(value.Mounts, paths) ||
    !isPlainObject(value.HostConfig) ||
    !exactKeys(value.HostConfig, [
      "AutoRemove",
      "CapDrop",
      "IpcMode",
      "Memory",
      "MemorySwap",
      "NanoCpus",
      "NetworkMode",
      "PidMode",
      "PidsLimit",
      "Privileged",
      "ReadonlyRootfs",
      "RestartPolicy",
      "SecurityOpt",
      "Tmpfs",
      "UTSMode",
      "Ulimits",
      "UsernsMode",
    ]) ||
    value.HostConfig.AutoRemove !== false ||
    !exactStringSet(value.HostConfig.CapDrop, ["ALL"]) ||
    value.HostConfig.IpcMode !== "private" ||
    value.HostConfig.Memory !== plan.action.budgets.memoryBytes ||
    value.HostConfig.MemorySwap !== plan.action.budgets.memorySwapBytes ||
    value.HostConfig.NanoCpus !== 1_000_000_000 ||
    value.HostConfig.NetworkMode !== "none" ||
    value.HostConfig.PidMode !== "" ||
    value.HostConfig.PidsLimit !== plan.action.budgets.pids ||
    value.HostConfig.Privileged !== false ||
    value.HostConfig.ReadonlyRootfs !== true ||
    !isPlainObject(value.HostConfig.RestartPolicy) ||
    !exactKeys(value.HostConfig.RestartPolicy, ["Name"]) ||
    value.HostConfig.RestartPolicy.Name !== "no" ||
    !exactStringSet(value.HostConfig.SecurityOpt, ["no-new-privileges"]) ||
    !tmpfsMatch(value.HostConfig.Tmpfs) ||
    value.HostConfig.UTSMode !== "" ||
    !ulimitsMatch(value.HostConfig.Ulimits) ||
    value.HostConfig.UsernsMode !== "" ||
    !isPlainObject(value.State) ||
    !exactKeys(value.State, ["ExitCode", "OOMKilled", "Running", "Status"]) ||
    typeof value.State.ExitCode !== "number" ||
    !Number.isInteger(value.State.ExitCode) ||
    typeof value.State.OOMKilled !== "boolean" ||
    typeof value.State.Running !== "boolean" ||
    !["created", "exited", "running"].includes(String(value.State.Status)) ||
    (value.State.Status === "running") !== value.State.Running
  ) {
    return { code: "inspection_invalid", ok: false };
  }
  return {
    ok: true,
    value: {
      exitCode: value.State.ExitCode,
      id: value.Id,
      name: plan.containerName,
      oomKilled: value.State.OOMKilled,
      state: value.State.Status as "created" | "exited" | "running",
    },
  };
}

function canonicalBase64(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function decodeRepositoryCheckInternalResult(
  value: unknown,
  plan: RepositoryCheckExecutionPlan,
): RepositoryCheckInternalResultV1 | null {
  if (
    !isPlainObject(value) ||
    !exactKeys(value, [
      "actionId",
      "checkName",
      "effectId",
      "endedAt",
      "exitCode",
      "inputManifestDigest",
      "outcome",
      "resultVersion",
      "startedAt",
      "stderr",
      "stderrByteLength",
      "stderrEncoding",
      "stderrSha256",
      "stdout",
      "stdoutByteLength",
      "stdoutEncoding",
      "stdoutSha256",
      "wrapperProtocolVersion",
      "wrapperReason",
    ]) ||
    value.actionId !== plan.action.actionId ||
    value.checkName !== plan.action.operation.checkName ||
    value.effectId !== plan.labels.effectId ||
    value.inputManifestDigest !== plan.action.repositorySnapshot.digest ||
    value.resultVersion !== 1 ||
    value.wrapperProtocolVersion !== 1 ||
    typeof value.startedAt !== "string" ||
    typeof value.endedAt !== "string" ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    Date.parse(value.endedAt) < Date.parse(value.startedAt) ||
    !(
      value.exitCode === null ||
      (typeof value.exitCode === "number" &&
        Number.isInteger(value.exitCode) &&
        value.exitCode >= 0)
    ) ||
    !["cancelled", "engine_failed", "failed", "output_overflow", "passed", "timed_out"].includes(
      String(value.outcome),
    ) ||
    ![
      "cancel_requested",
      "process_exited",
      "spawn_failed",
      "stderr_overflow",
      "stdout_overflow",
      "wall_clock_exceeded",
    ].includes(String(value.wrapperReason)) ||
    value.stdoutEncoding !== "base64" ||
    value.stderrEncoding !== "base64" ||
    !canonicalBase64(value.stdout) ||
    !canonicalBase64(value.stderr) ||
    !Number.isInteger(value.stdoutByteLength) ||
    !Number.isInteger(value.stderrByteLength) ||
    typeof value.stdoutSha256 !== "string" ||
    typeof value.stderrSha256 !== "string"
  ) {
    return null;
  }
  const stdout = Buffer.from(value.stdout, "base64");
  const stderr = Buffer.from(value.stderr, "base64");
  if (
    stdout.byteLength !== value.stdoutByteLength ||
    stderr.byteLength !== value.stderrByteLength ||
    stdout.byteLength > plan.action.budgets.stdoutBytes ||
    stderr.byteLength > plan.action.budgets.stderrBytes ||
    sha256(stdout) !== value.stdoutSha256 ||
    sha256(stderr) !== value.stderrSha256 ||
    (value.outcome === "passed" &&
      (value.exitCode !== 0 || value.wrapperReason !== "process_exited")) ||
    (value.outcome === "failed" &&
      (value.exitCode === null || value.exitCode === 0 || value.wrapperReason !== "process_exited"))
  ) {
    return null;
  }
  return value as RepositoryCheckInternalResultV1;
}

function exactLocation(
  location: RepositoryCheckLocation,
  plan: RepositoryCheckExecutionPlan,
): location is Extract<RepositoryCheckLocation, { readonly status: "found" }> {
  return (
    location.status === "found" &&
    location.name === plan.containerName &&
    /^[a-f0-9]{64}$/u.test(location.id)
  );
}

async function finalizeReceipt(
  plan: RepositoryCheckExecutionPlan,
  durable: RepositoryCheckDurableReceipt,
  environment: RepositoryCheckExecutionEnvironment,
  signal?: AbortSignal,
): Promise<ExecuteRepositoryCheckResult> {
  await environment.observe?.("cleaning");
  const located = await environment.port.locate(plan, signal);
  let containerState: "absent" | "failed" | "removed" =
    located.status === "absent" ? "absent" : "failed";
  if (
    located.status === "found" &&
    located.id === durable.receipt.container.id &&
    located.name === durable.receipt.container.name
  ) {
    const inspected = await environment.port.inspect(plan, environment.state.paths, signal);
    if (
      inspected.status === "found" &&
      inspected.inspection.id === durable.receipt.container.id &&
      inspected.inspection.name === durable.receipt.container.name &&
      inspected.inspection.state === "exited"
    ) {
      containerState = (await environment.port.remove(durable.receipt.container.id, signal))
        ? "removed"
        : "failed";
    }
  }
  const stagingRemoved = await environment.state.cleanupStaging();
  const cleanupComplete = containerState !== "failed" && stagingRemoved;
  const cleanup = {
    actionId: durable.receipt.actionId,
    cleanupVersion: 1 as const,
    completedAt: environment.clock(),
    container: {
      id: durable.receipt.container.id,
      state: containerState,
    },
    effectId: durable.receipt.effectId,
    error: cleanupComplete
      ? null
      : {
          code: "repository_check_cleanup_failed",
          message: "The exact repository-check container or staging tree could not be removed.",
          recoverability: "retry" as const,
          suggestedActions: [
            "Inspect only the exact receipt-owned objects before retrying cleanup.",
          ],
        },
    receiptId: durable.receipt.receiptId,
    staging: {
      identity: durable.receipt.stagingIdentity,
      state: stagingRemoved ? ("removed" as const) : ("failed" as const),
    },
    status: cleanupComplete ? ("complete" as const) : ("failed" as const),
  };
  const internal = durable.internalResult;
  const resultValue = {
    actionId: internal.actionId,
    checkName: internal.checkName,
    cleanup,
    effectId: internal.effectId,
    endedAt: internal.endedAt,
    exitCode: internal.exitCode,
    imageIndexDigest: durable.receipt.labels.imageIndexDigest,
    inputManifestDigest: internal.inputManifestDigest,
    outcome: cleanupComplete ? durable.receipt.resultOutcome : ("cleanup_failed" as const),
    platformManifestDigest: durable.receipt.labels.platformManifestDigest,
    profileRevision: durable.receipt.labels.profileRevision,
    receiptId: durable.receipt.receiptId,
    resultVersion: 1 as const,
    startedAt: internal.startedAt,
    stderr: internal.stderr,
    stderrByteLength: internal.stderrByteLength,
    stderrEncoding: internal.stderrEncoding,
    stderrSha256: internal.stderrSha256,
    stdout: internal.stdout,
    stdoutByteLength: internal.stdoutByteLength,
    stdoutEncoding: internal.stdoutEncoding,
    stdoutSha256: internal.stdoutSha256,
    wrapperReason:
      durable.receipt.resultOutcome === "oom"
        ? ("oom_killed" as const)
        : internal.wrapperReason === "spawn_failed"
          ? ("docker_engine_failed" as const)
          : internal.wrapperReason,
  };
  const result = decodeRepositoryCheckResult(resultValue);
  if (!result.ok) return { code: "repository_check_result_invalid", ok: false };
  return {
    event: {
      effectId: durable.receipt.effectId,
      receipt: durable.receipt,
      result: result.value,
      type: "repository.check.completed",
    },
    ok: true,
  };
}

async function completeContainer(
  plan: RepositoryCheckExecutionPlan,
  container: RepositoryCheckContainerInspection,
  environment: RepositoryCheckExecutionEnvironment,
  signal?: AbortSignal,
): Promise<ExecuteRepositoryCheckResult> {
  let current = container;
  if (current.state === "created") {
    await environment.observe?.("created");
    if (!(await environment.port.start(current.id, signal))) {
      return { code: "repository_check_start_unknown", ok: false };
    }
    current = { ...current, state: "running" };
  }
  if (current.state === "running") {
    await environment.observe?.("running");
    const waited = await environment.port.wait(current.id, plan.action.budgets.timeoutMs, signal);
    if (waited.status === "timeout") {
      const stopped = await environment.port.stop(
        current.id,
        plan.action.budgets.stopGraceMs,
        signal,
      );
      if (!stopped && !(await environment.port.kill(current.id, signal))) {
        return { code: "repository_check_timeout_unknown", ok: false };
      }
    } else if (waited.status === "unknown") {
      return { code: "repository_check_wait_unknown", ok: false };
    }
  }
  const inspected = await environment.port.inspect(plan, environment.state.paths, signal);
  if (
    inspected.status !== "found" ||
    inspected.inspection.id !== current.id ||
    inspected.inspection.name !== plan.containerName ||
    inspected.inspection.state !== "exited"
  ) {
    return { code: "repository_check_exit_unknown", ok: false };
  }
  await environment.observe?.("exited");
  const resultFile = await environment.state.readInternalResult();
  if (
    resultFile === null ||
    resultFile.bytes.byteLength > plan.action.budgets.internalResultBytes
  ) {
    return { code: "repository_check_result_unavailable", ok: false };
  }
  const internal = decodeRepositoryCheckInternalResult(resultFile.value, plan);
  if (
    internal === null ||
    (inspected.inspection.oomKilled && internal.outcome !== "engine_failed") ||
    (!inspected.inspection.oomKilled && inspected.inspection.exitCode !== 0)
  ) {
    return { code: "repository_check_result_mismatch", ok: false };
  }
  await environment.observe?.("result_decoded");
  const receiptValue: RepositoryCheckReceiptV1 = {
    actionId: plan.action.actionId,
    configDigest: plan.configDigest,
    container: { id: current.id, name: plan.containerName },
    effectId: plan.labels.effectId,
    labels: plan.labels,
    lifecycleState: "exited",
    receiptId: environment.id(),
    receiptVersion: 1,
    recordedAt: environment.clock(),
    resultDigest: sha256(resultFile.bytes),
    resultOutcome: inspected.inspection.oomKilled ? "oom" : internal.outcome,
    stagingIdentity: plan.action.staging.identity,
  };
  const receipt = decodeRepositoryCheckReceipt(receiptValue);
  if (!receipt.ok) return { code: "repository_check_receipt_invalid", ok: false };
  const durable = { internalResult: internal, receipt: receipt.value };
  await environment.state.recordReceipt(durable);
  return finalizeReceipt(plan, durable, environment, signal);
}

async function executePlannedRepositoryCheck(
  plan: RepositoryCheckExecutionPlan,
  environment: RepositoryCheckExecutionEnvironment,
  signal?: AbortSignal,
): Promise<ExecuteRepositoryCheckResult> {
  const durable = await environment.state.readReceipt();
  if (durable === "unknown") return { code: "repository_check_receipt_unknown", ok: false };
  if (durable !== null) return finalizeReceipt(plan, durable, environment, signal);
  if (!(await environment.state.validate(plan))) {
    return { code: "repository_check_staging_invalid", ok: false };
  }
  await environment.observe?.("preparing");
  const located = await environment.port.locate(plan, signal);
  let container: RepositoryCheckContainerInspection;
  if (located.status === "absent") {
    await environment.observe?.("creating");
    const created = await environment.port.create(plan, environment.state.paths, signal);
    if (created === null || created.name !== plan.containerName) {
      return { code: "repository_check_create_unknown", ok: false };
    }
    const inspected = await environment.port.inspect(plan, environment.state.paths, signal);
    if (
      inspected.status !== "found" ||
      inspected.inspection.id !== created.id ||
      inspected.inspection.name !== plan.containerName ||
      inspected.inspection.state !== "created"
    ) {
      return { code: "repository_check_created_mismatch", ok: false };
    }
    container = inspected.inspection;
  } else if (exactLocation(located, plan)) {
    const inspected = await environment.port.inspect(plan, environment.state.paths, signal);
    if (
      inspected.status !== "found" ||
      inspected.inspection.id !== located.id ||
      inspected.inspection.name !== plan.containerName
    ) {
      return { code: "repository_check_container_mismatch", ok: false };
    }
    container = inspected.inspection;
  } else {
    return { code: "repository_check_container_unknown", ok: false };
  }
  return completeContainer(plan, container, environment, signal);
}

export async function executeRepositoryCheck(
  input: {
    readonly action: RepositoryCheckActionEnvelopeV1;
    readonly effectId: string;
  },
  environment: RepositoryCheckExecutionEnvironment,
  signal?: AbortSignal,
): Promise<ExecuteRepositoryCheckResult> {
  const planned = createRepositoryCheckExecutionPlan(input.action, input.effectId);
  return planned.ok
    ? executePlannedRepositoryCheck(planned.plan, environment, signal)
    : { code: planned.code, ok: false };
}

export async function recoverRepositoryCheck(
  input: {
    readonly action: RepositoryCheckActionEnvelopeV1;
    readonly dispatchStarted: boolean;
    readonly effectId: string;
  },
  environment: RepositoryCheckExecutionEnvironment,
  signal?: AbortSignal,
): Promise<RecoverRepositoryCheckResult> {
  const planned = createRepositoryCheckExecutionPlan(input.action, input.effectId);
  if (!planned.ok) return { status: "unknown" };
  const durable = await environment.state.readReceipt();
  if (durable === "unknown") return { status: "unknown" };
  if (durable !== null) {
    const completed = await finalizeReceipt(planned.plan, durable, environment, signal);
    return completed.ok ? { event: completed.event, status: "completed" } : { status: "unknown" };
  }
  if (!(await environment.state.validate(planned.plan))) return { status: "unknown" };
  const located = await environment.port.locate(planned.plan, signal);
  if (located.status === "absent") {
    return { status: input.dispatchStarted ? "unknown" : "not-started" };
  }
  if (!exactLocation(located, planned.plan)) return { status: "unknown" };
  const inspected = await environment.port.inspect(planned.plan, environment.state.paths, signal);
  if (
    inspected.status !== "found" ||
    inspected.inspection.id !== located.id ||
    inspected.inspection.name !== planned.plan.containerName
  ) {
    return { status: "unknown" };
  }
  if (!input.dispatchStarted) {
    return inspected.inspection.state === "created"
      ? { status: "not-started" }
      : { status: "unknown" };
  }
  const completed = await completeContainer(
    planned.plan,
    inspected.inspection,
    environment,
    signal,
  );
  return completed.ok ? { event: completed.event, status: "completed" } : { status: "unknown" };
}

const repositoryCheckInspectionFormat =
  '{"Config":{"Cmd":{{json .Config.Cmd}},"Entrypoint":{{json .Config.Entrypoint}},"Env":{{json .Config.Env}},"Labels":{{json .Config.Labels}},"User":{{json .Config.User}},"WorkingDir":{{json .Config.WorkingDir}}},"HostConfig":{"AutoRemove":{{json .HostConfig.AutoRemove}},"CapDrop":{{json .HostConfig.CapDrop}},"IpcMode":{{json .HostConfig.IpcMode}},"Memory":{{json .HostConfig.Memory}},"MemorySwap":{{json .HostConfig.MemorySwap}},"NanoCpus":{{json .HostConfig.NanoCpus}},"NetworkMode":{{json .HostConfig.NetworkMode}},"PidMode":{{json .HostConfig.PidMode}},"PidsLimit":{{json .HostConfig.PidsLimit}},"Privileged":{{json .HostConfig.Privileged}},"ReadonlyRootfs":{{json .HostConfig.ReadonlyRootfs}},"RestartPolicy":{"Name":{{json .HostConfig.RestartPolicy.Name}}},"SecurityOpt":{{json .HostConfig.SecurityOpt}},"Tmpfs":{{json .HostConfig.Tmpfs}},"UTSMode":{{json .HostConfig.UTSMode}},"Ulimits":{{json .HostConfig.Ulimits}},"UsernsMode":{{json .HostConfig.UsernsMode}}},"Id":{{json .Id}},"Image":{{json .Image}},"Mounts":[{{range $index, $mount := .Mounts}}{{if $index}},{{end}}{"Destination":{{json $mount.Destination}},"RW":{{json $mount.RW}},"Source":{{json $mount.Source}}}{{end}}],"Name":{{json .Name}},"State":{"ExitCode":{{json .State.ExitCode}},"OOMKilled":{{json .State.OOMKilled}},"Running":{{json .State.Running}},"Status":{{json .State.Status}}}}';
const repositoryCheckLocationFormat = '{"ID":{{json .ID}},"Names":{{json .Names}}}';

function succeeded(
  observation: NativeProcessObservation,
): observation is Extract<NativeProcessObservation, { readonly status: "exited" }> {
  return observation.status === "exited" && observation.exitCode === 0;
}

function safeMountPath(value: string): boolean {
  return (
    isAbsolute(value) && !value.includes("\0") && !value.includes(",") && !value.includes("\n")
  );
}

export class DockerCliRepositoryCheckPort implements RepositoryCheckExecutionPort {
  readonly #cwd: string;
  readonly #dockerContext: string | undefined;
  readonly #dockerExecutable: string;
  readonly #dockerHost: string | undefined;
  readonly #nativeProcess: NativeProcessPort;

  constructor(options: DockerCliRepositoryCheckPortOptions) {
    if (options.dockerContext !== undefined && options.dockerHost !== undefined) {
      throw new Error("Docker context and host selection are mutually exclusive.");
    }
    this.#cwd = options.cwd;
    this.#dockerContext = options.dockerContext;
    this.#dockerExecutable = options.dockerExecutable ?? "docker";
    this.#dockerHost = options.dockerHost;
    this.#nativeProcess = options.nativeProcess ?? new NativeProcessRunner();
  }

  #connectionArguments(): readonly string[] {
    if (this.#dockerContext !== undefined) return ["--context", this.#dockerContext];
    return this.#dockerHost === undefined ? [] : ["--host", this.#dockerHost];
  }

  #environment(): Readonly<Record<string, string>> {
    return this.#dockerExecutable.includes("/")
      ? {}
      : {
          ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
          ...(process.env.SystemRoot === undefined ? {} : { SystemRoot: process.env.SystemRoot }),
        };
  }

  #run(
    arguments_: readonly string[],
    maxStdoutBytes: number,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#nativeProcess.run(
      {
        arguments: [...this.#connectionArguments(), ...arguments_],
        cwd: this.#cwd,
        environment: this.#environment(),
        executable: this.#dockerExecutable,
        maxStderrBytes: 4_096,
        maxStdoutBytes,
        timeoutMs,
      },
      signal,
    );
  }

  async create(
    plan: RepositoryCheckExecutionPlan,
    paths: RepositoryCheckExecutionPaths,
    signal?: AbortSignal,
  ): Promise<{ readonly id: string; readonly name: string } | null> {
    if (![paths.control, paths.result, paths.workspace].every(safeMountPath)) return null;
    const labels = {
      "eden.action-id": plan.labels.actionId,
      "eden.config-digest": plan.configDigest,
      "eden.effect-id": plan.labels.effectId,
      "eden.image-index-digest": plan.labels.imageIndexDigest,
      "eden.input-manifest-digest": plan.labels.inputManifestDigest,
      "eden.platform-manifest-digest": plan.labels.platformManifestDigest,
      "eden.profile-revision": plan.labels.profileRevision,
      "eden.run-id": plan.labels.runId,
      "eden.schema": plan.labels.schema,
      "eden.staging-identity": plan.action.staging.identity,
    };
    const arguments_: string[] = ["create", "--pull", "never", "--name", plan.containerName];
    for (const [name, value] of Object.entries(labels)) {
      arguments_.push("--label", `${name}=${value}`);
    }
    arguments_.push(
      "--platform",
      plan.action.toolchain.requestedPlatform,
      "--network",
      "none",
      "--read-only",
      "--tmpfs",
      `/tmp:rw,noexec,nosuid,nodev,size=${plan.action.budgets.tmpfsBytes}`,
      "--user",
      `${plan.action.profile.linuxUser}:${plan.action.profile.linuxUser}`,
      "--workdir",
      "/workspace",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      String(plan.action.budgets.memoryBytes),
      "--memory-swap",
      String(plan.action.budgets.memorySwapBytes),
      "--cpus",
      String(plan.action.budgets.cpuCount),
      "--pids-limit",
      String(plan.action.budgets.pids),
      "--ulimit",
      `nofile=${plan.action.budgets.fileDescriptors}:${plan.action.budgets.fileDescriptors}`,
      "--ulimit",
      `fsize=${plan.action.budgets.fileSizeBytes}:${plan.action.budgets.fileSizeBytes}`,
      "--restart",
      "no",
      "--ipc",
      "private",
      "--env",
      `CI=${plan.action.profile.environment.CI}`,
      "--env",
      `HOME=${plan.action.profile.environment.HOME}`,
      "--env",
      `LANG=${plan.action.profile.environment.LANG}`,
      "--env",
      `PATH=${plan.action.profile.environment.PATH}`,
      "--mount",
      `type=bind,source=${paths.workspace},target=/workspace,readonly`,
      "--mount",
      `type=bind,source=${paths.control},target=/run/eden/request.json,readonly`,
      "--mount",
      `type=bind,source=${paths.result},target=/run/eden/result.json`,
      plan.imageReference,
    );
    const observation = await this.#run(arguments_, 4_096, 5_000, signal);
    if (!succeeded(observation) || observation.stderr.byteLength !== 0) return null;
    const id = Buffer.from(observation.stdout).toString("utf8").trim();
    return /^[a-f0-9]{64}$/u.test(id) ? { id, name: plan.containerName } : null;
  }

  async inspect(
    plan: RepositoryCheckExecutionPlan,
    paths: RepositoryCheckExecutionPaths,
    signal?: AbortSignal,
  ): Promise<RepositoryCheckPortInspection> {
    const observation = await this.#run(
      ["inspect", "--format", repositoryCheckInspectionFormat, plan.containerName],
      65_536,
      5_000,
      signal,
    );
    if (!succeeded(observation) || observation.stderr.byteLength !== 0) {
      return { status: "unknown" };
    }
    const decoded = decodeRepositoryCheckContainerInspection(
      Buffer.from(observation.stdout).toString("utf8"),
      plan,
      paths,
    );
    return decoded.ok ? { inspection: decoded.value, status: "found" } : { status: "unknown" };
  }

  async locate(
    plan: RepositoryCheckExecutionPlan,
    signal?: AbortSignal,
  ): Promise<RepositoryCheckLocation> {
    const observation = await this.#run(
      [
        "container",
        "ls",
        "--all",
        "--no-trunc",
        "--filter",
        `name=^/${plan.containerName}$`,
        "--format",
        repositoryCheckLocationFormat,
      ],
      4_096,
      5_000,
      signal,
    );
    if (!succeeded(observation) || observation.stderr.byteLength !== 0) {
      return { status: "unknown" };
    }
    const lines = Buffer.from(observation.stdout)
      .toString("utf8")
      .split("\n")
      .filter((line) => line.length > 0);
    if (lines.length === 0) return { status: "absent" };
    if (lines.length !== 1) return { status: "unknown" };
    try {
      const value: unknown = JSON.parse(lines[0] ?? "");
      if (
        !isPlainObject(value) ||
        !exactKeys(value, ["ID", "Names"]) ||
        typeof value.ID !== "string" ||
        !/^[a-f0-9]{64}$/u.test(value.ID) ||
        value.Names !== plan.containerName
      ) {
        return { status: "unknown" };
      }
      return { id: value.ID, name: value.Names, status: "found" };
    } catch {
      return { status: "unknown" };
    }
  }

  async start(id: string, signal?: AbortSignal): Promise<boolean> {
    const observation = await this.#run(["start", id], 4_096, 5_000, signal);
    return succeeded(observation) && observation.stderr.byteLength === 0;
  }

  async wait(
    id: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<
    | { readonly exitCode: number; readonly status: "exited" }
    | { readonly status: "timeout" | "unknown" }
  > {
    const observation = await this.#run(["wait", id], 4_096, timeoutMs + 2_000, signal);
    if (observation.status === "timed-out") return { status: "timeout" };
    if (!succeeded(observation) || observation.stderr.byteLength !== 0) {
      return { status: "unknown" };
    }
    const exitCode = Number(Buffer.from(observation.stdout).toString("utf8").trim());
    return Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255
      ? { exitCode, status: "exited" }
      : { status: "unknown" };
  }

  async stop(id: string, graceMs: number, signal?: AbortSignal): Promise<boolean> {
    const observation = await this.#run(
      ["stop", "--time", String(graceMs / 1_000), id],
      4_096,
      graceMs + 5_000,
      signal,
    );
    return succeeded(observation) && observation.stderr.byteLength === 0;
  }

  async kill(id: string, signal?: AbortSignal): Promise<boolean> {
    const observation = await this.#run(["kill", id], 4_096, 5_000, signal);
    return succeeded(observation) && observation.stderr.byteLength === 0;
  }

  async remove(id: string, signal?: AbortSignal): Promise<boolean> {
    const observation = await this.#run(["rm", id], 4_096, 5_000, signal);
    return succeeded(observation) && observation.stderr.byteLength === 0;
  }
}

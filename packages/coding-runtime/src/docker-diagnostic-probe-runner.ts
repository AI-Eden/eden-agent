import { createHash } from "node:crypto";

import {
  type DockerDiagnosticProbeActionV1,
  type DockerDiagnosticProbeApprovalRequiredV1,
  type DockerDiagnosticProbeCleanupV1,
  type DockerDiagnosticProbeCommandV1,
  type DockerDiagnosticProbeEventV1,
  type DockerDiagnosticProbeLabels,
  type DockerDiagnosticProbeReceiptV1,
  type DockerDiagnosticProbeResultV1,
  decodeDockerDiagnosticProbeAction,
  decodeDockerDiagnosticProbeCleanup,
  decodeDockerDiagnosticProbeCommand,
  decodeDockerDiagnosticProbeEvent,
  decodeDockerDiagnosticProbeReceipt,
  decodeDockerDiagnosticProbeResult,
  type ProductError,
} from "@eden/contracts";
import {
  createDockerDiagnosticProbeRecoveryResolvedEvent,
  DockerDiagnosticProbeJournal,
  type DockerDiagnosticProbeTerminalDraft,
  projectDockerDiagnosticProbeJournal,
} from "./docker-diagnostic-probe-journal.ts";
import {
  type DockerDiagnosticProbeIdentity,
  prepareDockerDiagnosticProbeApproval,
} from "./docker-diagnostic-probe-preflight.ts";
import {
  decodeDockerDiagnosticProbeContainerInspection,
  decodeDockerDiagnosticProbeProgramOutput,
  dockerDiagnosticProbeProgramSource,
} from "./docker-diagnostic-probe-program.ts";
import type { DockerDoctorPort } from "./docker-doctor.ts";
import type {
  NativeProcessObservation,
  NativeProcessPort,
  NativeProcessRequest,
} from "./native-process.ts";
import {
  consumeDockerDiagnosticProbeApproval,
  createDockerDiagnosticProbeApproval,
  dockerDiagnosticProbeActionDigest,
  evaluateDockerDiagnosticProbePolicy,
} from "./policy/index.ts";
import { repositoryCheckToolchainImageReference } from "./repository-check-toolchain.ts";

export type DockerDiagnosticProbeContainerConfiguration = {
  readonly arguments: readonly ["-e", string];
  readonly autoRemove: false;
  readonly capDrop: readonly ["ALL"];
  readonly cpuPeriodMicros: 100_000;
  readonly cpuQuotaMicros: 50_000;
  readonly environment: readonly [
    "HOME=/tmp",
    "LANG=C.UTF-8",
    "PATH=/usr/local/bin:/usr/bin:/bin",
    "SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt",
  ];
  readonly fileDescriptors: 64;
  readonly imageReference: typeof repositoryCheckToolchainImageReference;
  readonly ipcMode: "private";
  readonly memoryBytes: 67_108_864;
  readonly memorySwapBytes: 67_108_864;
  readonly networkMode: "none";
  readonly pids: 16;
  readonly platform: "linux/amd64" | "linux/arm64";
  readonly privileged: false;
  readonly pull: "never";
  readonly readOnlyRootFilesystem: true;
  readonly restart: "no";
  readonly securityOptions: readonly ["no-new-privileges"];
  readonly temporaryFilesystems: Readonly<{
    readonly "/tmp": "rw,noexec,nosuid,nodev,size=1048576";
  }>;
  readonly user: "65532:65532";
  readonly usernsMode: "daemon_default";
  readonly utsMode: "";
  readonly workingDirectory: "/tmp";
};

export type DockerDiagnosticProbeExecutionPlan = {
  readonly action: DockerDiagnosticProbeActionV1;
  readonly actionDigest: string;
  readonly configDigest: `sha256:${string}`;
  readonly configuration: DockerDiagnosticProbeContainerConfiguration;
  readonly containerName: `eden-probe-${string}`;
  readonly effectId: string;
  readonly labels: DockerDiagnosticProbeLabels;
};

export type DockerDiagnosticProbeExecutionPlanResult =
  | { readonly ok: true; readonly plan: DockerDiagnosticProbeExecutionPlan }
  | { readonly code: "action_invalid" | "effect_identity_invalid"; readonly ok: false };

export type DockerCliDiagnosticProbePortOptions = {
  readonly cwd: string;
  readonly dockerContext?: string;
  readonly dockerExecutable?: string;
  readonly dockerHost?: string;
  readonly nativeProcess: NativeProcessPort;
};

export interface DockerDiagnosticProbeExecutionPort {
  create(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
  inspect(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
  logs(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
  remove(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
  start(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
  wait(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
}

export interface DockerDiagnosticProbeRecoveryPort extends DockerDiagnosticProbeExecutionPort {
  kill(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
  locate(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
  stop(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation>;
}

export type ExecuteDockerDiagnosticProbeEnvironment = {
  readonly clock: () => string;
  readonly doctorPort: DockerDoctorPort;
  readonly executionPort: DockerDiagnosticProbeExecutionPort;
  readonly id: () => string;
  readonly stateDirectory: string;
};

export type ExecuteDockerDiagnosticProbeInput = {
  readonly approvalCommand: DockerDiagnosticProbeCommandV1;
  readonly approvalRequired: DockerDiagnosticProbeApprovalRequiredV1;
  readonly effectId: string;
};

export type ExecuteDockerDiagnosticProbeResult =
  | {
      readonly event: DockerDiagnosticProbeEventV1;
      readonly ok: true;
      readonly result: DockerDiagnosticProbeResultV1;
    }
  | { readonly error: ProductError; readonly ok: false };

export type RecoverDockerDiagnosticProbeEnvironment = {
  readonly clock: () => string;
  readonly executionPort: DockerDiagnosticProbeRecoveryPort;
  readonly id: () => string;
  readonly stateDirectory: string;
};

export type RecoverDockerDiagnosticProbeResult =
  | {
      readonly event: Extract<
        DockerDiagnosticProbeEventV1,
        { readonly type: "docker.probe.recovery.resolved" }
      >;
      readonly ok: true;
      readonly outcome: "not_started";
    }
  | {
      readonly event: Extract<
        DockerDiagnosticProbeEventV1,
        { readonly type: "docker.probe.terminal" }
      >;
      readonly ok: true;
      readonly outcome: "terminal";
      readonly result: DockerDiagnosticProbeResultV1;
    }
  | { readonly error: ProductError; readonly ok: false };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createDockerDiagnosticProbeExecutionPlan(
  action: DockerDiagnosticProbeActionV1,
  effectId: string,
): DockerDiagnosticProbeExecutionPlanResult {
  const decoded = decodeDockerDiagnosticProbeAction(action);
  if (!decoded.ok) return { code: "action_invalid", ok: false };
  if (effectId.length < 1 || effectId.length > 256 || effectId.includes("\0")) {
    return { code: "effect_identity_invalid", ok: false };
  }
  const configuration: DockerDiagnosticProbeContainerConfiguration = {
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
    imageReference: repositoryCheckToolchainImageReference,
    ipcMode: "private",
    memoryBytes: 67_108_864,
    memorySwapBytes: 67_108_864,
    networkMode: "none",
    pids: 16,
    platform: decoded.value.toolchain.requestedPlatform,
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
  };
  const configDigest = `sha256:${createHash("sha256")
    .update("eden.docker-diagnostic-config.v1\0")
    .update(canonicalJson(configuration))
    .digest("hex")}` as const;
  const containerName = `eden-probe-${createHash("sha256")
    .update(effectId)
    .digest("hex")
    .slice(0, 24)}` as const;
  const labels: DockerDiagnosticProbeLabels = {
    actionId: decoded.value.actionId,
    configDigest,
    effectId,
    imageIndexDigest: decoded.value.toolchain.imageIndexDigest,
    platformManifestDigest: decoded.value.toolchain.platformManifestDigest,
    probeId: decoded.value.probeId,
    profileRevision: decoded.value.profile.profileRevision,
    schema: "eden.docker-diagnostic-probe.v1",
  };
  return {
    ok: true,
    plan: {
      action: decoded.value,
      actionDigest: dockerDiagnosticProbeActionDigest(decoded.value),
      configDigest,
      configuration,
      containerName,
      effectId,
      labels,
    },
  };
}

function executionError(code: string, message: string): ProductError {
  return {
    code,
    message,
    recoverability: "ask-user",
    suggestedActions: [
      "Inspect the closed recovery projection before any further Docker mutation.",
    ],
  };
}

function processSucceeded(
  observation: NativeProcessObservation,
): observation is Extract<NativeProcessObservation, { readonly status: "exited" }> {
  return (
    observation.status === "exited" &&
    observation.exitCode === 0 &&
    observation.stderr.byteLength === 0
  );
}

function appendInput(
  probeId: string,
  eventId: string,
  recordedAt: string,
  type:
    | "docker.probe.action.prepared"
    | "docker.probe.approval.consumed"
    | "docker.probe.effect.intent"
    | "docker.probe.container.created"
    | "docker.probe.dispatch.started"
    | "docker.probe.receipt.recorded"
    | "docker.probe.cleanup.recorded"
    | "docker.probe.terminal",
  payload: Record<string, unknown>,
) {
  return {
    eventId,
    payload,
    probeId,
    recordedAt,
    redaction: "closed_no_raw_docker" as const,
    type,
  };
}

export async function executeDockerDiagnosticProbe(
  input: ExecuteDockerDiagnosticProbeInput,
  environment: ExecuteDockerDiagnosticProbeEnvironment,
  signal?: AbortSignal,
): Promise<ExecuteDockerDiagnosticProbeResult> {
  const approvalRequired = decodeDockerDiagnosticProbeEvent(input.approvalRequired);
  const command = decodeDockerDiagnosticProbeCommand(input.approvalCommand);
  if (
    !approvalRequired.ok ||
    approvalRequired.value.type !== "docker.probe.approval.required" ||
    !command.ok ||
    command.value.decision !== "approve"
  ) {
    return {
      error: executionError(
        "docker_probe_approval_invalid",
        "The Docker diagnostic approval is invalid or denied.",
      ),
      ok: false,
    };
  }
  const event = approvalRequired.value;
  if (
    command.value.probeId !== event.probeId ||
    command.value.approvalId !== event.approval.approvalId ||
    command.value.actionDigest !== event.actionDigest ||
    command.value.expectedRevision !== event.revision
  ) {
    return {
      error: executionError(
        "docker_probe_approval_mismatch",
        "The Docker diagnostic approval does not match the presented action.",
      ),
      ok: false,
    };
  }
  const available = createDockerDiagnosticProbeApproval({
    action: event.action,
    approvalId: event.approval.approvalId,
    expectedRevision: event.revision,
  });
  const consumed = consumeDockerDiagnosticProbeApproval(available, event.action, event.revision);
  const planned = createDockerDiagnosticProbeExecutionPlan(event.action, input.effectId);
  if (!consumed.ok || !planned.ok || planned.plan.actionDigest !== event.actionDigest) {
    return {
      error: executionError(
        "docker_probe_action_invalid",
        "The Docker diagnostic action failed its exact approval boundary.",
      ),
      ok: false,
    };
  }

  const journal = new DockerDiagnosticProbeJournal({
    stateDirectory: environment.stateDirectory,
  });
  const lease = await journal.acquireLock();
  try {
    if (projectDockerDiagnosticProbeJournal(await journal.load()).status === "unresolved") {
      return {
        error: executionError(
          "docker_probe_recovery_required",
          "An unresolved Docker diagnostic transaction blocks a new execution.",
        ),
        ok: false,
      };
    }
    const lifecycle: { observedAt: string; state: string }[] = [];
    const append = async (
      state:
        | "awaiting_approval"
        | "approval_consumed"
        | "effect_intent"
        | "container_created"
        | "dispatch_started"
        | "receipt_recorded"
        | "cleanup_recorded"
        | "terminal",
      type: Parameters<typeof appendInput>[3],
      payload: Record<string, unknown>,
    ) => {
      const recordedAt = environment.clock();
      await journal.append(appendInput(event.probeId, environment.id(), recordedAt, type, payload));
      lifecycle.push({ observedAt: recordedAt, state });
      return recordedAt;
    };

    await append("awaiting_approval", "docker.probe.action.prepared", {
      action: event.action,
      actionDigest: event.actionDigest,
      approvalId: event.approval.approvalId,
      effectId: input.effectId,
    });
    await append("approval_consumed", "docker.probe.approval.consumed", {
      actionDigest: event.actionDigest,
      actionId: event.action.actionId,
      approvalId: consumed.approval.approvalId,
      decision: "approve",
    });
    await append("effect_intent", "docker.probe.effect.intent", {
      actionId: event.action.actionId,
      configDigest: planned.plan.configDigest,
      containerName: planned.plan.containerName,
      effectId: input.effectId,
    });

    const identity: DockerDiagnosticProbeIdentity = {
      actionId: event.action.actionId,
      approvalId: event.approval.approvalId,
      eventId: event.eventId,
      probeId: event.probeId,
      revision: event.revision,
    };
    const revalidated = prepareDockerDiagnosticProbeApproval({
      identity,
      observation: await environment.doctorPort.inspect(signal),
      observedAt: environment.clock(),
    });
    if (
      !revalidated.ok ||
      revalidated.event.actionDigest !== event.actionDigest ||
      JSON.stringify(revalidated.event.action) !== JSON.stringify(event.action)
    ) {
      return {
        error: executionError(
          "docker_probe_preflight_stale",
          "The exact Docker prerequisites changed after approval.",
        ),
        ok: false,
      };
    }

    const created = await environment.executionPort.create(planned.plan, signal);
    if (!processSucceeded(created)) {
      return {
        error: executionError(
          "docker_probe_create_failed",
          "The exact Docker diagnostic container was not proven created.",
        ),
        ok: false,
      };
    }
    const containerId = new TextDecoder().decode(created.stdout).trim();
    if (!/^[a-f0-9]{64}$/u.test(containerId)) {
      return {
        error: executionError(
          "docker_probe_create_invalid",
          "Docker returned an invalid diagnostic container identity.",
        ),
        ok: false,
      };
    }
    const createdInspection = await environment.executionPort.inspect(planned.plan, signal);
    if (!processSucceeded(createdInspection)) {
      return {
        error: executionError(
          "docker_probe_inspection_failed",
          "The created diagnostic container could not be inspected safely.",
        ),
        ok: false,
      };
    }
    const decodedCreated = decodeDockerDiagnosticProbeContainerInspection(
      createdInspection.stdout,
      planned.plan.labels,
    );
    if (
      !decodedCreated.ok ||
      decodedCreated.value.state !== "created" ||
      decodedCreated.value.id !== containerId ||
      decodedCreated.value.name !== planned.plan.containerName
    ) {
      return {
        error: executionError(
          "docker_probe_container_mismatch",
          "The created Docker object does not match the exact diagnostic identity.",
        ),
        ok: false,
      };
    }
    await append("container_created", "docker.probe.container.created", {
      container: { id: containerId, name: planned.plan.containerName },
      effectId: input.effectId,
      labels: planned.plan.labels,
    });
    const startedAt = await append("dispatch_started", "docker.probe.dispatch.started", {
      containerId,
      effectId: input.effectId,
    });

    const started = await environment.executionPort.start(planned.plan, signal);
    if (!processSucceeded(started)) {
      return {
        error: executionError(
          "docker_probe_start_unknown",
          "Docker start did not return a proven terminal dispatch status.",
        ),
        ok: false,
      };
    }
    const waited = await environment.executionPort.wait(planned.plan, signal);
    if (!processSucceeded(waited)) {
      return {
        error: executionError(
          "docker_probe_wait_unknown",
          "Docker wait did not return a proven terminal container status.",
        ),
        ok: false,
      };
    }
    const waitedExitCode = Number(new TextDecoder().decode(waited.stdout).trim());
    if (!Number.isInteger(waitedExitCode) || waitedExitCode < 0 || waitedExitCode > 255) {
      return {
        error: executionError(
          "docker_probe_wait_invalid",
          "Docker wait returned an invalid container status.",
        ),
        ok: false,
      };
    }
    const exitedInspection = await environment.executionPort.inspect(planned.plan, signal);
    if (!processSucceeded(exitedInspection)) {
      return {
        error: executionError(
          "docker_probe_inspection_failed",
          "The exited diagnostic container could not be inspected safely.",
        ),
        ok: false,
      };
    }
    const decodedExited = decodeDockerDiagnosticProbeContainerInspection(
      exitedInspection.stdout,
      planned.plan.labels,
    );
    const logs = await environment.executionPort.logs(planned.plan, signal);
    if (
      !decodedExited.ok ||
      decodedExited.value.state !== "exited" ||
      decodedExited.value.id !== containerId ||
      decodedExited.value.exitCode !== waitedExitCode ||
      logs.status !== "exited" ||
      logs.exitCode !== 0 ||
      logs.stderr.byteLength > event.action.budgets.stderrBytes
    ) {
      return {
        error: executionError(
          "docker_probe_receipt_unknown",
          "The diagnostic result could not be bound to the exact exited container.",
        ),
        ok: false,
      };
    }
    const output = decodeDockerDiagnosticProbeProgramOutput(logs.stdout);
    if (!output.ok) {
      return {
        error: executionError(
          "docker_probe_result_invalid",
          "The fixed diagnostic program returned an invalid closed result.",
        ),
        ok: false,
      };
    }
    const resultOutcome =
      decodedExited.value.oomKilled || waitedExitCode !== 0
        ? decodedExited.value.oomKilled
          ? ("oom" as const)
          : ("failed" as const)
        : output.observations.every((row) => row.status === "passed")
          ? ("passed" as const)
          : ("failed" as const);
    const resultDigest = output.observations[8].sha256;
    if (resultDigest === null) {
      return {
        error: executionError(
          "docker_probe_result_invalid",
          "The fixed diagnostic result has no complete digest.",
        ),
        ok: false,
      };
    }
    const receiptId = environment.id();
    const receiptRecordedAt = environment.clock();
    const receiptValue: DockerDiagnosticProbeReceiptV1 = {
      actionId: event.action.actionId,
      configDigest: planned.plan.configDigest,
      container: { id: containerId, name: planned.plan.containerName },
      effectId: input.effectId,
      labels: planned.plan.labels,
      lifecycleState: "exited",
      probeId: event.probeId,
      receiptId,
      receiptVersion: 1,
      recordedAt: receiptRecordedAt,
      resultDigest,
      resultOutcome,
    };
    const receipt = decodeDockerDiagnosticProbeReceipt(receiptValue);
    if (!receipt.ok) {
      return {
        error: executionError(
          "docker_probe_receipt_invalid",
          "The Docker diagnostic receipt failed its closed contract.",
        ),
        ok: false,
      };
    }
    await journal.append(
      appendInput(
        event.probeId,
        environment.id(),
        receiptRecordedAt,
        "docker.probe.receipt.recorded",
        {
          receipt: receipt.value,
          terminalDraft: {
            endedAt: receiptRecordedAt,
            observations: output.observations,
            outcome: resultOutcome,
            startedAt,
          },
        },
      ),
    );
    lifecycle.push({ observedAt: receiptRecordedAt, state: "receipt_recorded" });

    const removed = await environment.executionPort.remove(planned.plan, signal);
    const cleanupCompletedAt = environment.clock();
    const cleanupValue: DockerDiagnosticProbeCleanupV1 = processSucceeded(removed)
      ? {
          actionId: event.action.actionId,
          cleanupVersion: 1,
          completedAt: cleanupCompletedAt,
          container: { id: containerId, name: planned.plan.containerName, state: "removed" },
          effectId: input.effectId,
          error: null,
          probeId: event.probeId,
          receiptId,
          status: "complete",
        }
      : {
          actionId: event.action.actionId,
          cleanupVersion: 1,
          completedAt: cleanupCompletedAt,
          container: { id: containerId, name: planned.plan.containerName, state: "failed" },
          effectId: input.effectId,
          error: executionError(
            "docker_probe_cleanup_failed",
            "The exact diagnostic container could not be proven removed.",
          ),
          probeId: event.probeId,
          receiptId,
          status: "failed",
        };
    const cleanup = decodeDockerDiagnosticProbeCleanup(cleanupValue);
    if (!cleanup.ok) {
      return {
        error: executionError(
          "docker_probe_cleanup_invalid",
          "The Docker diagnostic cleanup failed its closed contract.",
        ),
        ok: false,
      };
    }
    await journal.append(
      appendInput(
        event.probeId,
        environment.id(),
        cleanupCompletedAt,
        "docker.probe.cleanup.recorded",
        { cleanup: cleanup.value },
      ),
    );
    lifecycle.push({ observedAt: cleanupCompletedAt, state: "cleanup_recorded" });

    const resultValue: DockerDiagnosticProbeResultV1 = {
      actionId: event.action.actionId,
      cleanup: cleanup.value,
      effectId: input.effectId,
      endedAt: receiptRecordedAt,
      observations: output.observations,
      outcome: cleanup.value.status === "complete" ? resultOutcome : "cleanup_failed",
      probeId: event.probeId,
      receipt: receipt.value,
      resultVersion: 1,
      startedAt,
    };
    const result = decodeDockerDiagnosticProbeResult(resultValue);
    if (!result.ok) {
      return {
        error: executionError(
          "docker_probe_result_invalid",
          "The Docker diagnostic terminal result failed its closed contract.",
        ),
        ok: false,
      };
    }
    const terminalAt = environment.clock();
    const terminalEventId = environment.id();
    const terminalValue = {
      eventId: terminalEventId,
      probe: {
        action: event.action,
        actionDigest: event.actionDigest,
        approval: null,
        cleanup: cleanup.value,
        effectId: input.effectId,
        lifecycle: [...lifecycle, { observedAt: terminalAt, state: "terminal" }],
        limitations: [
          "The probe does not inspect or execute repository code.",
          "The result describes one bounded container, not the Docker daemon or host.",
        ],
        nextActions: ["Review the closed diagnostic observations."],
        policy: event.policy,
        probeId: event.probeId,
        projectionVersion: 1,
        receipt: receipt.value,
        result: result.value,
        revision: event.revision,
        state: "terminal",
      },
      probeId: event.probeId,
      protocolVersion: 1,
      revision: event.revision,
      type: "docker.probe.terminal",
    } as const;
    const terminal = decodeDockerDiagnosticProbeEvent(terminalValue);
    if (!terminal.ok) {
      return {
        error: executionError(
          "docker_probe_event_invalid",
          "The Docker diagnostic terminal event failed its closed contract.",
        ),
        ok: false,
      };
    }
    await journal.append(
      appendInput(event.probeId, terminalEventId, terminalAt, "docker.probe.terminal", {
        result: result.value,
      }),
    );
    return { event: terminal.value, ok: true, result: result.value };
  } catch {
    return {
      error: executionError(
        "docker_probe_runtime_failure",
        "The Docker diagnostic transaction stopped without broad recovery.",
      ),
      ok: false,
    };
  } finally {
    await lease.release();
  }
}

function recoveryLifecycle(
  records: readonly {
    readonly recordedAt: string;
    readonly type: string;
  }[],
): { readonly observedAt: string; readonly state: string }[] {
  const states: Readonly<Record<string, string>> = {
    "docker.probe.action.prepared": "awaiting_approval",
    "docker.probe.approval.consumed": "approval_consumed",
    "docker.probe.effect.intent": "effect_intent",
    "docker.probe.container.created": "container_created",
    "docker.probe.dispatch.started": "dispatch_started",
    "docker.probe.receipt.recorded": "receipt_recorded",
    "docker.probe.cleanup.recorded": "cleanup_recorded",
  };
  const sessionStart = records.findLastIndex(
    (record) => record.type === "docker.probe.action.prepared",
  );
  const session = sessionStart < 0 ? [] : records.slice(sessionStart);
  return session.flatMap((record) => {
    const state = states[record.type];
    return state === undefined ? [] : [{ observedAt: record.recordedAt, state }];
  });
}

async function completeRecoveredDockerDiagnosticProbe(
  input: {
    readonly action: DockerDiagnosticProbeActionV1;
    readonly actionDigest: string;
    readonly containerId: string;
    readonly effectId: string;
    readonly exitedInspection?: NativeProcessObservation;
    readonly mode: "created" | "running" | "exited";
    readonly plan: DockerDiagnosticProbeExecutionPlan;
    readonly startedAt: string;
  },
  environment: RecoverDockerDiagnosticProbeEnvironment,
  journal: DockerDiagnosticProbeJournal,
  signal?: AbortSignal,
): Promise<RecoverDockerDiagnosticProbeResult> {
  if (input.mode === "created") {
    const started = await environment.executionPort.start(input.plan, signal);
    if (!processSucceeded(started)) {
      return {
        error: executionError(
          "docker_probe_start_unknown",
          "Docker start did not return a proven dispatch status during recovery.",
        ),
        ok: false,
      };
    }
  }
  let exitedInspection: NativeProcessObservation;
  let waitedExitCode: number | null = null;
  let forcedOutcome: "cancelled" | "timed_out" | null = null;
  if (input.mode === "exited") {
    exitedInspection =
      input.exitedInspection ?? (await environment.executionPort.inspect(input.plan, signal));
  } else {
    const waited = await environment.executionPort.wait(input.plan, signal);
    if (processSucceeded(waited)) {
      waitedExitCode = Number(new TextDecoder().decode(waited.stdout).trim());
      if (!Number.isInteger(waitedExitCode) || waitedExitCode < 0 || waitedExitCode > 255) {
        return {
          error: executionError(
            "docker_probe_wait_invalid",
            "Docker wait returned an invalid recovered container status.",
          ),
          ok: false,
        };
      }
      exitedInspection = await environment.executionPort.inspect(input.plan, signal);
    } else if (waited.status === "timed-out" || waited.status === "aborted") {
      forcedOutcome = waited.status === "timed-out" ? "timed_out" : "cancelled";
      const stopped = await environment.executionPort.stop(input.plan);
      if (!processSucceeded(stopped)) {
        const killed = await environment.executionPort.kill(input.plan);
        if (!processSucceeded(killed)) {
          return {
            error: executionError(
              "docker_probe_stop_unknown",
              "The exact running diagnostic container could not be proven stopped.",
            ),
            ok: false,
          };
        }
      }
      exitedInspection = await environment.executionPort.inspect(input.plan);
    } else {
      return {
        error: executionError(
          "docker_probe_wait_unknown",
          "Docker wait did not prove a terminal container status during recovery.",
        ),
        ok: false,
      };
    }
  }
  if (!processSucceeded(exitedInspection)) {
    return {
      error: executionError(
        "docker_probe_inspection_failed",
        "The recovered diagnostic container could not be inspected safely.",
      ),
      ok: false,
    };
  }
  const decodedExited = decodeDockerDiagnosticProbeContainerInspection(
    exitedInspection.stdout,
    input.plan.labels,
  );
  const logs = await environment.executionPort.logs(input.plan, signal);
  if (
    !decodedExited.ok ||
    decodedExited.value.state !== "exited" ||
    decodedExited.value.id !== input.containerId ||
    decodedExited.value.name !== input.plan.containerName ||
    (waitedExitCode !== null && decodedExited.value.exitCode !== waitedExitCode) ||
    logs.status !== "exited" ||
    logs.exitCode !== 0 ||
    logs.stderr.byteLength > input.action.budgets.stderrBytes
  ) {
    return {
      error: executionError(
        "docker_probe_receipt_unknown",
        "The recovered result could not be bound to the exact exited container.",
      ),
      ok: false,
    };
  }
  const output = decodeDockerDiagnosticProbeProgramOutput(logs.stdout);
  if (!output.ok || output.observations[8].sha256 === null) {
    return {
      error: executionError(
        "docker_probe_result_invalid",
        "The recovered diagnostic program result is not a complete closed value.",
      ),
      ok: false,
    };
  }
  const resultOutcome =
    forcedOutcome ??
    (decodedExited.value.oomKilled || decodedExited.value.exitCode !== 0
      ? decodedExited.value.oomKilled
        ? ("oom" as const)
        : ("failed" as const)
      : output.observations.every((row) => row.status === "passed")
        ? ("passed" as const)
        : ("failed" as const));
  const receiptId = environment.id();
  const receiptRecordedAt = environment.clock();
  const receipt = decodeDockerDiagnosticProbeReceipt({
    actionId: input.action.actionId,
    configDigest: input.plan.configDigest,
    container: { id: input.containerId, name: input.plan.containerName },
    effectId: input.effectId,
    labels: input.plan.labels,
    lifecycleState: "exited",
    probeId: input.action.probeId,
    receiptId,
    receiptVersion: 1,
    recordedAt: receiptRecordedAt,
    resultDigest: output.observations[8].sha256,
    resultOutcome,
  });
  if (!receipt.ok) {
    return {
      error: executionError(
        "docker_probe_receipt_invalid",
        "The recovered Docker diagnostic receipt failed its closed contract.",
      ),
      ok: false,
    };
  }
  await journal.append(
    appendInput(
      input.action.probeId,
      environment.id(),
      receiptRecordedAt,
      "docker.probe.receipt.recorded",
      {
        receipt: receipt.value,
        terminalDraft: {
          endedAt: receiptRecordedAt,
          observations: output.observations,
          outcome: resultOutcome,
          startedAt: input.startedAt,
        },
      },
    ),
  );
  const removed = await environment.executionPort.remove(input.plan, signal);
  const cleanupCompletedAt = environment.clock();
  const cleanup = decodeDockerDiagnosticProbeCleanup(
    processSucceeded(removed)
      ? {
          actionId: input.action.actionId,
          cleanupVersion: 1,
          completedAt: cleanupCompletedAt,
          container: { id: input.containerId, name: input.plan.containerName, state: "removed" },
          effectId: input.effectId,
          error: null,
          probeId: input.action.probeId,
          receiptId,
          status: "complete",
        }
      : {
          actionId: input.action.actionId,
          cleanupVersion: 1,
          completedAt: cleanupCompletedAt,
          container: { id: input.containerId, name: input.plan.containerName, state: "failed" },
          effectId: input.effectId,
          error: executionError(
            "docker_probe_cleanup_failed",
            "The exact recovered diagnostic container could not be proven removed.",
          ),
          probeId: input.action.probeId,
          receiptId,
          status: "failed",
        },
  );
  if (!cleanup.ok) {
    return {
      error: executionError(
        "docker_probe_cleanup_invalid",
        "The recovered Docker diagnostic cleanup failed its closed contract.",
      ),
      ok: false,
    };
  }
  await journal.append(
    appendInput(
      input.action.probeId,
      environment.id(),
      cleanupCompletedAt,
      "docker.probe.cleanup.recorded",
      { cleanup: cleanup.value },
    ),
  );
  const result = decodeDockerDiagnosticProbeResult({
    actionId: input.action.actionId,
    cleanup: cleanup.value,
    effectId: input.effectId,
    endedAt: receiptRecordedAt,
    observations: output.observations,
    outcome: cleanup.value.status === "complete" ? resultOutcome : "cleanup_failed",
    probeId: input.action.probeId,
    receipt: receipt.value,
    resultVersion: 1,
    startedAt: input.startedAt,
  });
  if (!result.ok) {
    return {
      error: executionError(
        "docker_probe_result_invalid",
        "The recovered terminal result failed its closed contract.",
      ),
      ok: false,
    };
  }
  const terminalAt = environment.clock();
  const terminalEventId = environment.id();
  const records = await journal.load();
  const terminal = decodeDockerDiagnosticProbeEvent({
    eventId: terminalEventId,
    probe: {
      action: input.action,
      actionDigest: input.actionDigest,
      approval: null,
      cleanup: cleanup.value,
      effectId: input.effectId,
      lifecycle: [...recoveryLifecycle(records), { observedAt: terminalAt, state: "terminal" }],
      limitations: [
        "The probe does not inspect or execute repository code.",
        "The result describes one bounded container, not the Docker daemon or host.",
      ],
      nextActions: ["Review the closed diagnostic observations."],
      policy: evaluateDockerDiagnosticProbePolicy(
        input.action,
        records[0]?.recordedAt ?? terminalAt,
      ),
      probeId: input.action.probeId,
      projectionVersion: 1,
      receipt: receipt.value,
      result: result.value,
      revision: input.action.proposalRevision,
      state: "terminal",
    },
    probeId: input.action.probeId,
    protocolVersion: 1,
    revision: input.action.proposalRevision,
    type: "docker.probe.terminal",
  });
  if (!terminal.ok || terminal.value.type !== "docker.probe.terminal") {
    return {
      error: executionError(
        "docker_probe_event_invalid",
        "The recovered terminal event failed its closed contract.",
      ),
      ok: false,
    };
  }
  await journal.append(
    appendInput(input.action.probeId, terminalEventId, terminalAt, "docker.probe.terminal", {
      result: result.value,
    }),
  );
  return { event: terminal.value, ok: true, outcome: "terminal", result: result.value };
}

function decodeLocatedDockerDiagnosticProbe(
  observation: NativeProcessObservation,
):
  | { readonly status: "absent" }
  | { readonly id: string; readonly name: string; readonly status: "found" }
  | null {
  if (!processSucceeded(observation)) return null;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(observation.stdout).trim();
  } catch {
    return null;
  }
  if (text.length === 0) return { status: "absent" };
  const lines = text.split("\n");
  if (lines.length !== 1) return null;
  let value: unknown;
  try {
    value = JSON.parse(lines[0] ?? "");
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "ID" || keys[1] !== "Names") return null;
  const row = value as { readonly ID?: unknown; readonly Names?: unknown };
  return typeof row.ID === "string" &&
    /^[a-f0-9]{64}$/u.test(row.ID) &&
    typeof row.Names === "string"
    ? { id: row.ID, name: row.Names, status: "found" }
    : null;
}

async function appendRecoveredDockerDiagnosticProbeTerminal(
  input: {
    readonly action: DockerDiagnosticProbeActionV1;
    readonly actionDigest: string;
    readonly cleanup: DockerDiagnosticProbeCleanupV1;
    readonly effectId: string;
    readonly receipt: DockerDiagnosticProbeReceiptV1;
    readonly terminalDraft: DockerDiagnosticProbeTerminalDraft;
  },
  environment: RecoverDockerDiagnosticProbeEnvironment,
  journal: DockerDiagnosticProbeJournal,
): Promise<RecoverDockerDiagnosticProbeResult> {
  const result = decodeDockerDiagnosticProbeResult({
    actionId: input.action.actionId,
    cleanup: input.cleanup,
    effectId: input.effectId,
    endedAt: input.terminalDraft.endedAt,
    observations: input.terminalDraft.observations,
    outcome: input.cleanup.status === "complete" ? input.terminalDraft.outcome : "cleanup_failed",
    probeId: input.action.probeId,
    receipt: input.receipt,
    resultVersion: 1,
    startedAt: input.terminalDraft.startedAt,
  });
  if (!result.ok) {
    return {
      error: executionError(
        "docker_probe_result_invalid",
        "The durable recovery draft could not produce a closed terminal result.",
      ),
      ok: false,
    };
  }
  const terminalAt = environment.clock();
  const terminalEventId = environment.id();
  const records = await journal.load();
  const terminal = decodeDockerDiagnosticProbeEvent({
    eventId: terminalEventId,
    probe: {
      action: input.action,
      actionDigest: input.actionDigest,
      approval: null,
      cleanup: input.cleanup,
      effectId: input.effectId,
      lifecycle: [...recoveryLifecycle(records), { observedAt: terminalAt, state: "terminal" }],
      limitations: [
        "The probe does not inspect or execute repository code.",
        "The result describes one bounded container, not the Docker daemon or host.",
      ],
      nextActions: ["Review the closed diagnostic observations."],
      policy: evaluateDockerDiagnosticProbePolicy(
        input.action,
        records[0]?.recordedAt ?? terminalAt,
      ),
      probeId: input.action.probeId,
      projectionVersion: 1,
      receipt: input.receipt,
      result: result.value,
      revision: input.action.proposalRevision,
      state: "terminal",
    },
    probeId: input.action.probeId,
    protocolVersion: 1,
    revision: input.action.proposalRevision,
    type: "docker.probe.terminal",
  });
  if (!terminal.ok || terminal.value.type !== "docker.probe.terminal") {
    return {
      error: executionError(
        "docker_probe_event_invalid",
        "The recovered terminal event failed its closed contract.",
      ),
      ok: false,
    };
  }
  await journal.append(
    appendInput(input.action.probeId, terminalEventId, terminalAt, "docker.probe.terminal", {
      result: result.value,
    }),
  );
  return { event: terminal.value, ok: true, outcome: "terminal", result: result.value };
}

async function finalizeRecoveredDockerDiagnosticProbeReceipt(
  input: {
    readonly action: DockerDiagnosticProbeActionV1;
    readonly actionDigest: string;
    readonly cleanupState: "absent" | "failed" | "removed";
    readonly effectId: string;
    readonly plan: DockerDiagnosticProbeExecutionPlan;
    readonly receipt: DockerDiagnosticProbeReceiptV1;
    readonly terminalDraft: DockerDiagnosticProbeTerminalDraft;
  },
  environment: RecoverDockerDiagnosticProbeEnvironment,
  journal: DockerDiagnosticProbeJournal,
): Promise<RecoverDockerDiagnosticProbeResult> {
  const cleanupCompletedAt = environment.clock();
  const cleanup = decodeDockerDiagnosticProbeCleanup({
    actionId: input.action.actionId,
    cleanupVersion: 1,
    completedAt: cleanupCompletedAt,
    container: {
      id: input.receipt.container.id,
      name: input.plan.containerName,
      state: input.cleanupState,
    },
    effectId: input.effectId,
    error:
      input.cleanupState === "failed"
        ? executionError(
            "docker_probe_cleanup_failed",
            "The exact recovered diagnostic container could not be proven removed.",
          )
        : null,
    probeId: input.action.probeId,
    receiptId: input.receipt.receiptId,
    status: input.cleanupState === "failed" ? "failed" : "complete",
  });
  if (!cleanup.ok) {
    return {
      error: executionError(
        "docker_probe_cleanup_invalid",
        "The recovered Docker diagnostic cleanup failed its closed contract.",
      ),
      ok: false,
    };
  }
  await journal.append(
    appendInput(
      input.action.probeId,
      environment.id(),
      cleanupCompletedAt,
      "docker.probe.cleanup.recorded",
      { cleanup: cleanup.value },
    ),
  );
  return await appendRecoveredDockerDiagnosticProbeTerminal(
    {
      action: input.action,
      actionDigest: input.actionDigest,
      cleanup: cleanup.value,
      effectId: input.effectId,
      receipt: input.receipt,
      terminalDraft: input.terminalDraft,
    },
    environment,
    journal,
  );
}

export async function recoverDockerDiagnosticProbe(
  environment: RecoverDockerDiagnosticProbeEnvironment,
  signal?: AbortSignal,
): Promise<RecoverDockerDiagnosticProbeResult> {
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory: environment.stateDirectory });
  const lease = await journal.acquireLock();
  try {
    const records = await journal.load();
    const projection = projectDockerDiagnosticProbeJournal(records);
    if (projection.status !== "unresolved") {
      return {
        error: executionError(
          "docker_probe_recovery_unsupported",
          "The durable Docker diagnostic prefix cannot be reconciled by this recovery slice.",
        ),
        ok: false,
      };
    }
    const closeNotStarted = async (
      lastLifecycleState: "action_prepared" | "approval_consumed" | "effect_intent",
      reason: "approval_not_consumed" | "pre_create_absent",
    ): Promise<RecoverDockerDiagnosticProbeResult> => {
      const eventId = environment.id();
      const resolvedAt = environment.clock();
      await journal.append({
        eventId,
        payload: {
          actionDigest: projection.actionDigest,
          actionId: projection.actionId,
          effectId: projection.effectId,
          lastLifecycleState,
          outcome: "not_started",
          reason,
        },
        probeId: projection.probeId,
        recordedAt: resolvedAt,
        redaction: "closed_no_raw_docker",
        type: "docker.probe.recovery.closed",
      });
      const resolved = createDockerDiagnosticProbeRecoveryResolvedEvent(
        projectDockerDiagnosticProbeJournal(await journal.load()),
        eventId,
      );
      return resolved.ok
        ? { event: resolved.event, ok: true, outcome: "not_started" }
        : {
            error: executionError(
              "docker_probe_recovery_invalid",
              "The recovered Docker diagnostic value failed its closed contract.",
            ),
            ok: false,
          };
    };
    if (projection.lastLifecycleState === "action_prepared") {
      return await closeNotStarted("action_prepared", "approval_not_consumed");
    }
    if (
      projection.lastLifecycleState === "approval_consumed" ||
      projection.lastLifecycleState === "effect_intent"
    ) {
      const preparedIndex = records.findLastIndex(
        (record) => record.type === "docker.probe.action.prepared",
      );
      const prepared = records[preparedIndex];
      const action = decodeDockerDiagnosticProbeAction(prepared?.payload.action);
      if (!action.ok) {
        throw new TypeError("docker_probe_recovery_action_invalid");
      }
      const planned = createDockerDiagnosticProbeExecutionPlan(action.value, projection.effectId);
      if (!planned.ok || planned.plan.actionDigest !== projection.actionDigest) {
        throw new TypeError("docker_probe_recovery_plan_invalid");
      }
      const located = decodeLocatedDockerDiagnosticProbe(
        await environment.executionPort.locate(planned.plan, signal),
      );
      if (located?.status === "absent") {
        return await closeNotStarted(projection.lastLifecycleState, "pre_create_absent");
      }
      if (
        projection.lastLifecycleState === "effect_intent" &&
        located?.status === "found" &&
        located.name === planned.plan.containerName
      ) {
        const inspected = await environment.executionPort.inspect(planned.plan, signal);
        if (!processSucceeded(inspected)) {
          return {
            error: executionError(
              "docker_probe_recovery_unknown",
              "The intent-owned diagnostic container was not inspectable.",
            ),
            ok: false,
          };
        }
        const decoded = decodeDockerDiagnosticProbeContainerInspection(
          inspected.stdout,
          planned.plan.labels,
        );
        if (
          !decoded.ok ||
          decoded.value.state !== "created" ||
          decoded.value.id !== located.id ||
          decoded.value.name !== planned.plan.containerName
        ) {
          return {
            error: executionError(
              "docker_probe_recovery_unknown",
              "The intent-owned diagnostic object does not match the exact created identity.",
            ),
            ok: false,
          };
        }
        const createdAt = environment.clock();
        await journal.append(
          appendInput(
            action.value.probeId,
            environment.id(),
            createdAt,
            "docker.probe.container.created",
            {
              container: { id: located.id, name: planned.plan.containerName },
              effectId: projection.effectId,
              labels: planned.plan.labels,
            },
          ),
        );
        const startedAt = environment.clock();
        await journal.append(
          appendInput(
            action.value.probeId,
            environment.id(),
            startedAt,
            "docker.probe.dispatch.started",
            { containerId: located.id, effectId: projection.effectId },
          ),
        );
        return await completeRecoveredDockerDiagnosticProbe(
          {
            action: action.value,
            actionDigest: projection.actionDigest,
            containerId: located.id,
            effectId: projection.effectId,
            mode: "created",
            plan: planned.plan,
            startedAt,
          },
          environment,
          journal,
          signal,
        );
      }
    }
    if (projection.lastLifecycleState === "container_created") {
      const preparedIndex = records.findLastIndex(
        (record) => record.type === "docker.probe.action.prepared",
      );
      const prepared = records[preparedIndex];
      const action = decodeDockerDiagnosticProbeAction(prepared?.payload.action);
      if (!action.ok) throw new TypeError("docker_probe_recovery_action_invalid");
      const planned = createDockerDiagnosticProbeExecutionPlan(action.value, projection.effectId);
      if (!planned.ok || planned.plan.actionDigest !== projection.actionDigest) {
        throw new TypeError("docker_probe_recovery_plan_invalid");
      }
      const created = records.at(-1);
      const container = created?.payload.container;
      const containerId =
        typeof container === "object" &&
        container !== null &&
        "id" in container &&
        typeof container.id === "string"
          ? container.id
          : null;
      const containerName =
        typeof container === "object" &&
        container !== null &&
        "name" in container &&
        typeof container.name === "string"
          ? container.name
          : null;
      if (
        created?.type !== "docker.probe.container.created" ||
        containerId === null ||
        containerName !== planned.plan.containerName
      ) {
        throw new TypeError("docker_probe_recovery_container_invalid");
      }
      const inspected = await environment.executionPort.inspect(planned.plan, signal);
      if (!processSucceeded(inspected)) {
        return {
          error: executionError(
            "docker_probe_recovery_unknown",
            "The exact created diagnostic container was not inspectable.",
          ),
          ok: false,
        };
      }
      const decoded = decodeDockerDiagnosticProbeContainerInspection(
        inspected.stdout,
        planned.plan.labels,
      );
      if (
        !decoded.ok ||
        decoded.value.state !== "created" ||
        decoded.value.id !== containerId ||
        decoded.value.name !== planned.plan.containerName
      ) {
        return {
          error: executionError(
            "docker_probe_recovery_unknown",
            "The created diagnostic object does not match the durable identity.",
          ),
          ok: false,
        };
      }
      const startedAt = environment.clock();
      await journal.append(
        appendInput(
          action.value.probeId,
          environment.id(),
          startedAt,
          "docker.probe.dispatch.started",
          { containerId, effectId: projection.effectId },
        ),
      );
      return await completeRecoveredDockerDiagnosticProbe(
        {
          action: action.value,
          actionDigest: projection.actionDigest,
          containerId,
          effectId: projection.effectId,
          mode: "created",
          plan: planned.plan,
          startedAt,
        },
        environment,
        journal,
        signal,
      );
    }
    if (projection.lastLifecycleState === "dispatch_started") {
      const preparedIndex = records.findLastIndex(
        (record) => record.type === "docker.probe.action.prepared",
      );
      const prepared = records[preparedIndex];
      const action = decodeDockerDiagnosticProbeAction(prepared?.payload.action);
      if (!action.ok) throw new TypeError("docker_probe_recovery_action_invalid");
      const planned = createDockerDiagnosticProbeExecutionPlan(action.value, projection.effectId);
      if (!planned.ok || planned.plan.actionDigest !== projection.actionDigest) {
        throw new TypeError("docker_probe_recovery_plan_invalid");
      }
      const dispatch = records.at(-1);
      const containerId = dispatch?.payload.containerId;
      if (dispatch?.type !== "docker.probe.dispatch.started" || typeof containerId !== "string") {
        throw new TypeError("docker_probe_recovery_dispatch_invalid");
      }
      const inspected = await environment.executionPort.inspect(planned.plan, signal);
      if (!processSucceeded(inspected)) {
        return {
          error: executionError(
            "docker_probe_recovery_unknown",
            "The dispatched diagnostic container was not inspectable.",
          ),
          ok: false,
        };
      }
      const decoded = decodeDockerDiagnosticProbeContainerInspection(
        inspected.stdout,
        planned.plan.labels,
      );
      if (
        !decoded.ok ||
        decoded.value.id !== containerId ||
        decoded.value.name !== planned.plan.containerName
      ) {
        return {
          error: executionError(
            "docker_probe_recovery_unknown",
            "The dispatched diagnostic object does not match the durable identity.",
          ),
          ok: false,
        };
      }
      return await completeRecoveredDockerDiagnosticProbe(
        {
          action: action.value,
          actionDigest: projection.actionDigest,
          containerId,
          effectId: projection.effectId,
          ...(decoded.value.state === "exited" ? { exitedInspection: inspected } : {}),
          mode: decoded.value.state,
          plan: planned.plan,
          startedAt: dispatch.recordedAt,
        },
        environment,
        journal,
        signal,
      );
    }
    if (projection.lastLifecycleState === "receipt_recorded") {
      const preparedIndex = records.findLastIndex(
        (record) => record.type === "docker.probe.action.prepared",
      );
      const prepared = records[preparedIndex];
      const action = decodeDockerDiagnosticProbeAction(prepared?.payload.action);
      if (!action.ok) throw new TypeError("docker_probe_recovery_action_invalid");
      const planned = createDockerDiagnosticProbeExecutionPlan(action.value, projection.effectId);
      if (
        !planned.ok ||
        planned.plan.actionDigest !== projection.actionDigest ||
        projection.receipt === null ||
        projection.terminalDraft === null ||
        projection.receipt.container.name !== planned.plan.containerName ||
        projection.receipt.configDigest !== planned.plan.configDigest
      ) {
        throw new TypeError("docker_probe_recovery_receipt_invalid");
      }
      const located = decodeLocatedDockerDiagnosticProbe(
        await environment.executionPort.locate(planned.plan, signal),
      );
      if (located?.status === "absent") {
        return await finalizeRecoveredDockerDiagnosticProbeReceipt(
          {
            action: action.value,
            actionDigest: projection.actionDigest,
            cleanupState: "absent",
            effectId: projection.effectId,
            plan: planned.plan,
            receipt: projection.receipt,
            terminalDraft: projection.terminalDraft,
          },
          environment,
          journal,
        );
      }
      if (
        located?.status !== "found" ||
        located.id !== projection.receipt.container.id ||
        located.name !== planned.plan.containerName
      ) {
        return {
          error: executionError(
            "docker_probe_recovery_unknown",
            "The receipt-owned diagnostic container location is missing or ambiguous.",
          ),
          ok: false,
        };
      }
      const inspected = await environment.executionPort.inspect(planned.plan, signal);
      if (!processSucceeded(inspected)) {
        return {
          error: executionError(
            "docker_probe_recovery_unknown",
            "The receipt-owned diagnostic container was not inspectable.",
          ),
          ok: false,
        };
      }
      const decoded = decodeDockerDiagnosticProbeContainerInspection(
        inspected.stdout,
        planned.plan.labels,
      );
      if (
        !decoded.ok ||
        decoded.value.state !== "exited" ||
        decoded.value.id !== projection.receipt.container.id ||
        decoded.value.name !== planned.plan.containerName
      ) {
        return {
          error: executionError(
            "docker_probe_recovery_unknown",
            "The receipt-owned diagnostic container does not match the durable identity.",
          ),
          ok: false,
        };
      }
      const removed = await environment.executionPort.remove(planned.plan, signal);
      return await finalizeRecoveredDockerDiagnosticProbeReceipt(
        {
          action: action.value,
          actionDigest: projection.actionDigest,
          cleanupState: processSucceeded(removed) ? "removed" : "failed",
          effectId: projection.effectId,
          plan: planned.plan,
          receipt: projection.receipt,
          terminalDraft: projection.terminalDraft,
        },
        environment,
        journal,
      );
    }
    if (projection.lastLifecycleState === "cleanup_recorded") {
      const preparedIndex = records.findLastIndex(
        (record) => record.type === "docker.probe.action.prepared",
      );
      const prepared = records[preparedIndex];
      const action = decodeDockerDiagnosticProbeAction(prepared?.payload.action);
      if (!action.ok) throw new TypeError("docker_probe_recovery_action_invalid");
      const planned = createDockerDiagnosticProbeExecutionPlan(action.value, projection.effectId);
      if (
        !planned.ok ||
        planned.plan.actionDigest !== projection.actionDigest ||
        projection.receipt === null ||
        projection.terminalDraft === null ||
        projection.cleanup === null ||
        projection.receipt.container.name !== planned.plan.containerName ||
        projection.receipt.configDigest !== planned.plan.configDigest
      ) {
        throw new TypeError("docker_probe_recovery_cleanup_invalid");
      }
      return await appendRecoveredDockerDiagnosticProbeTerminal(
        {
          action: action.value,
          actionDigest: projection.actionDigest,
          cleanup: projection.cleanup,
          effectId: projection.effectId,
          receipt: projection.receipt,
          terminalDraft: projection.terminalDraft,
        },
        environment,
        journal,
      );
    }
    return {
      error: executionError(
        "docker_probe_recovery_unknown",
        "The exact Docker diagnostic identity was not proven safely recoverable.",
      ),
      ok: false,
    };
  } catch {
    return {
      error: executionError(
        "docker_probe_runtime_failure",
        "The Docker diagnostic recovery stopped without broad mutation.",
      ),
      ok: false,
    };
  } finally {
    await lease.release();
  }
}

const dockerDiagnosticProbeInspectionFormat =
  '{"Config":{"Entrypoint":{{json .Config.Entrypoint}},"Env":{{json .Config.Env}},"Labels":{{json .Config.Labels}},"User":{{json .Config.User}},"WorkingDir":{{json .Config.WorkingDir}}},"HostConfig":{"AutoRemove":{{json .HostConfig.AutoRemove}},"CapDrop":{{json .HostConfig.CapDrop}},"CpuPeriod":{{json .HostConfig.CpuPeriod}},"CpuQuota":{{json .HostConfig.CpuQuota}},"IpcMode":{{json .HostConfig.IpcMode}},"Memory":{{json .HostConfig.Memory}},"MemorySwap":{{json .HostConfig.MemorySwap}},"NetworkMode":{{json .HostConfig.NetworkMode}},"PidMode":{{json .HostConfig.PidMode}},"PidsLimit":{{json .HostConfig.PidsLimit}},"Privileged":{{json .HostConfig.Privileged}},"ReadonlyRootfs":{{json .HostConfig.ReadonlyRootfs}},"RestartPolicy":{"Name":{{json .HostConfig.RestartPolicy.Name}}},"SecurityOpt":{{json .HostConfig.SecurityOpt}},"Tmpfs":{{json .HostConfig.Tmpfs}},"UTSMode":{{json .HostConfig.UTSMode}},"Ulimits":{{json .HostConfig.Ulimits}},"UsernsMode":{{json .HostConfig.UsernsMode}}},"Id":{{json .Id}},"Name":{{json .Name}},"State":{"ExitCode":{{json .State.ExitCode}},"OOMKilled":{{json .State.OOMKilled}},"Running":{{json .State.Running}},"Status":{{json .State.Status}}}}';

const dockerDiagnosticProbeLocationFormat = '{"ID":{{json .ID}},"Names":{{json .Names}}}';

export class DockerCliDiagnosticProbePort implements DockerDiagnosticProbeRecoveryPort {
  readonly #cwd: string;
  readonly #dockerContext: string | undefined;
  readonly #dockerExecutable: string;
  readonly #dockerHost: string | undefined;
  readonly #nativeProcess: NativeProcessPort;

  constructor(options: DockerCliDiagnosticProbePortOptions) {
    if (options.dockerContext !== undefined && options.dockerHost !== undefined) {
      throw new Error("Docker context and host selection are mutually exclusive.");
    }
    this.#cwd = options.cwd;
    this.#dockerContext = options.dockerContext;
    this.#dockerExecutable = options.dockerExecutable ?? "docker";
    this.#dockerHost = options.dockerHost;
    this.#nativeProcess = options.nativeProcess;
  }

  #environment(): Readonly<Record<string, string>> {
    return this.#dockerExecutable.includes("/")
      ? {}
      : {
          ...(process.env.PATH === undefined ? {} : { PATH: process.env.PATH }),
          ...(process.env.SystemRoot === undefined ? {} : { SystemRoot: process.env.SystemRoot }),
        };
  }

  #connectionArguments(): readonly string[] {
    if (this.#dockerContext !== undefined) return ["--context", this.#dockerContext];
    return this.#dockerHost === undefined ? [] : ["--host", this.#dockerHost];
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
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    const configuration = plan.configuration;
    const labels = plan.labels;
    const request: NativeProcessRequest = {
      arguments: [
        ...this.#connectionArguments(),
        "create",
        "--pull",
        configuration.pull,
        "--name",
        plan.containerName,
        "--label",
        `eden.schema=${labels.schema}`,
        "--label",
        `eden.probe-id=${labels.probeId}`,
        "--label",
        `eden.action-id=${labels.actionId}`,
        "--label",
        `eden.effect-id=${labels.effectId}`,
        "--label",
        `eden.image-index-digest=${labels.imageIndexDigest}`,
        "--label",
        `eden.platform-manifest-digest=${labels.platformManifestDigest}`,
        "--label",
        `eden.profile-revision=${labels.profileRevision}`,
        "--label",
        `eden.config-digest=${labels.configDigest}`,
        "--platform",
        configuration.platform,
        "--network",
        configuration.networkMode,
        "--read-only",
        "--tmpfs",
        `/tmp:${configuration.temporaryFilesystems["/tmp"]}`,
        "--user",
        configuration.user,
        "--workdir",
        configuration.workingDirectory,
        "--entrypoint",
        plan.action.profile.entrypoint,
        "--cap-drop",
        configuration.capDrop[0],
        "--security-opt",
        configuration.securityOptions[0],
        "--memory",
        String(configuration.memoryBytes),
        "--memory-swap",
        String(configuration.memorySwapBytes),
        "--cpu-period",
        String(configuration.cpuPeriodMicros),
        "--cpu-quota",
        String(configuration.cpuQuotaMicros),
        "--pids-limit",
        String(configuration.pids),
        "--ulimit",
        `nofile=${configuration.fileDescriptors}:${configuration.fileDescriptors}`,
        "--restart",
        configuration.restart,
        "--ipc",
        configuration.ipcMode,
        "--env",
        configuration.environment[0],
        "--env",
        configuration.environment[1],
        "--env",
        configuration.environment[2],
        "--env",
        configuration.environment[3],
        configuration.imageReference,
        configuration.arguments[0],
        configuration.arguments[1],
      ],
      cwd: this.#cwd,
      environment: this.#environment(),
      executable: this.#dockerExecutable,
      maxStderrBytes: 4_096,
      maxStdoutBytes: 4_096,
      timeoutMs: 5_000,
    };
    return this.#nativeProcess.run(request, signal);
  }

  inspect(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#run(
      ["inspect", "--format", dockerDiagnosticProbeInspectionFormat, plan.containerName],
      65_536,
      5_000,
      signal,
    );
  }

  locate(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#run(
      [
        "container",
        "ls",
        "--all",
        "--no-trunc",
        "--filter",
        `name=^/${plan.containerName}$`,
        "--format",
        dockerDiagnosticProbeLocationFormat,
      ],
      4_096,
      5_000,
      signal,
    );
  }

  stop(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#run(
      ["stop", "--time", String(plan.action.budgets.stopGraceMs / 1_000), plan.containerName],
      4_096,
      plan.action.budgets.stopGraceMs + 5_000,
      signal,
    );
  }

  kill(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#run(["kill", plan.containerName], 4_096, 5_000, signal);
  }

  start(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#run(["start", plan.containerName], 4_096, 5_000, signal);
  }

  wait(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#run(["wait", plan.containerName], 4_096, plan.action.budgets.timeoutMs, signal);
  }

  logs(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#run(["logs", plan.containerName], 4_096, 5_000, signal);
  }

  remove(
    plan: DockerDiagnosticProbeExecutionPlan,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    return this.#run(["rm", plan.containerName], 4_096, 5_000, signal);
  }
}

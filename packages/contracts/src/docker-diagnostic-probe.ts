import Type from "typebox";
import Schema from "typebox/schema";

import {
  ActionIdSchema,
  type DecodeResult,
  type ProductError,
  ProductErrorSchema,
  RevisionSchema,
} from "./protocol.ts";

const closed = { additionalProperties: false } as const;
const utf8 = new TextEncoder();
const sha256Schema = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
const versionSchema = Type.String({ maxLength: 64, minLength: 1 });

export const DockerDiagnosticProbeCheckSchema = Type.Union([
  Type.Literal("process_user"),
  Type.Literal("user_namespace"),
  Type.Literal("capabilities"),
  Type.Literal("no_new_privileges"),
  Type.Literal("seccomp"),
  Type.Literal("root_filesystem"),
  Type.Literal("temporary_filesystem"),
  Type.Literal("resource_limits"),
  Type.Literal("result_protocol"),
]);
export type DockerDiagnosticProbeCheck = Type.Static<typeof DockerDiagnosticProbeCheckSchema>;

export const DockerDiagnosticProbeActionV1Schema = Type.Refine(
  Type.Object(
    {
      actionId: ActionIdSchema,
      actionVersion: Type.Literal(1),
      authority: Type.Object(
        {
          environmentClass: Type.Literal("closed_non_secret"),
          executionMode: Type.Literal("docker_container"),
          isolation: Type.Literal("linux_container"),
          network: Type.Literal("none"),
          policyVersion: Type.Literal(1),
          remediation: Type.Literal("none"),
          ruleSetRevision: Type.Literal("r2-docker-diagnostic-probe-v1"),
        },
        closed,
      ),
      backend: Type.Object(
        {
          architecture: Type.Union([Type.Literal("amd64"), Type.Literal("arm64")]),
          clientApiVersion: versionSchema,
          contextEndpointSha256: sha256Schema,
          contextName: Type.String({
            maxLength: 128,
            minLength: 1,
            pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$",
          }),
          daemonApiVersion: versionSchema,
          daemonIdentitySha256: sha256Schema,
          daemonMinimumApiVersion: versionSchema,
          osType: Type.Literal("linux"),
          serverVersion: versionSchema,
        },
        closed,
      ),
      budgets: Type.Object(
        {
          cpuPeriodMicros: Type.Literal(100_000),
          cpuQuotaMicros: Type.Literal(50_000),
          fileDescriptors: Type.Literal(64),
          memoryBytes: Type.Literal(67_108_864),
          memorySwapBytes: Type.Literal(67_108_864),
          pids: Type.Literal(16),
          stderrBytes: Type.Literal(4_096),
          stdoutBytes: Type.Literal(4_096),
          stopGraceMs: Type.Literal(2_000),
          timeoutMs: Type.Literal(10_000),
          tmpfsBytes: Type.Literal(1_048_576),
        },
        closed,
      ),
      kind: Type.Literal("docker_diagnostic_probe_v1"),
      lifetime: Type.Object(
        {
          kind: Type.Literal("single_use_proposal_revision"),
          revision: RevisionSchema,
        },
        closed,
      ),
      operation: Type.Object(
        {
          checks: Type.Tuple([
            Type.Literal("process_user"),
            Type.Literal("user_namespace"),
            Type.Literal("capabilities"),
            Type.Literal("no_new_privileges"),
            Type.Literal("seccomp"),
            Type.Literal("root_filesystem"),
            Type.Literal("temporary_filesystem"),
            Type.Literal("resource_limits"),
            Type.Literal("result_protocol"),
          ]),
          probeProtocolVersion: Type.Literal(1),
          programId: Type.Literal("eden-docker-diagnostic-probe-v1"),
          type: Type.Literal("docker_diagnostic_probe_v1"),
        },
        closed,
      ),
      probeId: Type.String({
        maxLength: 128,
        minLength: 7,
        pattern: "^probe-[a-z0-9][a-z0-9-]{0,121}$",
      }),
      profile: Type.Object(
        {
          autoRemove: Type.Literal(false),
          capabilities: Type.Literal("drop_all"),
          environment: Type.Object(
            {
              HOME: Type.Literal("/tmp"),
              LANG: Type.Literal("C.UTF-8"),
              PATH: Type.Literal("/usr/local/bin:/usr/bin:/bin"),
              SSL_CERT_FILE: Type.Literal("/etc/ssl/certs/ca-certificates.crt"),
            },
            closed,
          ),
          entrypoint: Type.Literal("/nodejs/bin/node"),
          hostNamespaces: Type.Literal("none"),
          linuxUser: Type.Literal("65532:65532"),
          network: Type.Literal("none"),
          noNewPrivileges: Type.Literal(true),
          privileged: Type.Literal(false),
          profileRevision: Type.Literal("r2-docker-diagnostic-probe-v1"),
          restart: Type.Literal("disabled"),
          rootFilesystem: Type.Literal("read_only"),
          seccomp: Type.Literal("docker_default"),
          sockets: Type.Literal("none"),
          temporaryFilesystem: Type.Object(
            {
              access: Type.Literal("read_write"),
              containerPath: Type.Literal("/tmp"),
              filesystem: Type.Literal("tmpfs"),
              options: Type.Tuple([
                Type.Literal("nodev"),
                Type.Literal("noexec"),
                Type.Literal("nosuid"),
              ]),
            },
            closed,
          ),
          workingDirectory: Type.Literal("/tmp"),
        },
        closed,
      ),
      proposalRevision: RevisionSchema,
      scope: Type.Object(
        {
          capability: Type.Literal("docker.diagnostic.probe"),
          paths: Type.Literal("none"),
          repository: Type.Literal("none"),
        },
        closed,
      ),
      toolchain: Type.Object(
        {
          imageIndexDigest: Type.Literal(
            "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
          ),
          nodeExecutable: Type.Literal("/nodejs/bin/node"),
          nodeMajor: Type.Literal(24),
          platformManifestDigest: sha256Schema,
          probeProgramBytes: Type.Integer({ maximum: 8_192, minimum: 1 }),
          probeProgramSha256: sha256Schema,
          requestedPlatform: Type.Union([Type.Literal("linux/amd64"), Type.Literal("linux/arm64")]),
          toolchainId: Type.Literal("eden-node24-check-v1"),
        },
        closed,
      ),
    },
    closed,
  ),
  (action) =>
    action.proposalRevision === action.lifetime.revision &&
    action.operation.type === action.kind &&
    action.toolchain.nodeExecutable === action.profile.entrypoint &&
    action.toolchain.requestedPlatform === `linux/${action.backend.architecture}` &&
    utf8.encode(JSON.stringify(action)).byteLength <= 16_384,
);
export type DockerDiagnosticProbeActionV1 = Type.Static<typeof DockerDiagnosticProbeActionV1Schema>;

const actionValidator = Schema.Compile(DockerDiagnosticProbeActionV1Schema);

function invalid(kind: string): ProductError {
  return {
    code: `invalid_${kind}`,
    message: `The ${kind.replaceAll("_", " ")} does not match the closed contract.`,
    recoverability: "fatal",
    suggestedActions: ["Reject the value at the product boundary."],
  };
}

export function decodeDockerDiagnosticProbeAction(
  value: unknown,
): DecodeResult<DockerDiagnosticProbeActionV1> {
  return actionValidator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalid("docker_diagnostic_probe_action") };
}

const identifierSchema = Type.String({ maxLength: 256, minLength: 1 });
const digestSchema = Type.String({ pattern: "^[a-f0-9]{64}$" });
const boundedTextSchema = Type.String({ maxLength: 4_096, minLength: 1 });
const limitationsSchema = Type.Array(boundedTextSchema, { maxItems: 8 });
const nextActionsSchema = Type.Array(boundedTextSchema, { maxItems: 8 });
const probeIdSchema = DockerDiagnosticProbeActionV1Schema.properties.probeId;

export const DockerDiagnosticProbeApprovalSchema = Type.Object(
  {
    approvalId: identifierSchema,
    choices: Type.Tuple([Type.Literal("approve"), Type.Literal("deny")]),
    expectedRevision: RevisionSchema,
  },
  closed,
);
export type DockerDiagnosticProbeApproval = Type.Static<typeof DockerDiagnosticProbeApprovalSchema>;

const DockerDiagnosticProbePolicySchema = Type.Object(
  {
    actionDigest: digestSchema,
    decision: Type.Literal("ask"),
    evaluatedAt: Type.String({ format: "date-time" }),
    reason: boundedTextSchema,
    ruleId: Type.Literal("r2.docker-diagnostic-probe.exact"),
    ruleSetRevision: Type.Literal("r2-docker-diagnostic-probe-v1"),
  },
  closed,
);

export const DockerDiagnosticProbeCommandV1Schema = Type.Object(
  {
    actionDigest: digestSchema,
    approvalId: identifierSchema,
    commandId: identifierSchema,
    decision: Type.Union([Type.Literal("approve"), Type.Literal("deny")]),
    expectedRevision: RevisionSchema,
    probeId: probeIdSchema,
    protocolVersion: Type.Literal(1),
    type: Type.Literal("docker.probe.approval.resolve"),
  },
  closed,
);
export type DockerDiagnosticProbeCommandV1 = Type.Static<
  typeof DockerDiagnosticProbeCommandV1Schema
>;

const DockerDiagnosticProbeLabelsSchema = Type.Object(
  {
    actionId: ActionIdSchema,
    configDigest: sha256Schema,
    effectId: identifierSchema,
    imageIndexDigest: Type.Literal(
      "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
    ),
    platformManifestDigest: sha256Schema,
    probeId: probeIdSchema,
    profileRevision: Type.Literal("r2-docker-diagnostic-probe-v1"),
    schema: Type.Literal("eden.docker-diagnostic-probe.v1"),
  },
  closed,
);
export type DockerDiagnosticProbeLabels = Type.Static<typeof DockerDiagnosticProbeLabelsSchema>;

const DockerDiagnosticProbeExecutionOutcomeSchema = Type.Union([
  Type.Literal("passed"),
  Type.Literal("failed"),
  Type.Literal("timed_out"),
  Type.Literal("cancelled"),
  Type.Literal("oom"),
  Type.Literal("output_overflow"),
  Type.Literal("engine_failed"),
  Type.Literal("unknown"),
]);

export const DockerDiagnosticProbeReceiptV1Schema = Type.Refine(
  Type.Object(
    {
      actionId: ActionIdSchema,
      configDigest: sha256Schema,
      container: Type.Object(
        {
          id: Type.String({ pattern: "^[a-f0-9]{64}$" }),
          name: Type.String({ pattern: "^eden-probe-[a-f0-9]{24}$" }),
        },
        closed,
      ),
      effectId: identifierSchema,
      labels: DockerDiagnosticProbeLabelsSchema,
      lifecycleState: Type.Literal("exited"),
      probeId: probeIdSchema,
      receiptId: identifierSchema,
      receiptVersion: Type.Literal(1),
      recordedAt: Type.String({ format: "date-time" }),
      resultDigest: sha256Schema,
      resultOutcome: DockerDiagnosticProbeExecutionOutcomeSchema,
    },
    closed,
  ),
  (receipt) =>
    receipt.actionId === receipt.labels.actionId &&
    receipt.configDigest === receipt.labels.configDigest &&
    receipt.effectId === receipt.labels.effectId &&
    receipt.probeId === receipt.labels.probeId,
);
export type DockerDiagnosticProbeReceiptV1 = Type.Static<
  typeof DockerDiagnosticProbeReceiptV1Schema
>;

const DockerDiagnosticProbeContainerStateSchema = Type.Union([
  Type.Literal("removed"),
  Type.Literal("absent"),
  Type.Literal("failed"),
  Type.Literal("unknown"),
]);

export const DockerDiagnosticProbeCleanupV1Schema = Type.Refine(
  Type.Object(
    {
      actionId: ActionIdSchema,
      cleanupVersion: Type.Literal(1),
      completedAt: Type.String({ format: "date-time" }),
      container: Type.Object(
        {
          id: Type.String({ pattern: "^[a-f0-9]{64}$" }),
          name: Type.String({ pattern: "^eden-probe-[a-f0-9]{24}$" }),
          state: DockerDiagnosticProbeContainerStateSchema,
        },
        closed,
      ),
      effectId: identifierSchema,
      error: Type.Union([ProductErrorSchema, Type.Null()]),
      probeId: probeIdSchema,
      receiptId: identifierSchema,
      status: Type.Union([
        Type.Literal("complete"),
        Type.Literal("failed"),
        Type.Literal("unknown"),
      ]),
    },
    closed,
  ),
  (cleanup) => {
    const removed = cleanup.container.state === "removed" || cleanup.container.state === "absent";
    return cleanup.status === "complete"
      ? removed && cleanup.error === null
      : !removed && cleanup.error !== null;
  },
);
export type DockerDiagnosticProbeCleanupV1 = Type.Static<
  typeof DockerDiagnosticProbeCleanupV1Schema
>;

const ObservationStatusSchema = Type.Union([
  Type.Literal("passed"),
  Type.Literal("failed"),
  Type.Literal("unavailable"),
]);
const nullableInteger = (maximum = Number.MAX_SAFE_INTEGER) =>
  Type.Union([Type.Integer({ maximum, minimum: 0 }), Type.Null()]);
const nullableBoolean = Type.Union([Type.Boolean(), Type.Null()]);

const ProcessUserObservationSchema = Type.Refine(
  Type.Object(
    {
      check: Type.Literal("process_user"),
      gid: nullableInteger(65_535),
      status: ObservationStatusSchema,
      uid: nullableInteger(65_535),
    },
    closed,
  ),
  (row) => row.status !== "passed" || (row.uid === 65_532 && row.gid === 65_532),
);
const UserNamespaceObservationSchema = Type.Refine(
  Type.Object(
    {
      check: Type.Literal("user_namespace"),
      mapping: Type.Union([
        Type.Literal("remapped"),
        Type.Literal("identity"),
        Type.Literal("unavailable"),
      ]),
      status: ObservationStatusSchema,
    },
    closed,
  ),
  (row) => row.status !== "passed" || row.mapping === "remapped",
);
const CapabilitiesObservationSchema = Type.Refine(
  Type.Object(
    {
      check: Type.Literal("capabilities"),
      effectiveMask: Type.Union([Type.String({ pattern: "^[a-f0-9]{16}$" }), Type.Null()]),
      status: ObservationStatusSchema,
    },
    closed,
  ),
  (row) => row.status !== "passed" || row.effectiveMask === "0000000000000000",
);
const NoNewPrivilegesObservationSchema = Type.Refine(
  Type.Object(
    {
      check: Type.Literal("no_new_privileges"),
      enabled: nullableBoolean,
      status: ObservationStatusSchema,
    },
    closed,
  ),
  (row) => row.status !== "passed" || row.enabled === true,
);
const SeccompObservationSchema = Type.Refine(
  Type.Object(
    {
      check: Type.Literal("seccomp"),
      mode: Type.Union([
        Type.Literal("filter"),
        Type.Literal("strict"),
        Type.Literal("disabled"),
        Type.Literal("unavailable"),
      ]),
      status: ObservationStatusSchema,
    },
    closed,
  ),
  (row) => row.status !== "passed" || row.mode === "filter",
);
const RootFilesystemObservationSchema = Type.Refine(
  Type.Object(
    {
      access: Type.Union([
        Type.Literal("read_only"),
        Type.Literal("read_write"),
        Type.Literal("unavailable"),
      ]),
      check: Type.Literal("root_filesystem"),
      status: ObservationStatusSchema,
    },
    closed,
  ),
  (row) => row.status !== "passed" || row.access === "read_only",
);
const TemporaryFilesystemObservationSchema = Type.Refine(
  Type.Object(
    {
      check: Type.Literal("temporary_filesystem"),
      filesystem: Type.Union([Type.String({ maxLength: 64, minLength: 1 }), Type.Null()]),
      nodev: nullableBoolean,
      noexec: nullableBoolean,
      nosuid: nullableBoolean,
      sizeBytes: nullableInteger(),
      status: ObservationStatusSchema,
      writable: nullableBoolean,
    },
    closed,
  ),
  (row) =>
    row.status !== "passed" ||
    (row.filesystem === "tmpfs" &&
      row.nodev === true &&
      row.noexec === true &&
      row.nosuid === true &&
      row.sizeBytes === 1_048_576 &&
      row.writable === true),
);
const ResourceLimitsObservationSchema = Type.Refine(
  Type.Object(
    {
      check: Type.Literal("resource_limits"),
      cpuPeriodMicros: nullableInteger(),
      cpuQuotaMicros: nullableInteger(),
      fileDescriptors: nullableInteger(),
      memoryBytes: nullableInteger(),
      memorySwapBytes: nullableInteger(),
      pids: nullableInteger(),
      status: ObservationStatusSchema,
    },
    closed,
  ),
  (row) =>
    row.status !== "passed" ||
    (row.cpuPeriodMicros === 100_000 &&
      row.cpuQuotaMicros === 50_000 &&
      row.fileDescriptors === 64 &&
      row.memoryBytes === 67_108_864 &&
      row.memorySwapBytes === 67_108_864 &&
      row.pids === 16),
);
const ResultProtocolObservationSchema = Type.Refine(
  Type.Object(
    {
      byteLength: Type.Integer({ maximum: 4_096, minimum: 0 }),
      check: Type.Literal("result_protocol"),
      protocolVersion: Type.Union([Type.Literal(1), Type.Null()]),
      sha256: Type.Union([sha256Schema, Type.Null()]),
      status: ObservationStatusSchema,
    },
    closed,
  ),
  (row) =>
    row.status !== "passed" ||
    (row.protocolVersion === 1 && row.sha256 !== null && row.byteLength > 0),
);

export const DockerDiagnosticProbeObservationsV1Schema = Type.Tuple([
  ProcessUserObservationSchema,
  UserNamespaceObservationSchema,
  CapabilitiesObservationSchema,
  NoNewPrivilegesObservationSchema,
  SeccompObservationSchema,
  RootFilesystemObservationSchema,
  TemporaryFilesystemObservationSchema,
  ResourceLimitsObservationSchema,
  ResultProtocolObservationSchema,
]);
export type DockerDiagnosticProbeObservationsV1 = Type.Static<
  typeof DockerDiagnosticProbeObservationsV1Schema
>;

const DockerDiagnosticProbeResultOutcomeSchema = Type.Union([
  DockerDiagnosticProbeExecutionOutcomeSchema,
  Type.Literal("cleanup_failed"),
]);

export const DockerDiagnosticProbeResultV1Schema = Type.Refine(
  Type.Object(
    {
      actionId: ActionIdSchema,
      cleanup: DockerDiagnosticProbeCleanupV1Schema,
      effectId: identifierSchema,
      endedAt: Type.String({ format: "date-time" }),
      observations: DockerDiagnosticProbeObservationsV1Schema,
      outcome: DockerDiagnosticProbeResultOutcomeSchema,
      probeId: probeIdSchema,
      receipt: DockerDiagnosticProbeReceiptV1Schema,
      resultVersion: Type.Literal(1),
      startedAt: Type.String({ format: "date-time" }),
    },
    closed,
  ),
  (result) => {
    const identityMatches =
      result.probeId === result.receipt.probeId &&
      result.probeId === result.cleanup.probeId &&
      result.actionId === result.receipt.actionId &&
      result.actionId === result.cleanup.actionId &&
      result.effectId === result.receipt.effectId &&
      result.effectId === result.cleanup.effectId &&
      result.receipt.receiptId === result.cleanup.receiptId;
    if (!identityMatches || Date.parse(result.endedAt) < Date.parse(result.startedAt)) return false;
    if (result.outcome === "passed") {
      return (
        result.receipt.resultOutcome === "passed" &&
        result.cleanup.status === "complete" &&
        result.observations.every((row) => row.status === "passed") &&
        result.observations[8].sha256 === result.receipt.resultDigest
      );
    }
    if (result.outcome === "cleanup_failed") return result.cleanup.status !== "complete";
    return result.receipt.resultOutcome === result.outcome;
  },
);
export type DockerDiagnosticProbeResultV1 = Type.Static<typeof DockerDiagnosticProbeResultV1Schema>;

const lifecycleStates = [
  "awaiting_approval",
  "approval_consumed",
  "effect_intent",
  "container_created",
  "dispatch_started",
  "receipt_recorded",
  "cleanup_recorded",
  "terminal",
] as const;
const DockerDiagnosticProbeLifecycleRowSchema = Type.Object(
  {
    observedAt: Type.String({ format: "date-time" }),
    state: Type.Union(lifecycleStates.map((state) => Type.Literal(state))),
  },
  closed,
);

export const DockerDiagnosticProbeProductViewV1Schema = Type.Refine(
  Type.Object(
    {
      action: DockerDiagnosticProbeActionV1Schema,
      actionDigest: digestSchema,
      approval: Type.Union([DockerDiagnosticProbeApprovalSchema, Type.Null()]),
      cleanup: Type.Union([DockerDiagnosticProbeCleanupV1Schema, Type.Null()]),
      effectId: Type.Union([identifierSchema, Type.Null()]),
      lifecycle: Type.Array(DockerDiagnosticProbeLifecycleRowSchema, {
        maxItems: lifecycleStates.length,
        minItems: 1,
      }),
      limitations: limitationsSchema,
      nextActions: nextActionsSchema,
      policy: DockerDiagnosticProbePolicySchema,
      probeId: probeIdSchema,
      projectionVersion: Type.Literal(1),
      receipt: Type.Union([DockerDiagnosticProbeReceiptV1Schema, Type.Null()]),
      result: Type.Union([DockerDiagnosticProbeResultV1Schema, Type.Null()]),
      revision: RevisionSchema,
      state: Type.Union([
        Type.Literal("awaiting_approval"),
        Type.Literal("recovery_required"),
        Type.Literal("executing"),
        Type.Literal("terminal"),
        Type.Literal("unknown"),
      ]),
    },
    closed,
  ),
  (view) => {
    const states = view.lifecycle.map((row) => row.state);
    const ordered =
      states.every((state, index) => state === lifecycleStates[index]) &&
      view.lifecycle.every(
        (row, index) =>
          index === 0 ||
          Date.parse(row.observedAt) >= Date.parse(view.lifecycle[index - 1]?.observedAt ?? ""),
      );
    if (
      !ordered ||
      view.probeId !== view.action.probeId ||
      view.revision !== view.action.proposalRevision ||
      view.policy.actionDigest !== view.actionDigest
    ) {
      return false;
    }
    if (view.state === "awaiting_approval") {
      return (
        states.length === 1 &&
        view.approval !== null &&
        view.effectId === null &&
        view.receipt === null &&
        view.cleanup === null &&
        view.result === null
      );
    }
    if (view.state === "terminal") {
      return (
        states.at(-1) === "terminal" &&
        view.approval === null &&
        view.effectId !== null &&
        view.receipt !== null &&
        view.cleanup !== null &&
        view.result !== null &&
        view.effectId === view.result.effectId &&
        view.receipt.receiptId === view.result.receipt.receiptId &&
        view.cleanup.receiptId === view.result.cleanup.receiptId
      );
    }
    return view.effectId !== null;
  },
);
export type DockerDiagnosticProbeProductViewV1 = Type.Static<
  typeof DockerDiagnosticProbeProductViewV1Schema
>;

const DockerDiagnosticProbeEventEnvelopeSchema = {
  eventId: identifierSchema,
  probeId: probeIdSchema,
  protocolVersion: Type.Literal(1),
  revision: RevisionSchema,
} as const;

export const DockerDiagnosticProbeApprovalRequiredV1Schema = Type.Refine(
  Type.Object(
    {
      ...DockerDiagnosticProbeEventEnvelopeSchema,
      action: DockerDiagnosticProbeActionV1Schema,
      actionDigest: digestSchema,
      approval: DockerDiagnosticProbeApprovalSchema,
      limitations: limitationsSchema,
      nextActions: nextActionsSchema,
      policy: DockerDiagnosticProbePolicySchema,
      type: Type.Literal("docker.probe.approval.required"),
    },
    closed,
  ),
  (event) =>
    event.probeId === event.action.probeId &&
    event.revision === event.action.proposalRevision &&
    event.revision === event.approval.expectedRevision &&
    event.actionDigest === event.policy.actionDigest,
);
export type DockerDiagnosticProbeApprovalRequiredV1 = Type.Static<
  typeof DockerDiagnosticProbeApprovalRequiredV1Schema
>;

export const DockerDiagnosticProbeRecoveryRequiredV1Schema = Type.Object(
  {
    ...DockerDiagnosticProbeEventEnvelopeSchema,
    actionDigest: digestSchema,
    actionId: ActionIdSchema,
    cleanup: Type.Union([DockerDiagnosticProbeCleanupV1Schema, Type.Null()]),
    effectId: identifierSchema,
    error: ProductErrorSchema,
    lastLifecycleState: Type.Union([
      Type.Literal("action_prepared"),
      Type.Literal("approval_consumed"),
      Type.Literal("effect_intent"),
      Type.Literal("container_created"),
      Type.Literal("dispatch_started"),
      Type.Literal("receipt_recorded"),
      Type.Literal("cleanup_recorded"),
    ]),
    limitations: limitationsSchema,
    nextAction: boundedTextSchema,
    receipt: Type.Union([DockerDiagnosticProbeReceiptV1Schema, Type.Null()]),
    type: Type.Literal("docker.probe.recovery.required"),
  },
  closed,
);
export type DockerDiagnosticProbeRecoveryRequiredV1 = Type.Static<
  typeof DockerDiagnosticProbeRecoveryRequiredV1Schema
>;

export const DockerDiagnosticProbeRecoveryResolvedV1Schema = Type.Refine(
  Type.Object(
    {
      ...DockerDiagnosticProbeEventEnvelopeSchema,
      actionDigest: digestSchema,
      actionId: ActionIdSchema,
      effectId: identifierSchema,
      lastLifecycleState: Type.Union([
        Type.Literal("action_prepared"),
        Type.Literal("approval_consumed"),
        Type.Literal("effect_intent"),
      ]),
      limitations: limitationsSchema,
      nextAction: boundedTextSchema,
      outcome: Type.Literal("not_started"),
      reason: Type.Union([
        Type.Literal("approval_not_consumed"),
        Type.Literal("pre_create_absent"),
      ]),
      resolvedAt: Type.String({ format: "date-time" }),
      type: Type.Literal("docker.probe.recovery.resolved"),
    },
    closed,
  ),
  (event) =>
    event.reason === "approval_not_consumed"
      ? event.lastLifecycleState === "action_prepared"
      : event.lastLifecycleState === "approval_consumed" ||
        event.lastLifecycleState === "effect_intent",
);
export type DockerDiagnosticProbeRecoveryResolvedV1 = Type.Static<
  typeof DockerDiagnosticProbeRecoveryResolvedV1Schema
>;

const DockerDiagnosticProbeLifecycleUpdatedV1Schema = Type.Refine(
  Type.Object(
    {
      ...DockerDiagnosticProbeEventEnvelopeSchema,
      probe: DockerDiagnosticProbeProductViewV1Schema,
      type: Type.Literal("docker.probe.lifecycle.updated"),
    },
    closed,
  ),
  (event) => event.probeId === event.probe.probeId && event.revision === event.probe.revision,
);
const DockerDiagnosticProbeTerminalV1Schema = Type.Refine(
  Type.Object(
    {
      ...DockerDiagnosticProbeEventEnvelopeSchema,
      probe: DockerDiagnosticProbeProductViewV1Schema,
      type: Type.Literal("docker.probe.terminal"),
    },
    closed,
  ),
  (event) =>
    event.probeId === event.probe.probeId &&
    event.revision === event.probe.revision &&
    event.probe.state === "terminal",
);

export const DockerDiagnosticProbeEventV1Schema = Type.Union([
  DockerDiagnosticProbeApprovalRequiredV1Schema,
  DockerDiagnosticProbeRecoveryRequiredV1Schema,
  DockerDiagnosticProbeRecoveryResolvedV1Schema,
  DockerDiagnosticProbeLifecycleUpdatedV1Schema,
  DockerDiagnosticProbeTerminalV1Schema,
]);
export type DockerDiagnosticProbeEventV1 = Type.Static<typeof DockerDiagnosticProbeEventV1Schema>;

const commandValidator = Schema.Compile(DockerDiagnosticProbeCommandV1Schema);
const eventValidator = Schema.Compile(DockerDiagnosticProbeEventV1Schema);
const receiptValidator = Schema.Compile(DockerDiagnosticProbeReceiptV1Schema);
const cleanupValidator = Schema.Compile(DockerDiagnosticProbeCleanupV1Schema);
const resultValidator = Schema.Compile(DockerDiagnosticProbeResultV1Schema);
const productViewValidator = Schema.Compile(DockerDiagnosticProbeProductViewV1Schema);
const observationsValidator = Schema.Compile(DockerDiagnosticProbeObservationsV1Schema);

export function decodeDockerDiagnosticProbeCommand(
  value: unknown,
): DecodeResult<DockerDiagnosticProbeCommandV1> {
  return commandValidator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalid("docker_diagnostic_probe_command") };
}

export function decodeDockerDiagnosticProbeEvent(
  value: unknown,
): DecodeResult<DockerDiagnosticProbeEventV1> {
  return eventValidator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalid("docker_diagnostic_probe_event") };
}

export function decodeDockerDiagnosticProbeReceipt(
  value: unknown,
): DecodeResult<DockerDiagnosticProbeReceiptV1> {
  return receiptValidator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalid("docker_diagnostic_probe_receipt") };
}

export function decodeDockerDiagnosticProbeCleanup(
  value: unknown,
): DecodeResult<DockerDiagnosticProbeCleanupV1> {
  return cleanupValidator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalid("docker_diagnostic_probe_cleanup") };
}

export function decodeDockerDiagnosticProbeResult(
  value: unknown,
): DecodeResult<DockerDiagnosticProbeResultV1> {
  return resultValidator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalid("docker_diagnostic_probe_result") };
}

export function decodeDockerDiagnosticProbeProductView(
  value: unknown,
): DecodeResult<DockerDiagnosticProbeProductViewV1> {
  return productViewValidator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalid("docker_diagnostic_probe_product_view") };
}

export function decodeDockerDiagnosticProbeObservations(
  value: unknown,
): DecodeResult<DockerDiagnosticProbeObservationsV1> {
  return observationsValidator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalid("docker_diagnostic_probe_observations") };
}

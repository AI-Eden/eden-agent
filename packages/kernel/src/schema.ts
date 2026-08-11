import {
  ActionEnvelopeV1Schema,
  ActiveRunInputContentSchema,
  ClosedCheckObservationSchema,
  RepositoryToolCallSchema as ContractRepositoryToolCallSchema,
  RepositoryToolResultSchema as ContractRepositoryToolResultSchema,
  PatchObservationSchema,
  PolicyDecisionSchema,
  RepositoryCheckActionEnvelopeV1Schema,
  RepositoryCheckLifecycleStateSchema,
  RepositoryCheckReceiptV1Schema,
  RepositoryCheckResultV1Schema,
  RunCommandToolCallSchema,
  UsableCodingBudgetPolicyV1Schema,
  UsableCodingRunGrantV1Schema,
  validateUsableCodingBudgetLedger,
  WriteFileToolCallSchema,
} from "@eden/contracts";
import Type from "typebox";
import Schema from "typebox/schema";

import type { KernelEvent } from "./model.ts";

const closed = { additionalProperties: false } as const;
const identifier = () => Type.String({ maxLength: 256, minLength: 1 });
const boundedText = () => Type.String({ maxLength: 4_096, minLength: 1 });

const ProductErrorSchema = Type.Object(
  {
    code: identifier(),
    message: boundedText(),
    recoverability: Type.Union([
      Type.Literal("retry"),
      Type.Literal("reconfigure"),
      Type.Literal("ask-user"),
      Type.Literal("fatal"),
    ]),
    suggestedActions: Type.Array(boundedText(), { maxItems: 8 }),
  },
  closed,
);

const ActionSchema = Type.Object(
  {
    actionId: identifier(),
    approvalId: identifier(),
    canonicalDisplay: boundedText(),
    cwd: boundedText(),
    digest: boundedText(),
    reason: boundedText(),
    scope: boundedText(),
  },
  closed,
);
const SafeActuationActionSchema = Type.Object(
  {
    ...ActionSchema.properties,
    safeActuation: Type.Object(
      {
        approval: Type.Object(
          {
            actionDigest: Type.String({ pattern: "^[a-f0-9]{64}$" }),
            expectedRevision: Type.Integer({ minimum: 0 }),
            proposalRevision: Type.Integer({ minimum: 0 }),
            state: Type.Union([Type.Literal("available"), Type.Literal("consumed")]),
          },
          closed,
        ),
        envelope: ActionEnvelopeV1Schema,
        parentActionId: Type.Union([identifier(), Type.Null()]),
        policy: PolicyDecisionSchema,
      },
      closed,
    ),
  },
  closed,
);

const RunWorkspaceSchema = Type.Object(
  {
    name: boundedText(),
    root: boundedText(),
    trust: Type.Literal("trusted"),
    workspaceId: identifier(),
  },
  closed,
);

const ModelRunConfigurationSchema = Type.Object(
  {
    contextWindowTokens: Type.Integer({ minimum: 1 }),
    maxOutputTokens: Type.Integer({ maximum: 8_192, minimum: 1 }),
    model: Type.String({ maxLength: 256, minLength: 1 }),
    multiCallCapability: Type.Optional(Type.Literal("bounded_read_only_v1")),
    profileId: Type.String({ maxLength: 64, minLength: 1 }),
  },
  closed,
);

function isPortableRepositoryPath(value: string): boolean {
  if (
    value === "." ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return value === ".";
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

const RepositoryPathSchema = Type.Refine(
  Type.String({ maxLength: 4_096, minLength: 1 }),
  isPortableRepositoryPath,
);
const AnchorEditToolCallSchema = Type.Refine(
  Type.Object(
    {
      arguments: Type.Object(
        {
          path: RepositoryPathSchema,
          replacements: Type.Array(
            Type.Object(
              {
                expectedOccurrences: Type.Literal(1),
                newText: Type.String({ maxLength: 16_384 }),
                oldText: Type.String({ maxLength: 16_384, minLength: 1 }),
              },
              closed,
            ),
            { maxItems: 16, minItems: 1 },
          ),
        },
        closed,
      ),
      name: Type.Literal("anchor_edit"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (call) =>
    new TextEncoder().encode(JSON.stringify(call.arguments.replacements)).byteLength <= 16_384,
);
const RepositoryCheckToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      { checkName: Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }) },
      closed,
    ),
    name: Type.Literal("repository_check"),
    toolCallId: identifier(),
  },
  closed,
);
const RepositoryToolCallSchema = ContractRepositoryToolCallSchema;
const GitStatusCodeSchema = Type.String({ maxLength: 1, minLength: 1, pattern: "^[.MADRCUT?!]$" });
const GitStatusEntrySchema = Type.Refine(
  Type.Object(
    {
      indexStatus: GitStatusCodeSchema,
      kind: Type.Union([
        Type.Literal("added"),
        Type.Literal("copied"),
        Type.Literal("deleted"),
        Type.Literal("modified"),
        Type.Literal("renamed"),
        Type.Literal("unmerged"),
        Type.Literal("untracked"),
      ]),
      originalPath: Type.Union([RepositoryPathSchema, Type.Null()]),
      path: RepositoryPathSchema,
      worktreeStatus: GitStatusCodeSchema,
    },
    closed,
  ),
  (value) =>
    (value.kind === "renamed" || value.kind === "copied") === (value.originalPath !== null),
);
const RepositoryToolResultSchema = ContractRepositoryToolResultSchema;

const ModelUsageSchema = Type.Refine(
  Type.Object(
    {
      completionTokens: Type.Integer({ minimum: 0 }),
      promptTokens: Type.Integer({ minimum: 0 }),
      totalTokens: Type.Integer({ minimum: 0 }),
    },
    closed,
  ),
  (value) => value.totalTokens === value.completionTokens + value.promptTokens,
);

const ModelAttemptErrorSchema = Type.Object(
  {
    code: identifier(),
    message: boundedText(),
    recoverability: Type.Union([
      Type.Literal("retry"),
      Type.Literal("reconfigure"),
      Type.Literal("ask-user"),
      Type.Literal("fatal"),
    ]),
    suggestedActions: Type.Array(boundedText(), { maxItems: 8 }),
  },
  closed,
);

const CompletedModelStepObservationSchema = Type.Refine(
  Type.Object(
    {
      attemptId: identifier(),
      finishStatus: Type.Union([Type.Literal("stop"), Type.Literal("tool_calls")]),
      privateContinuity: Type.Union([Type.String({ maxLength: 8_192 }), Type.Null()]),
      requestId: Type.Union([Type.String({ maxLength: 128, minLength: 1 }), Type.Null()]),
      status: Type.Literal("completed"),
      text: Type.String({ maxLength: 32_768 }),
      toolCalls: Type.Array(RepositoryToolCallSchema, { maxItems: 4 }),
      usage: Type.Union([ModelUsageSchema, Type.Null()]),
      version: Type.Literal(1),
    },
    closed,
  ),
  (value) =>
    new TextEncoder().encode(value.text).byteLength <= 32_768 &&
    (value.privateContinuity === null ||
      new TextEncoder().encode(value.privateContinuity).byteLength <= 8_192) &&
    ((value.finishStatus === "stop" && value.toolCalls.length === 0) ||
      (value.finishStatus === "tool_calls" &&
        value.toolCalls.length >= 1 &&
        value.toolCalls.length <= 4)),
);
const NonCompletedModelStepObservationSchema = Type.Union([
  Type.Object(
    {
      attemptId: identifier(),
      error: ModelAttemptErrorSchema,
      status: Type.Union([Type.Literal("not_started"), Type.Literal("unknown")]),
      version: Type.Literal(1),
    },
    closed,
  ),
  Type.Refine(
    Type.Object(
      {
        attemptId: identifier(),
        error: ModelAttemptErrorSchema,
        partialText: Type.String({ maxLength: 32_768 }),
        status: Type.Literal("interrupted"),
        version: Type.Literal(1),
      },
      closed,
    ),
    (value) => new TextEncoder().encode(value.partialText).byteLength <= 32_768,
  ),
]);
const ModelStepObservationSchema = Type.Union([
  CompletedModelStepObservationSchema,
  NonCompletedModelStepObservationSchema,
]);

const FakeActionEffectSchema = Type.Object(
  { effectId: identifier(), runId: identifier(), type: Type.Literal("fake.action.execute") },
  closed,
);
const FakeModelEffectSchema = Type.Object(
  {
    effectId: identifier(),
    runId: identifier(),
    task: boundedText(),
    toolResult: Type.Optional(RepositoryToolResultSchema),
    type: Type.Literal("fake.model.complete"),
  },
  closed,
);
const RepositoryToolEffectSchema = Type.Object(
  {
    effectId: identifier(),
    runId: identifier(),
    toolCall: RepositoryToolCallSchema,
    type: Type.Literal("repository.tool.execute"),
  },
  closed,
);
const RepositoryToolBatchEffectSchema = Type.Object(
  {
    calls: Type.Array(RepositoryToolCallSchema, { maxItems: 4, minItems: 2 }),
    effectId: identifier(),
    runId: identifier(),
    type: Type.Literal("repository.tool.batch.execute"),
  },
  closed,
);
const AnchorEditEffectSchema = Type.Object(
  {
    effectId: identifier(),
    envelope: ActionEnvelopeV1Schema,
    runId: identifier(),
    type: Type.Literal("anchor_edit.execute"),
  },
  closed,
);
const WriteFileEffectSchema = Type.Object(
  {
    effectId: identifier(),
    envelope: ActionEnvelopeV1Schema,
    runId: identifier(),
    type: Type.Literal("write_file.execute"),
  },
  closed,
);
const RunCommandEffectSchema = Type.Object(
  {
    effectId: identifier(),
    envelope: ActionEnvelopeV1Schema,
    runId: identifier(),
    type: Type.Literal("run_command.execute"),
  },
  closed,
);
const RepositoryCheckEffectSchema = Type.Object(
  {
    effectId: identifier(),
    envelope: RepositoryCheckActionEnvelopeV1Schema,
    runId: identifier(),
    type: Type.Literal("repository_check.execute"),
  },
  closed,
);
const EdenPatchCaptureEffectSchema = Type.Object(
  {
    actionId: identifier(),
    effectId: identifier(),
    envelope: ActionEnvelopeV1Schema,
    runId: identifier(),
    type: Type.Literal("review.eden_patch.capture"),
  },
  closed,
);
const GitSnapshotCaptureEffectSchema = Type.Object(
  {
    actionId: identifier(),
    effectId: identifier(),
    expectedHead: Type.Union([Type.String({ pattern: "^[a-f0-9]{40,64}$" }), Type.Null()]),
    phase: Type.Union([Type.Literal("baseline"), Type.Literal("current")]),
    runId: identifier(),
    type: Type.Literal("review.git_snapshot.capture"),
  },
  closed,
);
const GitCheckCaptureEffectSchema = Type.Object(
  {
    actionId: identifier(),
    effectId: identifier(),
    head: Type.String({ pattern: "^[a-f0-9]{40,64}$" }),
    phase: Type.Union([Type.Literal("baseline"), Type.Literal("current")]),
    runId: identifier(),
    type: Type.Literal("review.git_check.capture"),
  },
  closed,
);
const GitReviewSnapshotSchema = Type.Object(
  {
    head: Type.String({ pattern: "^[a-f0-9]{40,64}$" }),
    observedAt: Type.String({ format: "date-time" }),
    statusEntries: Type.Array(GitStatusEntrySchema, { maxItems: 256 }),
    statusHash: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }),
    trackedPatch: PatchObservationSchema,
  },
  closed,
);
const AnchorEditPrepareEffectSchema = Type.Object(
  {
    effectId: identifier(),
    expectedRevision: Type.Integer({ minimum: 0 }),
    parentActionId: Type.Union([identifier(), Type.Null()]),
    proposalRevision: Type.Integer({ minimum: 0 }),
    runId: identifier(),
    toolCall: AnchorEditToolCallSchema,
    type: Type.Literal("anchor_edit.prepare"),
    workspace: RunWorkspaceSchema,
  },
  closed,
);
const WriteFilePrepareEffectSchema = Type.Object(
  {
    effectId: identifier(),
    expectedRevision: Type.Integer({ minimum: 0 }),
    proposalRevision: Type.Integer({ minimum: 0 }),
    runId: identifier(),
    toolCall: WriteFileToolCallSchema,
    type: Type.Literal("write_file.prepare"),
    workspace: RunWorkspaceSchema,
  },
  closed,
);
const RunCommandPrepareEffectSchema = Type.Object(
  {
    effectId: identifier(),
    expectedRevision: Type.Integer({ minimum: 0 }),
    proposalRevision: Type.Integer({ minimum: 0 }),
    runId: identifier(),
    toolCall: RunCommandToolCallSchema,
    type: Type.Literal("run_command.prepare"),
    workspace: RunWorkspaceSchema,
  },
  closed,
);
const RepositoryCheckPrepareEffectSchema = Type.Object(
  {
    effectId: identifier(),
    executionEffectId: identifier(),
    expectedRevision: Type.Integer({ minimum: 0 }),
    proposalRevision: Type.Integer({ minimum: 0 }),
    runId: identifier(),
    toolCall: RepositoryCheckToolCallSchema,
    type: Type.Literal("repository_check.prepare"),
    workspace: RunWorkspaceSchema,
  },
  closed,
);
const ProviderModelEffectSchema = Type.Object(
  {
    effectId: identifier(),
    maxOutputTokens: Type.Integer({ maximum: 8_192, minimum: 1 }),
    model: Type.String({ maxLength: 256, minLength: 1 }),
    profileId: Type.String({ maxLength: 64, minLength: 1 }),
    runId: identifier(),
    step: Type.Integer({ maximum: 12, minimum: 1 }),
    type: Type.Literal("provider.model.step"),
  },
  closed,
);
const FakeVerificationEffectSchema = Type.Object(
  { effectId: identifier(), runId: identifier(), type: Type.Literal("fake.verification.run") },
  closed,
);
export const KernelEffectSchema = Type.Union([
  FakeModelEffectSchema,
  ProviderModelEffectSchema,
  RepositoryToolEffectSchema,
  RepositoryToolBatchEffectSchema,
  AnchorEditPrepareEffectSchema,
  WriteFilePrepareEffectSchema,
  RunCommandPrepareEffectSchema,
  RepositoryCheckPrepareEffectSchema,
  AnchorEditEffectSchema,
  WriteFileEffectSchema,
  RunCommandEffectSchema,
  RepositoryCheckEffectSchema,
  EdenPatchCaptureEffectSchema,
  GitSnapshotCaptureEffectSchema,
  GitCheckCaptureEffectSchema,
  FakeActionEffectSchema,
  FakeVerificationEffectSchema,
]);

export const KernelEventSchema = Type.Union([
  Type.Object(
    {
      item: Type.Refine(
        Type.Object(
          { content: Type.String({ maxLength: 32_768 }), contextItemId: identifier() },
          closed,
        ),
        (value) => new TextEncoder().encode(value.content).byteLength <= 32_768,
      ),
      type: Type.Literal("model.context.committed"),
    },
    closed,
  ),
  Type.Object(
    {
      actionId: identifier(),
      effectId: identifier(),
      patch: PatchObservationSchema,
      type: Type.Literal("review.eden_patch.captured"),
    },
    closed,
  ),
  Type.Object(
    {
      actionId: identifier(),
      effectId: identifier(),
      phase: Type.Union([Type.Literal("baseline"), Type.Literal("current")]),
      snapshot: GitReviewSnapshotSchema,
      type: Type.Literal("review.git_snapshot.captured"),
    },
    closed,
  ),
  Type.Object(
    {
      actionId: identifier(),
      check: ClosedCheckObservationSchema,
      effectId: identifier(),
      phase: Type.Union([Type.Literal("baseline"), Type.Literal("current")]),
      type: Type.Literal("review.git_check.completed"),
    },
    closed,
  ),
  Type.Object(
    {
      actionId: identifier(),
      effectId: identifier(),
      observedAt: Type.String({ format: "date-time" }),
      state: RepositoryCheckLifecycleStateSchema,
      type: Type.Literal("repository.check.lifecycle"),
    },
    closed,
  ),
  Type.Refine(
    Type.Object(
      {
        effectId: identifier(),
        receipt: RepositoryCheckReceiptV1Schema,
        result: RepositoryCheckResultV1Schema,
        type: Type.Literal("repository.check.completed"),
      },
      closed,
    ),
    (event) =>
      event.effectId === event.receipt.effectId &&
      event.effectId === event.result.effectId &&
      event.receipt.actionId === event.result.actionId &&
      event.receipt.receiptId === event.result.receiptId,
  ),
  Type.Object(
    {
      action: SafeActuationActionSchema,
      effectId: identifier(),
      type: Type.Literal("safe.action.proposed"),
    },
    closed,
  ),
  Type.Refine(
    Type.Object(
      {
        codingBudget: Type.Optional(
          Type.Object(
            {
              grant: UsableCodingRunGrantV1Schema,
              policy: UsableCodingBudgetPolicyV1Schema,
            },
            closed,
          ),
        ),
        correlationId: identifier(),
        runId: identifier(),
        task: boundedText(),
        type: Type.Literal("run.started"),
        workspace: RunWorkspaceSchema,
        model: Type.Optional(ModelRunConfigurationSchema),
      },
      closed,
    ),
    (event) =>
      event.codingBudget === undefined ||
      validateUsableCodingBudgetLedger(event.codingBudget.policy, event.codingBudget.grant, {
        actionProposals: 0,
        commandOutputBytes: 0,
        journalBytes: 0,
        journalRecords: 0,
        modelSteps: 0,
        modelVisibleToolContentBytes: 0,
        toolCalls: 0,
        version: 1,
        wallTimeMs: 0,
      }),
  ),
  Type.Object(
    {
      attemptId: identifier(),
      effectId: identifier(),
      reason: Type.Union([
        Type.Literal("initial"),
        Type.Literal("automatic-not-started-retry"),
        Type.Literal("explicit-retry"),
      ]),
      type: Type.Literal("model.attempt.started"),
    },
    closed,
  ),
  Type.Object(
    {
      effectId: identifier(),
      observation: ModelStepObservationSchema,
      type: Type.Literal("model.step.completed"),
    },
    closed,
  ),
  Type.Refine(
    Type.Object(
      {
        byteLength: Type.Integer({ maximum: 4_096, minimum: 1 }),
        commandId: identifier(),
        content: ActiveRunInputContentSchema,
        messageId: identifier(),
        mode: Type.Union([Type.Literal("steer"), Type.Literal("queue")]),
        modelStep: Type.Integer({ maximum: 12, minimum: 1 }),
        order: Type.Integer({ maximum: 7, minimum: 0 }),
        type: Type.Literal("conversation.input.accepted"),
      },
      closed,
    ),
    (event) => new TextEncoder().encode(event.content).byteLength === event.byteLength,
  ),
  Type.Object(
    {
      messageId: identifier(),
      turnId: identifier(),
      type: Type.Literal("conversation.input.delivered"),
    },
    closed,
  ),
  Type.Object({ type: Type.Literal("model.retry.requested") }, closed),
  Type.Object(
    {
      effectId: identifier(),
      toolCall: RepositoryToolCallSchema,
      type: Type.Literal("fake.model.tool-requested"),
    },
    closed,
  ),
  Type.Object(
    {
      effectId: identifier(),
      result: RepositoryToolResultSchema,
      type: Type.Literal("repository.tool.completed"),
    },
    closed,
  ),
  Type.Object(
    {
      effectId: identifier(),
      index: Type.Integer({ maximum: 3, minimum: 0 }),
      type: Type.Literal("repository.tool.batch.item.started"),
    },
    closed,
  ),
  Type.Object(
    {
      effectId: identifier(),
      index: Type.Integer({ maximum: 3, minimum: 0 }),
      result: RepositoryToolResultSchema,
      type: Type.Literal("repository.tool.batch.item.completed"),
    },
    closed,
  ),
  Type.Object(
    {
      effectId: identifier(),
      type: Type.Literal("repository.tool.batch.closed"),
    },
    closed,
  ),
  Type.Object(
    {
      action: ActionSchema,
      effectId: identifier(),
      type: Type.Literal("fake.model.completed"),
    },
    closed,
  ),
  Type.Object(
    {
      approvalId: identifier(),
      decision: Type.Union([Type.Literal("approve"), Type.Literal("deny")]),
      type: Type.Literal("approval.resolved"),
    },
    closed,
  ),
  Type.Object(
    {
      actionDigest: Type.String({ pattern: "^[a-f0-9]{64}$" }),
      approvalId: identifier(),
      expectedRevision: Type.Integer({ minimum: 0 }),
      proposalRevision: Type.Integer({ minimum: 0 }),
      type: Type.Literal("approval.consumed"),
    },
    closed,
  ),
  Type.Object({ effect: KernelEffectSchema, type: Type.Literal("effect.requested") }, closed),
  Type.Object({ effectId: identifier(), type: Type.Literal("effect.dispatch.started") }, closed),
  Type.Object(
    {
      effectId: identifier(),
      observation: Type.Object(
        {
          baseSha256: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }),
          byteLength: Type.Integer({ maximum: 1_048_576, minimum: 0 }),
          desiredSha256: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }),
          path: Type.String({ maxLength: 4_096, minLength: 1 }),
          state: Type.Literal("completed"),
        },
        closed,
      ),
      recovered: Type.Boolean(),
      type: Type.Literal("anchor_edit.completed"),
    },
    closed,
  ),
  Type.Object(
    {
      effectId: identifier(),
      observation: Type.Object(
        {
          byteLength: Type.Integer({ maximum: 32_768, minimum: 0 }),
          path: RepositoryPathSchema,
          sha256: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }),
          state: Type.Literal("completed"),
        },
        closed,
      ),
      recovered: Type.Boolean(),
      type: Type.Literal("write_file.completed"),
    },
    closed,
  ),
  Type.Refine(
    Type.Object(
      {
        byteLength: Type.Integer({ maximum: 8_192, minimum: 1 }),
        contentBase64: Type.String({
          maxLength: 10_924,
          pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
        }),
        effectId: identifier(),
        index: Type.Integer({ maximum: 7, minimum: 0 }),
        stream: Type.Union([Type.Literal("stderr"), Type.Literal("stdout")]),
        type: Type.Literal("run_command.output"),
      },
      closed,
    ),
    (event) => {
      const padding = event.contentBase64.endsWith("==")
        ? 2
        : event.contentBase64.endsWith("=")
          ? 1
          : 0;
      return (event.contentBase64.length / 4) * 3 - padding === event.byteLength;
    },
  ),
  Type.Object(
    {
      effectId: identifier(),
      observation: Type.Object(
        {
          cleanupStatus: Type.Union([
            Type.Literal("complete"),
            Type.Literal("failed"),
            Type.Literal("unknown"),
          ]),
          completedAt: Type.String({ format: "date-time" }),
          exitCode: Type.Union([Type.Integer({ maximum: 255, minimum: 0 }), Type.Null()]),
          outcome: Type.Union([
            Type.Literal("exited"),
            Type.Literal("timed_out"),
            Type.Literal("cancelled"),
            Type.Literal("output_overflow"),
            Type.Literal("cleanup_failed"),
            Type.Literal("spawn_failed"),
            Type.Literal("invalid_output"),
          ]),
          startedAt: Type.String({ format: "date-time" }),
          stderrBytes: Type.Integer({ maximum: 65_536, minimum: 0 }),
          stderrSha256: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }),
          stdoutBytes: Type.Integer({ maximum: 65_536, minimum: 0 }),
          stdoutSha256: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }),
        },
        closed,
      ),
      type: Type.Literal("run_command.completed"),
    },
    closed,
  ),
  Type.Object({ effectId: identifier(), type: Type.Literal("fake.action.completed") }, closed),
  Type.Object(
    {
      effectId: identifier(),
      evidenceRef: identifier(),
      passed: Type.Boolean(),
      type: Type.Literal("verification.completed"),
    },
    closed,
  ),
  Type.Object({ type: Type.Literal("run.cancelled") }, closed),
  Type.Object({ error: ProductErrorSchema, type: Type.Literal("run.blocked") }, closed),
]);

export type KernelEventDecodeResult =
  | { readonly ok: true; readonly value: KernelEvent }
  | { readonly ok: false; readonly code: "invalid_kernel_event" };

const eventValidator = Schema.Compile(KernelEventSchema);

export function decodeKernelEvent(value: unknown): KernelEventDecodeResult {
  return eventValidator.Check(value)
    ? { ok: true, value }
    : { code: "invalid_kernel_event", ok: false };
}

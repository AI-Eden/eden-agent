import {
  ActionEnvelopeV1Schema,
  ClosedCheckObservationSchema,
  PatchObservationSchema,
  PolicyDecisionSchema,
  RepositoryCheckActionEnvelopeV1Schema,
  RepositoryCheckLifecycleStateSchema,
  RepositoryCheckOutcomeSchema,
  RepositoryCheckReceiptV1Schema,
  RepositoryCheckResultV1Schema,
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
const ListFilesToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        continuation: Type.Union([RepositoryPathSchema, Type.Null()]),
        path: RepositoryPathSchema,
      },
      closed,
    ),
    name: Type.Literal("list_files"),
    toolCallId: identifier(),
  },
  closed,
);
const ReadFileToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        maxBytes: Type.Integer({ maximum: 24_576, minimum: 1 }),
        offset: Type.Integer({ minimum: 0 }),
        path: RepositoryPathSchema,
      },
      closed,
    ),
    name: Type.Literal("read_file"),
    toolCallId: identifier(),
  },
  closed,
);
const SearchPatternSchema = Type.Refine(
  Type.String({ maxLength: 1_024, minLength: 1 }),
  (value) => !value.includes("\0"),
);
const SearchRepositoryToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        continuation: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
        path: RepositoryPathSchema,
        pattern: SearchPatternSchema,
      },
      closed,
    ),
    name: Type.Literal("search_repository"),
    toolCallId: identifier(),
  },
  closed,
);
const GitStatusToolCallSchema = Type.Object(
  {
    arguments: Type.Object({}, closed),
    name: Type.Literal("git_status"),
    toolCallId: identifier(),
  },
  closed,
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
const RepositoryToolCallSchema = Type.Union([
  ListFilesToolCallSchema,
  ReadFileToolCallSchema,
  SearchRepositoryToolCallSchema,
  GitStatusToolCallSchema,
  AnchorEditToolCallSchema,
  RepositoryCheckToolCallSchema,
]);
const ListFilesEntrySchema = Type.Union([
  Type.Object(
    { kind: Type.Literal("directory"), path: RepositoryPathSchema, size: Type.Null() },
    closed,
  ),
  Type.Object(
    {
      kind: Type.Literal("file"),
      path: RepositoryPathSchema,
      size: Type.Integer({ minimum: 0 }),
    },
    closed,
  ),
]);
const contentHash = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
const ListFilesToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash,
          continuation: Type.Union([RepositoryPathSchema, Type.Null()]),
          entries: Type.Array(ListFilesEntrySchema, { maxItems: 256 }),
          sourcePath: RepositoryPathSchema,
          truncated: Type.Boolean(),
          visited: Type.Integer({ maximum: 4_096, minimum: 0 }),
        },
        closed,
      ),
      name: Type.Literal("list_files"),
      status: Type.Literal("succeeded"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (value) =>
    value.data.truncated === (value.data.continuation !== null) &&
    new TextEncoder().encode(JSON.stringify(value.data.entries)).byteLength <= 24_576,
);
const ReadFileToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          bytesRead: Type.Integer({ maximum: 24_576, minimum: 0 }),
          content: Type.String({ maxLength: 24_576 }),
          contentHash,
          nextOffset: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
          offset: Type.Integer({ minimum: 0 }),
          sourcePath: RepositoryPathSchema,
          totalBytes: Type.Integer({ minimum: 0 }),
        },
        closed,
      ),
      name: Type.Literal("read_file"),
      status: Type.Literal("succeeded"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (value) =>
    new TextEncoder().encode(value.data.content).byteLength === value.data.bytesRead &&
    value.data.offset + value.data.bytesRead <= value.data.totalBytes &&
    (value.data.nextOffset === null
      ? value.data.offset + value.data.bytesRead === value.data.totalBytes
      : value.data.nextOffset === value.data.offset + value.data.bytesRead &&
        value.data.nextOffset < value.data.totalBytes),
);
const SearchMatchSchema = Type.Object(
  {
    byteColumn: Type.Integer({ minimum: 1 }),
    lineNumber: Type.Integer({ minimum: 1 }),
    path: RepositoryPathSchema,
    preview: Type.String({ maxLength: 4_096 }),
  },
  closed,
);
const SearchRepositoryToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash,
          continuation: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
          engine: Type.Object(
            {
              contentHash,
              name: Type.Literal("ripgrep"),
              version: Type.String({ maxLength: 64, minLength: 1 }),
            },
            closed,
          ),
          matches: Type.Array(SearchMatchSchema, { maxItems: 256 }),
          sourcePath: RepositoryPathSchema,
          truncated: Type.Boolean(),
        },
        closed,
      ),
      name: Type.Literal("search_repository"),
      status: Type.Literal("succeeded"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (value) =>
    value.data.truncated === (value.data.continuation !== null) &&
    new TextEncoder().encode(JSON.stringify(value.data.matches)).byteLength <= 24_576,
);
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
const GitStatusToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash,
          entries: Type.Array(GitStatusEntrySchema, { maxItems: 256 }),
          gitVersion: Type.String({ maxLength: 64, minLength: 1 }),
          sourcePath: Type.Literal("."),
        },
        closed,
      ),
      name: Type.Literal("git_status"),
      status: Type.Literal("succeeded"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (value) => new TextEncoder().encode(JSON.stringify(value.data.entries)).byteLength <= 24_576,
);
const RepositoryToolFailureSchema = Type.Object(
  {
    error: ProductErrorSchema,
    name: Type.Union([
      Type.Literal("list_files"),
      Type.Literal("read_file"),
      Type.Literal("search_repository"),
      Type.Literal("git_status"),
      Type.Literal("anchor_edit"),
      Type.Literal("repository_check"),
    ]),
    status: Type.Literal("failed"),
    toolCallId: identifier(),
  },
  closed,
);
const AnchorEditDeniedResultSchema = Type.Object(
  {
    data: Type.Object({ parentActionId: identifier(), reason: boundedText() }, closed),
    name: Type.Literal("anchor_edit"),
    status: Type.Literal("denied"),
    toolCallId: identifier(),
  },
  closed,
);
const RepositoryCheckCompletedResultSchema = Type.Object(
  {
    data: Type.Object(
      {
        actionId: identifier(),
        checkName: Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }),
        cleanupStatus: Type.Union([
          Type.Literal("complete"),
          Type.Literal("failed"),
          Type.Literal("unknown"),
        ]),
        exitCode: Type.Union([Type.Integer({ maximum: 255, minimum: 0 }), Type.Null()]),
        imageIndexDigest: contentHash,
        inputManifestDigest: contentHash,
        outcome: RepositoryCheckOutcomeSchema,
        platformManifestDigest: contentHash,
        profileRevision: Type.Literal("r2-docker-profile-v1"),
        stderrSha256: contentHash,
        stdoutSha256: contentHash,
      },
      closed,
    ),
    name: Type.Literal("repository_check"),
    status: Type.Literal("completed"),
    toolCallId: identifier(),
  },
  closed,
);
const RepositoryCheckDeniedResultSchema = Type.Object(
  {
    data: Type.Object(
      {
        checkName: Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }),
        reason: boundedText(),
      },
      closed,
    ),
    name: Type.Literal("repository_check"),
    status: Type.Literal("denied"),
    toolCallId: identifier(),
  },
  closed,
);
const RepositoryToolResultSchema = Type.Union([
  ListFilesToolSuccessSchema,
  ReadFileToolSuccessSchema,
  SearchRepositoryToolSuccessSchema,
  GitStatusToolSuccessSchema,
  AnchorEditDeniedResultSchema,
  RepositoryCheckCompletedResultSchema,
  RepositoryCheckDeniedResultSchema,
  RepositoryToolFailureSchema,
]);

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
      toolCalls: Type.Array(RepositoryToolCallSchema, { maxItems: 1 }),
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
      (value.finishStatus === "tool_calls" && value.toolCalls.length === 1)),
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
const AnchorEditEffectSchema = Type.Object(
  {
    effectId: identifier(),
    envelope: ActionEnvelopeV1Schema,
    runId: identifier(),
    type: Type.Literal("anchor_edit.execute"),
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
    step: Type.Integer({ maximum: 4, minimum: 1 }),
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
  AnchorEditPrepareEffectSchema,
  RepositoryCheckPrepareEffectSchema,
  AnchorEditEffectSchema,
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
  Type.Object(
    {
      correlationId: identifier(),
      runId: identifier(),
      task: boundedText(),
      type: Type.Literal("run.started"),
      workspace: RunWorkspaceSchema,
      model: Type.Optional(ModelRunConfigurationSchema),
    },
    closed,
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

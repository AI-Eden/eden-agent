import Type from "typebox";
import Schema from "typebox/schema";

import type {
  DeleteProviderProfileCommand,
  ProviderProfileCatalog,
  ProviderReadiness,
  ProviderReadinessCommand,
  SaveProviderProfileCommand,
  SelectProviderProfileCommand,
} from "./provider-profiles.ts";
import { ProviderProfileSummarySchema } from "./provider-profiles.ts";

export const productProtocolVersion = 1 as const;
export const ProductProtocolVersionSchema = Type.Literal(productProtocolVersion);
export type ProductProtocolVersion = Type.Static<typeof ProductProtocolVersionSchema>;

const identifierOptions = { maxLength: 256, minLength: 1 } as const;
export const CommandIdSchema = Type.String(identifierOptions);
export const EventIdSchema = Type.String(identifierOptions);
export const RunIdSchema = Type.String({
  maxLength: 128,
  minLength: 5,
  pattern: "^run-[a-z0-9][a-z0-9-]{0,123}$",
});
export const ActionIdSchema = Type.String(identifierOptions);
export const ApprovalIdSchema = Type.String(identifierOptions);
export const CheckIdSchema = Type.String(identifierOptions);
export const EvidenceIdSchema = Type.String(identifierOptions);
const safeInteger = { maximum: Number.MAX_SAFE_INTEGER, minimum: 0 } as const;
export const RevisionSchema = Type.Integer(safeInteger);
export const EventCursorSchema = Type.Integer(safeInteger);

export type CommandId = Type.Static<typeof CommandIdSchema>;
export type EventId = Type.Static<typeof EventIdSchema>;
export type RunId = Type.Static<typeof RunIdSchema>;
export type ActionId = Type.Static<typeof ActionIdSchema>;
export type ApprovalId = Type.Static<typeof ApprovalIdSchema>;
export type CheckId = Type.Static<typeof CheckIdSchema>;
export type EvidenceId = Type.Static<typeof EvidenceIdSchema>;
export type Revision = Type.Static<typeof RevisionSchema>;
export type EventCursor = Type.Static<typeof EventCursorSchema>;

const boundedText = () => Type.String({ maxLength: 4_096, minLength: 1 });
const shortText = () => Type.String({ maxLength: 512, minLength: 1 });
const closed = { additionalProperties: false } as const;

export const ProductErrorSchema = Type.Object(
  {
    code: Type.String({ maxLength: 128, minLength: 1, pattern: "^[a-z][a-z0-9_]*$" }),
    message: boundedText(),
    recoverability: Type.Union([
      Type.Literal("retry"),
      Type.Literal("reconfigure"),
      Type.Literal("ask-user"),
      Type.Literal("fatal"),
    ]),
    suggestedActions: Type.Array(shortText(), { maxItems: 8 }),
  },
  closed,
);
export type ProductError = Type.Static<typeof ProductErrorSchema>;

export const DecodeFailureSchema = Type.Object(
  { ok: Type.Literal(false), error: ProductErrorSchema },
  closed,
);
export type DecodeFailure = Type.Static<typeof DecodeFailureSchema>;
export type DecodeResult<T> = { readonly ok: true; readonly value: T } | DecodeFailure;

const commandEnvelope = {
  protocolVersion: ProductProtocolVersionSchema,
  commandId: CommandIdSchema,
} as const;
const runCommandEnvelope = {
  ...commandEnvelope,
  runId: RunIdSchema,
  expectedRevision: RevisionSchema,
} as const;

export const StartRunCommandSchema = Type.Object(
  { ...commandEnvelope, type: Type.Literal("run.start"), task: boundedText() },
  closed,
);
export const PauseRunCommandSchema = Type.Object(
  { ...runCommandEnvelope, type: Type.Literal("run.pause") },
  closed,
);
export const ResumeRunCommandSchema = Type.Object(
  { ...runCommandEnvelope, type: Type.Literal("run.resume") },
  closed,
);
export const CancelRunCommandSchema = Type.Object(
  { ...runCommandEnvelope, type: Type.Literal("run.cancel") },
  closed,
);
export const ResolveApprovalCommandSchema = Type.Object(
  {
    ...runCommandEnvelope,
    type: Type.Literal("approval.resolve"),
    approvalId: ApprovalIdSchema,
    decision: Type.Union([Type.Literal("approve"), Type.Literal("deny")]),
  },
  closed,
);
export const ResolveWorkspaceTrustCommandSchema = Type.Object(
  {
    ...commandEnvelope,
    type: Type.Literal("workspace.trust.resolve"),
    workspaceId: Type.String(identifierOptions),
    expectedRevision: RevisionSchema,
    decision: Type.Union([Type.Literal("trust"), Type.Literal("restrict")]),
  },
  closed,
);
export type ResolveWorkspaceTrustCommand = Type.Static<typeof ResolveWorkspaceTrustCommandSchema>;
export const ProductCommandSchema = Type.Union([
  StartRunCommandSchema,
  PauseRunCommandSchema,
  ResumeRunCommandSchema,
  CancelRunCommandSchema,
  ResolveApprovalCommandSchema,
]);
export type ProductCommand = Type.Static<typeof ProductCommandSchema>;

export const ProductPhaseSchema = Type.Union([
  Type.Literal("awaiting-approval"),
  Type.Literal("executing"),
  Type.Literal("review"),
]);
export type ProductPhase = Type.Static<typeof ProductPhaseSchema>;

export const ProgressSchema = Type.Refine(
  Type.Object(
    {
      completed: Type.Integer({ minimum: 0 }),
      total: Type.Integer({ minimum: 1 }),
      summary: shortText(),
    },
    closed,
  ),
  (progress) => progress.completed <= progress.total,
);
export type Progress = Type.Static<typeof ProgressSchema>;

export const ActionSummarySchema = Type.Object(
  {
    actionId: ActionIdSchema,
    display: boundedText(),
    cwd: boundedText(),
    reason: boundedText(),
    scope: boundedText(),
  },
  closed,
);
export type ActionSummary = Type.Static<typeof ActionSummarySchema>;

export const ApprovalPresentationSchema = Type.Object(
  {
    approvalId: ApprovalIdSchema,
    actionId: ActionIdSchema,
    canonicalDisplay: boundedText(),
    cwd: boundedText(),
    reason: boundedText(),
    scope: boundedText(),
    digest: Type.String({ maxLength: 512, minLength: 1 }),
  },
  closed,
);
export type ApprovalPresentation = Type.Static<typeof ApprovalPresentationSchema>;

export const CheckResultSchema = Type.Object(
  {
    checkId: CheckIdSchema,
    name: shortText(),
    requirement: Type.Union([Type.Literal("required"), Type.Literal("optional")]),
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("passed"),
      Type.Literal("failed"),
      Type.Literal("skipped"),
      Type.Literal("infrastructure-failed"),
    ]),
    summary: shortText(),
    evidenceRef: Type.Optional(EvidenceIdSchema),
  },
  closed,
);
export type CheckResult = Type.Static<typeof CheckResultSchema>;

export const TerminalOutcomeSchema = Type.Union([
  Type.Object(
    {
      state: Type.Literal("succeeded"),
      evidenceRef: EvidenceIdSchema,
    },
    closed,
  ),
  Type.Object(
    {
      state: Type.Union([Type.Literal("failed"), Type.Literal("blocked")]),
      error: ProductErrorSchema,
    },
    closed,
  ),
  Type.Object({ state: Type.Literal("cancelled") }, closed),
]);
export type TerminalOutcome = Type.Static<typeof TerminalOutcomeSchema>;
export type TerminalState = TerminalOutcome["state"];

export const WorkspaceSummarySchema = Type.Object(
  {
    workspaceId: Type.String(identifierOptions),
    name: shortText(),
    root: boundedText(),
    trust: Type.Union([Type.Literal("trusted"), Type.Literal("restricted")]),
  },
  closed,
);
export type WorkspaceSummary = Type.Static<typeof WorkspaceSummarySchema>;

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
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export const RepositoryPathSchema = Type.Refine(
  Type.String({ maxLength: 4_096, minLength: 1 }),
  isPortableRepositoryPath,
);
export type RepositoryPath = Type.Static<typeof RepositoryPathSchema>;

export const ListFilesToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        continuation: Type.Union([RepositoryPathSchema, Type.Null()]),
        path: RepositoryPathSchema,
      },
      closed,
    ),
    name: Type.Literal("list_files"),
    toolCallId: Type.String(identifierOptions),
  },
  closed,
);
export const ReadFileToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        maxBytes: Type.Integer({ maximum: 24_576, minimum: 1 }),
        offset: Type.Integer(safeInteger),
        path: RepositoryPathSchema,
      },
      closed,
    ),
    name: Type.Literal("read_file"),
    toolCallId: Type.String(identifierOptions),
  },
  closed,
);
const SearchPatternSchema = Type.Refine(
  Type.String({ maxLength: 1_024, minLength: 1 }),
  (value) => !value.includes("\0"),
);
export const SearchRepositoryToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        continuation: Type.Union([Type.Integer(safeInteger), Type.Null()]),
        path: RepositoryPathSchema,
        pattern: SearchPatternSchema,
      },
      closed,
    ),
    name: Type.Literal("search_repository"),
    toolCallId: Type.String(identifierOptions),
  },
  closed,
);
export const GitStatusToolCallSchema = Type.Object(
  {
    arguments: Type.Object({}, closed),
    name: Type.Literal("git_status"),
    toolCallId: Type.String(identifierOptions),
  },
  closed,
);
export const RepositoryToolCallSchema = Type.Union([
  ListFilesToolCallSchema,
  ReadFileToolCallSchema,
  SearchRepositoryToolCallSchema,
  GitStatusToolCallSchema,
]);
export type RepositoryToolCall = Type.Static<typeof RepositoryToolCallSchema>;

export const ListFilesEntrySchema = Type.Union([
  Type.Object(
    { kind: Type.Literal("directory"), path: RepositoryPathSchema, size: Type.Null() },
    closed,
  ),
  Type.Object(
    { kind: Type.Literal("file"), path: RepositoryPathSchema, size: Type.Integer(safeInteger) },
    closed,
  ),
]);
export type ListFilesEntry = Type.Static<typeof ListFilesEntrySchema>;

const contentHashSchema = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
export const ListFilesToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash: contentHashSchema,
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
      toolCallId: Type.String(identifierOptions),
    },
    closed,
  ),
  (value) =>
    value.data.truncated === (value.data.continuation !== null) &&
    new TextEncoder().encode(JSON.stringify(value.data.entries)).byteLength <= 24_576,
);
export const ReadFileToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          bytesRead: Type.Integer({ maximum: 24_576, minimum: 0 }),
          content: Type.String({ maxLength: 24_576 }),
          contentHash: contentHashSchema,
          nextOffset: Type.Union([Type.Integer(safeInteger), Type.Null()]),
          offset: Type.Integer(safeInteger),
          sourcePath: RepositoryPathSchema,
          totalBytes: Type.Integer(safeInteger),
        },
        closed,
      ),
      name: Type.Literal("read_file"),
      status: Type.Literal("succeeded"),
      toolCallId: Type.String(identifierOptions),
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
export const SearchMatchSchema = Type.Object(
  {
    byteColumn: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    lineNumber: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    path: RepositoryPathSchema,
    preview: Type.String({ maxLength: 4_096 }),
  },
  closed,
);
export type SearchMatch = Type.Static<typeof SearchMatchSchema>;
export const SearchRepositoryToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash: contentHashSchema,
          continuation: Type.Union([Type.Integer(safeInteger), Type.Null()]),
          engine: Type.Object(
            {
              contentHash: contentHashSchema,
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
      toolCallId: Type.String(identifierOptions),
    },
    closed,
  ),
  (value) =>
    value.data.truncated === (value.data.continuation !== null) &&
    new TextEncoder().encode(JSON.stringify(value.data.matches)).byteLength <= 24_576,
);
const GitStatusCodeSchema = Type.String({ maxLength: 1, minLength: 1, pattern: "^[.MADRCUT?!]$" });
export const GitStatusEntrySchema = Type.Refine(
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
export type GitStatusEntry = Type.Static<typeof GitStatusEntrySchema>;
export const GitStatusToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash: contentHashSchema,
          entries: Type.Array(GitStatusEntrySchema, { maxItems: 256 }),
          gitVersion: Type.String({ maxLength: 64, minLength: 1 }),
          sourcePath: Type.Literal("."),
        },
        closed,
      ),
      name: Type.Literal("git_status"),
      status: Type.Literal("succeeded"),
      toolCallId: Type.String(identifierOptions),
    },
    closed,
  ),
  (value) => new TextEncoder().encode(JSON.stringify(value.data.entries)).byteLength <= 24_576,
);
export const RepositoryToolFailureSchema = Type.Object(
  {
    error: ProductErrorSchema,
    name: Type.Union([
      Type.Literal("list_files"),
      Type.Literal("read_file"),
      Type.Literal("search_repository"),
      Type.Literal("git_status"),
    ]),
    status: Type.Literal("failed"),
    toolCallId: Type.String(identifierOptions),
  },
  closed,
);
export const RepositoryToolResultSchema = Type.Union([
  ListFilesToolSuccessSchema,
  ReadFileToolSuccessSchema,
  SearchRepositoryToolSuccessSchema,
  GitStatusToolSuccessSchema,
  RepositoryToolFailureSchema,
]);
export type RepositoryToolResult = Type.Static<typeof RepositoryToolResultSchema>;

export const ToolActivitySchema = Type.Refine(
  Type.Object(
    {
      call: RepositoryToolCallSchema,
      result: Type.Union([RepositoryToolResultSchema, Type.Null()]),
      state: Type.Union([Type.Literal("requested"), Type.Literal("completed")]),
    },
    closed,
  ),
  (value) =>
    (value.state === "requested" && value.result === null) ||
    (value.state === "completed" &&
      value.result !== null &&
      value.call.toolCallId === value.result.toolCallId &&
      value.call.name === value.result.name),
);
export type ToolActivity = Type.Static<typeof ToolActivitySchema>;

export const ContextPrioritySchema = Type.Union([
  Type.Literal("P0"),
  Type.Literal("P1"),
  Type.Literal("P2"),
]);
export type ContextPriority = Type.Static<typeof ContextPrioritySchema>;

export const InstructionSnapshotSummarySchema = Type.Object(
  {
    activatedContextItemIds: Type.Array(Type.String(identifierOptions), {
      maxItems: 256,
      minItems: 1,
    }),
    contentHash: Type.String({ pattern: "^sha256:[a-f0-9]{64}$" }),
    precedence: Type.Integer({ maximum: 256, minimum: 0 }),
    scopePath: Type.String({ maxLength: 4_096, minLength: 1 }),
    selectionReason: Type.Union([Type.Literal("trusted_root"), Type.Literal("path_scope")]),
    sourcePath: Type.String({ maxLength: 4_096, minLength: 1 }),
  },
  closed,
);
export type InstructionSnapshotSummary = Type.Static<typeof InstructionSnapshotSummarySchema>;

export const ContextSelectionItemSchema = Type.Refine(
  Type.Object(
    {
      contextItemId: Type.String(identifierOptions),
      estimatedTokens: Type.Integer(safeInteger),
      priority: ContextPrioritySchema,
      reason: Type.Union([
        Type.Literal("required"),
        Type.Literal("required_overflow"),
        Type.Literal("recent_context"),
        Type.Literal("supporting_evidence"),
        Type.Literal("budget_omitted"),
      ]),
      selected: Type.Boolean(),
      selection: Type.Union([Type.Literal("complete"), Type.Literal("omitted")]),
      source: shortText(),
      scopePath: Type.String({ maxLength: 4_096, minLength: 1 }),
    },
    closed,
  ),
  (value) =>
    value.selected === (value.selection === "complete") &&
    (value.selected
      ? (value.priority === "P0" && value.reason === "required") ||
        (value.priority === "P1" && value.reason === "recent_context") ||
        (value.priority === "P2" && value.reason === "supporting_evidence")
      : value.reason === "budget_omitted" ||
        (value.priority === "P0" && value.reason === "required_overflow")),
);
export type ContextSelectionItem = Type.Static<typeof ContextSelectionItemSchema>;

export const ContextBudgetSummarySchema = Type.Refine(
  Type.Object(
    {
      contextWindowTokens: Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 1 }),
      outputReserveTokens: Type.Integer(safeInteger),
      safetyReserveTokens: Type.Integer(safeInteger),
      selectedInputTokens: Type.Integer(safeInteger),
      usableInputTokens: Type.Integer(safeInteger),
    },
    closed,
  ),
  (value) =>
    value.outputReserveTokens + value.safetyReserveTokens + value.usableInputTokens ===
      value.contextWindowTokens && value.selectedInputTokens <= value.usableInputTokens,
);
export type ContextBudgetSummary = Type.Static<typeof ContextBudgetSummarySchema>;

const contextSummaryFields = {
  instructions: Type.Array(InstructionSnapshotSummarySchema, { maxItems: 256 }),
  items: Type.Array(ContextSelectionItemSchema, { maxItems: 1_024 }),
} as const;

export const ContextAdmissionSummarySchema = Type.Union([
  Type.Refine(
    Type.Object(
      {
        blocker: Type.Null(),
        budget: Type.Null(),
        ...contextSummaryFields,
        state: Type.Literal("restricted"),
      },
      closed,
    ),
    (value) => value.instructions.length === 0 && value.items.length === 0,
  ),
  Type.Refine(
    Type.Object(
      {
        blocker: ProductErrorSchema,
        budget: Type.Null(),
        ...contextSummaryFields,
        state: Type.Literal("unconfigured"),
      },
      closed,
    ),
    (value) => value.instructions.length === 0 && value.items.length === 0,
  ),
  Type.Object(
    {
      blocker: Type.Null(),
      budget: ContextBudgetSummarySchema,
      ...contextSummaryFields,
      state: Type.Literal("ready"),
    },
    closed,
  ),
  Type.Object(
    {
      blocker: ProductErrorSchema,
      budget: Type.Union([ContextBudgetSummarySchema, Type.Null()]),
      ...contextSummaryFields,
      state: Type.Literal("blocked"),
    },
    closed,
  ),
]);
export type ContextAdmissionSummary = Type.Static<typeof ContextAdmissionSummarySchema>;

const RipgrepCapabilitySchema = Type.Union([
  Type.Object(
    {
      contentHash: contentHashSchema,
      error: Type.Null(),
      minimumVersion: Type.Literal("15.0.0"),
      name: Type.Literal("ripgrep"),
      state: Type.Literal("ready"),
      version: Type.Literal("15.0.0"),
    },
    closed,
  ),
  Type.Object(
    {
      contentHash: Type.Union([contentHashSchema, Type.Null()]),
      error: ProductErrorSchema,
      minimumVersion: Type.Literal("15.0.0"),
      name: Type.Literal("ripgrep"),
      state: Type.Literal("blocked"),
      version: Type.Union([Type.String({ maxLength: 64, minLength: 1 }), Type.Null()]),
    },
    closed,
  ),
]);
const GitCapabilitySchema = Type.Union([
  Type.Object(
    {
      contentHash: Type.Null(),
      error: Type.Null(),
      minimumVersion: Type.Literal("2.31.0"),
      name: Type.Literal("git"),
      state: Type.Literal("ready"),
      version: Type.String({ maxLength: 64, minLength: 1 }),
    },
    closed,
  ),
  Type.Object(
    {
      contentHash: Type.Null(),
      error: ProductErrorSchema,
      minimumVersion: Type.Literal("2.31.0"),
      name: Type.Literal("git"),
      state: Type.Literal("blocked"),
      version: Type.Union([Type.String({ maxLength: 64, minLength: 1 }), Type.Null()]),
    },
    closed,
  ),
]);
export const RepositoryCapabilityReviewSchema = Type.Refine(
  Type.Object(
    {
      git: GitCapabilitySchema,
      ripgrep: RipgrepCapabilitySchema,
      state: Type.Union([Type.Literal("ready"), Type.Literal("blocked")]),
    },
    closed,
  ),
  (value) =>
    (value.state === "ready" && value.git.state === "ready" && value.ripgrep.state === "ready") ||
    (value.state === "blocked" &&
      (value.git.state === "blocked" || value.ripgrep.state === "blocked")),
);
export type RepositoryCapabilityReview = Type.Static<typeof RepositoryCapabilityReviewSchema>;

export const WorkspaceReviewSchema = Type.Object(
  {
    protocolVersion: ProductProtocolVersionSchema,
    revision: RevisionSchema,
    workspace: WorkspaceSummarySchema,
    profile: Type.Union([
      Type.Object(
        {
          provider: Type.Literal("deterministic-fake"),
          credentials: Type.Literal("not-required"),
        },
        closed,
      ),
      Type.Refine(
        Type.Object(
          {
            active: Type.Union([ProviderProfileSummarySchema, Type.Null()]),
            state: Type.Union([Type.Literal("unconfigured"), Type.Literal("configured")]),
          },
          closed,
        ),
        (value) =>
          (value.state === "unconfigured" && value.active === null) ||
          (value.state === "configured" &&
            value.active !== null &&
            value.active.credential.presence === "present"),
      ),
    ]),
    authority: Type.Object(
      {
        taskStart: Type.Union([Type.Literal("blocked"), Type.Literal("allowed")]),
        repositoryRead: Type.Literal("disabled"),
        repositoryWrite: Type.Literal("denied"),
        processExecution: Type.Literal("fake-only"),
        network: Type.Literal("denied"),
        sandbox: Type.Literal("not-configured"),
      },
      closed,
    ),
    notice: Type.Union([ProductErrorSchema, Type.Null()]),
    nextActions: Type.Array(shortText(), { maxItems: 16 }),
    context: ContextAdmissionSummarySchema,
    repository: Type.Optional(RepositoryCapabilityReviewSchema),
  },
  closed,
);
export type WorkspaceReview = Type.Static<typeof WorkspaceReviewSchema>;
export const ChangedFileSchema = Type.Object(
  {
    path: shortText(),
    status: Type.Union([
      Type.Literal("added"),
      Type.Literal("modified"),
      Type.Literal("deleted"),
      Type.Literal("renamed"),
    ]),
  },
  closed,
);
export const BudgetSummarySchema = Type.Object(
  {
    used: Type.Number({ minimum: 0 }),
    total: Type.Number({ exclusiveMinimum: 0 }),
    unit: Type.Union([Type.Literal("tokens"), Type.Literal("actions"), Type.Literal("minutes")]),
  },
  closed,
);
export const ViewApprovalSchema = Type.Object(
  {
    ...ApprovalPresentationSchema.properties,
    recoveryAction: shortText(),
  },
  closed,
);

export const ProductViewSchema = Type.Object(
  {
    protocolVersion: ProductProtocolVersionSchema,
    viewId: Type.String(identifierOptions),
    runId: RunIdSchema,
    revision: RevisionSchema,
    workspace: WorkspaceSummarySchema,
    phase: ProductPhaseSchema,
    progress: Type.Union([ProgressSchema, Type.Null()]),
    currentAction: Type.Union([ActionSummarySchema, Type.Null()]),
    approval: Type.Union([ViewApprovalSchema, Type.Null()]),
    changedFiles: Type.Array(ChangedFileSchema, { maxItems: 256 }),
    checks: Type.Array(CheckResultSchema, { maxItems: 128 }),
    budget: BudgetSummarySchema,
    nextActions: Type.Array(shortText(), { maxItems: 16 }),
    residualRisk: Type.Union([boundedText(), Type.Null()]),
    terminalOutcome: Type.Union([TerminalOutcomeSchema, Type.Null()]),
    context: Type.Optional(ContextAdmissionSummarySchema),
    tools: Type.Optional(Type.Array(ToolActivitySchema, { maxItems: 4 })),
  },
  closed,
);
export type ProductView = Type.Static<typeof ProductViewSchema>;

export const AvailableRunSummarySchema = Type.Refine(
  Type.Object(
    {
      availability: Type.Literal("available"),
      phase: ProductPhaseSchema,
      revision: RevisionSchema,
      runId: RunIdSchema,
      startedAt: Type.String({ format: "date-time" }),
      task: boundedText(),
      terminalOutcome: Type.Union([TerminalOutcomeSchema, Type.Null()]),
      updatedAt: Type.String({ format: "date-time" }),
    },
    closed,
  ),
  (summary) => Date.parse(summary.startedAt) <= Date.parse(summary.updatedAt),
);
export type AvailableRunSummary = Type.Static<typeof AvailableRunSummarySchema>;

export const UnavailableRunSummarySchema = Type.Object(
  {
    availability: Type.Literal("unavailable"),
    error: ProductErrorSchema,
    runId: RunIdSchema,
  },
  closed,
);
export type UnavailableRunSummary = Type.Static<typeof UnavailableRunSummarySchema>;

export const RunSummarySchema = Type.Union([
  AvailableRunSummarySchema,
  UnavailableRunSummarySchema,
]);
export type RunSummary = Type.Static<typeof RunSummarySchema>;

function runSummariesOrdered(entries: readonly RunSummary[]): boolean {
  let unavailableSeen = false;
  for (const [index, entry] of entries.entries()) {
    const previous = entries[index - 1];
    if (entry.availability === "unavailable") {
      unavailableSeen = true;
      if (previous?.availability === "unavailable" && previous.runId > entry.runId) {
        return false;
      }
      continue;
    }
    if (unavailableSeen) return false;
    if (previous?.availability === "available") {
      const timeOrder = Date.parse(previous.updatedAt) - Date.parse(entry.updatedAt);
      if (timeOrder < 0 || (timeOrder === 0 && previous.runId > entry.runId)) {
        return false;
      }
    }
  }
  return true;
}

export const RunCatalogSchema = Type.Refine(
  Type.Object(
    {
      entries: Type.Array(RunSummarySchema, { maxItems: 100 }),
      notices: Type.Array(ProductErrorSchema, { maxItems: 16 }),
      protocolVersion: ProductProtocolVersionSchema,
      truncated: Type.Boolean(),
      workspace: WorkspaceSummarySchema,
    },
    closed,
  ),
  (catalog) => runSummariesOrdered(catalog.entries),
);
export type RunCatalog = Type.Static<typeof RunCatalogSchema>;

function productErrorsEqual(left: ProductError, right: ProductError): boolean {
  return (
    left.code === right.code &&
    left.message === right.message &&
    left.recoverability === right.recoverability &&
    left.suggestedActions.length === right.suggestedActions.length &&
    left.suggestedActions.every((action, index) => action === right.suggestedActions[index])
  );
}

function terminalOutcomesEqual(
  left: TerminalOutcome | null,
  right: TerminalOutcome | null,
): boolean {
  if (left === null || right === null) return left === right;
  if (left.state !== right.state) return false;
  if (left.state === "succeeded" && right.state === "succeeded") {
    return left.evidenceRef === right.evidenceRef;
  }
  if (
    (left.state === "blocked" || left.state === "failed") &&
    (right.state === "blocked" || right.state === "failed")
  ) {
    return productErrorsEqual(left.error, right.error);
  }
  return left.state === "cancelled" && right.state === "cancelled";
}

export const RunInspectionSchema = Type.Refine(
  Type.Object(
    {
      mode: Type.Literal("read-only"),
      protocolVersion: ProductProtocolVersionSchema,
      summary: AvailableRunSummarySchema,
      view: ProductViewSchema,
    },
    closed,
  ),
  (inspection) =>
    inspection.summary.runId === inspection.view.runId &&
    inspection.summary.revision === inspection.view.revision &&
    inspection.summary.phase === inspection.view.phase &&
    terminalOutcomesEqual(inspection.summary.terminalOutcome, inspection.view.terminalOutcome),
);
export type RunInspection = Type.Static<typeof RunInspectionSchema>;

const eventEnvelope = {
  protocolVersion: ProductProtocolVersionSchema,
  eventId: EventIdSchema,
  runId: RunIdSchema,
  cursor: EventCursorSchema,
  revision: RevisionSchema,
} as const;

export const SessionSnapshotEventSchema = Type.Object(
  {
    ...eventEnvelope,
    type: Type.Literal("session.snapshot"),
    view: ProductViewSchema,
  },
  closed,
);
export const PhaseProgressEventSchema = Type.Object(
  {
    ...eventEnvelope,
    type: Type.Literal("phase.progress"),
    phase: ProductPhaseSchema,
    progress: ProgressSchema,
    currentAction: Type.Union([ActionSummarySchema, Type.Null()]),
  },
  closed,
);
export const ApprovalPresentedEventSchema = Type.Object(
  {
    ...eventEnvelope,
    type: Type.Literal("approval.presented"),
    approval: ApprovalPresentationSchema,
  },
  closed,
);
export const VerificationUpdatedEventSchema = Type.Object(
  {
    ...eventEnvelope,
    type: Type.Literal("verification.updated"),
    check: CheckResultSchema,
  },
  closed,
);
export const RunTerminalEventSchema = Type.Object(
  {
    ...eventEnvelope,
    type: Type.Literal("run.terminal"),
    outcome: TerminalOutcomeSchema,
  },
  closed,
);
export const ToolUpdatedEventSchema = Type.Object(
  {
    ...eventEnvelope,
    activity: ToolActivitySchema,
    type: Type.Literal("tool.updated"),
  },
  closed,
);
export const ProductEventSchema = Type.Union([
  SessionSnapshotEventSchema,
  PhaseProgressEventSchema,
  ApprovalPresentedEventSchema,
  VerificationUpdatedEventSchema,
  ToolUpdatedEventSchema,
  RunTerminalEventSchema,
]);
export type ProductEvent = Type.Static<typeof ProductEventSchema>;

export const ProductCommandDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: ProductCommandSchema }, closed),
  DecodeFailureSchema,
]);
export const ProductEventDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: ProductEventSchema }, closed),
  DecodeFailureSchema,
]);
export const ProductViewDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: ProductViewSchema }, closed),
  DecodeFailureSchema,
]);
export const ResolveWorkspaceTrustCommandDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: ResolveWorkspaceTrustCommandSchema }, closed),
  DecodeFailureSchema,
]);
export const WorkspaceReviewDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: WorkspaceReviewSchema }, closed),
  DecodeFailureSchema,
]);
export const ContextAdmissionSummaryDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: ContextAdmissionSummarySchema }, closed),
  DecodeFailureSchema,
]);
export const RepositoryToolCallDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: RepositoryToolCallSchema }, closed),
  DecodeFailureSchema,
]);
export const RepositoryToolResultDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: RepositoryToolResultSchema }, closed),
  DecodeFailureSchema,
]);
export const RepositoryCapabilityReviewDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: RepositoryCapabilityReviewSchema }, closed),
  DecodeFailureSchema,
]);
export const RunCatalogDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: RunCatalogSchema }, closed),
  DecodeFailureSchema,
]);
export const RunInspectionDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: RunInspectionSchema }, closed),
  DecodeFailureSchema,
]);
export const RunIdDecodeResultSchema = Type.Union([
  Type.Object({ ok: Type.Literal(true), value: RunIdSchema }, closed),
  DecodeFailureSchema,
]);
export type ProductCommandDecodeResult = Type.Static<typeof ProductCommandDecodeResultSchema>;
export type ProductEventDecodeResult = Type.Static<typeof ProductEventDecodeResultSchema>;
export type ProductViewDecodeResult = Type.Static<typeof ProductViewDecodeResultSchema>;
export type ResolveWorkspaceTrustCommandDecodeResult = Type.Static<
  typeof ResolveWorkspaceTrustCommandDecodeResultSchema
>;
export type WorkspaceReviewDecodeResult = Type.Static<typeof WorkspaceReviewDecodeResultSchema>;
export type ContextAdmissionSummaryDecodeResult = Type.Static<
  typeof ContextAdmissionSummaryDecodeResultSchema
>;
export type RepositoryToolCallDecodeResult = Type.Static<
  typeof RepositoryToolCallDecodeResultSchema
>;
export type RepositoryToolResultDecodeResult = Type.Static<
  typeof RepositoryToolResultDecodeResultSchema
>;
export type RepositoryCapabilityReviewDecodeResult = Type.Static<
  typeof RepositoryCapabilityReviewDecodeResultSchema
>;
export type RunCatalogDecodeResult = Type.Static<typeof RunCatalogDecodeResultSchema>;
export type RunInspectionDecodeResult = Type.Static<typeof RunInspectionDecodeResultSchema>;
export type RunIdDecodeResult = Type.Static<typeof RunIdDecodeResultSchema>;

export interface AgentClient {
  getWorkspaceReview(): Promise<WorkspaceReview>;
  getProviderProfiles(): Promise<ProviderProfileCatalog>;
  getProviderReadiness(): Promise<ProviderReadiness>;
  getRunCatalog(options?: { readonly signal?: AbortSignal }): Promise<RunCatalog>;
  inspectRun(runId: RunId, options?: { readonly signal?: AbortSignal }): Promise<RunInspection>;
  resolveWorkspaceTrust(
    command: ResolveWorkspaceTrustCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<WorkspaceReview>;
  saveProviderProfile(command: SaveProviderProfileCommand): Promise<ProviderProfileCatalog>;
  selectProviderProfile(command: SelectProviderProfileCommand): Promise<ProviderProfileCatalog>;
  deleteProviderProfile(command: DeleteProviderProfileCommand): Promise<ProviderProfileCatalog>;
  checkProviderReadiness(
    command: ProviderReadinessCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ProviderReadiness>;
  reloadProviderProfiles(): Promise<ProviderProfileCatalog>;
  submit(
    command: ProductCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ProductView>;
  getSnapshot(runId: RunId): Promise<ProductView>;
  subscribe(
    runId: RunId,
    afterCursor?: EventCursor,
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<ProductEvent>;
  close(): Promise<void>;
}

const commandValidator = Schema.Compile(ProductCommandSchema);
const eventValidator = Schema.Compile(ProductEventSchema);
const viewValidator = Schema.Compile(ProductViewSchema);
const workspaceReviewValidator = Schema.Compile(WorkspaceReviewSchema);
const contextAdmissionSummaryValidator = Schema.Compile(ContextAdmissionSummarySchema);
const repositoryToolCallValidator = Schema.Compile(RepositoryToolCallSchema);
const repositoryToolResultValidator = Schema.Compile(RepositoryToolResultSchema);
const repositoryCapabilityReviewValidator = Schema.Compile(RepositoryCapabilityReviewSchema);
const workspaceTrustCommandValidator = Schema.Compile(ResolveWorkspaceTrustCommandSchema);
const runCatalogValidator = Schema.Compile(RunCatalogSchema);
const runInspectionValidator = Schema.Compile(RunInspectionSchema);
const runIdValidator = Schema.Compile(RunIdSchema);

type DecodedKind =
  | "command"
  | "context_admission"
  | "event"
  | "run_catalog"
  | "run_id"
  | "run_inspection"
  | "repository_capability"
  | "tool_call"
  | "tool_result"
  | "view";

function invalidInputError(kind: DecodedKind, value: unknown): ProductError {
  if (
    typeof value === "object" &&
    value !== null &&
    "protocolVersion" in value &&
    value.protocolVersion !== productProtocolVersion
  ) {
    return {
      code: "unsupported_protocol_version",
      message: `Unsupported product protocol version for ${kind}.`,
      recoverability: "reconfigure",
      suggestedActions: ["Use product protocol version 1."],
    };
  }
  return {
    code: `invalid_product_${kind}`,
    message: `The product ${kind} does not match the protocol schema.`,
    recoverability: "fatal",
    suggestedActions: ["Reject the value at the product boundary."],
  };
}

function decode<T>(
  kind: DecodedKind,
  validator: { Check(value: unknown): value is T },
  value: unknown,
): DecodeResult<T> {
  return validator.Check(value)
    ? { ok: true, value }
    : { ok: false, error: invalidInputError(kind, value) };
}

export function decodeProductCommand(value: unknown): ProductCommandDecodeResult {
  return decode("command", commandValidator, value);
}

export function decodeProductEvent(value: unknown): ProductEventDecodeResult {
  return decode("event", eventValidator, value);
}

export function decodeProductView(value: unknown): ProductViewDecodeResult {
  return decode("view", viewValidator, value);
}

export function decodeResolveWorkspaceTrustCommand(
  value: unknown,
): ResolveWorkspaceTrustCommandDecodeResult {
  return decode("command", workspaceTrustCommandValidator, value);
}

export function decodeWorkspaceReview(value: unknown): WorkspaceReviewDecodeResult {
  return decode("view", workspaceReviewValidator, value);
}

export function decodeContextAdmissionSummary(value: unknown): ContextAdmissionSummaryDecodeResult {
  return decode("context_admission", contextAdmissionSummaryValidator, value);
}

export function decodeRepositoryToolCall(value: unknown): RepositoryToolCallDecodeResult {
  return decode("tool_call", repositoryToolCallValidator, value);
}

export function decodeRepositoryToolResult(value: unknown): RepositoryToolResultDecodeResult {
  return decode("tool_result", repositoryToolResultValidator, value);
}

export function decodeRepositoryCapabilityReview(
  value: unknown,
): RepositoryCapabilityReviewDecodeResult {
  return decode("repository_capability", repositoryCapabilityReviewValidator, value);
}

export function decodeRunCatalog(value: unknown): RunCatalogDecodeResult {
  return decode("run_catalog", runCatalogValidator, value);
}

export function decodeRunInspection(value: unknown): RunInspectionDecodeResult {
  return decode("run_inspection", runInspectionValidator, value);
}

export function decodeRunId(value: unknown): RunIdDecodeResult {
  return decode("run_id", runIdValidator, value);
}

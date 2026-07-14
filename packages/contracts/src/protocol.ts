import Type from "typebox";
import Schema from "typebox/schema";

export const productProtocolVersion = 1 as const;
export const ProductProtocolVersionSchema = Type.Literal(productProtocolVersion);
export type ProductProtocolVersion = Type.Static<typeof ProductProtocolVersionSchema>;

const identifierOptions = { maxLength: 256, minLength: 1 } as const;
export const CommandIdSchema = Type.String(identifierOptions);
export const EventIdSchema = Type.String(identifierOptions);
export const RunIdSchema = Type.String(identifierOptions);
export const ActionIdSchema = Type.String(identifierOptions);
export const ApprovalIdSchema = Type.String(identifierOptions);
export const CheckIdSchema = Type.String(identifierOptions);
export const EvidenceIdSchema = Type.String(identifierOptions);
export const RevisionSchema = Type.Integer({ minimum: 0 });
export const EventCursorSchema = Type.Integer({ minimum: 0 });

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
    cwd: shortText(),
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
    cwd: shortText(),
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
    trust: Type.Union([Type.Literal("trusted"), Type.Literal("restricted")]),
  },
  closed,
);
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
  },
  closed,
);
export type ProductView = Type.Static<typeof ProductViewSchema>;

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
export const ProductEventSchema = Type.Union([
  SessionSnapshotEventSchema,
  PhaseProgressEventSchema,
  ApprovalPresentedEventSchema,
  VerificationUpdatedEventSchema,
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
export type ProductCommandDecodeResult = Type.Static<typeof ProductCommandDecodeResultSchema>;
export type ProductEventDecodeResult = Type.Static<typeof ProductEventDecodeResultSchema>;
export type ProductViewDecodeResult = Type.Static<typeof ProductViewDecodeResultSchema>;

const commandValidator = Schema.Compile(ProductCommandSchema);
const eventValidator = Schema.Compile(ProductEventSchema);
const viewValidator = Schema.Compile(ProductViewSchema);

function invalidInputError(kind: "command" | "event" | "view", value: unknown): ProductError {
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
  kind: "command" | "event" | "view",
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

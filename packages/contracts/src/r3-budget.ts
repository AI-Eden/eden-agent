import Type from "typebox";

const closed = { additionalProperties: false } as const;

export const UsableCodingBudgetPolicyV1Schema = Type.Object(
  {
    actionProposals: Type.Literal(8),
    commandOutputBytes: Type.Literal(262_144),
    commandStderrBytes: Type.Literal(65_536),
    commandStdoutBytes: Type.Literal(65_536),
    commandTimeoutMs: Type.Literal(600_000),
    finalAnswerStep: Type.Literal(12),
    gitDiffPageBytes: Type.Literal(24_576),
    gitDiffPages: Type.Literal(4),
    journalBytes: Type.Literal(2_097_152),
    journalRecordBytes: Type.Literal(65_536),
    journalRecords: Type.Literal(4_096),
    maxReadOnlyCallsPerStep: Type.Literal(4),
    modelSteps: Type.Literal(12),
    modelVisibleToolContentBytes: Type.Literal(524_288),
    newFileBytes: Type.Literal(32_768),
    profile: Type.Literal("usable_coding_v1"),
    readOnlyConcurrency: Type.Literal(4),
    toolCalls: Type.Literal(16),
    wallTimeMs: Type.Literal(1_800_000),
    version: Type.Literal(1),
  },
  closed,
);
export type UsableCodingBudgetPolicyV1 = Type.Static<typeof UsableCodingBudgetPolicyV1Schema>;

export const usableCodingGrantableBudgetSchemas = {
  actionProposals: Type.Integer({ maximum: 8, minimum: 0 }),
  commandOutputBytes: Type.Integer({ maximum: 262_144, minimum: 0 }),
  journalBytes: Type.Integer({ maximum: 2_097_152, minimum: 1 }),
  journalRecords: Type.Integer({ maximum: 4_096, minimum: 1 }),
  modelSteps: Type.Integer({ maximum: 12, minimum: 1 }),
  modelVisibleToolContentBytes: Type.Integer({ maximum: 524_288, minimum: 0 }),
  toolCalls: Type.Integer({ maximum: 16, minimum: 0 }),
  wallTimeMs: Type.Integer({ maximum: 1_800_000, minimum: 1 }),
} as const;

export const UsableCodingRunGrantV1Schema = Type.Object(
  {
    ...usableCodingGrantableBudgetSchemas,
    policy: Type.Literal("usable_coding_v1"),
    version: Type.Literal(1),
  },
  closed,
);
export type UsableCodingRunGrantV1 = Type.Static<typeof UsableCodingRunGrantV1Schema>;

export const UsableCodingRunUsageV1Schema = Type.Object(
  {
    actionProposals: Type.Integer({ maximum: 8, minimum: 0 }),
    commandOutputBytes: Type.Integer({ maximum: 262_144, minimum: 0 }),
    journalBytes: Type.Integer({ maximum: 2_097_152, minimum: 0 }),
    journalRecords: Type.Integer({ maximum: 4_096, minimum: 0 }),
    modelSteps: Type.Integer({ maximum: 12, minimum: 0 }),
    modelVisibleToolContentBytes: Type.Integer({ maximum: 524_288, minimum: 0 }),
    toolCalls: Type.Integer({ maximum: 16, minimum: 0 }),
    version: Type.Literal(1),
    wallTimeMs: Type.Integer({ maximum: 1_800_000, minimum: 0 }),
  },
  closed,
);
export type UsableCodingRunUsageV1 = Type.Static<typeof UsableCodingRunUsageV1Schema>;

export const UsableCodingBudgetRemainingV1Schema = Type.Object(
  {
    actionProposals: Type.Integer({ maximum: 8, minimum: 0 }),
    commandOutputBytes: Type.Integer({ maximum: 262_144, minimum: 0 }),
    journalBytes: Type.Integer({ maximum: 2_097_152, minimum: 0 }),
    journalRecords: Type.Integer({ maximum: 4_096, minimum: 0 }),
    modelSteps: Type.Integer({ maximum: 12, minimum: 0 }),
    modelVisibleToolContentBytes: Type.Integer({ maximum: 524_288, minimum: 0 }),
    toolCalls: Type.Integer({ maximum: 16, minimum: 0 }),
    wallTimeMs: Type.Integer({ maximum: 1_800_000, minimum: 0 }),
  },
  closed,
);
export type UsableCodingBudgetRemainingV1 = Type.Static<typeof UsableCodingBudgetRemainingV1Schema>;

export const usableCodingBudgetKeys = [
  "actionProposals",
  "commandOutputBytes",
  "journalBytes",
  "journalRecords",
  "modelSteps",
  "modelVisibleToolContentBytes",
  "toolCalls",
  "wallTimeMs",
] as const;

export const UsableCodingBudgetProductViewV1Schema = Type.Refine(
  Type.Object(
    {
      grant: UsableCodingRunGrantV1Schema,
      policy: UsableCodingBudgetPolicyV1Schema,
      remaining: UsableCodingBudgetRemainingV1Schema,
      usage: UsableCodingRunUsageV1Schema,
      version: Type.Literal(1),
    },
    closed,
  ),
  (value) =>
    usableCodingBudgetKeys.every(
      (key) =>
        value.grant[key] <= value.policy[key] &&
        value.usage[key] <= value.grant[key] &&
        value.remaining[key] === value.grant[key] - value.usage[key],
    ),
);
export type UsableCodingBudgetProductViewV1 = Type.Static<
  typeof UsableCodingBudgetProductViewV1Schema
>;

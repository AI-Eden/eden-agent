import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  decodeUsableCodingBudgetPolicy,
  decodeUsableCodingRunGrant,
  decodeUsableCodingRunUsage,
  isUsableCodingUsageAdvance,
  validateUsableCodingBudgetLedger,
} from "../src/index.ts";

const acceptedPolicy = {
  actionProposals: 8,
  commandOutputBytes: 262_144,
  commandStderrBytes: 65_536,
  commandStdoutBytes: 65_536,
  commandTimeoutMs: 600_000,
  finalAnswerStep: 12,
  gitDiffPageBytes: 24_576,
  gitDiffPages: 4,
  journalBytes: 2_097_152,
  journalRecordBytes: 65_536,
  journalRecords: 4_096,
  maxReadOnlyCallsPerStep: 4,
  modelSteps: 12,
  modelVisibleToolContentBytes: 524_288,
  newFileBytes: 32_768,
  profile: "usable_coding_v1",
  readOnlyConcurrency: 4,
  toolCalls: 16,
  wallTimeMs: 1_800_000,
  version: 1,
} as const;

const lowerGrant = {
  actionProposals: 3,
  commandOutputBytes: 65_536,
  journalBytes: 1_048_576,
  journalRecords: 2_048,
  modelSteps: 8,
  modelVisibleToolContentBytes: 131_072,
  policy: "usable_coding_v1",
  toolCalls: 10,
  wallTimeMs: 900_000,
  version: 1,
} as const;

const partialUsage = {
  actionProposals: 1,
  commandOutputBytes: 1_024,
  journalBytes: 32_768,
  journalRecords: 12,
  modelSteps: 2,
  modelVisibleToolContentBytes: 4_096,
  toolCalls: 4,
  version: 1,
  wallTimeMs: 30_000,
} as const;

test("usable coding policy, grant, and usage remain distinct closed values", () => {
  deepStrictEqual(decodeUsableCodingBudgetPolicy(acceptedPolicy), {
    ok: true,
    value: acceptedPolicy,
  });
  deepStrictEqual(decodeUsableCodingRunGrant(lowerGrant), { ok: true, value: lowerGrant });
  deepStrictEqual(decodeUsableCodingRunUsage(partialUsage), { ok: true, value: partialUsage });
  strictEqual(validateUsableCodingBudgetLedger(acceptedPolicy, lowerGrant, partialUsage), true);

  for (const widened of [
    { ...acceptedPolicy, actionProposals: 9 },
    { ...acceptedPolicy, commandOutputBytes: 262_145 },
    { ...acceptedPolicy, commandTimeoutMs: 600_001 },
    { ...acceptedPolicy, journalBytes: 1_048_576 },
    { ...acceptedPolicy, maxReadOnlyCallsPerStep: 5 },
    { ...acceptedPolicy, modelSteps: 13 },
    { ...acceptedPolicy, modelVisibleToolContentBytes: 524_289 },
    { ...acceptedPolicy, newFileBytes: 32_769 },
    { ...acceptedPolicy, toolCalls: 17 },
    { ...acceptedPolicy, wallTimeMs: 1_800_001 },
    { ...acceptedPolicy, network: "host_unrestricted" },
  ]) {
    strictEqual(decodeUsableCodingBudgetPolicy(widened).ok, false);
  }

  strictEqual(
    validateUsableCodingBudgetLedger(
      acceptedPolicy,
      { ...lowerGrant, modelSteps: 13 },
      partialUsage,
    ),
    false,
  );
  strictEqual(
    validateUsableCodingBudgetLedger(acceptedPolicy, lowerGrant, {
      ...partialUsage,
      toolCalls: 11,
    }),
    false,
  );
});

test("usable coding usage advances monotonically without exceeding the durable grant", () => {
  const nextUsage = {
    ...partialUsage,
    commandOutputBytes: 2_048,
    journalBytes: 33_000,
    journalRecords: 13,
    modelSteps: 3,
    toolCalls: 5,
    wallTimeMs: 31_000,
  } as const;

  strictEqual(isUsableCodingUsageAdvance(lowerGrant, partialUsage, nextUsage), true);
  strictEqual(
    isUsableCodingUsageAdvance(lowerGrant, partialUsage, {
      ...nextUsage,
      modelVisibleToolContentBytes: 4_095,
    }),
    false,
  );
  strictEqual(
    isUsableCodingUsageAdvance(lowerGrant, partialUsage, { ...nextUsage, toolCalls: 11 }),
    false,
  );
});

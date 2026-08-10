import Type from "typebox";
import Schema from "typebox/schema";

import { type DecodeResult, type ProductError, RepositoryToolCallSchema } from "./protocol.ts";

export {
  type UsableCodingBudgetPolicyV1,
  UsableCodingBudgetPolicyV1Schema,
  type UsableCodingBudgetProductViewV1,
  UsableCodingBudgetProductViewV1Schema,
  type UsableCodingBudgetRemainingV1,
  UsableCodingBudgetRemainingV1Schema,
  type UsableCodingRunGrantV1,
  UsableCodingRunGrantV1Schema,
  type UsableCodingRunUsageV1,
  UsableCodingRunUsageV1Schema,
} from "./r3-budget.ts";

import {
  type UsableCodingBudgetPolicyV1,
  UsableCodingBudgetPolicyV1Schema,
  type UsableCodingRunGrantV1,
  UsableCodingRunGrantV1Schema,
  type UsableCodingRunUsageV1,
  UsableCodingRunUsageV1Schema,
  usableCodingBudgetKeys,
} from "./r3-budget.ts";

const closed = { additionalProperties: false } as const;

export const UsableCodingModelObservationV1Schema = Type.Refine(
  Type.Object(
    {
      finishStatus: Type.Union([Type.Literal("stop"), Type.Literal("tool_calls")]),
      step: Type.Integer({ maximum: 12, minimum: 1 }),
      toolCalls: Type.Array(RepositoryToolCallSchema, { maxItems: 4 }),
      version: Type.Literal(1),
    },
    closed,
  ),
  (value) =>
    (value.finishStatus === "stop" && value.toolCalls.length === 0) ||
    (value.finishStatus === "tool_calls" &&
      value.step < 12 &&
      value.toolCalls.length >= 1 &&
      value.toolCalls.length <= 4),
);
export type UsableCodingModelObservationV1 = Type.Static<
  typeof UsableCodingModelObservationV1Schema
>;

const policyValidator = Schema.Compile(UsableCodingBudgetPolicyV1Schema);
const grantValidator = Schema.Compile(UsableCodingRunGrantV1Schema);
const usageValidator = Schema.Compile(UsableCodingRunUsageV1Schema);
const modelObservationValidator = Schema.Compile(UsableCodingModelObservationV1Schema);

function invalidBudget(message: string): ProductError {
  return {
    code: "invalid_usable_coding_run_budget",
    message,
    recoverability: "fatal",
    suggestedActions: ["Reject the value at the product boundary."],
  };
}

export function decodeUsableCodingBudgetPolicy(
  value: unknown,
): DecodeResult<UsableCodingBudgetPolicyV1> {
  return policyValidator.Check(value)
    ? { ok: true, value }
    : { error: invalidBudget("The budget policy does not match usable_coding_v1."), ok: false };
}

export function decodeUsableCodingRunGrant(value: unknown): DecodeResult<UsableCodingRunGrantV1> {
  return grantValidator.Check(value)
    ? { ok: true, value }
    : { error: invalidBudget("The run grant exceeds the usable_coding_v1 policy."), ok: false };
}

export function decodeUsableCodingRunUsage(value: unknown): DecodeResult<UsableCodingRunUsageV1> {
  return usageValidator.Check(value)
    ? { ok: true, value }
    : { error: invalidBudget("The run usage is outside usable_coding_v1 bounds."), ok: false };
}

export function decodeUsableCodingModelObservation(
  value: unknown,
): DecodeResult<UsableCodingModelObservationV1> {
  return modelObservationValidator.Check(value)
    ? { ok: true, value }
    : {
        error: invalidBudget("The model observation violates usable_coding_v1 call limits."),
        ok: false,
      };
}

export function validateUsableCodingBudgetLedger(
  policy: unknown,
  grant: unknown,
  usage: unknown,
): boolean {
  const decodedPolicy = decodeUsableCodingBudgetPolicy(policy);
  const decodedGrant = decodeUsableCodingRunGrant(grant);
  const decodedUsage = decodeUsableCodingRunUsage(usage);
  if (!(decodedPolicy.ok && decodedGrant.ok && decodedUsage.ok)) return false;
  return usableCodingBudgetKeys.every(
    (key) =>
      decodedGrant.value[key] <= decodedPolicy.value[key] &&
      decodedUsage.value[key] <= decodedGrant.value[key],
  );
}

export function isUsableCodingUsageAdvance(
  grant: unknown,
  previous: unknown,
  next: unknown,
): boolean {
  const decodedGrant = decodeUsableCodingRunGrant(grant);
  const decodedPrevious = decodeUsableCodingRunUsage(previous);
  const decodedNext = decodeUsableCodingRunUsage(next);
  if (!(decodedGrant.ok && decodedPrevious.ok && decodedNext.ok)) return false;
  return usableCodingBudgetKeys.every(
    (key) =>
      decodedPrevious.value[key] <= decodedNext.value[key] &&
      decodedNext.value[key] <= decodedGrant.value[key],
  );
}

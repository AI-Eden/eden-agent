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

const FakeActionEffectSchema = Type.Object(
  { effectId: identifier(), runId: identifier(), type: Type.Literal("fake.action.execute") },
  closed,
);
const FakeVerificationEffectSchema = Type.Object(
  { effectId: identifier(), runId: identifier(), type: Type.Literal("fake.verification.run") },
  closed,
);
export const KernelEffectSchema = Type.Union([
  FakeActionEffectSchema,
  FakeVerificationEffectSchema,
]);

export const KernelEventSchema = Type.Union([
  Type.Object(
    {
      action: ActionSchema,
      correlationId: identifier(),
      runId: identifier(),
      task: boundedText(),
      type: Type.Literal("run.started"),
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
  Type.Object({ effect: KernelEffectSchema, type: Type.Literal("effect.requested") }, closed),
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

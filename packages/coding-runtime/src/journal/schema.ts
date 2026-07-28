import { decodeKernelEvent, type KernelEvent } from "@eden/kernel";
import Type from "typebox";
import Schema from "typebox/schema";

export const journalVersion = 1 as const;

export type JournalRecordV1 = {
  readonly journalVersion: 1;
  readonly eventId: string;
  readonly runId: string;
  readonly sequence: number;
  readonly recordedAt: string;
  readonly causationId: string | null;
  readonly correlationId: string;
  readonly type: KernelEvent["type"];
  readonly payload: unknown;
  readonly redaction: {
    readonly status: "not-required" | "redacted";
    readonly fields: readonly string[];
  };
};

export type DecodedJournalRecord = {
  readonly event: KernelEvent;
  readonly record: JournalRecordV1;
};

export type JournalDecodeResult =
  | { readonly ok: true; readonly value: DecodedJournalRecord }
  | { readonly ok: false; readonly code: "invalid_journal_record" };

const closed = { additionalProperties: false } as const;
const identifier = () => Type.String({ maxLength: 256, minLength: 1 });
const eventType = Type.Union([
  Type.Literal("run.started"),
  Type.Literal("approval.resolved"),
  Type.Literal("approval.consumed"),
  Type.Literal("effect.requested"),
  Type.Literal("effect.dispatch.started"),
  Type.Literal("safe.action.proposed"),
  Type.Literal("anchor_edit.completed"),
  Type.Literal("review.eden_patch.captured"),
  Type.Literal("review.git_snapshot.captured"),
  Type.Literal("review.git_check.completed"),
  Type.Literal("fake.model.completed"),
  Type.Literal("fake.model.tool-requested"),
  Type.Literal("model.attempt.started"),
  Type.Literal("model.context.committed"),
  Type.Literal("model.step.completed"),
  Type.Literal("model.retry.requested"),
  Type.Literal("repository.tool.completed"),
  Type.Literal("fake.action.completed"),
  Type.Literal("verification.completed"),
  Type.Literal("run.cancelled"),
  Type.Literal("run.blocked"),
]);

export const JournalRecordV1Schema = Type.Object(
  {
    causationId: Type.Union([identifier(), Type.Null()]),
    correlationId: identifier(),
    eventId: identifier(),
    journalVersion: Type.Literal(journalVersion),
    payload: Type.Unknown(),
    recordedAt: Type.String({ format: "date-time" }),
    redaction: Type.Object(
      {
        fields: Type.Array(Type.String({ minLength: 1 }), { maxItems: 128 }),
        status: Type.Union([Type.Literal("not-required"), Type.Literal("redacted")]),
      },
      closed,
    ),
    runId: identifier(),
    sequence: Type.Integer({ minimum: 0 }),
    type: eventType,
  },
  closed,
);

const recordValidator = Schema.Compile(JournalRecordV1Schema);

export function decodeJournalRecord(value: unknown): JournalDecodeResult {
  if (!recordValidator.Check(value)) {
    return { code: "invalid_journal_record", ok: false };
  }
  if (typeof value.payload !== "object" || value.payload === null || Array.isArray(value.payload)) {
    return { code: "invalid_journal_record", ok: false };
  }
  const decodedEvent = decodeKernelEvent({ ...value.payload, type: value.type });
  if (!decodedEvent.ok) {
    return { code: "invalid_journal_record", ok: false };
  }
  return {
    ok: true,
    value: {
      event: decodedEvent.value,
      record: {
        causationId: value.causationId,
        correlationId: value.correlationId,
        eventId: value.eventId,
        journalVersion,
        payload: value.payload,
        recordedAt: value.recordedAt,
        redaction: value.redaction,
        runId: value.runId,
        sequence: value.sequence,
        type: decodedEvent.value.type,
      },
    },
  };
}

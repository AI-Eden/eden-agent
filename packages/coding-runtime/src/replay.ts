import { initialRunState, type KernelEvent, type RunState, reduce } from "@eden/kernel";

import { decodeJournalRecord, type JournalRecordV1 } from "./journal/index.ts";

export class ReplayError extends Error {
  readonly name = "ReplayError";
  readonly code: "invalid_record" | "illegal_transition";

  constructor(code: "invalid_record" | "illegal_transition", message: string) {
    super(message);
    this.code = code;
  }
}

export type ReplayResult = {
  readonly events: readonly KernelEvent[];
  readonly state: RunState;
};

export function replayRecords(records: readonly JournalRecordV1[]): ReplayResult {
  const events: KernelEvent[] = [];
  let state: RunState = initialRunState;
  for (const record of records) {
    const decoded = decodeJournalRecord(record);
    if (!decoded.ok) {
      throw new ReplayError("invalid_record", "Replay received an invalid journal record.");
    }
    const transition = reduce(state, decoded.value.event);
    if (!transition.ok) {
      throw new ReplayError("illegal_transition", "Replay encountered an illegal transition.");
    }
    events.push(decoded.value.event);
    state = transition.state;
  }
  return { events, state };
}

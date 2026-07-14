import type { JournalRecordV1 } from "../src/journal/index.ts";

export const startRecord = {
  causationId: "command-run-1",
  correlationId: "command-run-1",
  eventId: "event-0",
  journalVersion: 1,
  payload: {
    action: {
      actionId: "action-run-1",
      approvalId: "approval-run-1",
      canonicalDisplay: "Run the deterministic fake task",
      cwd: ".",
      digest: "sha256:action-run-1",
      reason: "Exercise the R1 fake-task boundary.",
      scope: "R1 demo state directory only",
    },
    correlationId: "command-run-1",
    runId: "run-1",
    task: "Index the fake workspace",
  },
  recordedAt: "2026-07-15T00:00:00.000Z",
  redaction: { fields: [], status: "not-required" },
  runId: "run-1",
  sequence: 0,
  type: "run.started",
} satisfies JournalRecordV1;

export const approvalRecord = {
  causationId: "command-approval-1",
  correlationId: "command-run-1",
  eventId: "event-1",
  journalVersion: 1,
  payload: { approvalId: "approval-run-1", decision: "approve" },
  recordedAt: "2026-07-15T00:00:01.000Z",
  redaction: { fields: [], status: "not-required" },
  runId: "run-1",
  sequence: 1,
  type: "approval.resolved",
} satisfies JournalRecordV1;

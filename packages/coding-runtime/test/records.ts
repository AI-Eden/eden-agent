import type { JournalRecordV1 } from "../src/journal/index.ts";

export const startRecord = {
  causationId: "command-run-1",
  correlationId: "command-run-1",
  eventId: "event-0",
  journalVersion: 1,
  payload: {
    correlationId: "command-run-1",
    runId: "run-1",
    task: "Index the fake workspace",
    workspace: {
      name: "eden-agent",
      root: "/work/eden-agent",
      trust: "trusted",
      workspaceId: "workspace-eden-agent",
    },
  },
  recordedAt: "2026-07-15T00:00:00.000Z",
  redaction: { fields: [], status: "not-required" },
  runId: "run-1",
  sequence: 0,
  type: "run.started",
} satisfies JournalRecordV1;

const action = {
  actionId: "run-1:fake-action",
  approvalId: "run-1:fake-approval",
  canonicalDisplay: "Run the deterministic fake task",
  cwd: "/work/eden-agent",
  digest: "run-1:fake-action-digest",
  reason: "Exercise the R1 fake-task boundary without changing workspace files.",
  scope: "R1 demo state directory only",
} as const;

export const modelRequestedRecord = {
  causationId: "event-0",
  correlationId: "command-run-1",
  eventId: "event-1",
  journalVersion: 1,
  payload: {
    effect: {
      effectId: "run-1:fake-model",
      runId: "run-1",
      task: "Index the fake workspace",
      type: "fake.model.complete",
    },
  },
  recordedAt: "2026-07-15T00:00:01.000Z",
  redaction: { fields: [], status: "not-required" },
  runId: "run-1",
  sequence: 1,
  type: "effect.requested",
} satisfies JournalRecordV1;

export const modelCompletedRecord = {
  causationId: "run-1:fake-model",
  correlationId: "command-run-1",
  eventId: "event-2",
  journalVersion: 1,
  payload: { action, effectId: "run-1:fake-model" },
  recordedAt: "2026-07-15T00:00:02.000Z",
  redaction: { fields: [], status: "not-required" },
  runId: "run-1",
  sequence: 2,
  type: "fake.model.completed",
} satisfies JournalRecordV1;

export const approvalRecord = {
  causationId: "command-approval-1",
  correlationId: "command-run-1",
  eventId: "event-3",
  journalVersion: 1,
  payload: { approvalId: "run-1:fake-approval", decision: "approve" },
  recordedAt: "2026-07-15T00:00:03.000Z",
  redaction: { fields: [], status: "not-required" },
  runId: "run-1",
  sequence: 3,
  type: "approval.resolved",
} satisfies JournalRecordV1;

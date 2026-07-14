import type { ProductEvent, ProductView } from "@eden/contracts";
import { initialRunState, type RunState, reduce } from "@eden/kernel";

import { decodeJournalRecord, type JournalRecordV1 } from "./journal/index.ts";
import {
  approvalPresentation,
  type ProjectionContext,
  ProjectionError,
  progress,
  projectView,
} from "./view-projection.ts";

export { type ProjectionContext, ProjectionError, projectView } from "./view-projection.ts";

export type ProjectionResult = {
  readonly events: readonly ProductEvent[];
  readonly view: ProductView;
};

function assertNever(value: never): never {
  throw new ProjectionError(`Unexpected projection variant: ${JSON.stringify(value)}`);
}

function requireTerminal(view: ProductView) {
  if (view.terminalOutcome === null) {
    throw new ProjectionError("Terminal event requires a terminal outcome.");
  }
  return view.terminalOutcome;
}

export function projectJournal(
  records: readonly JournalRecordV1[],
  context: ProjectionContext,
): ProjectionResult {
  const events: ProductEvent[] = [];
  let state: RunState = initialRunState;
  let cursor = 0;
  for (const record of records) {
    const decoded = decodeJournalRecord(record);
    if (!decoded.ok) {
      throw new ProjectionError("Projection received an invalid journal record.");
    }
    const transition = reduce(state, decoded.value.event);
    if (!transition.ok) {
      throw new ProjectionError("Projection encountered an illegal transition.");
    }
    state = transition.state;
    const view = projectView(state, context);
    if (state.phase === "idle") {
      throw new ProjectionError("A journal event cannot reduce to idle state.");
    }
    const base = {
      protocolVersion: 1 as const,
      revision: state.revision,
      runId: state.runId,
    };
    switch (decoded.value.event.type) {
      case "run.started":
        events.push({
          ...base,
          cursor,
          eventId: `${record.eventId}:product:0`,
          type: "session.snapshot",
          view,
        });
        cursor += 1;
        events.push({
          ...base,
          approval: approvalPresentation(state.action),
          cursor,
          eventId: `${record.eventId}:product:1`,
          type: "approval.presented",
        });
        cursor += 1;
        break;
      case "approval.resolved":
        if (state.phase === "terminal") {
          events.push({
            ...base,
            cursor,
            eventId: `${record.eventId}:product:0`,
            outcome: requireTerminal(view),
            type: "run.terminal",
          });
          cursor += 1;
          break;
        }
        events.push({
          ...base,
          currentAction: view.currentAction,
          cursor,
          eventId: `${record.eventId}:product:0`,
          phase: view.phase,
          progress: progress(state),
          type: "phase.progress",
        });
        cursor += 1;
        break;
      case "effect.requested":
      case "fake.action.completed":
        events.push({
          ...base,
          currentAction: view.currentAction,
          cursor,
          eventId: `${record.eventId}:product:0`,
          phase: view.phase,
          progress: progress(state),
          type: "phase.progress",
        });
        cursor += 1;
        break;
      case "verification.completed": {
        const check = view.checks[0];
        if (check === undefined) {
          throw new ProjectionError("Verification projection requires a check.");
        }
        events.push({
          ...base,
          check,
          cursor,
          eventId: `${record.eventId}:product:0`,
          type: "verification.updated",
        });
        cursor += 1;
        events.push({
          ...base,
          cursor,
          eventId: `${record.eventId}:product:1`,
          outcome: requireTerminal(view),
          type: "run.terminal",
        });
        cursor += 1;
        break;
      }
      case "run.cancelled":
      case "run.blocked":
        events.push({
          ...base,
          cursor,
          eventId: `${record.eventId}:product:0`,
          outcome: requireTerminal(view),
          type: "run.terminal",
        });
        cursor += 1;
        break;
      default:
        assertNever(decoded.value.event);
    }
  }
  return { events, view: projectView(state, context) };
}

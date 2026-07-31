import type { ProductEvent, ProductView } from "@eden/contracts";
import { initialRunState, type RunState, reduce } from "@eden/kernel";

import { decodeJournalRecord, type JournalRecordV1 } from "./journal/index.ts";
import { approvalPresentation, ProjectionError, progress, projectView } from "./view-projection.ts";

export { ProjectionError, projectView } from "./view-projection.ts";

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

export function projectJournal(records: readonly JournalRecordV1[]): ProjectionResult {
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
    const view = projectView(state);
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
        break;
      case "fake.model.completed":
        if (state.phase !== "awaiting-approval") {
          throw new ProjectionError("Model completion must produce an approval state.");
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
        events.push({
          ...base,
          approval: approvalPresentation(state.action),
          cursor,
          eventId: `${record.eventId}:product:1`,
          type: "approval.presented",
        });
        cursor += 1;
        break;
      case "safe.action.proposed":
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
      case "fake.model.tool-requested": {
        const activity = view.tools?.at(-1);
        if (activity === undefined) {
          throw new ProjectionError("A repository tool request requires visible activity.");
        }
        events.push({
          ...base,
          activity,
          cursor,
          eventId: `${record.eventId}:product:0`,
          type: "tool.updated",
        });
        cursor += 1;
        break;
      }
      case "repository.tool.completed": {
        const activity = view.tools?.at(-1);
        if (activity === undefined) {
          throw new ProjectionError("A repository tool result requires visible activity.");
        }
        events.push({
          ...base,
          activity,
          cursor,
          eventId: `${record.eventId}:product:0`,
          type: "tool.updated",
        });
        cursor += 1;
        if (state.phase === "terminal") {
          events.push({
            ...base,
            cursor,
            eventId: `${record.eventId}:product:1`,
            outcome: requireTerminal(view),
            type: "run.terminal",
          });
          cursor += 1;
        }
        break;
      }
      case "model.attempt.started": {
        const attempt = view.attempts?.at(-1);
        if (attempt === undefined) {
          throw new ProjectionError("A model attempt start requires a visible attempt.");
        }
        events.push({
          ...base,
          attempt,
          cursor,
          eventId: `${record.eventId}:product:0`,
          type: "model.attempt.updated",
        });
        cursor += 1;
        break;
      }
      case "model.step.completed": {
        const attempt = view.attempts?.at(-1);
        if (attempt === undefined) {
          throw new ProjectionError("A terminal model observation requires a visible attempt.");
        }
        events.push({
          ...base,
          attempt,
          cursor,
          eventId: `${record.eventId}:product:0`,
          type: "model.attempt.updated",
        });
        cursor += 1;
        const turn = view.conversation?.at(-1);
        if (
          turn?.role === "assistant" &&
          turn.attemptId === decoded.value.event.observation.attemptId
        ) {
          events.push({
            ...base,
            cursor,
            eventId: `${record.eventId}:product:1`,
            turn,
            type: "conversation.updated",
          });
          cursor += 1;
        }
        if (state.phase === "terminal") {
          events.push({
            ...base,
            cursor,
            eventId: `${record.eventId}:product:2`,
            outcome: requireTerminal(view),
            type: "run.terminal",
          });
          cursor += 1;
        }
        break;
      }
      case "model.retry.requested":
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
      case "effect.dispatch.started":
      case "approval.consumed":
      case "anchor_edit.completed":
      case "review.eden_patch.captured":
      case "review.git_snapshot.captured":
      case "model.context.committed":
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
      case "review.git_check.completed":
        if (state.phase === "awaiting-approval") {
          events.push({
            ...base,
            approval: approvalPresentation(state.action),
            cursor,
            eventId: `${record.eventId}:product:0`,
            type: "approval.presented",
          });
          cursor += 1;
          break;
        }
        if (state.phase === "terminal") {
          if (view.review === undefined) {
            throw new ProjectionError("A completed safe review requires complete review evidence.");
          }
          events.push({
            ...base,
            cursor,
            eventId: `${record.eventId}:product:0`,
            review: view.review,
            type: "review.updated",
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
        throw new ProjectionError("A review check must present approval or terminal review.");
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
      case "repository.check.lifecycle":
      case "repository.check.completed":
        throw new ProjectionError(
          "Repository-check journal projection is not active before the lifecycle slice.",
        );
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
  return { events, view: projectView(state) };
}

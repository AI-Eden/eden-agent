import { decide } from "./decide.ts";
import { deterministicFakeAction } from "./fake-action.ts";
import type {
  Action,
  AwaitingApprovalRunState,
  ExecutingRunState,
  KernelEffect,
  KernelEvent,
  RunState,
  TerminalOutcome,
  TransitionResult,
} from "./model.ts";

function illegal(state: RunState, event: KernelEvent): TransitionResult {
  return {
    error: { code: "illegal_transition", eventType: event.type, phase: state.phase },
    ok: false,
  };
}

function terminal(state: AwaitingApprovalRunState | ExecutingRunState, outcome: TerminalOutcome) {
  return {
    action: state.action,
    correlationId: state.correlationId,
    phase: "terminal",
    revision: state.revision + 1,
    runId: state.runId,
    task: state.task,
    terminalOutcome: outcome,
    workspace: state.workspace,
  } as const;
}

function effectMatches(effect: KernelEffect, expected: KernelEffect): boolean {
  if (
    effect.type !== expected.type ||
    effect.effectId !== expected.effectId ||
    effect.runId !== expected.runId
  ) {
    return false;
  }
  return (
    effect.type !== "fake.model.complete" ||
    (expected.type === "fake.model.complete" && effect.task === expected.task)
  );
}

function actionMatches(left: Action, right: Action): boolean {
  return (
    left.actionId === right.actionId &&
    left.approvalId === right.approvalId &&
    left.canonicalDisplay === right.canonicalDisplay &&
    left.cwd === right.cwd &&
    left.digest === right.digest &&
    left.reason === right.reason &&
    left.scope === right.scope
  );
}

export function reduce(state: RunState, event: KernelEvent): TransitionResult {
  if (state.phase === "terminal") {
    return illegal(state, event);
  }

  switch (event.type) {
    case "run.started":
      if (state.phase !== "idle") {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          action: null,
          correlationId: event.correlationId,
          inFlightEffect: null,
          phase: "executing",
          revision: 1,
          runId: event.runId,
          stage: "model-ready",
          task: event.task,
          terminalOutcome: null,
          workspace: event.workspace,
        },
      };
    case "approval.resolved":
      if (state.phase !== "awaiting-approval" || event.approvalId !== state.action.approvalId) {
        return illegal(state, event);
      }
      if (event.decision === "deny") {
        return {
          ok: true,
          state: terminal(state, {
            error: {
              code: "approval_denied",
              message: "The deterministic fake action was denied.",
              recoverability: "ask-user",
              suggestedActions: ["Start a new task with acceptable authority."],
            },
            state: "blocked",
          }),
        };
      }
      return {
        ok: true,
        state: {
          ...state,
          inFlightEffect: null,
          phase: "executing",
          revision: state.revision + 1,
          stage: "action-ready",
        },
      };
    case "effect.requested": {
      if (state.phase !== "executing") {
        return illegal(state, event);
      }
      const expectedEffect = decide(state)[0];
      if (expectedEffect === undefined || !effectMatches(event.effect, expectedEffect)) {
        return illegal(state, event);
      }
      if (state.stage === "model-ready" && event.effect.type === "fake.model.complete") {
        return {
          ok: true,
          state: {
            ...state,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            stage: "model-in-flight",
          },
        };
      }
      if (state.stage === "action-ready" && event.effect.type === "fake.action.execute") {
        return {
          ok: true,
          state: {
            ...state,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            stage: "action-in-flight",
          },
        };
      }
      if (state.stage === "verification-ready" && event.effect.type === "fake.verification.run") {
        return {
          ok: true,
          state: {
            ...state,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            stage: "verification-in-flight",
          },
        };
      }
      return illegal(state, event);
    }
    case "fake.model.completed":
      if (
        state.phase !== "executing" ||
        state.stage !== "model-in-flight" ||
        state.inFlightEffect?.effectId !== event.effectId ||
        !actionMatches(event.action, deterministicFakeAction(state.runId, state.workspace.root))
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          action: event.action,
          correlationId: state.correlationId,
          phase: "awaiting-approval",
          revision: state.revision + 1,
          runId: state.runId,
          task: state.task,
          terminalOutcome: null,
          workspace: state.workspace,
        },
      };
    case "fake.action.completed":
      if (
        state.phase !== "executing" ||
        state.stage !== "action-in-flight" ||
        state.inFlightEffect?.effectId !== event.effectId
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          inFlightEffect: null,
          revision: state.revision + 1,
          stage: "verification-ready",
        },
      };
    case "verification.completed":
      if (
        state.phase !== "executing" ||
        state.stage !== "verification-in-flight" ||
        state.inFlightEffect?.effectId !== event.effectId
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: terminal(
          state,
          event.passed
            ? { evidenceRef: event.evidenceRef, state: "succeeded" }
            : {
                error: {
                  code: "verification_failed",
                  message: "The deterministic fake verification failed.",
                  recoverability: "retry",
                  suggestedActions: ["Start a new task and retry the fake verification."],
                },
                state: "failed",
              },
        ),
      };
    case "run.cancelled":
      if (state.phase === "idle") {
        return illegal(state, event);
      }
      return { ok: true, state: terminal(state, { state: "cancelled" }) };
    case "run.blocked":
      if (state.phase === "idle") {
        return illegal(state, event);
      }
      return { ok: true, state: terminal(state, { error: event.error, state: "blocked" }) };
  }
}

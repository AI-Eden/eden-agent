import { decide } from "./decide.ts";
import { deterministicFakeAction } from "./fake-action.ts";
import type {
  Action,
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

function terminal(
  state: Exclude<RunState, { readonly phase: "idle" | "terminal" }>,
  outcome: TerminalOutcome,
) {
  if ("model" in state) {
    return {
      action: null,
      attempts: state.attempts,
      conversation: state.conversation,
      context: state.context,
      correlationId: state.correlationId,
      inFlightEffect: null,
      model: state.model,
      modelStep: state.modelStep,
      phase: "terminal",
      revision: state.revision + 1,
      runId: state.runId,
      task: state.task,
      terminalOutcome: outcome,
      tool: state.tool,
      tools: state.tools,
      workspace: state.workspace,
    } as const;
  }
  return {
    action: state.action,
    correlationId: state.correlationId,
    phase: "terminal",
    revision: state.revision + 1,
    runId: state.runId,
    task: state.task,
    terminalOutcome: outcome,
    tool: state.tool,
    workspace: state.workspace,
  } as const;
}

function canonicalValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalValue(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function effectMatches(effect: KernelEffect, expected: KernelEffect): boolean {
  if (
    effect.type !== expected.type ||
    effect.effectId !== expected.effectId ||
    effect.runId !== expected.runId
  ) {
    return false;
  }
  if (effect.type === "fake.model.complete" && expected.type === "fake.model.complete") {
    return (
      effect.task === expected.task &&
      canonicalValue(effect.toolResult) === canonicalValue(expected.toolResult)
    );
  }
  if (effect.type === "provider.model.step" && expected.type === "provider.model.step") {
    return (
      effect.step === expected.step &&
      effect.profileId === expected.profileId &&
      effect.model === expected.model &&
      effect.maxOutputTokens === expected.maxOutputTokens
    );
  }
  if (effect.type === "repository.tool.execute" && expected.type === "repository.tool.execute") {
    return canonicalValue(effect.toolCall) === canonicalValue(expected.toolCall);
  }
  return true;
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
      if (event.model !== undefined) {
        return {
          ok: true,
          state: {
            action: null,
            attempts: [],
            conversation: [{ content: event.task, role: "user" }],
            context: [],
            correlationId: event.correlationId,
            inFlightEffect: null,
            model: event.model,
            modelStep: 1,
            phase: "executing",
            revision: 1,
            runId: event.runId,
            stage: "model-ready",
            task: event.task,
            terminalOutcome: null,
            tool: null,
            tools: [],
            workspace: event.workspace,
          },
        };
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
          tool: null,
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
      if (
        "model" in state &&
        state.stage === "model-ready" &&
        event.effect.type === "provider.model.step"
      ) {
        return {
          ok: true,
          state: {
            ...state,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            stage: "model-awaiting-attempt",
          },
        };
      }
      if (state.stage === "tool-ready" && event.effect.type === "repository.tool.execute") {
        return {
          ok: true,
          state: {
            ...state,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            stage: "tool-in-flight",
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
    case "model.context.committed":
      if (
        state.phase !== "executing" ||
        !("model" in state) ||
        state.stage !== "model-ready" ||
        state.context.some((item) => item.contextItemId === event.item.contextItemId)
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          context: [...state.context, event.item],
          revision: state.revision + 1,
        },
      };
    case "model.attempt.started": {
      if (
        state.phase !== "executing" ||
        !("model" in state) ||
        state.stage !== "model-awaiting-attempt" ||
        state.inFlightEffect?.type !== "provider.model.step" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.attempts.some((attempt) => attempt.attemptId === event.attemptId)
      ) {
        return illegal(state, event);
      }
      const attemptsForStep = state.attempts.filter((attempt) => attempt.step === state.modelStep);
      const expectedReason =
        attemptsForStep.length === 0
          ? "initial"
          : attemptsForStep.length === 1 &&
              attemptsForStep[0]?.observation?.status === "not_started"
            ? "automatic-not-started-retry"
            : "explicit-retry";
      if (event.reason !== expectedReason || attemptsForStep.length >= 3) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          attempts: [
            ...state.attempts,
            {
              attemptId: event.attemptId,
              observation: null,
              reason: event.reason,
              step: state.modelStep,
            },
          ],
          revision: state.revision + 1,
          stage: "model-in-flight",
        },
      };
    }
    case "model.step.completed": {
      if (
        state.phase !== "executing" ||
        !("model" in state) ||
        state.stage !== "model-in-flight" ||
        state.inFlightEffect?.type !== "provider.model.step" ||
        state.inFlightEffect.effectId !== event.effectId
      ) {
        return illegal(state, event);
      }
      const currentAttempt = state.attempts.at(-1);
      if (
        currentAttempt === undefined ||
        currentAttempt.step !== state.modelStep ||
        currentAttempt.observation !== null ||
        currentAttempt.attemptId !== event.observation.attemptId
      ) {
        return illegal(state, event);
      }
      const attempts = [
        ...state.attempts.slice(0, -1),
        { ...currentAttempt, observation: event.observation },
      ];
      if (event.observation.status === "completed") {
        if (event.observation.finishStatus === "stop") {
          if (event.observation.text.length === 0) return illegal(state, event);
          return {
            ok: true,
            state: terminal(
              { ...state, attempts },
              { answer: event.observation.text, state: "completed" },
            ),
          };
        }
        const call = event.observation.toolCalls[0];
        if (call === undefined) return illegal(state, event);
        if (state.modelStep >= 4 || state.tools.length >= 4) {
          return {
            ok: true,
            state: terminal(
              { ...state, attempts },
              {
                error: {
                  code: "model_tool_budget_exceeded",
                  message: "The model exceeded the bounded model-step or tool-call budget.",
                  recoverability: "ask-user",
                  suggestedActions: ["Start a new task with a narrower repository question."],
                },
                state: "blocked",
              },
            ),
          };
        }
        const tool = { call, result: null };
        return {
          ok: true,
          state: {
            ...state,
            attempts,
            conversation: [
              ...state.conversation,
              {
                content: event.observation.text,
                privateContinuity: event.observation.privateContinuity,
                role: "assistant",
                toolCalls: event.observation.toolCalls,
              },
            ],
            inFlightEffect: null,
            revision: state.revision + 1,
            stage: "tool-ready",
            tool,
            tools: [...state.tools, tool],
          },
        };
      }
      const attemptsForStep = attempts.filter((attempt) => attempt.step === state.modelStep);
      if (
        event.observation.status === "not_started" &&
        event.observation.error.recoverability === "retry" &&
        attemptsForStep.length < 2
      ) {
        return {
          ok: true,
          state: {
            ...state,
            attempts,
            revision: state.revision + 1,
            stage: "model-awaiting-attempt",
          },
        };
      }
      return {
        ok: true,
        state: {
          action: null,
          attempts,
          conversation: state.conversation,
          context: state.context,
          correlationId: state.correlationId,
          inFlightEffect: state.inFlightEffect,
          interruption: event.observation,
          model: state.model,
          modelStep: state.modelStep,
          phase: "awaiting-retry",
          revision: state.revision + 1,
          runId: state.runId,
          task: state.task,
          terminalOutcome: null,
          tool: state.tool,
          tools: state.tools,
          workspace: state.workspace,
        },
      };
    }
    case "model.retry.requested":
      if (state.phase !== "awaiting-retry") {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          action: null,
          attempts: state.attempts,
          conversation: state.conversation,
          context: state.context,
          correlationId: state.correlationId,
          inFlightEffect: state.inFlightEffect,
          model: state.model,
          modelStep: state.modelStep,
          phase: "executing",
          revision: state.revision + 1,
          runId: state.runId,
          stage: "model-awaiting-attempt",
          task: state.task,
          terminalOutcome: null,
          tool: state.tool,
          tools: state.tools,
          workspace: state.workspace,
        },
      };
    case "fake.model.tool-requested":
      if (
        state.phase !== "executing" ||
        state.stage !== "model-in-flight" ||
        state.inFlightEffect?.effectId !== event.effectId ||
        state.tool !== null
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          inFlightEffect: null,
          revision: state.revision + 1,
          stage: "tool-ready",
          tool: { call: event.toolCall, result: null },
        },
      };
    case "repository.tool.completed":
      if (
        state.phase !== "executing" ||
        state.stage !== "tool-in-flight" ||
        state.inFlightEffect?.effectId !== event.effectId ||
        state.tool === null ||
        event.result.toolCallId !== state.tool.call.toolCallId ||
        event.result.name !== state.tool.call.name
      ) {
        return illegal(state, event);
      }
      if (event.result.status === "failed") {
        return {
          ok: true,
          state: terminal(
            { ...state, tool: { call: state.tool.call, result: event.result } },
            { error: event.result.error, state: "blocked" },
          ),
        };
      }
      if ("model" in state) {
        const tool = { call: state.tool.call, result: event.result };
        const tools = [...state.tools.slice(0, -1), tool];
        return {
          ok: true,
          state: {
            ...state,
            conversation: [...state.conversation, { ...tool, role: "tool" }],
            inFlightEffect: null,
            modelStep: state.modelStep + 1,
            revision: state.revision + 1,
            stage: "model-ready",
            tool,
            tools,
          },
        };
      }
      return {
        ok: true,
        state: {
          ...state,
          inFlightEffect: null,
          revision: state.revision + 1,
          stage: "model-ready",
          tool: { call: state.tool.call, result: event.result },
        },
      };
    case "fake.model.completed":
      if (
        state.phase !== "executing" ||
        "model" in state ||
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
          tool: state.tool,
          workspace: state.workspace,
        },
      };
    case "fake.action.completed":
      if (
        state.phase !== "executing" ||
        "model" in state ||
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
        "model" in state ||
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

import {
  decodeRepositoryToolCall,
  decodeRepositoryToolResult,
  type ProductView,
} from "@eden/contracts";
import type { Action, KernelProductError, RunState, TerminalOutcome } from "@eden/kernel";

export class ProjectionError extends Error {
  readonly name = "ProjectionError";
}

function assertNever(value: never): never {
  throw new ProjectionError(`Unexpected projection variant: ${JSON.stringify(value)}`);
}

function actionSummary(action: Action) {
  return {
    actionId: action.actionId,
    cwd: action.cwd,
    display: action.canonicalDisplay,
    reason: action.reason,
    scope: action.scope,
  };
}

export function approvalPresentation(action: Action) {
  return {
    actionId: action.actionId,
    approvalId: action.approvalId,
    canonicalDisplay: action.canonicalDisplay,
    cwd: action.cwd,
    digest: action.digest,
    reason: action.reason,
    scope: action.scope,
  };
}

function productError(error: KernelProductError) {
  return { ...error, suggestedActions: [...error.suggestedActions] };
}

function productOutcome(outcome: TerminalOutcome): ProductView["terminalOutcome"] {
  switch (outcome.state) {
    case "succeeded":
    case "completed":
    case "cancelled":
      return outcome;
    case "blocked":
    case "failed":
      return { error: productError(outcome.error), state: outcome.state };
    default:
      return assertNever(outcome);
  }
}

export function progress(state: Exclude<RunState, { readonly phase: "idle" }>) {
  switch (state.phase) {
    case "awaiting-approval":
      return { completed: 1, summary: "Awaiting approval for the fake action.", total: 4 };
    case "executing":
      if ("model" in state) {
        const summary =
          state.stage === "tool-ready" || state.stage === "tool-in-flight"
            ? "Reading bounded repository context for the model."
            : state.stage === "model-awaiting-attempt"
              ? "Preparing an explicit provider attempt."
              : "Generating a repository-grounded answer.";
        return { completed: state.modelStep - 1, summary, total: 4 };
      }
      switch (state.stage) {
        case "model-ready":
        case "model-in-flight":
          return {
            completed: state.tool?.result === null ? 0 : state.tool === null ? 0 : 1,
            summary:
              state.tool === null
                ? "Running the deterministic fake model."
                : "Continuing the deterministic fake model with the repository result.",
            total: 4,
          };
        case "tool-ready":
        case "tool-in-flight":
          return { completed: 0, summary: "Reading bounded repository context.", total: 4 };
        case "action-ready":
        case "action-in-flight":
          return { completed: 2, summary: "Executing the deterministic fake action.", total: 4 };
        case "verification-ready":
        case "verification-in-flight":
          return { completed: 3, summary: "Verifying the deterministic fake result.", total: 4 };
        default:
          return assertNever(state);
      }
    case "awaiting-retry":
      return {
        completed: state.modelStep - 1,
        summary: "The model attempt requires an explicit retry decision.",
        total: 4,
      };
    case "terminal":
      return {
        completed: 4,
        summary:
          "model" in state
            ? "The repository answer is complete for review."
            : "The deterministic fake task is terminal.",
        total: 4,
      };
    default:
      return assertNever(state);
  }
}

function checks(outcome: ProductView["terminalOutcome"]): ProductView["checks"] {
  if (outcome?.state === "completed") return [];
  if (outcome?.state === "succeeded") {
    return [
      {
        checkId: "check-fake-verification",
        evidenceRef: outcome.evidenceRef,
        name: "Deterministic fake verification",
        requirement: "required",
        status: "passed",
        summary: "Fake verification passed.",
      },
    ];
  }
  return [
    {
      checkId: "check-fake-verification",
      name: "Deterministic fake verification",
      requirement: "required",
      status: outcome === null ? "pending" : "skipped",
      summary:
        outcome === null ? "Fake verification is pending." : "Fake verification did not pass.",
    },
  ];
}

function productTools(state: Exclude<RunState, { readonly phase: "idle" }>): ProductView["tools"] {
  const exchanges = "tools" in state ? state.tools : state.tool === null ? [] : [state.tool];
  if (exchanges.length === 0) return undefined;
  return exchanges.map((exchange) => {
    const call = decodeRepositoryToolCall(exchange.call);
    if (!call.ok) {
      throw new ProjectionError("The repository tool call failed projection validation.");
    }
    if (exchange.result === null) {
      return { call: call.value, result: null, state: "requested" } as const;
    }
    const result = decodeRepositoryToolResult(exchange.result);
    if (!result.ok) {
      throw new ProjectionError("The repository tool result failed projection validation.");
    }
    return { call: call.value, result: result.value, state: "completed" } as const;
  });
}

function providerProjection(state: Exclude<RunState, { readonly phase: "idle" }>) {
  if (!("model" in state)) return {};
  const attempts = state.attempts.map((attempt) => ({
    attemptId: attempt.attemptId,
    error:
      attempt.observation === null || attempt.observation.status === "completed"
        ? null
        : productError(attempt.observation.error),
    reason: attempt.reason,
    state: attempt.observation?.status ?? ("started" as const),
    step: attempt.step,
    usage:
      attempt.observation?.status === "completed" && attempt.observation.usage !== null
        ? { ...attempt.observation.usage, state: "exact" as const }
        : { state: "unknown" as const },
  }));
  const conversation: NonNullable<ProductView["conversation"]> = [
    {
      content: state.task,
      role: "user",
      turnId: `user-${state.runId}`,
    },
  ];
  let assistantIndex = 0;
  for (const item of state.conversation) {
    if (item.role !== "assistant" || item.content.length === 0) continue;
    const attempt = state.attempts.filter((entry) => entry.step === assistantIndex + 1).at(-1);
    if (attempt === undefined) continue;
    conversation.push({
      attemptId: attempt.attemptId,
      content: item.content,
      role: "assistant",
      status: "complete",
      turnId: `assistant-${attempt.attemptId}`,
    });
    assistantIndex += 1;
  }
  if (state.phase === "terminal" && state.terminalOutcome.state === "completed") {
    const attempt = state.attempts.at(-1);
    if (attempt !== undefined) {
      conversation.push({
        attemptId: attempt.attemptId,
        content: state.terminalOutcome.answer,
        role: "assistant",
        status: "complete",
        turnId: `assistant-${attempt.attemptId}`,
      });
    }
  } else if (state.phase === "awaiting-retry" && state.interruption.status === "interrupted") {
    conversation.push({
      attemptId: state.interruption.attemptId,
      content: state.interruption.partialText,
      role: "assistant",
      status: "incomplete",
      turnId: `assistant-${state.interruption.attemptId}-incomplete`,
    });
  }
  return {
    attempts,
    conversation,
    retry: {
      available: state.phase === "awaiting-retry",
      reason: state.phase === "awaiting-retry" ? productError(state.interruption.error) : null,
    },
  };
}

export function projectView(state: RunState): ProductView {
  if (state.phase === "idle") {
    throw new ProjectionError("Idle state has no product run view.");
  }
  const awaitingApproval = state.phase === "awaiting-approval";
  const awaitingRetry = state.phase === "awaiting-retry";
  const terminal = state.phase === "terminal";
  const terminalOutcome = terminal ? productOutcome(state.terminalOutcome) : null;
  const succeeded = terminalOutcome?.state === "succeeded";
  const tools = productTools(state);
  return {
    approval: awaitingApproval
      ? {
          ...approvalPresentation(state.action),
          recoveryAction: "Approve the exact fake action or deny it.",
        }
      : null,
    budget: { total: 10, unit: "actions", used: state.revision },
    changedFiles: [],
    checks: checks(terminalOutcome),
    currentAction: terminal || state.action === null ? null : actionSummary(state.action),
    nextActions: awaitingApproval
      ? ["Approve or deny the deterministic fake action."]
      : awaitingRetry
        ? ["Explicitly retry from the last committed conversation turn or cancel the run."]
        : terminal
          ? ["Review the terminal evidence."]
          : ["Wait for the deterministic fake task to advance."],
    phase: awaitingApproval
      ? "awaiting-approval"
      : awaitingRetry
        ? "awaiting-retry"
        : terminal
          ? "review"
          : "executing",
    progress: progress(state),
    protocolVersion: 1,
    residualRisk: succeeded ? "This run exercised only deterministic fake boundaries." : null,
    revision: state.revision,
    runId: state.runId,
    terminalOutcome,
    ...(tools === undefined ? {} : { tools }),
    ...providerProjection(state),
    viewId: `${state.runId}:view:${state.revision}`,
    workspace: state.workspace,
  };
}

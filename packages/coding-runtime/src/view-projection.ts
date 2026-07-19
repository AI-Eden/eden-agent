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
    case "terminal":
      return { completed: 4, summary: "The deterministic fake task is terminal.", total: 4 };
    default:
      return assertNever(state);
  }
}

function checks(outcome: ProductView["terminalOutcome"]): ProductView["checks"] {
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
  if (state.tool === null) return undefined;
  const call = decodeRepositoryToolCall(state.tool.call);
  if (!call.ok) throw new ProjectionError("The repository tool call failed projection validation.");
  if (state.tool.result === null) {
    return [{ call: call.value, result: null, state: "requested" }];
  }
  const result = decodeRepositoryToolResult(state.tool.result);
  if (!result.ok) {
    throw new ProjectionError("The repository tool result failed projection validation.");
  }
  return [{ call: call.value, result: result.value, state: "completed" }];
}

export function projectView(state: RunState): ProductView {
  if (state.phase === "idle") {
    throw new ProjectionError("Idle state has no product run view.");
  }
  const awaitingApproval = state.phase === "awaiting-approval";
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
      : terminal
        ? ["Review the terminal evidence."]
        : ["Wait for the deterministic fake task to advance."],
    phase: awaitingApproval ? "awaiting-approval" : terminal ? "review" : "executing",
    progress: progress(state),
    protocolVersion: 1,
    residualRisk: succeeded ? "This run exercised only deterministic fake boundaries." : null,
    revision: state.revision,
    runId: state.runId,
    terminalOutcome,
    ...(tools === undefined ? {} : { tools }),
    viewId: `${state.runId}:view:${state.revision}`,
    workspace: state.workspace,
  };
}

import { repositoryToolModelContent } from "@eden/contracts";

import { decide } from "./decide.ts";
import { deterministicFakeAction } from "./fake-action.ts";
import type {
  Action,
  KernelEffect,
  KernelEvent,
  RepositoryToolCall,
  RepositoryToolResult,
  RunState,
  SafeActuationAction,
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
      action: state.action,
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
      ...(state.codingBudget === undefined ? {} : { codingBudget: state.codingBudget }),
      ...(state.toolBatch === undefined ? {} : { toolBatch: state.toolBatch }),
      ...(state.safeReview === undefined ? {} : { safeReview: state.safeReview }),
      ...(state.repositoryCheck === undefined ? {} : { repositoryCheck: state.repositoryCheck }),
      ...(state.runCommand === undefined ? {} : { runCommand: state.runCommand }),
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
    ...(state.safeReview === undefined ? {} : { safeReview: state.safeReview }),
    ...(state.repositoryCheck === undefined ? {} : { repositoryCheck: state.repositoryCheck }),
    ...(state.runCommand === undefined ? {} : { runCommand: state.runCommand }),
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
  if (
    effect.type === "repository.tool.batch.execute" &&
    expected.type === "repository.tool.batch.execute"
  ) {
    return canonicalValue(effect.calls) === canonicalValue(expected.calls);
  }
  if (effect.type === "anchor_edit.execute" && expected.type === "anchor_edit.execute") {
    return canonicalValue(effect.envelope) === canonicalValue(expected.envelope);
  }
  if (effect.type === "write_file.execute" && expected.type === "write_file.execute") {
    return canonicalValue(effect.envelope) === canonicalValue(expected.envelope);
  }
  if (effect.type === "run_command.execute" && expected.type === "run_command.execute") {
    return canonicalValue(effect.envelope) === canonicalValue(expected.envelope);
  }
  if (effect.type === "repository_check.execute" && expected.type === "repository_check.execute") {
    return canonicalValue(effect.envelope) === canonicalValue(expected.envelope);
  }
  if (effect.type === "anchor_edit.prepare" && expected.type === "anchor_edit.prepare") {
    return (
      effect.expectedRevision === expected.expectedRevision &&
      effect.parentActionId === expected.parentActionId &&
      effect.proposalRevision === expected.proposalRevision &&
      canonicalValue(effect.toolCall) === canonicalValue(expected.toolCall) &&
      canonicalValue(effect.workspace) === canonicalValue(expected.workspace)
    );
  }
  if (effect.type === "write_file.prepare" && expected.type === "write_file.prepare") {
    return (
      effect.expectedRevision === expected.expectedRevision &&
      effect.proposalRevision === expected.proposalRevision &&
      canonicalValue(effect.toolCall) === canonicalValue(expected.toolCall) &&
      canonicalValue(effect.workspace) === canonicalValue(expected.workspace)
    );
  }
  if (effect.type === "run_command.prepare" && expected.type === "run_command.prepare") {
    return (
      effect.expectedRevision === expected.expectedRevision &&
      effect.proposalRevision === expected.proposalRevision &&
      canonicalValue(effect.toolCall) === canonicalValue(expected.toolCall) &&
      canonicalValue(effect.workspace) === canonicalValue(expected.workspace)
    );
  }
  if (effect.type === "repository_check.prepare" && expected.type === "repository_check.prepare") {
    return (
      effect.executionEffectId === expected.executionEffectId &&
      effect.expectedRevision === expected.expectedRevision &&
      effect.proposalRevision === expected.proposalRevision &&
      canonicalValue(effect.toolCall) === canonicalValue(expected.toolCall) &&
      canonicalValue(effect.workspace) === canonicalValue(expected.workspace)
    );
  }
  if (
    effect.type === "review.eden_patch.capture" &&
    expected.type === "review.eden_patch.capture"
  ) {
    return (
      effect.actionId === expected.actionId &&
      canonicalValue(effect.envelope) === canonicalValue(expected.envelope)
    );
  }
  if (
    effect.type === "review.git_snapshot.capture" &&
    expected.type === "review.git_snapshot.capture"
  ) {
    return (
      effect.actionId === expected.actionId &&
      effect.expectedHead === expected.expectedHead &&
      effect.phase === expected.phase
    );
  }
  if (effect.type === "review.git_check.capture" && expected.type === "review.git_check.capture") {
    return (
      effect.actionId === expected.actionId &&
      effect.head === expected.head &&
      effect.phase === expected.phase
    );
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

function isSafeAction(action: Action | null): action is SafeActuationAction {
  return action !== null && "safeActuation" in action;
}

const zeroUsableCodingUsage = {
  actionProposals: 0,
  commandOutputBytes: 0,
  journalBytes: 0,
  journalRecords: 0,
  modelSteps: 0,
  modelVisibleToolContentBytes: 0,
  toolCalls: 0,
  version: 1,
  wallTimeMs: 0,
} as const;

function isReadOnlyRepositoryCall(call: RepositoryToolCall): boolean {
  return (
    call.name === "list_files" ||
    call.name === "read_file" ||
    call.name === "search_repository" ||
    call.name === "git_diff" ||
    call.name === "git_status"
  );
}

function declaredModelVisibleToolBytes(call: RepositoryToolCall): number {
  if (call.name === "run_command") return 147_456;
  return call.name === "anchor_edit" ||
    call.name === "write_file" ||
    call.name === "repository_check"
    ? 8_192
    : 32_768;
}

function observedModelVisibleToolBytes(result: RepositoryToolResult): number {
  return new TextEncoder().encode(repositoryToolModelContent(result)).byteLength;
}

function decodeUtf8Base64(value: string, expectedBytes: number): string | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength !== expectedBytes) return null;
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function narrowerSafeAction(parent: SafeActuationAction, child: SafeActuationAction): boolean {
  const left = parent.safeActuation.envelope;
  const right = child.safeActuation.envelope;
  if (
    left.kind !== "anchor_edit" ||
    right.kind !== "anchor_edit" ||
    left.operation.type !== "anchor_edit" ||
    right.operation.type !== "anchor_edit"
  ) {
    return false;
  }
  return (
    left.runId === right.runId &&
    left.workspace.workspaceId === right.workspace.workspaceId &&
    left.operation.path === right.operation.path &&
    left.operation.baseByteLength === right.operation.baseByteLength &&
    left.operation.baseSha256 === right.operation.baseSha256 &&
    right.operation.replacements.length <= left.operation.replacements.length &&
    canonicalValue(left.authority) === canonicalValue(right.authority) &&
    canonicalValue(left.budgets) === canonicalValue(right.budgets) &&
    canonicalValue(left.scope) === canonicalValue(right.scope)
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
            ...(event.codingBudget === undefined
              ? {}
              : {
                  codingBudget: {
                    ...event.codingBudget,
                    usage: zeroUsableCodingUsage,
                  },
                }),
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
      if (isSafeAction(state.action)) {
        const action = state.action;
        if ("model" in state) {
          if (event.decision === "deny") {
            if (
              state.tool === null ||
              (state.tool.call.name !== "anchor_edit" &&
                state.tool.call.name !== "write_file" &&
                state.tool.call.name !== "run_command" &&
                state.tool.call.name !== "repository_check")
            ) {
              return illegal(state, event);
            }
            const result: RepositoryToolResult =
              state.tool.call.name === "repository_check"
                ? {
                    data: {
                      checkName: state.tool.call.arguments.checkName,
                      reason: "The user denied this exact action digest.",
                    },
                    name: "repository_check",
                    status: "denied",
                    toolCallId: state.tool.call.toolCallId,
                  }
                : state.tool.call.name === "anchor_edit"
                  ? {
                      data: {
                        parentActionId: action.actionId,
                        reason: "The user denied this exact action digest.",
                      },
                      name: "anchor_edit",
                      status: "denied",
                      toolCallId: state.tool.call.toolCallId,
                    }
                  : {
                      error: {
                        code: "approval_denied",
                        message: "The user denied this exact action digest.",
                        recoverability: "retry",
                        suggestedActions: [
                          "Continue without this action or propose a different singleton action.",
                        ],
                      },
                      name: state.tool.call.name,
                      status: "failed",
                      toolCallId: state.tool.call.toolCallId,
                    };
            const tool = { call: state.tool.call, result };
            if (
              state.tool.call.name === "anchor_edit" &&
              action.safeActuation.parentActionId !== null
            ) {
              return {
                ok: true,
                state: terminal(
                  {
                    ...state,
                    action,
                    conversation: [...state.conversation, { ...tool, role: "tool" }],
                    tool,
                    tools: [...state.tools.slice(0, -1), tool],
                  },
                  {
                    error: {
                      code: "denial_lineage_exhausted",
                      message: "This denial lineage already used its one narrower proposal.",
                      recoverability: "ask-user",
                      suggestedActions: ["Review the denied actions or start a new task."],
                    },
                    state: "blocked",
                  },
                ),
              };
            }
            return {
              ok: true,
              state: {
                ...state,
                action,
                conversation: [...state.conversation, { ...tool, role: "tool" }],
                inFlightEffect: null,
                modelStep: state.modelStep + 1,
                phase: "executing",
                revision: state.revision + 1,
                stage: "model-ready",
                tool,
                tools: [...state.tools.slice(0, -1), tool],
              },
            };
          }
          return {
            ok: true,
            state: {
              ...state,
              action,
              dispatchStarted: false,
              inFlightEffect: null,
              phase: "executing",
              revision: state.revision + 1,
              stage: "approval-consume-ready",
            },
          };
        }
        if (event.decision === "deny") {
          return {
            ok: true,
            state: {
              ...state,
              action,
              dispatchStarted: false,
              inFlightEffect: null,
              phase: "executing",
              revision: state.revision + 1,
              stage: "safe-reproposal-ready",
            },
          };
        }
        return {
          ok: true,
          state: {
            ...state,
            action,
            dispatchStarted: false,
            inFlightEffect: null,
            phase: "executing",
            revision: state.revision + 1,
            stage: "approval-consume-ready",
          },
        };
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
    case "safe.action.proposed": {
      const providerProposal =
        state.phase === "executing" &&
        "model" in state &&
        state.stage === "action-prepare-in-flight" &&
        (state.inFlightEffect?.type === "anchor_edit.prepare" ||
          state.inFlightEffect?.type === "write_file.prepare" ||
          state.inFlightEffect?.type === "run_command.prepare" ||
          state.inFlightEffect?.type === "repository_check.prepare") &&
        state.inFlightEffect.effectId === event.effectId;
      const directProposal =
        state.phase === "executing" &&
        !("model" in state) &&
        (state.stage === "model-ready" ||
          (state.stage === "safe-reproposal-ready" &&
            state.action !== null &&
            isSafeAction(state.action) &&
            state.action.safeActuation.parentActionId === null));
      if (state.phase !== "executing" || (!providerProposal && !directProposal)) {
        return illegal(state, event);
      }
      const safe = event.action.safeActuation;
      const envelope = safe.envelope;
      const repositoryCheck = envelope.kind === "repository_check_v1";
      const command = envelope.kind === "run_command";
      const parentAction =
        repositoryCheck || envelope.kind === "write_file" || command
          ? null
          : "model" in state
            ? state.action
            : state.stage === "safe-reproposal-ready"
              ? state.action
              : null;
      const replacingDenied = parentAction !== null;
      if (
        envelope.runId !== state.runId ||
        envelope.workspace.workspaceId !== state.workspace.workspaceId ||
        event.action.actionId !== envelope.actionId ||
        event.action.digest !== safe.policy.actionDigest ||
        event.action.digest !== safe.approval.actionDigest ||
        event.action.approvalId.length === 0 ||
        safe.policy.decision !== "ask" ||
        safe.approval.state !== "available" ||
        safe.approval.expectedRevision !== state.revision + (repositoryCheck || command ? 1 : 10) ||
        safe.approval.proposalRevision !== envelope.proposalRevision ||
        (replacingDenied
          ? safe.parentActionId !== parentAction.actionId ||
            !narrowerSafeAction(parentAction, event.action)
          : safe.parentActionId !== null)
      ) {
        return illegal(state, event);
      }
      if ("model" in state) {
        if (repositoryCheck) {
          if (state.inFlightEffect?.type !== "repository_check.prepare") {
            return illegal(state, event);
          }
          return {
            ok: true,
            state: {
              ...state,
              action: event.action,
              inFlightEffect: null,
              phase: "awaiting-approval",
              repositoryCheck: {
                actionId: envelope.actionId,
                effectId: state.inFlightEffect.executionEffectId,
                lifecycle: [{ observedAt: safe.policy.evaluatedAt, state: "awaiting_approval" }],
                receipt: null,
                result: null,
                state: "awaiting_approval",
              },
              revision: state.revision + 1,
            },
          };
        }
        if (command) {
          if (state.inFlightEffect?.type !== "run_command.prepare") {
            return illegal(state, event);
          }
          return {
            ok: true,
            state: {
              ...state,
              action: event.action,
              inFlightEffect: null,
              phase: "awaiting-approval",
              revision: state.revision + 1,
            },
          };
        }
        return {
          ok: true,
          state: {
            ...state,
            action: event.action,
            dispatchStarted: false,
            inFlightEffect: null,
            phase: "executing",
            revision: state.revision + 1,
            safeReview: {
              baselineCheck: null,
              baselineGit: null,
              currentCheck: null,
              currentGit: null,
              edenPatch: null,
            },
            stage: "eden-patch-ready",
          },
        };
      }
      return {
        ok: true,
        state: {
          action: event.action,
          correlationId: state.correlationId,
          dispatchStarted: false,
          inFlightEffect: null,
          phase: "executing",
          revision: state.revision + 1,
          runId: state.runId,
          safeReview: {
            baselineCheck: null,
            baselineGit: null,
            currentCheck: null,
            currentGit: null,
            edenPatch: null,
          },
          stage: "eden-patch-ready",
          task: state.task,
          terminalOutcome: null,
          tool: state.tool,
          workspace: state.workspace,
        },
      };
    }
    case "approval.consumed": {
      if (
        state.phase !== "executing" ||
        state.stage !== "approval-consume-ready" ||
        !isSafeAction(state.action)
      ) {
        return illegal(state, event);
      }
      const approval = state.action.safeActuation.approval;
      if (
        event.approvalId !== state.action.approvalId ||
        event.actionDigest !== approval.actionDigest ||
        event.expectedRevision !== approval.expectedRevision ||
        event.proposalRevision !== approval.proposalRevision ||
        approval.state !== "available"
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          action: {
            ...state.action,
            safeActuation: {
              ...state.action.safeActuation,
              approval: { ...approval, state: "consumed" },
            },
          },
          revision: state.revision + 1,
          stage: "safe-action-ready",
        },
      };
    }
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
      if (
        "model" in state &&
        state.stage === "tool-batch-ready" &&
        event.effect.type === "repository.tool.batch.execute"
      ) {
        return {
          ok: true,
          state: {
            ...state,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            stage: "tool-batch-in-flight",
          },
        };
      }
      if (
        "model" in state &&
        state.stage === "action-prepare-ready" &&
        (event.effect.type === "anchor_edit.prepare" ||
          event.effect.type === "write_file.prepare" ||
          event.effect.type === "run_command.prepare" ||
          event.effect.type === "repository_check.prepare")
      ) {
        return {
          ok: true,
          state: {
            ...state,
            dispatchStarted: false,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            stage: "action-prepare-in-flight",
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
      if (
        state.stage === "safe-action-ready" &&
        (event.effect.type === "anchor_edit.execute" ||
          event.effect.type === "write_file.execute" ||
          event.effect.type === "run_command.execute" ||
          event.effect.type === "repository_check.execute") &&
        isSafeAction(state.action)
      ) {
        return {
          ok: true,
          state: {
            ...state,
            dispatchStarted: false,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            ...(event.effect.type === "run_command.execute"
              ? {
                  runCommand: {
                    effectId: event.effect.effectId,
                    stderr: [],
                    stdout: [],
                  },
                }
              : {}),
            stage: "safe-action-in-flight",
          },
        };
      }
      const reviewTransition = (() => {
        switch (state.stage) {
          case "eden-patch-ready":
            return event.effect.type === "review.eden_patch.capture"
              ? "eden-patch-in-flight"
              : null;
          case "git-baseline-ready":
            return event.effect.type === "review.git_snapshot.capture"
              ? "git-baseline-in-flight"
              : null;
          case "check-baseline-ready":
            return event.effect.type === "review.git_check.capture"
              ? "check-baseline-in-flight"
              : null;
          case "git-current-ready":
            return event.effect.type === "review.git_snapshot.capture"
              ? "git-current-in-flight"
              : null;
          case "check-current-ready":
            return event.effect.type === "review.git_check.capture"
              ? "check-current-in-flight"
              : null;
          default:
            return null;
        }
      })();
      if (reviewTransition !== null) {
        if (!isSafeAction(state.action)) return illegal(state, event);
        const action = state.action;
        return {
          ok: true,
          state: {
            ...state,
            action,
            dispatchStarted: false,
            inFlightEffect: event.effect,
            revision: state.revision + 1,
            stage: reviewTransition,
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
    case "effect.dispatch.started":
      if (
        state.phase !== "executing" ||
        !(
          (state.stage === "safe-action-in-flight" &&
            (state.inFlightEffect?.type === "anchor_edit.execute" ||
              state.inFlightEffect?.type === "write_file.execute" ||
              state.inFlightEffect?.type === "run_command.execute" ||
              state.inFlightEffect?.type === "repository_check.execute")) ||
          (state.stage === "action-prepare-in-flight" &&
            (state.inFlightEffect?.type === "anchor_edit.prepare" ||
              state.inFlightEffect?.type === "write_file.prepare" ||
              state.inFlightEffect?.type === "run_command.prepare" ||
              state.inFlightEffect?.type === "repository_check.prepare")) ||
          (state.stage === "eden-patch-in-flight" &&
            state.inFlightEffect?.type === "review.eden_patch.capture") ||
          ((state.stage === "git-baseline-in-flight" || state.stage === "git-current-in-flight") &&
            state.inFlightEffect?.type === "review.git_snapshot.capture") ||
          ((state.stage === "check-baseline-in-flight" ||
            state.stage === "check-current-in-flight") &&
            state.inFlightEffect?.type === "review.git_check.capture")
        ) ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.dispatchStarted
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          dispatchStarted: true,
          revision: state.revision + 1,
        },
      };
    case "anchor_edit.completed":
      if (
        state.phase !== "executing" ||
        state.stage !== "safe-action-in-flight" ||
        state.inFlightEffect?.type !== "anchor_edit.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        !isSafeAction(state.action) ||
        state.action.safeActuation.envelope.operation.type !== "anchor_edit"
      ) {
        return illegal(state, event);
      }
      if (
        event.observation.path !== state.action.safeActuation.envelope.operation.path ||
        event.observation.baseSha256 !== state.action.safeActuation.envelope.operation.baseSha256 ||
        event.observation.desiredSha256 !==
          state.action.safeActuation.envelope.operation.desiredSha256 ||
        event.observation.byteLength !==
          state.action.safeActuation.envelope.operation.desiredByteLength
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          dispatchStarted: state.dispatchStarted || event.recovered,
          inFlightEffect: null,
          revision: state.revision + 1,
          stage: "git-current-ready",
        },
      };
    case "write_file.completed":
      if (
        state.phase !== "executing" ||
        state.stage !== "safe-action-in-flight" ||
        state.inFlightEffect?.type !== "write_file.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        !isSafeAction(state.action) ||
        state.action.safeActuation.envelope.operation.type !== "write_file"
      ) {
        return illegal(state, event);
      }
      if (
        event.observation.path !== state.action.safeActuation.envelope.operation.path ||
        event.observation.sha256 !== state.action.safeActuation.envelope.operation.sha256 ||
        event.observation.byteLength !== state.action.safeActuation.envelope.operation.byteLength
      ) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          dispatchStarted: state.dispatchStarted || event.recovered,
          inFlightEffect: null,
          revision: state.revision + 1,
          stage: "git-current-ready",
        },
      };
    case "run_command.output": {
      if (
        state.phase !== "executing" ||
        !("model" in state) ||
        state.stage !== "safe-action-in-flight" ||
        state.inFlightEffect?.type !== "run_command.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.runCommand?.effectId !== event.effectId ||
        !isSafeAction(state.action) ||
        state.action.safeActuation.envelope.operation.type !== "run_command"
      ) {
        return illegal(state, event);
      }
      const content = decodeUtf8Base64(event.contentBase64, event.byteLength);
      if (content === null) return illegal(state, event);
      const previous = state.runCommand[event.stream];
      if (event.index !== previous.length) return illegal(state, event);
      const next = [...previous, content];
      if (new TextEncoder().encode(next.join("")).byteLength > 65_536) {
        return illegal(state, event);
      }
      return {
        ok: true,
        state: {
          ...state,
          revision: state.revision + 1,
          runCommand: { ...state.runCommand, [event.stream]: next },
        },
      };
    }
    case "run_command.completed": {
      if (
        state.phase !== "executing" ||
        !("model" in state) ||
        state.stage !== "safe-action-in-flight" ||
        state.inFlightEffect?.type !== "run_command.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.runCommand?.effectId !== event.effectId ||
        state.tool?.call.name !== "run_command" ||
        !isSafeAction(state.action) ||
        state.action.safeActuation.envelope.operation.type !== "run_command"
      ) {
        return illegal(state, event);
      }
      const stdout = state.runCommand.stdout.join("");
      const stderr = state.runCommand.stderr.join("");
      const stdoutBytes = new TextEncoder().encode(stdout).byteLength;
      const stderrBytes = new TextEncoder().encode(stderr).byteLength;
      const observation = event.observation;
      if (
        stdoutBytes !== observation.stdoutBytes ||
        stderrBytes !== observation.stderrBytes ||
        Date.parse(observation.startedAt) > Date.parse(observation.completedAt) ||
        (observation.outcome === "exited") !== (observation.exitCode !== null)
      ) {
        return illegal(state, event);
      }
      if (observation.cleanupStatus !== "complete" || observation.outcome === "cleanup_failed") {
        return {
          ok: true,
          state: terminal(
            { ...state, inFlightEffect: null },
            {
              error: {
                code: "command_cleanup_unconfirmed",
                message: "The approved command did not produce a confirmed complete cleanup.",
                recoverability: "ask-user",
                suggestedActions: ["Inspect the durable command output and host process state."],
              },
              state: "blocked",
            },
          ),
        };
      }
      const operation = state.action.safeActuation.envelope.operation;
      const result: RepositoryToolResult = {
        data: {
          actionId: state.action.actionId,
          cleanupStatus: observation.cleanupStatus,
          completedAt: observation.completedAt,
          cwd: operation.cwd,
          executablePath: operation.executable.path,
          exitCode: observation.exitCode,
          outcome: observation.outcome,
          startedAt: observation.startedAt,
          stderr,
          stderrBytes,
          stderrSha256: observation.stderrSha256,
          stdout,
          stdoutBytes,
          stdoutSha256: observation.stdoutSha256,
        },
        name: "run_command",
        status: "completed",
        toolCallId: state.tool.call.toolCallId,
      };
      const commandOutputBytes = stdoutBytes + stderrBytes;
      const modelVisibleToolContentBytes = observedModelVisibleToolBytes(result);
      if (
        state.codingBudget !== undefined &&
        (state.codingBudget.usage.commandOutputBytes + commandOutputBytes >
          state.codingBudget.grant.commandOutputBytes ||
          state.codingBudget.usage.modelVisibleToolContentBytes + modelVisibleToolContentBytes >
            state.codingBudget.grant.modelVisibleToolContentBytes)
      ) {
        return illegal(state, event);
      }
      const tool = { call: state.tool.call, result };
      return {
        ok: true,
        state: {
          ...state,
          ...(state.codingBudget === undefined
            ? {}
            : {
                codingBudget: {
                  ...state.codingBudget,
                  usage: {
                    ...state.codingBudget.usage,
                    commandOutputBytes:
                      state.codingBudget.usage.commandOutputBytes + commandOutputBytes,
                    modelVisibleToolContentBytes:
                      state.codingBudget.usage.modelVisibleToolContentBytes +
                      modelVisibleToolContentBytes,
                  },
                },
              }),
          conversation: [...state.conversation, { ...tool, role: "tool" }],
          inFlightEffect: null,
          modelStep: state.modelStep + 1,
          revision: state.revision + 1,
          stage: "model-ready",
          tool,
          tools: [...state.tools.slice(0, -1), tool],
        },
      };
    }
    case "review.eden_patch.captured":
      if (
        state.phase !== "executing" ||
        state.stage !== "eden-patch-in-flight" ||
        state.inFlightEffect?.type !== "review.eden_patch.capture" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.inFlightEffect.actionId !== event.actionId ||
        !isSafeAction(state.action) ||
        state.safeReview === undefined ||
        state.safeReview.edenPatch !== null
      ) {
        return illegal(state, event);
      }
      if (event.patch.state === "blocked") {
        return {
          ok: true,
          state: terminal(
            {
              ...state,
              inFlightEffect: null,
              safeReview: { ...state.safeReview, edenPatch: event.patch },
            },
            { error: event.patch.error, state: "blocked" },
          ),
        };
      }
      return {
        ok: true,
        state: {
          ...state,
          inFlightEffect: null,
          revision: state.revision + 1,
          safeReview: { ...state.safeReview, edenPatch: event.patch },
          stage: "git-baseline-ready",
        },
      };
    case "review.git_snapshot.captured": {
      const expectedStage =
        event.phase === "baseline" ? "git-baseline-in-flight" : "git-current-in-flight";
      if (
        state.phase !== "executing" ||
        state.stage !== expectedStage ||
        state.inFlightEffect?.type !== "review.git_snapshot.capture" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.inFlightEffect.actionId !== event.actionId ||
        state.inFlightEffect.phase !== event.phase ||
        !isSafeAction(state.action) ||
        state.safeReview === undefined ||
        (event.phase === "current" &&
          (state.safeReview.baselineGit === null ||
            state.safeReview.baselineGit.head !== event.snapshot.head))
      ) {
        return illegal(state, event);
      }
      if (event.snapshot.trackedPatch.state === "blocked") {
        return {
          ok: true,
          state: terminal(
            {
              ...state,
              inFlightEffect: null,
              safeReview:
                event.phase === "baseline"
                  ? { ...state.safeReview, baselineGit: event.snapshot }
                  : { ...state.safeReview, currentGit: event.snapshot },
            },
            { error: event.snapshot.trackedPatch.error, state: "blocked" },
          ),
        };
      }
      return {
        ok: true,
        state: {
          ...state,
          inFlightEffect: null,
          revision: state.revision + 1,
          safeReview:
            event.phase === "baseline"
              ? { ...state.safeReview, baselineGit: event.snapshot }
              : { ...state.safeReview, currentGit: event.snapshot },
          stage: event.phase === "baseline" ? "check-baseline-ready" : "check-current-ready",
        },
      };
    }
    case "review.git_check.completed": {
      const expectedStage =
        event.phase === "baseline" ? "check-baseline-in-flight" : "check-current-in-flight";
      if (
        state.phase !== "executing" ||
        state.stage !== expectedStage ||
        state.inFlightEffect?.type !== "review.git_check.capture" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.inFlightEffect.actionId !== event.actionId ||
        state.inFlightEffect.phase !== event.phase ||
        state.inFlightEffect.head !== event.check.head ||
        !isSafeAction(state.action) ||
        state.safeReview === undefined
      ) {
        return illegal(state, event);
      }
      const safeReview =
        event.phase === "baseline"
          ? { ...state.safeReview, baselineCheck: event.check }
          : { ...state.safeReview, currentCheck: event.check };
      const action = state.action;
      if (event.phase === "baseline") {
        return {
          ok: true,
          state: {
            ...state,
            action,
            inFlightEffect: null,
            phase: "awaiting-approval",
            revision: state.revision + 1,
            safeReview,
          },
        };
      }
      if ("model" in state && state.codingBudget !== undefined) {
        const call = state.tool?.call;
        const operation = action.safeActuation.envelope.operation;
        if (
          call === undefined ||
          (call.name !== "anchor_edit" && call.name !== "write_file") ||
          (operation.type !== "anchor_edit" && operation.type !== "write_file") ||
          call.name !== operation.type
        ) {
          return illegal(state, event);
        }
        const result: RepositoryToolResult = {
          data: {
            actionId: action.actionId,
            byteLength:
              operation.type === "anchor_edit" ? operation.desiredByteLength : operation.byteLength,
            contentHash:
              operation.type === "anchor_edit" ? operation.desiredSha256 : operation.sha256,
            path: operation.path,
            reviewStatus: event.check.status === "passed" ? "passed" : "diagnostics",
          },
          name: call.name,
          status: "completed",
          toolCallId: call.toolCallId,
        };
        const tool = { call, result };
        const codingBudget = {
          ...state.codingBudget,
          usage: {
            ...state.codingBudget.usage,
            modelVisibleToolContentBytes:
              state.codingBudget.usage.modelVisibleToolContentBytes +
              observedModelVisibleToolBytes(result),
          },
        };
        return {
          ok: true,
          state: {
            ...state,
            action,
            codingBudget,
            conversation: [...state.conversation, { ...tool, role: "tool" }],
            inFlightEffect: null,
            modelStep: state.modelStep + 1,
            revision: state.revision + 1,
            safeReview,
            stage: "model-ready",
            tool,
            tools: [...state.tools.slice(0, -1), tool],
          },
        };
      }
      return {
        ok: true,
        state: terminal(
          { ...state, action, inFlightEffect: null, safeReview },
          {
            answer:
              event.check.status === "passed"
                ? "The approved edit is complete; review and diff-check are available."
                : "The approved edit is complete; review includes diff-check diagnostics.",
            state: "completed",
          },
        ),
      };
    }
    case "repository.check.lifecycle":
      if (
        state.phase !== "executing" ||
        state.stage !== "safe-action-in-flight" ||
        state.inFlightEffect?.type !== "repository_check.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        !isSafeAction(state.action) ||
        state.action.actionId !== event.actionId ||
        state.action.safeActuation.envelope.kind !== "repository_check_v1"
      ) {
        return illegal(state, event);
      }
      {
        const order = [
          "awaiting_approval",
          "preparing",
          "creating",
          "created",
          "running",
          "exited",
          "result_decoded",
          "cleaning",
          "review",
        ] as const;
        const previous = state.repositoryCheck?.state ?? "awaiting_approval";
        if (
          event.state === "awaiting_approval" ||
          event.state === "review" ||
          order.indexOf(event.state) < order.indexOf(previous) ||
          (state.repositoryCheck?.lifecycle.length ?? 0) >= 15
        ) {
          return illegal(state, event);
        }
      }
      return {
        ok: true,
        state: {
          ...state,
          repositoryCheck: {
            actionId: event.actionId,
            effectId: event.effectId,
            lifecycle: [
              ...(state.repositoryCheck?.lifecycle ?? []),
              { observedAt: event.observedAt, state: event.state },
            ],
            receipt: null,
            result: null,
            state: event.state,
          },
          revision: state.revision + 1,
        },
      };
    case "repository.check.completed": {
      if (
        state.phase !== "executing" ||
        state.stage !== "safe-action-in-flight" ||
        state.inFlightEffect?.type !== "repository_check.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        !isSafeAction(state.action) ||
        state.action.safeActuation.envelope.kind !== "repository_check_v1"
      ) {
        return illegal(state, event);
      }
      const action = state.action.safeActuation.envelope;
      if (
        event.result.actionId !== action.actionId ||
        event.result.effectId !== event.effectId ||
        event.result.checkName !== action.operation.checkName ||
        event.result.inputManifestDigest !== action.repositorySnapshot.digest ||
        event.result.imageIndexDigest !== action.toolchain.imageIndexDigest ||
        event.result.platformManifestDigest !== action.toolchain.platformManifestDigest ||
        event.result.profileRevision !== action.profile.profileRevision ||
        event.receipt.actionId !== action.actionId ||
        event.receipt.effectId !== event.effectId ||
        event.receipt.receiptId !== event.result.receiptId ||
        (event.result.outcome !== "cleanup_failed" &&
          event.receipt.resultOutcome !== event.result.outcome)
      ) {
        return illegal(state, event);
      }
      if ("model" in state) {
        if (state.tool?.call.name !== "repository_check") return illegal(state, event);
        const result: RepositoryToolResult = {
          data: {
            actionId: event.result.actionId,
            checkName: event.result.checkName,
            cleanupStatus: event.result.cleanup.status,
            exitCode: event.result.exitCode,
            imageIndexDigest: event.result.imageIndexDigest,
            inputManifestDigest: event.result.inputManifestDigest,
            outcome: event.result.outcome,
            platformManifestDigest: event.result.platformManifestDigest,
            profileRevision: event.result.profileRevision,
            stderrSha256: event.result.stderrSha256,
            stdoutSha256: event.result.stdoutSha256,
          },
          name: "repository_check",
          status: "completed",
          toolCallId: state.tool.call.toolCallId,
        };
        const tool = { call: state.tool.call, result };
        return {
          ok: true,
          state: {
            ...state,
            conversation: [...state.conversation, { ...tool, role: "tool" }],
            inFlightEffect: null,
            modelStep: state.modelStep + 1,
            repositoryCheck: {
              actionId: action.actionId,
              effectId: event.effectId,
              lifecycle: [
                ...(state.repositoryCheck?.lifecycle ?? []),
                { observedAt: event.result.cleanup.completedAt, state: "review" },
              ],
              receipt: event.receipt,
              result: event.result,
              state: "review",
            },
            revision: state.revision + 1,
            stage: "model-ready",
            tool,
            tools: [...state.tools.slice(0, -1), tool],
          },
        };
      }
      return {
        ok: true,
        state: terminal(
          {
            ...state,
            inFlightEffect: null,
            repositoryCheck: {
              actionId: action.actionId,
              effectId: event.effectId,
              lifecycle: [
                ...(state.repositoryCheck?.lifecycle ?? []),
                { observedAt: event.result.cleanup.completedAt, state: "review" },
              ],
              receipt: event.receipt,
              result: event.result,
              state: "review",
            },
          },
          {
            answer: `The named repository check completed with outcome ${event.result.outcome}.`,
            state: "completed",
          },
        ),
      };
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
        const calls = event.observation.toolCalls;
        const actionProposalCount = calls.filter(
          (call) =>
            call.name === "anchor_edit" ||
            call.name === "write_file" ||
            call.name === "run_command" ||
            call.name === "repository_check",
        ).length;
        const declaredToolContentBytes = calls.reduce(
          (total, call) => total + declaredModelVisibleToolBytes(call),
          0,
        );
        const codingBudget =
          state.codingBudget === undefined
            ? undefined
            : {
                ...state.codingBudget,
                usage: {
                  ...state.codingBudget.usage,
                  actionProposals: state.codingBudget.usage.actionProposals + actionProposalCount,
                  modelSteps: state.codingBudget.usage.modelSteps + 1,
                  toolCalls: state.codingBudget.usage.toolCalls + calls.length,
                },
              };
        if (
          codingBudget !== undefined &&
          (codingBudget.usage.modelSteps > codingBudget.grant.modelSteps ||
            (calls.length > 0 && state.modelStep >= codingBudget.grant.modelSteps))
        ) {
          return {
            ok: true,
            state: terminal(
              { ...state, attempts },
              {
                error: {
                  code: "model_tool_budget_exceeded",
                  message: "The model exceeded the durable usable-coding grant.",
                  recoverability: "ask-user",
                  suggestedActions: ["Start a new task with a sufficient explicit grant."],
                },
                state: "blocked",
              },
            ),
          };
        }
        if (
          codingBudget !== undefined &&
          (codingBudget.usage.toolCalls > codingBudget.grant.toolCalls ||
            codingBudget.usage.actionProposals > codingBudget.grant.actionProposals ||
            (calls.some((batchCall) => batchCall.name === "run_command") &&
              codingBudget.usage.commandOutputBytes + 131_072 >
                codingBudget.grant.commandOutputBytes) ||
            codingBudget.usage.modelVisibleToolContentBytes + declaredToolContentBytes >
              codingBudget.grant.modelVisibleToolContentBytes)
        ) {
          const rejected = calls.map((batchCall) => ({
            call: batchCall,
            result: {
              error: {
                code: "model_tool_budget_exceeded",
                message:
                  "The complete tool request was rejected before dispatch because it exceeded the durable run grant.",
                recoverability: "retry" as const,
                suggestedActions: [
                  "Continue without tools or request fewer tools in a later model step.",
                ],
              },
              name: batchCall.name,
              status: "failed" as const,
              toolCallId: batchCall.toolCallId,
            },
          }));
          const last = rejected.at(-1);
          if (last === undefined) return illegal(state, event);
          return {
            ok: true,
            state: {
              ...state,
              attempts,
              codingBudget: {
                ...codingBudget,
                usage: {
                  ...codingBudget.usage,
                  actionProposals: state.codingBudget?.usage.actionProposals ?? 0,
                  toolCalls: state.codingBudget?.usage.toolCalls ?? 0,
                },
              },
              conversation: [
                ...state.conversation,
                {
                  content: event.observation.text,
                  privateContinuity: event.observation.privateContinuity,
                  role: "assistant",
                  toolCalls: calls,
                },
                ...rejected.map((exchange) => ({ ...exchange, role: "tool" as const })),
              ],
              inFlightEffect: null,
              modelStep: state.modelStep + 1,
              revision: state.revision + 1,
              stage: "model-ready",
              tool: last,
              tools: [...state.tools, ...rejected],
            },
          };
        }
        const budgetedState =
          codingBudget === undefined
            ? { ...state, attempts }
            : { ...state, attempts, codingBudget };
        if (event.observation.finishStatus === "stop") {
          if (event.observation.text.length === 0) return illegal(state, event);
          return {
            ok: true,
            state: terminal(budgetedState, { answer: event.observation.text, state: "completed" }),
          };
        }
        const call = calls[0];
        if (call === undefined) return illegal(state, event);
        if (codingBudget === undefined && (state.modelStep >= 4 || state.tools.length >= 4)) {
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
        if (calls.length > 1) {
          const eligible =
            state.model.multiCallCapability === "bounded_read_only_v1" &&
            codingBudget !== undefined &&
            calls.length <= codingBudget.policy.maxReadOnlyCallsPerStep &&
            calls.every(isReadOnlyRepositoryCall);
          if (!eligible) {
            const rejectedBudget =
              codingBudget === undefined
                ? undefined
                : {
                    ...codingBudget,
                    usage: {
                      ...codingBudget.usage,
                      actionProposals: state.codingBudget?.usage.actionProposals ?? 0,
                      toolCalls: state.codingBudget?.usage.toolCalls ?? 0,
                    },
                  };
            const rejected = calls.map((batchCall) => ({
              call: batchCall,
              result: {
                error: {
                  code: "ineligible_tool_batch",
                  message:
                    "The complete batch was rejected before dispatch because it was not independent and read-only.",
                  recoverability: "retry" as const,
                  suggestedActions: ["Re-plan effects as singleton calls in a later model step."],
                },
                name: batchCall.name,
                status: "failed" as const,
                toolCallId: batchCall.toolCallId,
              },
            }));
            const last = rejected.at(-1);
            if (last === undefined) return illegal(state, event);
            return {
              ok: true,
              state: {
                ...state,
                attempts,
                ...(rejectedBudget === undefined ? {} : { codingBudget: rejectedBudget }),
                conversation: [
                  ...state.conversation,
                  {
                    content: event.observation.text,
                    privateContinuity: event.observation.privateContinuity,
                    role: "assistant",
                    toolCalls: calls,
                  },
                  ...rejected.map((exchange) => ({ ...exchange, role: "tool" as const })),
                ],
                inFlightEffect: null,
                modelStep: state.modelStep + 1,
                revision: state.revision + 1,
                stage: "model-ready",
                tool: last,
                tools: [...state.tools, ...rejected],
              },
            };
          }
          const pending = calls.map((batchCall) => ({ call: batchCall, result: null }));
          return {
            ok: true,
            state: {
              ...budgetedState,
              conversation: [
                ...state.conversation,
                {
                  content: event.observation.text,
                  privateContinuity: event.observation.privateContinuity,
                  role: "assistant",
                  toolCalls: calls,
                },
              ],
              inFlightEffect: null,
              revision: state.revision + 1,
              stage: "tool-batch-ready",
              tool: null,
              toolBatch: {
                calls,
                results: calls.map(() => null),
                started: calls.map(() => false),
              },
              tools: [...state.tools, ...pending],
            },
          };
        }
        const tool = { call, result: null };
        if (
          call.name === "repository_check" &&
          state.tools.some((exchange) => exchange.call.name === "repository_check")
        ) {
          return {
            ok: true,
            state: terminal(
              { ...state, attempts },
              {
                error: {
                  code: "repository_check_budget_exceeded",
                  message: "Only one named repository check may be proposed in this run.",
                  recoverability: "ask-user",
                  suggestedActions: ["Start a new task for another named repository check."],
                },
                state: "blocked",
              },
            ),
          };
        }
        if (
          call.name === "anchor_edit" ||
          call.name === "write_file" ||
          call.name === "run_command" ||
          call.name === "repository_check"
        ) {
          if (
            call.name === "anchor_edit" &&
            state.action !== null &&
            state.action.safeActuation.parentActionId !== null
          ) {
            return {
              ok: true,
              state: terminal(
                { ...state, attempts },
                {
                  error: {
                    code: "denial_lineage_exhausted",
                    message: "This denial lineage already used its one narrower proposal.",
                    recoverability: "ask-user",
                    suggestedActions: ["Review the denied actions or start a new task."],
                  },
                  state: "blocked",
                },
              ),
            };
          }
          return {
            ok: true,
            state: {
              ...budgetedState,
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
              stage: "action-prepare-ready",
              tool,
              tools: [...state.tools, tool],
            },
          };
        }
        return {
          ok: true,
          state: {
            ...budgetedState,
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
      if (
        event.result.status === "failed" &&
        !(
          "model" in state &&
          state.codingBudget !== undefined &&
          event.result.error.recoverability === "retry"
        )
      ) {
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
        const codingBudget =
          state.codingBudget === undefined
            ? undefined
            : {
                ...state.codingBudget,
                usage: {
                  ...state.codingBudget.usage,
                  modelVisibleToolContentBytes:
                    state.codingBudget.usage.modelVisibleToolContentBytes +
                    observedModelVisibleToolBytes(event.result),
                },
              };
        return {
          ok: true,
          state: {
            ...state,
            ...(codingBudget === undefined ? {} : { codingBudget }),
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
    case "repository.tool.batch.item.started": {
      if (
        state.phase !== "executing" ||
        !("model" in state) ||
        state.stage !== "tool-batch-in-flight" ||
        state.inFlightEffect?.type !== "repository.tool.batch.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.toolBatch === undefined ||
        event.index >= state.toolBatch.calls.length ||
        state.toolBatch.started[event.index] !== false
      ) {
        return illegal(state, event);
      }
      const started = [...state.toolBatch.started];
      started[event.index] = true;
      return {
        ok: true,
        state: {
          ...state,
          revision: state.revision + 1,
          toolBatch: { ...state.toolBatch, started },
        },
      };
    }
    case "repository.tool.batch.item.completed": {
      if (
        state.phase !== "executing" ||
        !("model" in state) ||
        state.stage !== "tool-batch-in-flight" ||
        state.inFlightEffect?.type !== "repository.tool.batch.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.toolBatch === undefined ||
        event.index >= state.toolBatch.calls.length ||
        state.toolBatch.started[event.index] !== true ||
        state.toolBatch.results[event.index] !== null ||
        event.result.toolCallId !== state.toolBatch.calls[event.index]?.toolCallId ||
        event.result.name !== state.toolBatch.calls[event.index]?.name
      ) {
        return illegal(state, event);
      }
      const results = [...state.toolBatch.results];
      results[event.index] = event.result;
      const tools = [...state.tools];
      const toolIndex = tools.length - state.toolBatch.calls.length + event.index;
      const call = state.toolBatch.calls[event.index];
      if (call === undefined || toolIndex < 0) return illegal(state, event);
      tools[toolIndex] = { call, result: event.result };
      const codingBudget =
        state.codingBudget === undefined
          ? undefined
          : {
              ...state.codingBudget,
              usage: {
                ...state.codingBudget.usage,
                modelVisibleToolContentBytes:
                  state.codingBudget.usage.modelVisibleToolContentBytes +
                  observedModelVisibleToolBytes(event.result),
              },
            };
      return {
        ok: true,
        state: {
          ...state,
          ...(codingBudget === undefined ? {} : { codingBudget }),
          revision: state.revision + 1,
          toolBatch: { ...state.toolBatch, results },
          tools,
        },
      };
    }
    case "repository.tool.batch.closed": {
      if (
        state.phase !== "executing" ||
        !("model" in state) ||
        state.stage !== "tool-batch-in-flight" ||
        state.inFlightEffect?.type !== "repository.tool.batch.execute" ||
        state.inFlightEffect.effectId !== event.effectId ||
        state.toolBatch === undefined ||
        state.toolBatch.started.some((started) => !started) ||
        state.toolBatch.results.some((result) => result === null)
      ) {
        return illegal(state, event);
      }
      const exchanges = state.toolBatch.calls.map((call, index) => ({
        call,
        result: state.toolBatch?.results[index] ?? null,
      }));
      if (exchanges.some((exchange) => exchange.result === null)) return illegal(state, event);
      const completed = exchanges as readonly {
        readonly call: RepositoryToolCall;
        readonly result: RepositoryToolResult;
      }[];
      const last = completed.at(-1);
      if (last === undefined) return illegal(state, event);
      const blocking = completed.find(
        (exchange) =>
          exchange.result.status === "failed" && exchange.result.error.recoverability !== "retry",
      );
      if (blocking?.result.status === "failed") {
        return {
          ok: true,
          state: terminal(
            {
              ...state,
              conversation: [
                ...state.conversation,
                ...completed.map((exchange) => ({ ...exchange, role: "tool" as const })),
              ],
              inFlightEffect: null,
              tool: last,
              tools: [...state.tools.slice(0, -completed.length), ...completed],
            },
            { error: blocking.result.error, state: "blocked" },
          ),
        };
      }
      return {
        ok: true,
        state: {
          ...state,
          conversation: [
            ...state.conversation,
            ...completed.map((exchange) => ({ ...exchange, role: "tool" as const })),
          ],
          inFlightEffect: null,
          modelStep: state.modelStep + 1,
          revision: state.revision + 1,
          stage: "model-ready",
          tool: last,
          toolBatch: state.toolBatch,
          tools: [...state.tools.slice(0, -completed.length), ...completed],
        },
      };
    }
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

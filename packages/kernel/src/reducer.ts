import { decide } from "./decide.ts";
import { deterministicFakeAction } from "./fake-action.ts";
import type {
  Action,
  KernelEffect,
  KernelEvent,
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
      ...(state.safeReview === undefined ? {} : { safeReview: state.safeReview }),
      ...(state.repositoryCheck === undefined ? {} : { repositoryCheck: state.repositoryCheck }),
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
  if (effect.type === "anchor_edit.execute" && expected.type === "anchor_edit.execute") {
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
                : {
                    data: {
                      parentActionId: action.actionId,
                      reason: "The user denied this exact action digest.",
                    },
                    name: "anchor_edit",
                    status: "denied",
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
      const parentAction = repositoryCheck
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
        safe.approval.expectedRevision !== state.revision + (repositoryCheck ? 1 : 10) ||
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
        state.stage === "action-prepare-ready" &&
        (event.effect.type === "anchor_edit.prepare" ||
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
              state.inFlightEffect?.type === "repository_check.execute")) ||
          (state.stage === "action-prepare-in-flight" &&
            (state.inFlightEffect?.type === "anchor_edit.prepare" ||
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
        if (call.name === "anchor_edit" || call.name === "repository_check") {
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
              stage: "action-prepare-ready",
              tool,
              tools: [...state.tools, tool],
            },
          };
        }
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

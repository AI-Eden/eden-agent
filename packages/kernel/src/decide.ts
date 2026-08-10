import type { KernelEffect, RunState } from "./model.ts";

class UnreachableKernelStateError extends Error {
  readonly name = "UnreachableKernelStateError";
}

function assertNever(value: never): never {
  throw new UnreachableKernelStateError(`Unexpected kernel state: ${JSON.stringify(value)}`);
}

function repositoryCheckEffectId(runId: string, modelStep: number): string {
  return `repository-check-${runId.slice(4, 100)}-${modelStep}`;
}

export function decide(state: RunState): readonly KernelEffect[] {
  switch (state.phase) {
    case "idle":
    case "awaiting-approval":
    case "awaiting-retry":
    case "terminal":
      return [];
    case "executing":
      if ("model" in state) {
        switch (state.stage) {
          case "model-ready":
            return [
              {
                effectId: `${state.runId}:model-step:${state.modelStep}`,
                maxOutputTokens: state.model.maxOutputTokens,
                model: state.model.model,
                profileId: state.model.profileId,
                runId: state.runId,
                step: state.modelStep,
                type: "provider.model.step",
              },
            ];
          case "tool-ready":
            if (state.tool === null) {
              throw new UnreachableKernelStateError(
                "A ready provider tool effect requires a call.",
              );
            }
            return [
              {
                effectId: `${state.runId}:repository-tool:${state.tool.call.toolCallId}`,
                runId: state.runId,
                toolCall: state.tool.call,
                type: "repository.tool.execute",
              },
            ];
          case "tool-batch-ready":
            if (state.toolBatch === undefined || state.toolBatch.calls.length < 2) {
              throw new UnreachableKernelStateError(
                "A ready provider tool batch requires at least two calls.",
              );
            }
            return [
              {
                calls: state.toolBatch.calls,
                effectId: `${state.runId}:repository-tool-batch:${state.modelStep}`,
                runId: state.runId,
                type: "repository.tool.batch.execute",
              },
            ];
          case "action-prepare-ready": {
            if (
              state.tool?.call.name !== "anchor_edit" &&
              state.tool?.call.name !== "write_file" &&
              state.tool?.call.name !== "run_command" &&
              state.tool?.call.name !== "repository_check"
            ) {
              throw new UnreachableKernelStateError(
                "A ready safe-action preparation requires one proposal call.",
              );
            }
            if (state.tool.call.name === "repository_check") {
              const executionEffectId = repositoryCheckEffectId(state.runId, state.modelStep);
              return [
                {
                  effectId: `${executionEffectId}-prepare`,
                  executionEffectId,
                  expectedRevision: state.revision + 3,
                  proposalRevision:
                    (state.action?.safeActuation.envelope.proposalRevision ?? 0) + 1,
                  runId: state.runId,
                  toolCall: state.tool.call,
                  type: "repository_check.prepare",
                  workspace: state.workspace,
                },
              ];
            }
            if (state.tool.call.name === "write_file") {
              return [
                {
                  effectId: `${state.runId}:write-file-prepare:${state.tool.call.toolCallId}`,
                  expectedRevision: state.revision + 12,
                  proposalRevision: 1,
                  runId: state.runId,
                  toolCall: state.tool.call,
                  type: "write_file.prepare",
                  workspace: state.workspace,
                },
              ];
            }
            if (state.tool.call.name === "run_command") {
              return [
                {
                  effectId: `${state.runId}:run-command-prepare:${state.tool.call.toolCallId}`,
                  expectedRevision: state.revision + 3,
                  proposalRevision: 1,
                  runId: state.runId,
                  toolCall: state.tool.call,
                  type: "run_command.prepare",
                  workspace: state.workspace,
                },
              ];
            }
            const parent = state.action;
            return [
              {
                effectId: `${state.runId}:anchor-edit-prepare:${state.tool.call.toolCallId}`,
                expectedRevision: state.revision + 12,
                parentActionId: parent?.actionId ?? null,
                proposalRevision: (parent?.safeActuation.envelope.proposalRevision ?? 0) + 1,
                runId: state.runId,
                toolCall: state.tool.call,
                type: "anchor_edit.prepare",
                workspace: state.workspace,
              },
            ];
          }
          case "safe-action-ready":
            if (state.action === null) {
              throw new UnreachableKernelStateError(
                "A safe action effect requires an approved action.",
              );
            }
            return state.action.safeActuation.envelope.kind === "repository_check_v1"
              ? [
                  {
                    effectId: repositoryCheckEffectId(state.runId, state.modelStep),
                    envelope: state.action.safeActuation.envelope,
                    runId: state.runId,
                    type: "repository_check.execute" as const,
                  },
                ]
              : state.action.safeActuation.envelope.kind === "write_file"
                ? [
                    {
                      effectId: `${state.runId}:write-file:${state.action.actionId}`,
                      envelope: state.action.safeActuation.envelope,
                      runId: state.runId,
                      type: "write_file.execute" as const,
                    },
                  ]
                : state.action.safeActuation.envelope.kind === "run_command"
                  ? [
                      {
                        effectId: `${state.runId}:run-command:${state.action.actionId}`,
                        envelope: state.action.safeActuation.envelope,
                        runId: state.runId,
                        type: "run_command.execute" as const,
                      },
                    ]
                  : [
                      {
                        effectId: `${state.runId}:anchor-edit:${state.action.actionId}`,
                        envelope: state.action.safeActuation.envelope,
                        runId: state.runId,
                        type: "anchor_edit.execute" as const,
                      },
                    ];
          case "eden-patch-ready":
            if (state.action === null) {
              throw new UnreachableKernelStateError("Eden patch capture requires an action.");
            }
            return [
              {
                actionId: state.action.actionId,
                effectId: `${state.runId}:eden-patch:${state.action.actionId}`,
                envelope: state.action.safeActuation.envelope,
                runId: state.runId,
                type: "review.eden_patch.capture",
              },
            ];
          case "git-baseline-ready":
          case "git-current-ready":
            if (state.action === null) {
              throw new UnreachableKernelStateError("Git review capture requires an action.");
            }
            return [
              {
                actionId: state.action.actionId,
                effectId: `${state.runId}:git-${state.stage === "git-baseline-ready" ? "baseline" : "current"}:${state.action.actionId}`,
                expectedHead:
                  state.stage === "git-baseline-ready"
                    ? null
                    : (state.safeReview?.baselineGit?.head ?? null),
                phase: state.stage === "git-baseline-ready" ? "baseline" : "current",
                runId: state.runId,
                type: "review.git_snapshot.capture",
              },
            ];
          case "check-baseline-ready":
          case "check-current-ready": {
            if (state.action === null || state.safeReview === undefined) {
              throw new UnreachableKernelStateError("Git check capture requires review state.");
            }
            const phase = state.stage === "check-baseline-ready" ? "baseline" : "current";
            const snapshot =
              phase === "baseline" ? state.safeReview.baselineGit : state.safeReview.currentGit;
            if (snapshot === null) {
              throw new UnreachableKernelStateError("Git check capture requires its snapshot.");
            }
            return [
              {
                actionId: state.action.actionId,
                effectId: `${state.runId}:check-${phase}:${state.action.actionId}`,
                head: snapshot.head,
                phase,
                runId: state.runId,
                type: "review.git_check.capture",
              },
            ];
          }
          case "action-prepare-in-flight":
          case "approval-consume-ready":
          case "check-baseline-in-flight":
          case "check-current-in-flight":
          case "eden-patch-in-flight":
          case "git-baseline-in-flight":
          case "git-current-in-flight":
          case "model-awaiting-attempt":
          case "model-in-flight":
          case "safe-action-in-flight":
          case "tool-in-flight":
          case "tool-batch-in-flight":
            return [];
          default:
            return assertNever(state);
        }
      }
      switch (state.stage) {
        case "model-ready":
          if (state.tool === null) {
            return [
              {
                effectId: `${state.runId}:fake-model`,
                runId: state.runId,
                task: state.task,
                type: "fake.model.complete",
              },
            ];
          }
          if (state.tool.result === null) {
            throw new UnreachableKernelStateError("A model continuation requires a tool result.");
          }
          return [
            {
              effectId: `${state.runId}:fake-model-continuation`,
              runId: state.runId,
              task: state.task,
              toolResult: state.tool.result,
              type: "fake.model.complete",
            },
          ];
        case "tool-ready":
          if (state.tool === null) {
            throw new UnreachableKernelStateError("A ready tool effect requires a tool call.");
          }
          return [
            {
              effectId: `${state.runId}:repository-tool:${state.tool.call.toolCallId}`,
              runId: state.runId,
              toolCall: state.tool.call,
              type: "repository.tool.execute",
            },
          ];
        case "action-ready":
          return [
            {
              effectId: `${state.runId}:fake-action`,
              runId: state.runId,
              type: "fake.action.execute",
            },
          ];
        case "safe-action-ready":
          if (!("safeActuation" in state.action)) {
            throw new UnreachableKernelStateError(
              "A safe action effect requires a safe action envelope.",
            );
          }
          return [
            {
              effectId: `${state.runId}:anchor-edit:${state.action.actionId}`,
              envelope: state.action.safeActuation.envelope,
              runId: state.runId,
              type: "anchor_edit.execute",
            },
          ];
        case "eden-patch-ready":
          return [
            {
              actionId: state.action.actionId,
              effectId: `${state.runId}:eden-patch:${state.action.actionId}`,
              envelope: state.action.safeActuation.envelope,
              runId: state.runId,
              type: "review.eden_patch.capture",
            },
          ];
        case "git-baseline-ready":
        case "git-current-ready":
          return [
            {
              actionId: state.action.actionId,
              effectId: `${state.runId}:git-${state.stage === "git-baseline-ready" ? "baseline" : "current"}:${state.action.actionId}`,
              expectedHead:
                state.stage === "git-baseline-ready"
                  ? null
                  : (state.safeReview?.baselineGit?.head ?? null),
              phase: state.stage === "git-baseline-ready" ? "baseline" : "current",
              runId: state.runId,
              type: "review.git_snapshot.capture",
            },
          ];
        case "check-baseline-ready":
        case "check-current-ready": {
          const phase = state.stage === "check-baseline-ready" ? "baseline" : "current";
          const snapshot =
            phase === "baseline" ? state.safeReview?.baselineGit : state.safeReview?.currentGit;
          if (snapshot === undefined || snapshot === null) {
            throw new UnreachableKernelStateError("Git check capture requires its snapshot.");
          }
          return [
            {
              actionId: state.action.actionId,
              effectId: `${state.runId}:check-${phase}:${state.action.actionId}`,
              head: snapshot.head,
              phase,
              runId: state.runId,
              type: "review.git_check.capture",
            },
          ];
        }
        case "verification-ready":
          return [
            {
              effectId: `${state.runId}:fake-verification`,
              runId: state.runId,
              type: "fake.verification.run",
            },
          ];
        case "model-in-flight":
        case "tool-in-flight":
        case "action-in-flight":
        case "approval-consume-ready":
        case "check-baseline-in-flight":
        case "check-current-in-flight":
        case "eden-patch-in-flight":
        case "git-baseline-in-flight":
        case "git-current-in-flight":
        case "safe-action-in-flight":
        case "safe-reproposal-ready":
        case "verification-in-flight":
          return [];
        default:
          return assertNever(state);
      }
    default:
      return assertNever(state);
  }
}

import type { KernelEffect, RunState } from "./model.ts";

class UnreachableKernelStateError extends Error {
  readonly name = "UnreachableKernelStateError";
}

function assertNever(value: never): never {
  throw new UnreachableKernelStateError(`Unexpected kernel state: ${JSON.stringify(value)}`);
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
          case "model-awaiting-attempt":
          case "model-in-flight":
          case "tool-in-flight":
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
        case "verification-in-flight":
          return [];
        default:
          return assertNever(state);
      }
    default:
      return assertNever(state);
  }
}

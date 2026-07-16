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
    case "terminal":
      return [];
    case "executing":
      switch (state.stage) {
        case "model-ready":
          return [
            {
              effectId: `${state.runId}:fake-model`,
              runId: state.runId,
              task: state.task,
              type: "fake.model.complete",
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

export interface RunState {
  readonly phase: "idle" | "running" | "paused" | "terminal";
  readonly terminalState?: "succeeded" | "failed" | "blocked" | "cancelled";
}

export type KernelEvent =
  | { readonly type: "run.started" }
  | { readonly type: "run.paused" }
  | { readonly type: "run.failed"; readonly reason: string };

export type KernelEffect =
  | { readonly type: "context.assemble" }
  | { readonly type: "checkpoint.persist" };

export function reduce(state: RunState, event: KernelEvent): RunState {
  switch (event.type) {
    case "run.started":
      return { phase: "running" };
    case "run.paused":
      return { phase: "paused" };
    case "run.failed":
      return { phase: "terminal", terminalState: "failed" };
  }
}

export function decide(state: RunState): readonly KernelEffect[] {
  return state.phase === "running" ? [{ type: "context.assemble" }] : [];
}

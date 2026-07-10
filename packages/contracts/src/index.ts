export type RunId = string & { readonly __brand: "RunId" };

export type ProductCommand =
  | { readonly type: "run.start"; readonly task: string }
  | { readonly type: "run.pause"; readonly runId: RunId }
  | { readonly type: "run.resume"; readonly runId: RunId }
  | { readonly type: "run.cancel"; readonly runId: RunId };

export type ProductEvent =
  | { readonly type: "session.snapshot"; readonly runId: RunId }
  | { readonly type: "phase.changed"; readonly phase: string }
  | { readonly type: "run.terminal"; readonly state: TerminalState };

export type TerminalState = "succeeded" | "failed" | "blocked" | "cancelled";

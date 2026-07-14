export type Action = {
  readonly actionId: string;
  readonly approvalId: string;
  readonly canonicalDisplay: string;
  readonly cwd: string;
  readonly digest: string;
  readonly reason: string;
  readonly scope: string;
};

export type KernelProductError = {
  readonly code: string;
  readonly message: string;
  readonly recoverability: "retry" | "reconfigure" | "ask-user" | "fatal";
  readonly suggestedActions: readonly string[];
};

export type TerminalOutcome =
  | { readonly state: "succeeded"; readonly evidenceRef: string }
  | { readonly state: "failed" | "blocked"; readonly error: KernelProductError }
  | { readonly state: "cancelled" };

export type KernelEffect =
  | { readonly type: "fake.action.execute"; readonly effectId: string; readonly runId: string }
  | { readonly type: "fake.verification.run"; readonly effectId: string; readonly runId: string };

export type KernelEvent =
  | {
      readonly type: "run.started";
      readonly action: Action;
      readonly correlationId: string;
      readonly runId: string;
      readonly task: string;
    }
  | {
      readonly type: "approval.resolved";
      readonly approvalId: string;
      readonly decision: "approve" | "deny";
    }
  | { readonly type: "effect.requested"; readonly effect: KernelEffect }
  | { readonly type: "fake.action.completed"; readonly effectId: string }
  | {
      readonly type: "verification.completed";
      readonly effectId: string;
      readonly evidenceRef: string;
      readonly passed: boolean;
    }
  | { readonly type: "run.cancelled" }
  | { readonly type: "run.blocked"; readonly error: KernelProductError };

export type IdleRunState = {
  readonly phase: "idle";
  readonly revision: 0;
  readonly terminalOutcome: null;
};

type ActiveRunFields = {
  readonly action: Action;
  readonly correlationId: string;
  readonly revision: number;
  readonly runId: string;
  readonly task: string;
  readonly terminalOutcome: null;
};

export type AwaitingApprovalRunState = ActiveRunFields & {
  readonly phase: "awaiting-approval";
};

export type ExecutingRunState = ActiveRunFields & {
  readonly phase: "executing";
  readonly stage:
    | "action-ready"
    | "action-in-flight"
    | "verification-ready"
    | "verification-in-flight";
  readonly inFlightEffect: KernelEffect | null;
};

export type TerminalRunState = Omit<ActiveRunFields, "terminalOutcome"> & {
  readonly phase: "terminal";
  readonly terminalOutcome: TerminalOutcome;
};

export type RunState =
  | IdleRunState
  | AwaitingApprovalRunState
  | ExecutingRunState
  | TerminalRunState;

export type TransitionError = {
  readonly code: "illegal_transition";
  readonly eventType: KernelEvent["type"];
  readonly phase: RunState["phase"];
};

export type TransitionResult =
  | { readonly ok: true; readonly state: RunState }
  | { readonly ok: false; readonly error: TransitionError };

export const initialRunState: IdleRunState = {
  phase: "idle",
  revision: 0,
  terminalOutcome: null,
};

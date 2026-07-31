import type {
  ActionEnvelopeV1,
  ClosedCheckObservation,
  RepositoryToolCall as ContractRepositoryToolCall,
  RepositoryToolResult as ContractRepositoryToolResult,
  GitStatusEntry,
  PatchObservation,
  PolicyDecision,
  RepositoryCheckLifecycleState,
  RepositoryCheckReceiptV1,
  RepositoryCheckResultV1,
} from "@eden/contracts";

export type Action = {
  readonly actionId: string;
  readonly approvalId: string;
  readonly canonicalDisplay: string;
  readonly cwd: string;
  readonly digest: string;
  readonly reason: string;
  readonly scope: string;
};

export type SafeActuationAction = Action & {
  readonly safeActuation: {
    readonly approval: {
      readonly actionDigest: string;
      readonly expectedRevision: number;
      readonly proposalRevision: number;
      readonly state: "available" | "consumed";
    };
    readonly envelope: ActionEnvelopeV1;
    readonly parentActionId: string | null;
    readonly policy: PolicyDecision;
  };
};

export type AnchorEditObservation = {
  readonly baseSha256: string;
  readonly byteLength: number;
  readonly desiredSha256: string;
  readonly path: string;
  readonly state: "completed";
};

export type GitReviewSnapshot = {
  readonly head: string;
  readonly observedAt: string;
  readonly statusEntries: readonly GitStatusEntry[];
  readonly statusHash: string;
  readonly trackedPatch: PatchObservation;
};

export type SafeReviewProgress = {
  readonly baselineCheck: ClosedCheckObservation | null;
  readonly baselineGit: GitReviewSnapshot | null;
  readonly currentCheck: ClosedCheckObservation | null;
  readonly currentGit: GitReviewSnapshot | null;
  readonly edenPatch: PatchObservation | null;
};

export type RepositoryCheckProgress = {
  readonly actionId: string;
  readonly effectId: string;
  readonly lifecycle: readonly {
    readonly observedAt: string;
    readonly state: RepositoryCheckLifecycleState;
  }[];
  readonly receipt: RepositoryCheckReceiptV1 | null;
  readonly result: RepositoryCheckResultV1 | null;
  readonly state: RepositoryCheckLifecycleState;
};

export type RunWorkspace = {
  readonly name: string;
  readonly root: string;
  readonly trust: "trusted";
  readonly workspaceId: string;
};

export type KernelProductError = {
  readonly code: string;
  readonly message: string;
  readonly recoverability: "retry" | "reconfigure" | "ask-user" | "fatal";
  readonly suggestedActions: readonly string[];
};

type DeepReadonly<T> = T extends (...arguments_: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type RepositoryToolCall = DeepReadonly<ContractRepositoryToolCall>;

export type RepositoryToolResult = DeepReadonly<ContractRepositoryToolResult>;

export type RepositoryToolExchange = {
  readonly call: RepositoryToolCall;
  readonly result: RepositoryToolResult | null;
};

export type ModelRunConfiguration = {
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
  readonly model: string;
  readonly profileId: string;
};

export type ModelUsage = {
  readonly completionTokens: number;
  readonly promptTokens: number;
  readonly totalTokens: number;
};

export type ModelConversationItem =
  | { readonly content: string; readonly role: "user" }
  | {
      readonly content: string;
      readonly privateContinuity: string | null;
      readonly role: "assistant";
      readonly toolCalls: readonly RepositoryToolCall[];
    }
  | {
      readonly call: RepositoryToolCall;
      readonly result: RepositoryToolResult;
      readonly role: "tool";
    };

export type ModelContextItem = {
  readonly content: string;
  readonly contextItemId: string;
};

export type ModelAttemptError = {
  readonly code: string;
  readonly message: string;
  readonly recoverability: "retry" | "reconfigure" | "ask-user" | "fatal";
  readonly suggestedActions: readonly string[];
};

export type ModelStepObservation =
  | {
      readonly attemptId: string;
      readonly finishStatus: "stop" | "tool_calls";
      readonly privateContinuity: string | null;
      readonly requestId: string | null;
      readonly status: "completed";
      readonly text: string;
      readonly toolCalls: readonly RepositoryToolCall[];
      readonly usage: ModelUsage | null;
      readonly version: 1;
    }
  | {
      readonly attemptId: string;
      readonly error: ModelAttemptError;
      readonly status: "not_started" | "unknown";
      readonly version: 1;
    }
  | {
      readonly attemptId: string;
      readonly error: ModelAttemptError;
      readonly partialText: string;
      readonly status: "interrupted";
      readonly version: 1;
    };

export type ModelAttempt = {
  readonly attemptId: string;
  readonly observation: ModelStepObservation | null;
  readonly reason: "initial" | "automatic-not-started-retry" | "explicit-retry";
  readonly step: number;
};

export type TerminalOutcome =
  | { readonly state: "succeeded"; readonly evidenceRef: string }
  | { readonly state: "completed"; readonly answer: string }
  | { readonly state: "failed" | "blocked"; readonly error: KernelProductError }
  | { readonly state: "cancelled" };

export type KernelEffect =
  | {
      readonly type: "fake.model.complete";
      readonly effectId: string;
      readonly runId: string;
      readonly task: string;
      readonly toolResult?: RepositoryToolResult;
    }
  | {
      readonly type: "provider.model.step";
      readonly effectId: string;
      readonly maxOutputTokens: number;
      readonly model: string;
      readonly profileId: string;
      readonly runId: string;
      readonly step: number;
    }
  | {
      readonly type: "repository.tool.execute";
      readonly effectId: string;
      readonly runId: string;
      readonly toolCall: RepositoryToolCall;
    }
  | {
      readonly type: "anchor_edit.prepare";
      readonly effectId: string;
      readonly expectedRevision: number;
      readonly parentActionId: string | null;
      readonly proposalRevision: number;
      readonly runId: string;
      readonly toolCall: Extract<RepositoryToolCall, { readonly name: "anchor_edit" }>;
      readonly workspace: RunWorkspace;
    }
  | {
      readonly type: "repository_check.prepare";
      readonly effectId: string;
      readonly executionEffectId: string;
      readonly expectedRevision: number;
      readonly proposalRevision: number;
      readonly runId: string;
      readonly toolCall: Extract<RepositoryToolCall, { readonly name: "repository_check" }>;
      readonly workspace: RunWorkspace;
    }
  | {
      readonly type: "anchor_edit.execute";
      readonly effectId: string;
      readonly envelope: ActionEnvelopeV1;
      readonly runId: string;
    }
  | {
      readonly type: "repository_check.execute";
      readonly effectId: string;
      readonly envelope: Extract<ActionEnvelopeV1, { readonly kind: "repository_check_v1" }>;
      readonly runId: string;
    }
  | {
      readonly type: "review.eden_patch.capture";
      readonly actionId: string;
      readonly effectId: string;
      readonly envelope: ActionEnvelopeV1;
      readonly runId: string;
    }
  | {
      readonly type: "review.git_snapshot.capture";
      readonly actionId: string;
      readonly effectId: string;
      readonly expectedHead: string | null;
      readonly phase: "baseline" | "current";
      readonly runId: string;
    }
  | {
      readonly type: "review.git_check.capture";
      readonly actionId: string;
      readonly effectId: string;
      readonly head: string;
      readonly phase: "baseline" | "current";
      readonly runId: string;
    }
  | { readonly type: "fake.action.execute"; readonly effectId: string; readonly runId: string }
  | { readonly type: "fake.verification.run"; readonly effectId: string; readonly runId: string };

export type KernelEvent =
  | {
      readonly type: "run.started";
      readonly correlationId: string;
      readonly runId: string;
      readonly task: string;
      readonly workspace: RunWorkspace;
      readonly model?: ModelRunConfiguration;
    }
  | {
      readonly type: "approval.resolved";
      readonly approvalId: string;
      readonly decision: "approve" | "deny";
    }
  | {
      readonly type: "safe.action.proposed";
      readonly action: SafeActuationAction;
      readonly effectId: string;
    }
  | {
      readonly type: "approval.consumed";
      readonly actionDigest: string;
      readonly approvalId: string;
      readonly expectedRevision: number;
      readonly proposalRevision: number;
    }
  | { readonly type: "effect.requested"; readonly effect: KernelEffect }
  | {
      readonly type: "effect.dispatch.started";
      readonly effectId: string;
    }
  | {
      readonly type: "anchor_edit.completed";
      readonly effectId: string;
      readonly observation: AnchorEditObservation;
      readonly recovered: boolean;
    }
  | {
      readonly type: "review.eden_patch.captured";
      readonly actionId: string;
      readonly effectId: string;
      readonly patch: PatchObservation;
    }
  | {
      readonly type: "review.git_snapshot.captured";
      readonly actionId: string;
      readonly effectId: string;
      readonly phase: "baseline" | "current";
      readonly snapshot: GitReviewSnapshot;
    }
  | {
      readonly type: "review.git_check.completed";
      readonly actionId: string;
      readonly check: ClosedCheckObservation;
      readonly effectId: string;
      readonly phase: "baseline" | "current";
    }
  | {
      readonly type: "repository.check.lifecycle";
      readonly actionId: string;
      readonly effectId: string;
      readonly observedAt: string;
      readonly state: RepositoryCheckLifecycleState;
    }
  | {
      readonly type: "repository.check.completed";
      readonly effectId: string;
      readonly receipt: RepositoryCheckReceiptV1;
      readonly result: RepositoryCheckResultV1;
    }
  | {
      readonly type: "fake.model.completed";
      readonly action: Action;
      readonly effectId: string;
    }
  | {
      readonly type: "fake.model.tool-requested";
      readonly effectId: string;
      readonly toolCall: RepositoryToolCall;
    }
  | {
      readonly type: "model.context.committed";
      readonly item: ModelContextItem;
    }
  | {
      readonly type: "model.attempt.started";
      readonly attemptId: string;
      readonly effectId: string;
      readonly reason: ModelAttempt["reason"];
    }
  | {
      readonly type: "model.step.completed";
      readonly effectId: string;
      readonly observation: ModelStepObservation;
    }
  | {
      readonly type: "model.retry.requested";
    }
  | {
      readonly type: "repository.tool.completed";
      readonly effectId: string;
      readonly result: RepositoryToolResult;
    }
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
  readonly correlationId: string;
  readonly revision: number;
  readonly runId: string;
  readonly task: string;
  readonly terminalOutcome: null;
  readonly tool: RepositoryToolExchange | null;
  readonly safeReview?: SafeReviewProgress;
  readonly repositoryCheck?: RepositoryCheckProgress;
  readonly workspace: RunWorkspace;
};

export type AwaitingApprovalRunState = ActiveRunFields & {
  readonly action: Action | SafeActuationAction;
  readonly phase: "awaiting-approval";
};

export type ExecutingRunState = ActiveRunFields &
  (
    | {
        readonly action: null;
        readonly phase: "executing";
        readonly stage: "model-ready" | "model-in-flight" | "tool-ready" | "tool-in-flight";
        readonly inFlightEffect: KernelEffect | null;
      }
    | {
        readonly action: Action;
        readonly phase: "executing";
        readonly stage:
          | "action-ready"
          | "action-in-flight"
          | "verification-ready"
          | "verification-in-flight";
        readonly inFlightEffect: KernelEffect | null;
      }
    | {
        readonly action: SafeActuationAction;
        readonly dispatchStarted: boolean;
        readonly phase: "executing";
        readonly stage:
          | "approval-consume-ready"
          | "safe-action-ready"
          | "safe-action-in-flight"
          | "eden-patch-ready"
          | "eden-patch-in-flight"
          | "git-baseline-ready"
          | "git-baseline-in-flight"
          | "check-baseline-ready"
          | "check-baseline-in-flight"
          | "git-current-ready"
          | "git-current-in-flight"
          | "check-current-ready"
          | "check-current-in-flight"
          | "safe-reproposal-ready";
        readonly inFlightEffect: KernelEffect | null;
      }
  );

export type TerminalRunState = Omit<ActiveRunFields, "terminalOutcome"> & {
  readonly action: Action | null;
  readonly phase: "terminal";
  readonly terminalOutcome: TerminalOutcome;
};

type ProviderActiveRunFields = {
  readonly action: SafeActuationAction | null;
  readonly attempts: readonly ModelAttempt[];
  readonly conversation: readonly ModelConversationItem[];
  readonly context: readonly ModelContextItem[];
  readonly correlationId: string;
  readonly model: ModelRunConfiguration;
  readonly modelStep: number;
  readonly revision: number;
  readonly runId: string;
  readonly task: string;
  readonly terminalOutcome: null;
  readonly tool: RepositoryToolExchange | null;
  readonly safeReview?: SafeReviewProgress;
  readonly repositoryCheck?: RepositoryCheckProgress;
  readonly tools: readonly RepositoryToolExchange[];
  readonly workspace: RunWorkspace;
};

export type ProviderExecutingRunState = ProviderActiveRunFields & {
  readonly inFlightEffect: KernelEffect | null;
  readonly phase: "executing";
  readonly stage:
    | "model-ready"
    | "model-awaiting-attempt"
    | "model-in-flight"
    | "tool-ready"
    | "tool-in-flight"
    | "action-prepare-ready"
    | "action-prepare-in-flight"
    | "approval-consume-ready"
    | "safe-action-ready"
    | "safe-action-in-flight"
    | "eden-patch-ready"
    | "eden-patch-in-flight"
    | "git-baseline-ready"
    | "git-baseline-in-flight"
    | "check-baseline-ready"
    | "check-baseline-in-flight"
    | "git-current-ready"
    | "git-current-in-flight"
    | "check-current-ready"
    | "check-current-in-flight";
  readonly dispatchStarted?: boolean;
};

export type ProviderAwaitingApprovalRunState = ProviderActiveRunFields & {
  readonly action: SafeActuationAction;
  readonly inFlightEffect: null;
  readonly phase: "awaiting-approval";
};

export type AwaitingRetryRunState = ProviderActiveRunFields & {
  readonly inFlightEffect: Extract<KernelEffect, { readonly type: "provider.model.step" }>;
  readonly interruption: Extract<
    ModelStepObservation,
    { readonly status: "interrupted" | "not_started" | "unknown" }
  >;
  readonly phase: "awaiting-retry";
};

export type ProviderTerminalRunState = Omit<ProviderActiveRunFields, "terminalOutcome"> & {
  readonly inFlightEffect: null;
  readonly phase: "terminal";
  readonly terminalOutcome: Extract<
    TerminalOutcome,
    { readonly state: "completed" | "blocked" | "cancelled" }
  >;
};

export type RunState =
  | IdleRunState
  | AwaitingApprovalRunState
  | ExecutingRunState
  | TerminalRunState
  | ProviderExecutingRunState
  | ProviderAwaitingApprovalRunState
  | AwaitingRetryRunState
  | ProviderTerminalRunState;

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

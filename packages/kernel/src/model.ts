export type Action = {
  readonly actionId: string;
  readonly approvalId: string;
  readonly canonicalDisplay: string;
  readonly cwd: string;
  readonly digest: string;
  readonly reason: string;
  readonly scope: string;
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

export type RepositoryToolCall =
  | {
      readonly arguments: { readonly continuation: string | null; readonly path: string };
      readonly name: "list_files";
      readonly toolCallId: string;
    }
  | {
      readonly arguments: {
        readonly maxBytes: number;
        readonly offset: number;
        readonly path: string;
      };
      readonly name: "read_file";
      readonly toolCallId: string;
    }
  | {
      readonly arguments: {
        readonly continuation: number | null;
        readonly path: string;
        readonly pattern: string;
      };
      readonly name: "search_repository";
      readonly toolCallId: string;
    }
  | {
      readonly arguments: object;
      readonly name: "git_status";
      readonly toolCallId: string;
    };

export type RepositoryToolResult =
  | {
      readonly data: {
        readonly contentHash: string;
        readonly continuation: string | null;
        readonly entries: readonly (
          | { readonly kind: "directory"; readonly path: string; readonly size: null }
          | { readonly kind: "file"; readonly path: string; readonly size: number }
        )[];
        readonly sourcePath: string;
        readonly truncated: boolean;
        readonly visited: number;
      };
      readonly name: "list_files";
      readonly status: "succeeded";
      readonly toolCallId: string;
    }
  | {
      readonly data: {
        readonly bytesRead: number;
        readonly content: string;
        readonly contentHash: string;
        readonly nextOffset: number | null;
        readonly offset: number;
        readonly sourcePath: string;
        readonly totalBytes: number;
      };
      readonly name: "read_file";
      readonly status: "succeeded";
      readonly toolCallId: string;
    }
  | {
      readonly data: {
        readonly contentHash: string;
        readonly continuation: number | null;
        readonly engine: {
          readonly contentHash: string;
          readonly name: "ripgrep";
          readonly version: string;
        };
        readonly matches: readonly {
          readonly byteColumn: number;
          readonly lineNumber: number;
          readonly path: string;
          readonly preview: string;
        }[];
        readonly sourcePath: string;
        readonly truncated: boolean;
      };
      readonly name: "search_repository";
      readonly status: "succeeded";
      readonly toolCallId: string;
    }
  | {
      readonly data: {
        readonly contentHash: string;
        readonly entries: readonly {
          readonly indexStatus: string;
          readonly kind:
            | "added"
            | "copied"
            | "deleted"
            | "modified"
            | "renamed"
            | "unmerged"
            | "untracked";
          readonly originalPath: string | null;
          readonly path: string;
          readonly worktreeStatus: string;
        }[];
        readonly gitVersion: string;
        readonly sourcePath: ".";
      };
      readonly name: "git_status";
      readonly status: "succeeded";
      readonly toolCallId: string;
    }
  | {
      readonly error: KernelProductError;
      readonly name: "git_status" | "list_files" | "read_file" | "search_repository";
      readonly status: "failed";
      readonly toolCallId: string;
    };

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
  | { readonly type: "effect.requested"; readonly effect: KernelEffect }
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
  readonly workspace: RunWorkspace;
};

export type AwaitingApprovalRunState = ActiveRunFields & {
  readonly action: Action;
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
  );

export type TerminalRunState = Omit<ActiveRunFields, "terminalOutcome"> & {
  readonly action: Action | null;
  readonly phase: "terminal";
  readonly terminalOutcome: TerminalOutcome;
};

type ProviderActiveRunFields = {
  readonly action: null;
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
    | "tool-in-flight";
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

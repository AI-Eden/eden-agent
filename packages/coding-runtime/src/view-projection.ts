import {
  decodeRepositoryToolCall,
  decodeRepositoryToolResult,
  type ProductView,
} from "@eden/contracts";
import type {
  Action,
  KernelProductError,
  RunState,
  SafeActuationAction,
  TerminalOutcome,
} from "@eden/kernel";

export class ProjectionError extends Error {
  readonly name = "ProjectionError";
}

function assertNever(value: never): never {
  throw new ProjectionError(`Unexpected projection variant: ${JSON.stringify(value)}`);
}

function actionSummary(action: Action) {
  return {
    actionId: action.actionId,
    cwd: action.cwd,
    display: action.canonicalDisplay,
    reason: action.reason,
    scope: action.scope,
  };
}

function isSafeAction(action: Action): action is SafeActuationAction {
  return "safeActuation" in action;
}

export function approvalPresentation(action: Action) {
  const authority = !isSafeAction(action)
    ? undefined
    : action.safeActuation.envelope.kind === "repository_check_v1"
      ? {
          budgets: action.safeActuation.envelope.budgets,
          catalogSha256: action.safeActuation.envelope.operation.catalog.sha256,
          checkName: action.safeActuation.envelope.operation.checkName,
          dockerCompatibility: action.safeActuation.envelope.dockerCompatibility,
          executionMode: "docker_container" as const,
          isolation: "linux_container" as const,
          lifetime: "single_use_proposal_revision" as const,
          network: "none" as const,
          policyRuleId: action.safeActuation.policy.ruleId,
          policyRuleSetRevision: "r2-docker-repository-check-v1" as const,
          process: action.safeActuation.envelope.operation.process,
          proposalRevision: action.safeActuation.envelope.proposalRevision,
          repositorySnapshot: {
            byteLength: action.safeActuation.envelope.repositorySnapshot.byteLength,
            digest: action.safeActuation.envelope.repositorySnapshot.digest,
            fileCount: action.safeActuation.envelope.repositorySnapshot.fileCount,
          },
          toolchain: {
            imageIndexDigest: action.safeActuation.envelope.toolchain.imageIndexDigest,
            platformManifestDigest: action.safeActuation.envelope.toolchain.platformManifestDigest,
            profileRevision: action.safeActuation.envelope.toolchain.profileRevision,
            requestedPlatform: action.safeActuation.envelope.toolchain.requestedPlatform,
          },
        }
      : {
          baseSnapshots: action.safeActuation.envelope.baseSnapshots.map((snapshot) => ({
            ...snapshot,
          })),
          executionMode: "trusted_host_policy_only" as const,
          isolation: "none" as const,
          lifetime: "single_use_proposal_revision" as const,
          network:
            action.safeActuation.envelope.operation.type === "run_command"
              ? ("host_unrestricted" as const)
              : ("not_requested" as const),
          policyRuleId: action.safeActuation.policy.ruleId,
          policyRuleSetRevision: action.safeActuation.policy.ruleSetRevision,
          proposalRevision: action.safeActuation.envelope.proposalRevision,
          ...(action.safeActuation.envelope.operation.type === "run_command"
            ? {
                process: {
                  args: [...action.safeActuation.envelope.operation.args],
                  executablePath: action.safeActuation.envelope.operation.executable.path,
                  program: action.safeActuation.envelope.operation.program,
                  timeoutMs: action.safeActuation.envelope.operation.timeoutMs,
                },
              }
            : {}),
        };
  return {
    actionId: action.actionId,
    approvalId: action.approvalId,
    canonicalDisplay: action.canonicalDisplay,
    cwd: action.cwd,
    digest: action.digest,
    reason: action.reason,
    scope: action.scope,
    ...(authority === undefined ? {} : { authority }),
  };
}

function productError(error: KernelProductError) {
  return { ...error, suggestedActions: [...error.suggestedActions] };
}

function productOutcome(outcome: TerminalOutcome): ProductView["terminalOutcome"] {
  switch (outcome.state) {
    case "succeeded":
    case "completed":
    case "cancelled":
      return outcome;
    case "blocked":
    case "failed":
      return { error: productError(outcome.error), state: outcome.state };
    default:
      return assertNever(outcome);
  }
}

export function progress(state: Exclude<RunState, { readonly phase: "idle" }>) {
  switch (state.phase) {
    case "awaiting-approval":
      return {
        completed: 1,
        summary:
          "safeActuation" in state.action
            ? "Awaiting one exact safe-actuation approval."
            : "Awaiting approval for the fake action.",
        total: "safeActuation" in state.action ? 5 : 4,
      };
    case "executing":
      if ("model" in state) {
        const summary =
          state.stage === "tool-ready" || state.stage === "tool-in-flight"
            ? "Reading bounded repository context for the model."
            : state.stage === "action-prepare-ready" || state.stage === "action-prepare-in-flight"
              ? "Capturing and evaluating one closed AnchorEdit proposal."
              : state.stage === "approval-consume-ready"
                ? "Durably consuming the exact single-use approval."
                : state.stage === "safe-action-ready" || state.stage === "safe-action-in-flight"
                  ? "Applying the approved AnchorEdit."
                  : state.stage === "eden-patch-ready" ||
                      state.stage === "eden-patch-in-flight" ||
                      state.stage === "git-baseline-ready" ||
                      state.stage === "git-baseline-in-flight" ||
                      state.stage === "check-baseline-ready" ||
                      state.stage === "check-baseline-in-flight" ||
                      state.stage === "git-current-ready" ||
                      state.stage === "git-current-in-flight" ||
                      state.stage === "check-current-ready" ||
                      state.stage === "check-current-in-flight"
                    ? "Capturing the complete bounded change review."
                    : state.stage === "model-awaiting-attempt"
                      ? "Preparing an explicit provider attempt."
                      : "Generating a repository-grounded answer.";
        return { completed: state.modelStep - 1, summary, total: 4 };
      }
      switch (state.stage) {
        case "model-ready":
        case "model-in-flight":
          return {
            completed: state.tool?.result === null ? 0 : state.tool === null ? 0 : 1,
            summary:
              state.tool === null
                ? "Running the deterministic fake model."
                : "Continuing the deterministic fake model with the repository result.",
            total: 4,
          };
        case "tool-ready":
        case "tool-in-flight":
          return { completed: 0, summary: "Reading bounded repository context.", total: 4 };
        case "action-ready":
        case "action-in-flight":
          return { completed: 2, summary: "Executing the deterministic fake action.", total: 4 };
        case "approval-consume-ready":
          return {
            completed: 2,
            summary: "Durably consuming the exact single-use approval.",
            total: 5,
          };
        case "safe-action-ready":
        case "safe-action-in-flight":
          return { completed: 3, summary: "Applying the approved AnchorEdit.", total: 5 };
        case "eden-patch-ready":
        case "eden-patch-in-flight":
        case "git-baseline-ready":
        case "git-baseline-in-flight":
        case "check-baseline-ready":
        case "check-baseline-in-flight":
        case "git-current-ready":
        case "git-current-in-flight":
        case "check-current-ready":
        case "check-current-in-flight":
          return { completed: 4, summary: "Preparing the complete change review.", total: 5 };
        case "safe-reproposal-ready":
          return {
            completed: 1,
            summary: "The denied action may receive one narrower proposal.",
            total: 5,
          };
        case "verification-ready":
        case "verification-in-flight":
          return { completed: 3, summary: "Verifying the deterministic fake result.", total: 4 };
        default:
          return assertNever(state);
      }
    case "awaiting-retry":
      return {
        completed: state.modelStep - 1,
        summary: "The model attempt requires an explicit retry decision.",
        total: 4,
      };
    case "terminal":
      return {
        completed: 4,
        summary:
          "model" in state
            ? "The repository answer is complete for review."
            : "The deterministic fake task is terminal.",
        total: 4,
      };
    default:
      return assertNever(state);
  }
}

function checks(outcome: ProductView["terminalOutcome"]): ProductView["checks"] {
  if (outcome?.state === "completed") return [];
  if (outcome?.state === "succeeded") {
    return [
      {
        checkId: "check-fake-verification",
        evidenceRef: outcome.evidenceRef,
        name: "Deterministic fake verification",
        requirement: "required",
        status: "passed",
        summary: "Fake verification passed.",
      },
    ];
  }
  return [
    {
      checkId: "check-fake-verification",
      name: "Deterministic fake verification",
      requirement: "required",
      status: outcome === null ? "pending" : "skipped",
      summary:
        outcome === null ? "Fake verification is pending." : "Fake verification did not pass.",
    },
  ];
}

function safeChecks(state: Exclude<RunState, { readonly phase: "idle" }>): ProductView["checks"] {
  if (state.safeReview === undefined) return [];
  const result: ProductView["checks"][number][] = [];
  for (const [phase, check] of [
    ["baseline", state.safeReview.baselineCheck],
    ["current", state.safeReview.currentCheck],
  ] as const) {
    if (check === null) continue;
    result.push({
      checkId: check.checkId,
      name: `Git diff-check (${phase})`,
      requirement: "required",
      status:
        check.status === "passed"
          ? "passed"
          : check.status === "failed"
            ? "failed"
            : "infrastructure-failed",
      summary:
        check.status === "passed"
          ? "No diff-check diagnostics were observed."
          : `${check.diagnostics.length} complete diff-check diagnostic(s) observed.`,
    });
  }
  return result;
}

function safeChangedFiles(
  state: Exclude<RunState, { readonly phase: "idle" }>,
): ProductView["changedFiles"] {
  if (
    state.safeReview?.baselineGit === null ||
    state.safeReview?.currentGit === null ||
    state.safeReview === undefined ||
    state.action === null ||
    !isSafeAction(state.action) ||
    (state.action.safeActuation.envelope.operation.type !== "anchor_edit" &&
      state.action.safeActuation.envelope.operation.type !== "write_file")
  ) {
    return [];
  }
  const baseline = new Set(
    state.safeReview.baselineGit.statusEntries
      .filter((entry) => entry.kind !== "untracked")
      .map((entry) => entry.path),
  );
  const path = state.action.safeActuation.envelope.operation.path;
  const writeFile = state.action.safeActuation.envelope.operation.type === "write_file";
  return state.safeReview.currentGit.statusEntries.flatMap((entry) => {
    if (entry.kind === "untracked") {
      return writeFile && entry.path === path
        ? [{ attribution: "eden" as const, path: entry.path, status: "added" as const }]
        : [];
    }
    const eden = entry.path === path;
    return [
      {
        attribution: eden ? (baseline.has(entry.path) ? "both" : "eden") : "pre_existing",
        path: entry.path,
        status: entry.kind === "copied" ? "renamed" : entry.kind,
      },
    ];
  });
}

function productReview(
  state: Exclude<RunState, { readonly phase: "idle" }>,
): ProductView["review"] {
  if (
    state.safeReview === undefined ||
    state.safeReview.edenPatch === null ||
    state.safeReview.baselineGit === null ||
    state.safeReview.baselineCheck === null ||
    state.safeReview.currentGit === null ||
    state.safeReview.currentCheck === null ||
    state.action === null ||
    !isSafeAction(state.action) ||
    state.action.safeActuation.approval.state !== "consumed"
  ) {
    return undefined;
  }
  const baselineDiagnosticIds = new Set(
    state.safeReview.baselineCheck.diagnostics.map((diagnostic) => diagnostic.diagnosticId),
  );
  return {
    actionDigest: state.action.digest,
    actionId: state.action.actionId,
    approval: {
      approvalId: state.action.approvalId,
      expectedRevision: state.action.safeActuation.approval.expectedRevision,
      proposalRevision: state.action.safeActuation.approval.proposalRevision,
      state: "consumed",
    },
    baselineCheck: state.safeReview.baselineCheck,
    changedFiles: safeChangedFiles(state),
    currentCheck: state.safeReview.currentCheck,
    currentTrackedPatch: state.safeReview.currentGit.trackedPatch,
    edenPatch: state.safeReview.edenPatch,
    executionMode: "trusted_host_policy_only",
    head: state.safeReview.currentGit.head,
    isolation: "none",
    network: "not_requested",
    newlyObservedDiagnostics: state.safeReview.currentCheck.diagnostics
      .filter((diagnostic) => !baselineDiagnosticIds.has(diagnostic.diagnosticId))
      .map((diagnostic) => diagnostic.diagnosticId),
    observedAt: state.safeReview.currentGit.observedAt,
    policy: {
      decision: "ask",
      evaluatedAt: state.action.safeActuation.policy.evaluatedAt,
      reason: state.action.safeActuation.policy.reason,
      ruleId: state.action.safeActuation.policy.ruleId,
      ruleSetRevision: state.action.safeActuation.policy.ruleSetRevision,
    },
    residualRisk: "Trusted-host policy only; no OS isolation or verifier success is claimed.",
    statusHash: state.safeReview.currentGit.statusHash,
    untrackedPaths: state.safeReview.currentGit.statusEntries
      .filter((entry) => entry.kind === "untracked")
      .map((entry) => entry.path),
  };
}

function productTools(state: Exclude<RunState, { readonly phase: "idle" }>): ProductView["tools"] {
  const exchanges = "tools" in state ? state.tools : state.tool === null ? [] : [state.tool];
  if (exchanges.length === 0) return undefined;
  return exchanges.map((exchange) => {
    const call = decodeRepositoryToolCall(exchange.call);
    if (!call.ok) {
      throw new ProjectionError("The repository tool call failed projection validation.");
    }
    if (exchange.result === null) {
      return { call: call.value, result: null, state: "requested" } as const;
    }
    const result = decodeRepositoryToolResult(exchange.result);
    if (!result.ok) {
      throw new ProjectionError("The repository tool result failed projection validation.");
    }
    return { call: call.value, result: result.value, state: "completed" } as const;
  });
}

function providerProjection(state: Exclude<RunState, { readonly phase: "idle" }>) {
  if (!("model" in state)) return {};
  const attempts = state.attempts.map((attempt) => ({
    attemptId: attempt.attemptId,
    error:
      attempt.observation === null || attempt.observation.status === "completed"
        ? null
        : productError(attempt.observation.error),
    reason: attempt.reason,
    state: attempt.observation?.status ?? ("started" as const),
    step: attempt.step,
    usage:
      attempt.observation?.status === "completed" && attempt.observation.usage !== null
        ? { ...attempt.observation.usage, state: "exact" as const }
        : { state: "unknown" as const },
  }));
  const conversation: NonNullable<ProductView["conversation"]> = [
    {
      content: state.task,
      role: "user",
      turnId: `user-${state.runId}`,
    },
  ];
  let assistantIndex = 0;
  for (const item of state.conversation) {
    if (item.role === "user" && "messageId" in item) {
      conversation.push({
        content: item.content,
        messageId: item.messageId,
        role: "user",
        source: item.source,
        turnId: item.turnId,
      });
      continue;
    }
    if (item.role !== "assistant" || item.content.length === 0) continue;
    const attempt = state.attempts.filter((entry) => entry.step === assistantIndex + 1).at(-1);
    if (attempt === undefined) continue;
    conversation.push({
      attemptId: attempt.attemptId,
      content: item.content,
      role: "assistant",
      status: "complete",
      turnId: `assistant-${attempt.attemptId}`,
    });
    assistantIndex += 1;
  }
  if (state.phase === "terminal" && state.terminalOutcome.state === "completed") {
    const attempt = state.attempts.at(-1);
    if (attempt !== undefined) {
      conversation.push({
        attemptId: attempt.attemptId,
        content: state.terminalOutcome.answer,
        role: "assistant",
        status: "complete",
        turnId: `assistant-${attempt.attemptId}-outcome`,
      });
    }
  } else if (state.phase === "awaiting-retry" && state.interruption.status === "interrupted") {
    conversation.push({
      attemptId: state.interruption.attemptId,
      content: state.interruption.partialText,
      role: "assistant",
      status: "incomplete",
      turnId: `assistant-${state.interruption.attemptId}-incomplete`,
    });
  }
  const acceptedBytes = state.conversationInputs.reduce(
    (total, input) => total + input.byteLength,
    0,
  );
  const pending = state.conversationInputs
    .filter((input) => input.state === "accepted")
    .map((input) => ({ ...input, reservation: { ...input.reservation } }));
  const closedInputs = state.conversationInputs
    .filter((input) => input.state === "closed")
    .map((input) => ({
      ...input,
      closureReason: {
        ...input.closureReason,
        suggestedActions: [...input.closureReason.suggestedActions],
      },
      reservation: { ...input.reservation },
    }));
  const submissionReason = (
    mode: "steer" | "queue",
  ): NonNullable<ProductView["conversationInput"]>["submission"][typeof mode]["reason"] => {
    if (state.phase === "terminal") {
      return {
        code: "run_terminal",
        message: "The run is terminal and cannot accept more input.",
        recoverability: "ask-user",
        suggestedActions: ["Start a new run for another request."],
      };
    }
    if (state.conversationInputs.length >= 8 || acceptedBytes >= 16_384) {
      return {
        code: "conversation_input_capacity_reached",
        message: "The active-run input capacity is exhausted.",
        recoverability: "ask-user",
        suggestedActions: ["Wait for this run to finish before starting another request."],
      };
    }
    if (
      mode === "steer"
        ? pending.some((input) => input.mode === "steer")
        : pending.filter((input) => input.mode === "queue").length >= 3
    ) {
      return {
        code: `${mode}_capacity_reached`,
        message:
          mode === "steer"
            ? "One steering message is already pending."
            : "Three queued messages are already pending.",
        recoverability: "ask-user",
        suggestedActions: ["Wait for a pending message to be delivered."],
      };
    }
    if (
      state.codingBudget === undefined ||
      state.codingBudget.grant.modelSteps - state.codingBudget.usage.modelSteps <= pending.length
    ) {
      return {
        code: "conversation_input_reservation_unavailable",
        message: "No remaining model step can be reserved for this input.",
        recoverability: "ask-user",
        suggestedActions: ["Let the current run finish and start a new run if needed."],
      };
    }
    return null;
  };
  const steerReason = submissionReason("steer");
  const queueReason = submissionReason("queue");
  return {
    attempts,
    conversation,
    conversationInput: {
      acceptedBytes,
      acceptedCount: state.conversationInputs.length,
      closed: closedInputs,
      pending,
      remainingBytes: 16_384 - acceptedBytes,
      reservations: {
        pending: pending.length,
        remainingModelSteps: Math.max(
          0,
          (state.codingBudget?.grant.modelSteps ?? 0) -
            (state.codingBudget?.usage.modelSteps ?? 0) -
            pending.length,
        ),
      },
      submission: {
        queue: { available: queueReason === null, reason: queueReason },
        steer: { available: steerReason === null, reason: steerReason },
      },
    },
    retry: {
      available: state.phase === "awaiting-retry",
      reason: state.phase === "awaiting-retry" ? productError(state.interruption.error) : null,
    },
  };
}

function repositoryCheckProjection(
  state: Exclude<RunState, { readonly phase: "idle" }>,
): ProductView["repositoryCheck"] {
  if (
    state.repositoryCheck === undefined ||
    state.action === null ||
    !isSafeAction(state.action) ||
    state.action.safeActuation.envelope.kind !== "repository_check_v1"
  ) {
    return undefined;
  }
  const action = state.action.safeActuation.envelope;
  return {
    actionId: action.actionId,
    checkName: action.operation.checkName,
    effectId: state.repositoryCheck.effectId,
    input: {
      catalogSha256: action.operation.catalog.sha256,
      imageIndexDigest: action.toolchain.imageIndexDigest,
      manifestDigest: action.repositorySnapshot.digest,
      platformManifestDigest: action.toolchain.platformManifestDigest,
      profileRevision: action.profile.profileRevision,
    },
    isolation: {
      network: "none",
      rootFilesystem: "read_only",
      workspaceMount: "read_only",
    },
    lifecycle: state.repositoryCheck.lifecycle.map((entry) => ({ ...entry })),
    limitations: [
      "Repository output is untrusted local evidence, not verifier success.",
      "No network, package installation, repair, or automatic recheck is authorized.",
      "The Docker daemon and host kernel remain outside the container trust boundary.",
    ],
    nextActions:
      state.repositoryCheck.state === "awaiting_approval"
        ? ["Approve this exact digest once or deny it."]
        : state.repositoryCheck.state === "review"
          ? ["Review the local output, receipt, and cleanup truth."]
          : ["Wait for the exact repository-check lifecycle to advance."],
    process: action.operation.process,
    projectionVersion: 1,
    receipt: state.repositoryCheck.receipt,
    result: state.repositoryCheck.result,
    runId: state.runId,
    state: state.repositoryCheck.state,
  };
}

function budget(state: Exclude<RunState, { readonly phase: "idle" }>) {
  if ("model" in state) {
    return {
      total: 16,
      unit: "actions" as const,
      used: state.attempts.length + state.tools.length,
    };
  }
  return { total: 10, unit: "actions" as const, used: state.revision };
}

function codingBudget(
  state: Exclude<RunState, { readonly phase: "idle" }>,
): ProductView["codingBudget"] {
  if (!("model" in state) || state.codingBudget === undefined) return undefined;
  const { grant, policy, usage } = state.codingBudget;
  return {
    grant,
    policy,
    remaining: {
      actionProposals: grant.actionProposals - usage.actionProposals,
      commandOutputBytes: grant.commandOutputBytes - usage.commandOutputBytes,
      journalBytes: grant.journalBytes - usage.journalBytes,
      journalRecords: grant.journalRecords - usage.journalRecords,
      modelSteps: grant.modelSteps - usage.modelSteps,
      modelVisibleToolContentBytes:
        grant.modelVisibleToolContentBytes - usage.modelVisibleToolContentBytes,
      toolCalls: grant.toolCalls - usage.toolCalls,
      wallTimeMs: grant.wallTimeMs - usage.wallTimeMs,
    },
    usage,
    version: 1,
  };
}

export function projectView(state: RunState): ProductView {
  if (state.phase === "idle") {
    throw new ProjectionError("Idle state has no product run view.");
  }
  const awaitingApproval = state.phase === "awaiting-approval";
  const awaitingRetry = state.phase === "awaiting-retry";
  const terminal = state.phase === "terminal";
  const terminalOutcome = terminal ? productOutcome(state.terminalOutcome) : null;
  const succeeded = terminalOutcome?.state === "succeeded";
  const safeAction = state.action !== null && isSafeAction(state.action) ? state.action : null;
  const tools = productTools(state);
  const review = productReview(state);
  const repositoryCheck = repositoryCheckProjection(state);
  const repositoryAction =
    safeAction?.safeActuation.envelope.kind === "repository_check_v1" ? safeAction : null;
  const codingBudgetProjection = codingBudget(state);
  return {
    approval: awaitingApproval
      ? {
          ...approvalPresentation(state.action),
          recoveryAction:
            safeAction === null
              ? "Approve the exact fake action or deny it."
              : repositoryAction !== null
                ? "Approve this exact named-check digest once, or deny it without execution."
                : "Approve this exact digest once, or deny it and request one narrower proposal.",
        }
      : null,
    budget: budget(state),
    ...(codingBudgetProjection === undefined ? {} : { codingBudget: codingBudgetProjection }),
    changedFiles: safeAction === null ? [] : safeChangedFiles(state),
    checks: safeAction === null ? checks(terminalOutcome) : safeChecks(state),
    currentAction: terminal || state.action === null ? null : actionSummary(state.action),
    nextActions: awaitingApproval
      ? [
          safeAction === null
            ? "Approve or deny the deterministic fake action."
            : repositoryAction !== null
              ? "Approve or deny the exact repository-check digest."
              : "Approve or deny the exact AnchorEdit digest.",
        ]
      : awaitingRetry
        ? ["Explicitly retry from the last committed conversation turn or cancel the run."]
        : terminal
          ? ["Review the terminal evidence."]
          : safeAction !== null &&
              state.phase === "executing" &&
              state.stage === "safe-reproposal-ready"
            ? ["Submit one narrower proposal or cancel the run."]
            : ["Wait for the current task to advance."],
    phase: awaitingApproval
      ? "awaiting-approval"
      : awaitingRetry
        ? "awaiting-retry"
        : terminal
          ? "review"
          : "executing",
    progress: progress(state),
    protocolVersion: 1,
    residualRisk:
      repositoryAction !== null
        ? "Container isolation constrains repository code; the Docker daemon and host kernel remain trusted."
        : safeAction !== null
          ? "Trusted-host policy only; no OS isolation or verifier success is claimed."
          : succeeded
            ? "This run exercised only deterministic fake boundaries."
            : null,
    revision: state.revision,
    ...(review === undefined ? {} : { review }),
    ...(repositoryCheck === undefined ? {} : { repositoryCheck }),
    runId: state.runId,
    terminalOutcome,
    ...(tools === undefined ? {} : { tools }),
    ...providerProjection(state),
    viewId: `${state.runId}:view:${state.revision}`,
    workspace: state.workspace,
  };
}

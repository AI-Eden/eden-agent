import { deepStrictEqual, fail, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  decide,
  decodeKernelEvent,
  initialRunState,
  type KernelEvent,
  type RunState,
  reduce,
} from "./index.ts";

const action = {
  actionId: "run-1:fake-action",
  approvalId: "run-1:fake-approval",
  canonicalDisplay: "Run the deterministic fake task",
  cwd: "/work/eden-agent",
  digest: "run-1:fake-action-digest",
  reason: "Exercise the R1 fake-task boundary without changing workspace files.",
  scope: "R1 demo state directory only",
} as const;

const workspace = {
  name: "eden-agent",
  root: "/work/eden-agent",
  trust: "trusted",
  workspaceId: "workspace-eden-agent",
} as const;

const startEvent = {
  correlationId: "command-run-1",
  runId: "run-1",
  task: "Index the fake workspace",
  type: "run.started",
  workspace,
} as const;

function transition(state: RunState, event: KernelEvent): RunState {
  const result = reduce(state, event);
  if (!result.ok) {
    fail(`Unexpected transition failure: ${result.error.code}`);
  }
  return result.state;
}

function onlyEffect(state: RunState) {
  const effects = decide(state);
  strictEqual(effects.length, 1);
  const effect = effects[0];
  if (effect === undefined) {
    fail("Expected one kernel effect.");
  }
  return effect;
}

function modelObserved(state: RunState): RunState {
  const requested = transition(state, { effect: onlyEffect(state), type: "effect.requested" });
  return transition(requested, {
    action,
    effectId: "run-1:fake-model",
    type: "fake.model.completed",
  });
}

test("success remains impossible before current verifier evidence", () => {
  const started = reduce(initialRunState, startEvent);
  strictEqual(started.ok, true);
  if (!started.ok) {
    return;
  }

  const effects = decide(started.state);

  strictEqual(started.state.phase, "executing");
  deepStrictEqual(started.state.workspace, workspace);
  deepStrictEqual(effects, [
    {
      effectId: "run-1:fake-model",
      runId: "run-1",
      task: "Index the fake workspace",
      type: "fake.model.complete",
    },
  ]);
  strictEqual(started.state.action, null);
  strictEqual(started.state.terminalOutcome, null);
});

test("repository-check lifecycle facts are closed kernel observations", () => {
  const lifecycle = {
    actionId: "action-repository-check-1",
    effectId: "effect-repository-check-1",
    observedAt: "2026-07-30T03:00:00.000Z",
    state: "running",
    type: "repository.check.lifecycle",
  };
  deepStrictEqual(decodeKernelEvent(lifecycle), { ok: true, value: lifecycle });
  strictEqual(decodeKernelEvent({ ...lifecycle, dockerCommand: "docker start ..." }).ok, false);
});

test("the validated model observation creates the only approval action", () => {
  const started = transition(initialRunState, startEvent);
  const awaiting = modelObserved(started);

  strictEqual(awaiting.phase, "awaiting-approval");
  deepStrictEqual(awaiting.action, action);
  deepStrictEqual(decide(awaiting), []);
});

test("one validated repository tool round trip continues into a second fake model step", () => {
  const call = {
    arguments: { continuation: null, path: "." },
    name: "list_files",
    toolCallId: "tool-call-list-1",
  } as const;
  const result = {
    data: {
      contentHash: `sha256:${"a".repeat(64)}`,
      continuation: null,
      entries: [{ kind: "file", path: "README.md", size: 5 }],
      sourcePath: ".",
      truncated: false,
      visited: 1,
    },
    name: "list_files",
    status: "succeeded",
    toolCallId: call.toolCallId,
  } as const;
  const started = transition(initialRunState, startEvent);
  const modelRequested = transition(started, {
    effect: onlyEffect(started),
    type: "effect.requested",
  });
  const toolReady = transition(modelRequested, {
    effectId: "run-1:fake-model",
    toolCall: call,
    type: "fake.model.tool-requested",
  });
  deepStrictEqual(decide(toolReady), [
    {
      effectId: "run-1:repository-tool:tool-call-list-1",
      runId: "run-1",
      toolCall: call,
      type: "repository.tool.execute",
    },
  ]);
  const toolRequested = transition(toolReady, {
    effect: onlyEffect(toolReady),
    type: "effect.requested",
  });
  const continued = transition(toolRequested, {
    effectId: "run-1:repository-tool:tool-call-list-1",
    result,
    type: "repository.tool.completed",
  });
  deepStrictEqual(decide(continued), [
    {
      effectId: "run-1:fake-model-continuation",
      runId: "run-1",
      task: startEvent.task,
      toolResult: result,
      type: "fake.model.complete",
    },
  ]);
  const continuationRequested = transition(continued, {
    effect: onlyEffect(continued),
    type: "effect.requested",
  });
  const awaiting = transition(continuationRequested, {
    action,
    effectId: "run-1:fake-model-continuation",
    type: "fake.model.completed",
  });
  strictEqual(awaiting.phase, "awaiting-approval");
  deepStrictEqual(awaiting.tool, { call, result });
});

test("repository tool results remain runtime-owned and failures block without continuation", () => {
  const call = {
    arguments: { maxBytes: 100, offset: 0, path: "README.md" },
    name: "read_file",
    toolCallId: "tool-call-read-1",
  } as const;
  const started = transition(initialRunState, startEvent);
  const modelRequested = transition(started, {
    effect: onlyEffect(started),
    type: "effect.requested",
  });
  const toolReady = transition(modelRequested, {
    effectId: "run-1:fake-model",
    toolCall: call,
    type: "fake.model.tool-requested",
  });
  const toolRequested = transition(toolReady, {
    effect: onlyEffect(toolReady),
    type: "effect.requested",
  });
  const failure = {
    error: {
      code: "operation_aborted",
      message: "The repository tool operation was aborted.",
      recoverability: "retry",
      suggestedActions: ["Retry the repository tool operation when ready."],
    },
    name: "read_file",
    status: "failed",
    toolCallId: call.toolCallId,
  } as const;
  const blocked = transition(toolRequested, {
    effectId: "run-1:repository-tool:tool-call-read-1",
    result: failure,
    type: "repository.tool.completed",
  });
  strictEqual(blocked.phase, "terminal");
  deepStrictEqual(blocked.terminalOutcome, { error: failure.error, state: "blocked" });
  deepStrictEqual(blocked.tool, { call, result: failure });
  deepStrictEqual(decide(blocked), []);

  strictEqual(
    reduce(toolRequested, {
      effectId: "run-1:repository-tool:tool-call-read-1",
      result: { ...failure, toolCallId: "forged-call" },
      type: "repository.tool.completed",
    }).ok,
    false,
  );
  strictEqual(
    decodeKernelEvent({
      effectId: "run-1:repository-tool:tool-call-read-1",
      result: { ...failure, rawStdout: "forged" },
      type: "repository.tool.completed",
    }).ok,
    false,
  );
  strictEqual(
    decodeKernelEvent({
      effectId: "run-1:repository-tool:tool-call-list-oversized",
      result: {
        data: {
          contentHash: `sha256:${"a".repeat(64)}`,
          continuation: "next",
          entries: Array.from({ length: 7 }, (_, index) => ({
            kind: "file",
            path: `${"a".repeat(4_000)}${index}`,
            size: 1,
          })),
          sourcePath: ".",
          truncated: true,
          visited: 7,
        },
        name: "list_files",
        status: "succeeded",
        toolCallId: "tool-call-list-oversized",
      },
      type: "repository.tool.completed",
    }).ok,
    false,
  );
});

test("the model observation cannot forge runtime-owned action authority", () => {
  const started = transition(initialRunState, startEvent);
  const requested = transition(started, { effect: onlyEffect(started), type: "effect.requested" });
  for (const forgedAction of [
    { ...action, actionId: "forged-action" },
    { ...action, approvalId: "forged-approval" },
    { ...action, canonicalDisplay: "Forged display" },
    { ...action, cwd: "/forged" },
    { ...action, digest: "forged-digest" },
    { ...action, reason: "Forged reason" },
    { ...action, scope: "forged scope" },
  ]) {
    const result = reduce(requested, {
      action: forgedAction,
      effectId: "run-1:fake-model",
      type: "fake.model.completed",
    });
    strictEqual(result.ok, false);
  }
});

test("effect intent must match the exact deterministic decision", () => {
  const started = transition(initialRunState, startEvent);
  const expected = onlyEffect(started);
  if (expected.type !== "fake.model.complete") fail("Expected the fake-model decision.");

  for (const effect of [
    { ...expected, effectId: "forged-effect" },
    { ...expected, task: "Different task" },
  ]) {
    const result = reduce(started, { effect, type: "effect.requested" });
    strictEqual(result.ok, false);
    deepStrictEqual(started, transition(initialRunState, startEvent));
  }
});

test("approval makes the deterministic fake action ready", () => {
  const awaitingApproval = modelObserved(transition(initialRunState, startEvent));

  const approved = transition(awaitingApproval, {
    approvalId: action.approvalId,
    decision: "approve",
    type: "approval.resolved",
  });

  strictEqual(approved.phase, "executing");
  deepStrictEqual(decide(approved), [
    { effectId: "run-1:fake-action", runId: "run-1", type: "fake.action.execute" },
  ]);
});

test("an observed fake action makes verification ready", () => {
  const approved = transition(modelObserved(transition(initialRunState, startEvent)), {
    approvalId: action.approvalId,
    decision: "approve",
    type: "approval.resolved",
  });
  const requested = transition(approved, {
    effect: onlyEffect(approved),
    type: "effect.requested",
  });

  const completed = transition(requested, {
    effectId: "run-1:fake-action",
    type: "fake.action.completed",
  });

  deepStrictEqual(decide(completed), [
    { effectId: "run-1:fake-verification", runId: "run-1", type: "fake.verification.run" },
  ]);
  strictEqual(completed.terminalOutcome, null);
});

test("current verifier evidence is the only successful terminal transition", () => {
  const approved = transition(modelObserved(transition(initialRunState, startEvent)), {
    approvalId: action.approvalId,
    decision: "approve",
    type: "approval.resolved",
  });
  const actionRequested = transition(approved, {
    effect: onlyEffect(approved),
    type: "effect.requested",
  });
  const actionCompleted = transition(actionRequested, {
    effectId: "run-1:fake-action",
    type: "fake.action.completed",
  });
  const verificationRequested = transition(actionCompleted, {
    effect: onlyEffect(actionCompleted),
    type: "effect.requested",
  });

  const verified = transition(verificationRequested, {
    effectId: "run-1:fake-verification",
    evidenceRef: "evidence-run-1",
    passed: true,
    type: "verification.completed",
  });

  strictEqual(verified.phase, "terminal");
  deepStrictEqual(verified.terminalOutcome, {
    evidenceRef: "evidence-run-1",
    state: "succeeded",
  });
  deepStrictEqual(decide(verified), []);
});

test("verification cannot arrive before its committed effect intent", () => {
  const awaitingApproval = modelObserved(transition(initialRunState, startEvent));

  const result = reduce(awaitingApproval, {
    effectId: "run-1:fake-verification",
    evidenceRef: "forged-evidence",
    passed: true,
    type: "verification.completed",
  });

  strictEqual(result.ok, false);
  if (result.ok) {
    return;
  }
  strictEqual(result.error.code, "illegal_transition");
  deepStrictEqual(awaitingApproval, modelObserved(transition(initialRunState, startEvent)));
});

test("denial blocks the run without dispatching an effect", () => {
  const awaitingApproval = modelObserved(transition(initialRunState, startEvent));

  const denied = transition(awaitingApproval, {
    approvalId: action.approvalId,
    decision: "deny",
    type: "approval.resolved",
  });

  strictEqual(denied.phase, "terminal");
  strictEqual(denied.terminalOutcome.state, "blocked");
  deepStrictEqual(decide(denied), []);
});

test("terminal state is immutable", () => {
  const denied = transition(modelObserved(transition(initialRunState, startEvent)), {
    approvalId: action.approvalId,
    decision: "deny",
    type: "approval.resolved",
  });

  const result = reduce(denied, { type: "run.cancelled" });

  strictEqual(result.ok, false);
  deepStrictEqual(denied.terminalOutcome, {
    error: {
      code: "approval_denied",
      message: "The deterministic fake action was denied.",
      recoverability: "ask-user",
      suggestedActions: ["Start a new task with acceptable authority."],
    },
    state: "blocked",
  });
});

test("kernel events parse once at the runtime boundary", () => {
  const hostileEvent = { ...startEvent, rendererFocus: "approval" };
  const restrictedEvent = {
    ...startEvent,
    workspace: { ...workspace, trust: "restricted" },
  };

  const valid = decodeKernelEvent(startEvent);
  const invalid = decodeKernelEvent(hostileEvent);
  const restricted = decodeKernelEvent(restrictedEvent);

  strictEqual(valid.ok, true);
  strictEqual(invalid.ok, false);
  strictEqual(restricted.ok, false);
});

const providerStartEvent = {
  ...startEvent,
  model: {
    contextWindowTokens: 128_000,
    maxOutputTokens: 512,
    model: "deepseek-v4-pro",
    profileId: "deepseek",
  },
  task: "Find the native smoke marker and explain where it is used.",
} as const;

function usableCodingStartEvent() {
  return {
    ...providerStartEvent,
    codingBudget: {
      grant: {
        actionProposals: 3,
        commandOutputBytes: 65_536,
        journalBytes: 1_048_576,
        journalRecords: 2_048,
        modelSteps: 8,
        modelVisibleToolContentBytes: 131_072,
        policy: "usable_coding_v1",
        toolCalls: 10,
        version: 1,
        wallTimeMs: 900_000,
      },
      policy: {
        actionProposals: 8,
        commandOutputBytes: 262_144,
        commandStderrBytes: 65_536,
        commandStdoutBytes: 65_536,
        commandTimeoutMs: 600_000,
        finalAnswerStep: 12,
        gitDiffPageBytes: 24_576,
        gitDiffPages: 4,
        journalBytes: 2_097_152,
        journalRecordBytes: 65_536,
        journalRecords: 4_096,
        maxReadOnlyCallsPerStep: 4,
        modelSteps: 12,
        modelVisibleToolContentBytes: 524_288,
        newFileBytes: 32_768,
        profile: "usable_coding_v1",
        readOnlyConcurrency: 4,
        toolCalls: 16,
        version: 1,
        wallTimeMs: 1_800_000,
      },
    },
    model: {
      ...providerStartEvent.model,
      multiCallCapability: "bounded_read_only_v1",
    },
  } as const;
}

test("a provider run owns a complete model-tool-model conversation and ends completed, not succeeded", () => {
  const started = transition(initialRunState, providerStartEvent);
  const firstEffect = onlyEffect(started);
  deepStrictEqual(firstEffect, {
    effectId: "run-1:model-step:1",
    maxOutputTokens: 512,
    model: "deepseek-v4-pro",
    profileId: "deepseek",
    runId: "run-1",
    step: 1,
    type: "provider.model.step",
  });
  const requested = transition(started, { effect: firstEffect, type: "effect.requested" });
  const attempted = transition(requested, {
    attemptId: "attempt-1",
    effectId: "run-1:model-step:1",
    reason: "initial",
    type: "model.attempt.started",
  });
  const call = {
    arguments: { continuation: null, path: ".", pattern: "EDEN_NATIVE_SMOKE" },
    name: "search_repository",
    toolCallId: "call-search",
  } as const;
  const toolReady = transition(attempted, {
    effectId: "run-1:model-step:1",
    observation: {
      attemptId: "attempt-1",
      finishStatus: "tool_calls",
      privateContinuity: "private-provider-continuity",
      requestId: "request-1",
      status: "completed",
      text: "I will inspect the repository.",
      toolCalls: [call],
      usage: null,
      version: 1,
    },
    type: "model.step.completed",
  });
  const toolEffect = onlyEffect(toolReady);
  strictEqual(toolEffect.type, "repository.tool.execute");
  const toolRequested = transition(toolReady, {
    effect: toolEffect,
    type: "effect.requested",
  });
  const result = {
    data: {
      contentHash: `sha256:${"b".repeat(64)}`,
      continuation: null,
      engine: {
        contentHash: `sha256:${"c".repeat(64)}`,
        name: "ripgrep",
        version: "15.0.0",
      },
      matches: [{ byteColumn: 1, lineNumber: 1, path: "README.md", preview: "EDEN_NATIVE_SMOKE" }],
      sourcePath: ".",
      truncated: false,
    },
    name: "search_repository",
    status: "succeeded",
    toolCallId: "call-search",
  } as const;
  const continued = transition(toolRequested, {
    effectId: toolEffect.effectId,
    result,
    type: "repository.tool.completed",
  });
  const secondEffect = onlyEffect(continued);
  strictEqual(secondEffect.type, "provider.model.step");
  if (secondEffect.type !== "provider.model.step") return;
  strictEqual(secondEffect.step, 2);
  if (continued.phase !== "executing" || !("model" in continued)) return;
  deepStrictEqual(continued.conversation, [
    {
      content: "Find the native smoke marker and explain where it is used.",
      role: "user",
    },
    {
      content: "I will inspect the repository.",
      privateContinuity: "private-provider-continuity",
      role: "assistant",
      toolCalls: [call],
    },
    { call, result, role: "tool" },
  ]);
  const secondRequested = transition(continued, {
    effect: secondEffect,
    type: "effect.requested",
  });
  const secondAttempt = transition(secondRequested, {
    attemptId: "attempt-2",
    effectId: secondEffect.effectId,
    reason: "initial",
    type: "model.attempt.started",
  });
  const completed = transition(secondAttempt, {
    effectId: secondEffect.effectId,
    observation: {
      attemptId: "attempt-2",
      finishStatus: "stop",
      privateContinuity: null,
      requestId: null,
      status: "completed",
      text: "The marker is in README.md:1.",
      toolCalls: [],
      usage: { completionTokens: 8, promptTokens: 40, totalTokens: 48 },
      version: 1,
    },
    type: "model.step.completed",
  });
  strictEqual(completed.phase, "terminal");
  deepStrictEqual(completed.terminalOutcome, {
    answer: "The marker is in README.md:1.",
    state: "completed",
  });
});

test("a usable coding step closes four read calls as one source-ordered batch", () => {
  const calls = [1, 2, 3, 4].map((index) => ({
    arguments: { maxBytes: 8, offset: 0, path: `file-${index}.txt` },
    name: "read_file" as const,
    toolCallId: `call-${index}`,
  }));
  const start = {
    ...providerStartEvent,
    codingBudget: {
      grant: {
        actionProposals: 3,
        commandOutputBytes: 65_536,
        journalBytes: 1_048_576,
        journalRecords: 2_048,
        modelSteps: 8,
        modelVisibleToolContentBytes: 131_072,
        policy: "usable_coding_v1",
        toolCalls: 10,
        version: 1,
        wallTimeMs: 900_000,
      },
      policy: {
        actionProposals: 8,
        commandOutputBytes: 262_144,
        commandStderrBytes: 65_536,
        commandStdoutBytes: 65_536,
        commandTimeoutMs: 600_000,
        finalAnswerStep: 12,
        gitDiffPageBytes: 24_576,
        gitDiffPages: 4,
        journalBytes: 2_097_152,
        journalRecordBytes: 65_536,
        journalRecords: 4_096,
        maxReadOnlyCallsPerStep: 4,
        modelSteps: 12,
        modelVisibleToolContentBytes: 524_288,
        newFileBytes: 32_768,
        profile: "usable_coding_v1",
        readOnlyConcurrency: 4,
        toolCalls: 16,
        version: 1,
        wallTimeMs: 1_800_000,
      },
    },
    model: {
      ...providerStartEvent.model,
      multiCallCapability: "bounded_read_only_v1",
    },
  } as const;
  const started = transition(initialRunState, start);
  const modelEffect = onlyEffect(started);
  const requested = transition(started, { effect: modelEffect, type: "effect.requested" });
  const attempted = transition(requested, {
    attemptId: "attempt-batch",
    effectId: modelEffect.effectId,
    reason: "initial",
    type: "model.attempt.started",
  });
  const ready = transition(attempted, {
    effectId: modelEffect.effectId,
    observation: {
      attemptId: "attempt-batch",
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-batch",
      status: "completed",
      text: "Read the independent files.",
      toolCalls: calls,
      usage: null,
      version: 1,
    },
    type: "model.step.completed",
  });
  const batchEffect = onlyEffect(ready);
  deepStrictEqual(batchEffect, {
    calls,
    effectId: "run-1:repository-tool-batch:1",
    runId: "run-1",
    type: "repository.tool.batch.execute",
  });
  const batchRequested = transition(ready, { effect: batchEffect, type: "effect.requested" });
  const allStarted = [0, 1, 2, 3].reduce(
    (state, index) =>
      transition(state, {
        effectId: batchEffect.effectId,
        index,
        type: "repository.tool.batch.item.started",
      }),
    batchRequested,
  );
  const results = calls.map((call, index) =>
    index === 2
      ? {
          error: {
            code: "fixture_read_failed",
            message: "One independent read failed.",
            recoverability: "retry" as const,
            suggestedActions: ["Continue with the closed sibling results."],
          },
          name: "read_file" as const,
          status: "failed" as const,
          toolCallId: call.toolCallId,
        }
      : {
          data: {
            bytesRead: 1,
            content: String(index + 1),
            contentHash: `sha256:${String(index + 1).repeat(64)}`,
            nextOffset: null,
            offset: 0,
            sourcePath: call.arguments.path,
            totalBytes: 1,
          },
          name: "read_file" as const,
          status: "succeeded" as const,
          toolCallId: call.toolCallId,
        },
  );
  const observed = [3, 2, 1, 0].reduce(
    (state, index) =>
      transition(state, {
        effectId: batchEffect.effectId,
        index,
        result: results[index] ?? fail("Missing batch result fixture."),
        type: "repository.tool.batch.item.completed",
      }),
    allStarted,
  );
  const continued = transition(observed, {
    effectId: batchEffect.effectId,
    type: "repository.tool.batch.closed",
  });

  strictEqual(onlyEffect(continued).type, "provider.model.step");
  if (continued.phase !== "executing" || !("model" in continued)) return;
  deepStrictEqual(
    continued.conversation
      .slice(-4)
      .map((item) => (item.role === "tool" ? item.call.toolCallId : item.role)),
    calls.map((call) => call.toolCallId),
  );
  strictEqual(continued.tools.at(-2)?.result?.status, "failed");
  strictEqual(continued.tools.filter((tool) => tool.result?.status === "succeeded").length, 3);
  if (continued.codingBudget === undefined) fail("Expected a durable usable-coding budget.");
  deepStrictEqual(continued.codingBudget.usage, {
    actionProposals: 0,
    commandOutputBytes: 0,
    journalBytes: 0,
    journalRecords: 0,
    modelSteps: 1,
    modelVisibleToolContentBytes: 1_004,
    toolCalls: 4,
    version: 1,
    wallTimeMs: 0,
  });
});

test("a mixed read and effect batch rejects without effect and returns control to the model", () => {
  const started = transition(initialRunState, usableCodingStartEvent());
  const modelEffect = onlyEffect(started);
  const requested = transition(started, { effect: modelEffect, type: "effect.requested" });
  const attempted = transition(requested, {
    attemptId: "attempt-mixed",
    effectId: modelEffect.effectId,
    reason: "initial",
    type: "model.attempt.started",
  });
  const replanning = transition(attempted, {
    effectId: modelEffect.effectId,
    observation: {
      attemptId: "attempt-mixed",
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-mixed",
      status: "completed",
      text: "Read and then edit.",
      toolCalls: [
        {
          arguments: { maxBytes: 8, offset: 0, path: "file.txt" },
          name: "read_file",
          toolCallId: "call-read",
        },
        {
          arguments: {
            path: "file.txt",
            replacements: [{ expectedOccurrences: 1, newText: "new", oldText: "old" }],
          },
          name: "anchor_edit",
          toolCallId: "call-edit",
        },
      ],
      usage: null,
      version: 1,
    },
    type: "model.step.completed",
  });

  strictEqual(replanning.phase, "executing");
  if (replanning.phase !== "executing" || !("model" in replanning)) return;
  strictEqual(replanning.stage, "model-ready");
  strictEqual(onlyEffect(replanning).type, "provider.model.step");
  strictEqual(replanning.conversation.filter((item) => item.role === "tool").length, 2);
  strictEqual(
    replanning.tools.every((exchange) => exchange.result?.status === "failed"),
    true,
  );
  if (replanning.codingBudget === undefined) fail("Expected a durable usable-coding budget.");
  strictEqual(replanning.codingBudget.usage.modelSteps, 1);
  strictEqual(replanning.codingBudget.usage.toolCalls, 0);
});

test("an over-grant read batch performs no effect and returns the closed rejection to the model", () => {
  const start = usableCodingStartEvent();
  const started = transition(initialRunState, {
    ...start,
    codingBudget: {
      ...start.codingBudget,
      grant: { ...start.codingBudget.grant, toolCalls: 3 },
    },
  });
  const modelEffect = onlyEffect(started);
  const requested = transition(started, { effect: modelEffect, type: "effect.requested" });
  const attempted = transition(requested, {
    attemptId: "attempt-over-grant",
    effectId: modelEffect.effectId,
    reason: "initial",
    type: "model.attempt.started",
  });
  const calls = [1, 2, 3, 4].map((index) => ({
    arguments: { maxBytes: 8, offset: 0, path: `file-${index}.txt` },
    name: "read_file" as const,
    toolCallId: `call-over-${index}`,
  }));
  const replanning = transition(attempted, {
    effectId: modelEffect.effectId,
    observation: {
      attemptId: "attempt-over-grant",
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-over-grant",
      status: "completed",
      text: "Read four files.",
      toolCalls: calls,
      usage: null,
      version: 1,
    },
    type: "model.step.completed",
  });

  strictEqual(replanning.phase, "executing");
  if (replanning.phase !== "executing" || !("model" in replanning)) return;
  strictEqual(replanning.stage, "model-ready");
  strictEqual(onlyEffect(replanning).type, "provider.model.step");
  strictEqual(replanning.tools.length, 4);
  strictEqual(
    replanning.tools.every((tool) => tool.result?.status === "failed"),
    true,
  );
  strictEqual(replanning.codingBudget?.usage.modelSteps, 1);
  strictEqual(replanning.codingBudget?.usage.toolCalls, 0);
});

test("post-delta interruption requires an explicit fresh attempt without concatenation", () => {
  const started = transition(initialRunState, providerStartEvent);
  const effect = onlyEffect(started);
  const requested = transition(started, { effect, type: "effect.requested" });
  const attempted = transition(requested, {
    attemptId: "attempt-1",
    effectId: effect.effectId,
    reason: "initial",
    type: "model.attempt.started",
  });
  const interrupted = transition(attempted, {
    effectId: effect.effectId,
    observation: {
      attemptId: "attempt-1",
      error: {
        code: "network",
        message: "The provider stream was interrupted after visible output.",
        recoverability: "ask-user",
        suggestedActions: ["Explicitly retry from the last committed conversation turn."],
      },
      partialText: "Discarded attempt text",
      status: "interrupted",
      version: 1,
    },
    type: "model.step.completed",
  });
  strictEqual(interrupted.phase, "awaiting-retry");
  deepStrictEqual(decide(interrupted), []);
  const retried = transition(interrupted, {
    type: "model.retry.requested",
  });
  strictEqual(retried.phase, "executing");
  if (retried.phase !== "executing") return;
  strictEqual(retried.stage, "model-awaiting-attempt");
  const retryAttempt = transition(retried, {
    attemptId: "attempt-2",
    effectId: effect.effectId,
    reason: "explicit-retry",
    type: "model.attempt.started",
  });
  const completed = transition(retryAttempt, {
    effectId: effect.effectId,
    observation: {
      attemptId: "attempt-2",
      finishStatus: "stop",
      privateContinuity: null,
      requestId: null,
      status: "completed",
      text: "Fresh complete answer",
      toolCalls: [],
      usage: null,
      version: 1,
    },
    type: "model.step.completed",
  });
  strictEqual(completed.phase, "terminal");
  if (completed.phase !== "terminal") return;
  deepStrictEqual(completed.terminalOutcome, {
    answer: "Fresh complete answer",
    state: "completed",
  });
  strictEqual(JSON.stringify(completed).includes("Discarded attempt textFresh"), false);
});

test("only one automatic retry is allowed for a proven not-started model attempt", () => {
  const started = transition(initialRunState, providerStartEvent);
  const effect = onlyEffect(started);
  const requested = transition(started, { effect, type: "effect.requested" });
  const first = transition(requested, {
    attemptId: "attempt-1",
    effectId: effect.effectId,
    reason: "initial",
    type: "model.attempt.started",
  });
  const notStarted = transition(first, {
    effectId: effect.effectId,
    observation: {
      attemptId: "attempt-1",
      error: {
        code: "network",
        message: "The model request did not start.",
        recoverability: "retry",
        suggestedActions: ["Retry the model attempt."],
      },
      status: "not_started",
      version: 1,
    },
    type: "model.step.completed",
  });
  strictEqual(notStarted.phase, "executing");
  if (notStarted.phase !== "executing") return;
  strictEqual(notStarted.stage, "model-awaiting-attempt");
  const automatic = transition(notStarted, {
    attemptId: "attempt-2",
    effectId: effect.effectId,
    reason: "automatic-not-started-retry",
    type: "model.attempt.started",
  });
  const exhausted = transition(automatic, {
    effectId: effect.effectId,
    observation: {
      attemptId: "attempt-2",
      error: {
        code: "network",
        message: "The model request did not start.",
        recoverability: "retry",
        suggestedActions: ["Retry the model attempt."],
      },
      status: "not_started",
      version: 1,
    },
    type: "model.step.completed",
  });
  strictEqual(exhausted.phase, "awaiting-retry");
});

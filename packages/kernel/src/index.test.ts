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

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
  actionId: "action-run-1",
  approvalId: "approval-run-1",
  canonicalDisplay: "Run the deterministic fake task",
  cwd: ".",
  digest: "sha256:action-run-1",
  reason: "Exercise the R1 fake-task boundary.",
  scope: "R1 demo state directory only",
} as const;

const startEvent = {
  action,
  correlationId: "command-run-1",
  runId: "run-1",
  task: "Index the fake workspace",
  type: "run.started",
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

test("success remains impossible before current verifier evidence", () => {
  // Given: a new run that has not received verifier evidence.
  const started = reduce(initialRunState, startEvent);
  strictEqual(started.ok, true);
  if (!started.ok) {
    return;
  }

  // When: the kernel decides what may happen before approval and verification.
  const effects = decide(started.state);

  // Then: the run awaits approval, emits no effect, and has no terminal success.
  strictEqual(started.state.phase, "awaiting-approval");
  deepStrictEqual(effects, []);
  strictEqual(started.state.terminalOutcome, null);
});

test("approval makes the deterministic fake action ready", () => {
  // Given: a run awaiting its canonical approval.
  const awaitingApproval = transition(initialRunState, startEvent);

  // When: the user approves that exact action.
  const approved = transition(awaitingApproval, {
    approvalId: action.approvalId,
    decision: "approve",
    type: "approval.resolved",
  });

  // Then: the action effect is ready with a stable identity.
  strictEqual(approved.phase, "executing");
  deepStrictEqual(decide(approved), [
    { effectId: "run-1:fake-action", runId: "run-1", type: "fake.action.execute" },
  ]);
});

test("an observed fake action makes verification ready", () => {
  // Given: the approved action intent is committed.
  const approved = transition(transition(initialRunState, startEvent), {
    approvalId: action.approvalId,
    decision: "approve",
    type: "approval.resolved",
  });
  const requested = transition(approved, {
    effect: onlyEffect(approved),
    type: "effect.requested",
  });

  // When: the fake host reports completion for that effect.
  const completed = transition(requested, {
    effectId: "run-1:fake-action",
    type: "fake.action.completed",
  });

  // Then: only the verifier effect becomes ready.
  deepStrictEqual(decide(completed), [
    { effectId: "run-1:fake-verification", runId: "run-1", type: "fake.verification.run" },
  ]);
  strictEqual(completed.terminalOutcome, null);
});

test("current verifier evidence is the only successful terminal transition", () => {
  // Given: the verification effect intent is committed after the fake action.
  const approved = transition(transition(initialRunState, startEvent), {
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

  // When: the fake verifier reports current passing evidence.
  const verified = transition(verificationRequested, {
    effectId: "run-1:fake-verification",
    evidenceRef: "evidence-run-1",
    passed: true,
    type: "verification.completed",
  });

  // Then: the run succeeds with that evidence and emits no further effect.
  strictEqual(verified.phase, "terminal");
  deepStrictEqual(verified.terminalOutcome, {
    evidenceRef: "evidence-run-1",
    state: "succeeded",
  });
  deepStrictEqual(decide(verified), []);
});

test("verification cannot arrive before its committed effect intent", () => {
  // Given: a run that is only awaiting approval.
  const awaitingApproval = transition(initialRunState, startEvent);

  // When: a caller tries to inject successful verifier output out of order.
  const result = reduce(awaitingApproval, {
    effectId: "run-1:fake-verification",
    evidenceRef: "forged-evidence",
    passed: true,
    type: "verification.completed",
  });

  // Then: the transition is rejected and the prior state remains authoritative.
  strictEqual(result.ok, false);
  if (result.ok) {
    return;
  }
  strictEqual(result.error.code, "illegal_transition");
  deepStrictEqual(awaitingApproval, transition(initialRunState, startEvent));
});

test("denial blocks the run without dispatching an effect", () => {
  // Given: a run awaiting approval.
  const awaitingApproval = transition(initialRunState, startEvent);

  // When: the user denies the canonical action.
  const denied = transition(awaitingApproval, {
    approvalId: action.approvalId,
    decision: "deny",
    type: "approval.resolved",
  });

  // Then: the run is blocked and no effect is emitted.
  strictEqual(denied.phase, "terminal");
  strictEqual(denied.terminalOutcome.state, "blocked");
  deepStrictEqual(decide(denied), []);
});

test("terminal state is immutable", () => {
  // Given: a run terminally blocked by denial.
  const denied = transition(transition(initialRunState, startEvent), {
    approvalId: action.approvalId,
    decision: "deny",
    type: "approval.resolved",
  });

  // When: another lifecycle event arrives.
  const result = reduce(denied, { type: "run.cancelled" });

  // Then: the event is rejected and terminal truth is unchanged.
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
  // Given: one exact event and one hostile event with an unknown property.
  const hostileEvent = { ...startEvent, rendererFocus: "approval" };

  // When: both values cross the kernel-event decoder.
  const valid = decodeKernelEvent(startEvent);
  const invalid = decodeKernelEvent(hostileEvent);

  // Then: the exact event becomes typed and the hostile value fails closed.
  strictEqual(valid.ok, true);
  strictEqual(invalid.ok, false);
});

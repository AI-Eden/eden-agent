import { deepStrictEqual, strictEqual, throws } from "node:assert";
import { test } from "node:test";

import { ReplayError, replayRecords } from "../src/replay.ts";
import {
  approvalRecord,
  modelCompletedRecord,
  modelRequestedRecord,
  startRecord,
} from "./records.ts";

test("replay rebuilds state without dispatching effects", () => {
  // Given: the committed start and approval records for one run.
  const records = [startRecord, modelRequestedRecord, modelCompletedRecord, approvalRecord];

  // When: pure replay folds those records.
  const replayed = replayRecords(records);

  // Then: the action is ready with deterministic state and no I/O dependency.
  strictEqual(replayed.state.phase, "executing");
  if (replayed.state.phase !== "executing") {
    return;
  }
  strictEqual(replayed.state.stage, "action-ready");
  strictEqual(replayed.state.revision, 4);
  deepStrictEqual(
    replayed.events.map((event) => event.type),
    ["run.started", "effect.requested", "fake.model.completed", "approval.resolved"],
  );
});

test("replay rejects a forged model effect identity or causal task", () => {
  for (const effect of [
    { ...modelRequestedRecord.payload.effect, effectId: "forged-effect" },
    { ...modelRequestedRecord.payload.effect, task: "Different task" },
  ]) {
    const forged = { ...modelRequestedRecord, payload: { effect } };
    throws(
      () => replayRecords([startRecord, forged]),
      (error) => error instanceof ReplayError && error.code === "illegal_transition",
    );
  }
});

test("replay rejects forged runtime-owned action authority", () => {
  const action = modelCompletedRecord.payload.action;
  for (const forgedAction of [
    { ...action, actionId: "forged-action" },
    { ...action, approvalId: "forged-approval" },
    { ...action, canonicalDisplay: "Forged display" },
    { ...action, cwd: "/forged" },
    { ...action, digest: "forged-digest" },
    { ...action, reason: "Forged reason" },
    { ...action, scope: "forged scope" },
  ]) {
    const forged = {
      ...modelCompletedRecord,
      payload: { action: forgedAction, effectId: "run-1:fake-model" },
    };
    throws(
      () => replayRecords([startRecord, modelRequestedRecord, forged]),
      (error) => error instanceof ReplayError && error.code === "illegal_transition",
    );
  }
});

import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { replayRecords } from "../src/replay.ts";
import { approvalRecord, startRecord } from "./records.ts";

test("replay rebuilds state without dispatching effects", () => {
  // Given: the committed start and approval records for one run.
  const records = [startRecord, approvalRecord];

  // When: pure replay folds those records.
  const replayed = replayRecords(records);

  // Then: the action is ready with deterministic state and no I/O dependency.
  strictEqual(replayed.state.phase, "executing");
  if (replayed.state.phase !== "executing") {
    return;
  }
  strictEqual(replayed.state.stage, "action-ready");
  strictEqual(replayed.state.revision, 2);
  deepStrictEqual(
    replayed.events.map((event) => event.type),
    ["run.started", "approval.resolved"],
  );
});

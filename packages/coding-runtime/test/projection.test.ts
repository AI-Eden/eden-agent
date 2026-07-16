import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { decodeProductEvent, decodeProductView } from "@eden/contracts";

import { projectJournal } from "../src/projection.ts";
import {
  approvalRecord,
  modelCompletedRecord,
  modelRequestedRecord,
  startRecord,
} from "./records.ts";

test("the same journal projects deterministic client values", () => {
  const records = [startRecord, modelRequestedRecord, modelCompletedRecord, approvalRecord];

  const first = projectJournal(records);
  const second = projectJournal(records);

  deepStrictEqual(first, second);
  strictEqual(first.view.phase, "executing");
  strictEqual(first.view.workspace.root, "/work/eden-agent");
  deepStrictEqual(
    first.events.map((event) => event.type),
    [
      "session.snapshot",
      "phase.progress",
      "phase.progress",
      "approval.presented",
      "phase.progress",
    ],
  );
  deepStrictEqual(
    first.events.map((event) => event.cursor),
    [0, 1, 2, 3, 4],
  );
  strictEqual(decodeProductView(first.view).ok, true);
  deepStrictEqual(
    first.events.map((event) => decodeProductEvent(event).ok),
    [true, true, true, true, true],
  );
});

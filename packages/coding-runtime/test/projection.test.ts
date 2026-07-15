import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { decodeProductEvent, decodeProductView } from "@eden/contracts";

import { projectJournal } from "../src/projection.ts";
import { approvalRecord, startRecord } from "./records.ts";

test("the same journal projects deterministic client values", () => {
  // Given: one approved fake-task journal with its trusted workspace snapshot.
  const records = [startRecord, approvalRecord];

  // When: the journal is projected twice.
  const first = projectJournal(records);
  const second = projectJournal(records);

  // Then: views and cursor-ordered product events are deep-equal and schema valid.
  deepStrictEqual(first, second);
  strictEqual(first.view.phase, "executing");
  strictEqual(first.view.workspace.root, "/work/eden-agent");
  deepStrictEqual(
    first.events.map((event) => event.type),
    ["session.snapshot", "approval.presented", "phase.progress"],
  );
  deepStrictEqual(
    first.events.map((event) => event.cursor),
    [0, 1, 2],
  );
  strictEqual(decodeProductView(first.view).ok, true);
  deepStrictEqual(
    first.events.map((event) => decodeProductEvent(event).ok),
    [true, true, true],
  );
});

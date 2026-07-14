import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { decodeProductEvent, decodeProductView } from "@eden/contracts";

import { projectJournal } from "../src/projection.ts";
import { approvalRecord, startRecord } from "./records.ts";

const context = {
  workspace: { name: "eden-agent", trust: "trusted", workspaceId: "workspace-eden-agent" },
} as const;

test("the same journal projects deterministic client values", () => {
  // Given: one approved fake-task journal and a renderer-independent workspace context.
  const records = [startRecord, approvalRecord];

  // When: the journal is projected twice.
  const first = projectJournal(records, context);
  const second = projectJournal(records, context);

  // Then: views and cursor-ordered product events are deep-equal and schema valid.
  deepStrictEqual(first, second);
  strictEqual(first.view.phase, "executing");
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

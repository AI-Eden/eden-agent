import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { parseArgs } from "../src/args.ts";

test("headless arguments require JSON mode, one task, and explicit approval", () => {
  // Given: the frozen R1 headless command shape.
  const argv = ["exec", "--json", "--approve-fake-action", "Index the fake workspace"];

  // When: arguments are decoded at the CLI boundary.
  const result = parseArgs(argv);

  // Then: the task and explicit fake approval are preserved without runtime flags.
  deepStrictEqual(result, {
    ok: true,
    value: { approveFakeAction: true, mode: "headless", task: "Index the fake workspace" },
  });
});

test("unknown and empty arguments fail with stable product errors", () => {
  // Given: malformed invocations.
  const unknown = parseArgs(["exec", "--json", "--wat", "task"]);
  const empty = parseArgs(["exec", "--json", ""]);

  // When and Then: both remain argument errors and cannot select a product surface.
  strictEqual(unknown.ok, false);
  strictEqual(empty.ok, false);
  if (!unknown.ok) strictEqual(unknown.error.code, "invalid_arguments");
  if (!empty.ok) strictEqual(empty.error.code, "invalid_arguments");
});

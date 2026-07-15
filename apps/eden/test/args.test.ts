import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { parseArgs } from "../src/args.ts";

test("headless arguments preserve separate workspace trust and action approval", () => {
  // Given: the frozen R1 headless command shape.
  const argv = [
    "exec",
    "--json",
    "--trust-workspace",
    "--approve-fake-action",
    "Index the fake workspace",
  ];

  // When: arguments are decoded at the CLI boundary.
  const result = parseArgs(argv);

  // Then: the task and both independent grants are preserved.
  deepStrictEqual(result, {
    ok: true,
    value: {
      approveFakeAction: true,
      mode: "headless",
      task: "Index the fake workspace",
      trustWorkspace: true,
    },
  });
});

test("unknown and empty arguments fail with stable product errors", () => {
  // Given: malformed invocations.
  const unknown = parseArgs(["exec", "--json", "--wat", "task"]);
  const empty = parseArgs(["exec", "--json", ""]);
  const duplicateTrust = parseArgs([
    "exec",
    "--json",
    "--trust-workspace",
    "--trust-workspace",
    "task",
  ]);

  // When and Then: both remain argument errors and cannot select a product surface.
  strictEqual(unknown.ok, false);
  strictEqual(empty.ok, false);
  strictEqual(duplicateTrust.ok, false);
  if (!unknown.ok) strictEqual(unknown.error.code, "invalid_arguments");
  if (!empty.ok) strictEqual(empty.error.code, "invalid_arguments");
});

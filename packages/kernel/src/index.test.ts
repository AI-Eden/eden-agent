import { strictEqual } from "node:assert";
import { test } from "node:test";

import { reduce, type RunState } from "./index.ts";

const idle: RunState = { phase: "idle" };

test("starting a run enters the running phase", () => {
  strictEqual(reduce(idle, { type: "run.started" }).phase, "running");
});

test("pausing a run enters the paused phase", () => {
  const running: RunState = { phase: "running" };
  strictEqual(reduce(running, { type: "run.paused" }).phase, "paused");
});

test("a failure produces the failed terminal state", () => {
  const next = reduce(idle, { type: "run.failed", reason: "fixture" });

  strictEqual(next.phase, "terminal");
  strictEqual(next.terminalState, "failed");
});

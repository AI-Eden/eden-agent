import assert from "node:assert/strict";
import { it } from "node:test";
import { createPassedTrial } from "../src/measurement-record.ts";
import { createProcessSmokeResult } from "../src/pty.ts";

it("uses monotonic elapsed time when the wall clock moves backward", () => {
  const startedAt = new Date();
  const result = createProcessSmokeResult({
    candidateId: "ink-bun",
    exitCode: 0,
    memory: { method: "linux-procfs-rss", residentSetBytes: 1, status: "observed" },
    readiness: "observed",
    readyAt: startedAt,
    scenario: "primary",
    shellExpectedResponse: "restored",
    startedAt,
    stateUpdate: {
      durationMs: 42,
      endedAt: new Date(startedAt.getTime() - 100),
      startedAt,
    },
    transcript: "restored\n__EDEN_TERMINAL_MODE_BEFORE__=mode\n__EDEN_TERMINAL_MODE_AFTER__=mode\n",
    viewportSequence: ["60x20", "100x30", "160x45"],
  });

  assert.equal(result.stateUpdateMs, 42);
});

it("rejects negative elapsed time before schema serialization", () => {
  const startedAt = new Date();
  const result = createProcessSmokeResult({
    candidateId: "ink-bun",
    exitCode: 0,
    memory: { method: "linux-procfs-rss", residentSetBytes: 1, status: "observed" },
    readiness: "observed",
    readyAt: startedAt,
    scenario: "primary",
    shellExpectedResponse: "restored",
    startedAt,
    stateUpdate: { durationMs: 42, endedAt: startedAt, startedAt },
    transcript: "restored\n__EDEN_TERMINAL_MODE_BEFORE__=mode\n__EDEN_TERMINAL_MODE_AFTER__=mode\n",
    viewportSequence: ["60x20", "100x30", "160x45"],
  });

  assert.throws(
    () => createPassedTrial({ ...result, stateUpdateMs: -1 }, "recorded", 1),
    /non-negative state update/u,
  );
});

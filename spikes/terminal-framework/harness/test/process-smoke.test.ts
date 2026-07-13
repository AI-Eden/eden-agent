import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { terminalSpikeFixture } from "@eden/terminal-spike-fixture";
import { type CandidateId, runCandidateScenario } from "../src/pty.ts";
import { ProcessHarnessTimeoutError } from "../src/pty-events.ts";

const candidateIds = [
  "ink-node",
  "ink-bun",
  "opentui-bun",
] as const satisfies readonly CandidateId[];

describe("terminal candidate process harness", () => {
  for (const candidateId of candidateIds) {
    it(`runs the shared primary PTY scenario for ${candidateId}`, async () => {
      // Given one candidate and the approved shared terminal fixture.
      // When the common harness drives the primary scenario through a real PTY.
      const result = await runCandidateScenario({ candidateId, scenario: "primary" });

      // Then readiness, resize, approval, cleanup, and shell recovery are structured evidence.
      assert.equal(result.candidateId, candidateId);
      assert.equal(result.fixtureId, terminalSpikeFixture.fixtureId);
      assert.deepEqual(result.viewportSequence, ["60x20", "100x30", "160x45"]);
      assert.equal(result.readiness, "observed");
      assert.match(result.transcript, /approved/);
      assert.ok(Date.parse(result.startedAt) <= Date.parse(result.readyAt));
      assert.ok(Date.parse(result.readyAt) <= Date.parse(result.endedAt));
      assert.ok(result.durationMs >= 0);
      assert.equal(result.exitCode, 0);
      assert.notEqual(result.terminalModeBefore, "missing");
      assert.equal(result.terminalModeBefore, result.terminalModeAfter);
      assert.equal(result.terminalCleanup, "restored");
      assert.equal(result.shellSentinel, "observed");
    });

    it(`rejects an invalid invocation for ${candidateId}`, async () => {
      // Given the same candidate is invoked with one unsupported argument.
      // When the common harness drives the invalid path through a real PTY.
      const result = await runCandidateScenario({ candidateId, scenario: "invalid" });

      // Then the candidate fails before readiness and the wrapper shell remains responsive.
      assert.equal(result.candidateId, candidateId);
      assert.equal(result.fixtureId, terminalSpikeFixture.fixtureId);
      assert.equal(result.readiness, "not-applicable");
      assert.deepEqual(result.viewportSequence, []);
      assert.match(result.transcript, /Unknown (argument|option)/);
      assert.equal(result.exitCode, 2);
      assert.notEqual(result.terminalModeBefore, "missing");
      assert.equal(result.terminalModeBefore, result.terminalModeAfter);
      assert.equal(result.terminalCleanup, "restored");
      assert.equal(result.shellSentinel, "observed");
    });

    it(`restores the terminal after forced cancellation for ${candidateId}`, async () => {
      // Given the candidate has reached its interactive approval surface.
      // When the common harness sends the real Ctrl+C byte through the PTY.
      const result = await runCandidateScenario({ candidateId, scenario: "cancel" });

      // Then exit code 130, renderer cleanup, and parent-shell recovery are observed.
      assert.equal(result.candidateId, candidateId);
      assert.equal(result.readiness, "observed");
      assert.match(result.transcript, /__EDEN_CANDIDATE_EXIT__=130/);
      assert.equal(result.exitCode, 130);
      assert.notEqual(result.terminalModeBefore, "missing");
      assert.equal(result.terminalModeBefore, result.terminalModeAfter);
      assert.equal(result.terminalCleanup, "restored");
      assert.equal(result.shellSentinel, "observed");
    });

    it(`records the shared stress outcome for ${candidateId}`, async () => {
      // Given the candidate is running the same large-output and large-diff fixture.
      // When the common PTY sequence opens both markers and returns with Escape.
      // Then completed paths expose cancellation cleanup and adapter failures remain bounded.
      if (candidateId === "opentui-bun") {
        const timeoutStartedAt = Date.now();
        await assert.rejects(
          runCandidateScenario({ candidateId, scenario: "stress" }),
          (error: unknown) => {
            assert.ok(error instanceof ProcessHarnessTimeoutError);
            assert.equal(error.expectedEvent, "output marker: output-09999");
            return true;
          },
        );
        assert.ok(Date.now() - timeoutStartedAt < 12_000);
        return;
      }
      const result = await runCandidateScenario({ candidateId, scenario: "stress" });

      assert.match(result.transcript, /output marker: output-09999/);
      assert.match(result.transcript, /diff file: synthetic\/file-20\.ts/);
      assert.match(result.transcript, /__EDEN_CANDIDATE_EXIT__=130/);
      assert.equal(result.exitCode, 130);
      assert.equal(result.terminalCleanup, "restored");
      assert.equal(result.shellSentinel, "observed");
    });
  }
});

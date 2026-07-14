import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { terminalSpikeFixture } from "@eden/terminal-spike-fixture";
import { type CandidateId, runCandidateScenario } from "../src/pty.ts";
import {
  shouldUseBundledConpty,
  terminatePtyProcessGroup,
  terminateWindowsProcessTree,
  windowsProcessTreeTerminationTimeoutMs,
} from "../src/pty-cleanup.ts";
import { ProcessHarnessTimeoutError, processHarnessEventTimeoutMs } from "../src/pty-events.ts";

const candidateIds = [
  "ink-node",
  "ink-bun",
  "opentui-bun",
] as const satisfies readonly CandidateId[];

it("uses bundled ConPTY only on Windows", () => {
  // Given the harness may run on either Windows or a POSIX host.
  // When it selects the node-pty backend used by real and packaged smoke tests.
  // Then Windows avoids the system ConPTY AttachConsole cleanup path.
  assert.equal(shouldUseBundledConpty("win32"), true);
  assert.equal(shouldUseBundledConpty("linux"), false);
  assert.equal(shouldUseBundledConpty("darwin"), false);
});

it("terminates the complete POSIX PTY process group after an interactive timeout", {
  skip: process.platform === "win32",
}, () => {
  // Given one timed-out PTY with a child process group.
  const signals: Array<{ pid: number; signal: string | number }> = [];

  // When timeout cleanup terminates the PTY.
  terminatePtyProcessGroup({ kill: () => undefined, pid: 321 }, (pid, signal) => {
    if (signal === undefined) {
      throw new TypeError("Expected timeout cleanup to provide a signal");
    }
    signals.push({ pid, signal });
    return true;
  });

  // Then the whole group receives an uncatchable termination signal.
  assert.deepEqual(signals, [{ pid: -321, signal: "SIGKILL" }]);
});

it("falls back to node-pty cleanup when POSIX process-group signaling is denied", {
  skip: process.platform === "win32",
}, () => {
  // Given the host refuses a process-group signal during an exit-event race.
  let terminalKillCount = 0;
  const permissionError = Object.assign(new Error("kill EPERM"), { code: "EPERM" });

  // When timeout cleanup encounters that platform response.
  terminatePtyProcessGroup({ kill: () => terminalKillCount++, pid: 321 }, () => {
    throw permissionError;
  });

  // Then node-pty still receives a direct cleanup request.
  assert.equal(terminalKillCount, 1);
});

it("terminates the Windows PTY process tree before releasing node-pty handles", () => {
  // Given one timed-out ConPTY and a platform process-tree terminator.
  const cleanupOrder: string[] = [];

  // When timeout cleanup runs on Windows.
  terminatePtyProcessGroup(
    { kill: () => cleanupOrder.push("release-handles"), pid: 321 },
    process.kill,
    "win32",
    (pid) => cleanupOrder.push(`terminate-tree:${pid}`),
  );

  // Then descendants die before node-pty releases the owning ConPTY handles.
  assert.deepEqual(cleanupOrder, ["terminate-tree:321", "release-handles"]);
});

it("releases Windows PTY handles when process-tree termination fails", () => {
  // Given the platform process-tree terminator fails before cleanup completes.
  let terminalKillCount = 0;

  // When Windows timeout cleanup propagates that failure.
  assert.throws(
    () =>
      terminatePtyProcessGroup(
        { kill: () => terminalKillCount++, pid: 321 },
        process.kill,
        "win32",
        () => {
          throw new Error("tree termination failed");
        },
      ),
    /tree termination failed/u,
  );

  // Then the owning ConPTY handles are still released.
  assert.equal(terminalKillCount, 1);
});

it("bounds taskkill and rejects a failed Windows process-tree cleanup", () => {
  // Given taskkill cannot terminate a process that remains alive.
  let timeout = 0;

  // When Windows cleanup observes the non-zero command status.
  assert.throws(
    () =>
      terminateWindowsProcessTree(
        321,
        (_command, _arguments, options) => {
          timeout = options.timeout ?? 0;
          return {
            error: undefined,
            output: [null, "", "Access denied"],
            pid: 1,
            signal: null,
            status: 1,
            stderr: "Access denied",
            stdout: "",
          };
        },
        () => true,
      ),
    /taskkill failed with status 1/u,
  );

  // Then cleanup is bounded instead of silently leaving a descendant alive.
  assert.equal(timeout, windowsProcessTreeTerminationTimeoutMs);
});

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
        const cleanupAllowanceMs =
          process.platform === "win32" ? windowsProcessTreeTerminationTimeoutMs : 0;
        assert.ok(
          Date.now() - timeoutStartedAt < processHarnessEventTimeoutMs + cleanupAllowanceMs + 2_000,
        );
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

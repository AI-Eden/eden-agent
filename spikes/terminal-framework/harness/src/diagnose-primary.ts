import { candidateIds, runCandidateScenario } from "./pty.ts";
import { ProcessHarnessTimeoutError } from "./pty-events.ts";

let failed = false;

for (const candidateId of candidateIds) {
  try {
    const result = await runCandidateScenario({ candidateId, scenario: "primary" });
    process.stdout.write(
      `${JSON.stringify({ candidateId, durationMs: result.durationMs, status: "passed" })}\n`,
    );
  } catch (error) {
    failed = true;
    process.stderr.write(
      `${JSON.stringify({
        candidateId,
        expectedEvent:
          error instanceof ProcessHarnessTimeoutError ? error.expectedEvent : "not-applicable",
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
      })}\n`,
    );
  }
}

process.exit(failed ? 1 : 0);

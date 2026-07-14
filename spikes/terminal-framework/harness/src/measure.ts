import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { candidateIds, type ProcessSmokeResult, runCandidateScenario } from "./pty.ts";

function createBoundedMeasurement(result: ProcessSmokeResult) {
  const { transcript, ...observation } = result;
  return {
    ...observation,
    transcriptBytes: Buffer.byteLength(transcript),
    transcriptSha256: createHash("sha256").update(transcript).digest("hex"),
  };
}

async function main(): Promise<void> {
  const results = [];
  for (const candidateId of candidateIds) {
    const result = await runCandidateScenario({ candidateId, scenario: "primary" });
    results.push(createBoundedMeasurement(result));
  }

  process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`, () => process.exit(0));
}

// node-pty 1.1.0 leaves its bundled-ConPTY worker ref'd after the PTY exits.
try {
  await main();
} catch (cause: unknown) {
  const error = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
  process.stderr.write(`${error}\n`, () => process.exit(1));
}

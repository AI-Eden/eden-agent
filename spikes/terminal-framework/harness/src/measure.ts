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

const results = [];
for (const candidateId of candidateIds) {
  const result = await runCandidateScenario({ candidateId, scenario: "primary" });
  results.push(createBoundedMeasurement(result));
}

process.stdout.write(`${JSON.stringify({ results }, null, 2)}\n`);

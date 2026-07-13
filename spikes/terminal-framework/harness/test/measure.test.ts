import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { candidateIds } from "../src/pty.ts";

const execFileAsync = promisify(execFile);
const harnessRoot = fileURLToPath(new URL("../", import.meta.url));

describe("terminal candidate measurement command", () => {
  it("emits one bounded structured primary observation per candidate", async () => {
    // Given the common measurement entrypoint and all three candidate combinations.
    // When the entrypoint drives the shared primary scenario through the process harness.
    const execution = await execFileAsync(process.execPath, ["--import", "tsx", "src/measure.ts"], {
      cwd: harnessRoot,
      encoding: "utf8",
      timeout: 30_000,
    });
    const report: unknown = JSON.parse(execution.stdout);

    // Then stdout is bounded JSON with one successful result and transcript digest per candidate.
    assert.equal(execution.stderr, "");
    assert.ok(typeof report === "object" && report !== null && "results" in report);
    assert.ok(Array.isArray(report.results));
    assert.deepEqual(
      report.results.map((result: unknown) => {
        assert.ok(typeof result === "object" && result !== null && "candidateId" in result);
        assert.ok("transcriptBytes" in result && Number.isInteger(result.transcriptBytes));
        assert.ok("transcriptSha256" in result && typeof result.transcriptSha256 === "string");
        assert.ok(!("transcript" in result));
        return result.candidateId;
      }),
      candidateIds,
    );
  });
});

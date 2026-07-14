import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { terminalSpikeFixture } from "@eden/terminal-spike-fixture";
import { candidateIds } from "../src/pty.ts";

const execFileAsync = promisify(execFile);
const harnessRoot = fileURLToPath(new URL("../", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const measurementTimeoutMs = process.platform === "win32" ? 60_000 : 30_000;

describe("terminal candidate measurement command", () => {
  it("rejects a run when the reproducibility contract is missing", async () => {
    // Given the measurement entrypoint receives none of the Slice 6 evidence parameters.
    // When the operator starts a measurement run.
    const execution = await execFileAsync(process.execPath, ["--import", "tsx", "src/measure.ts"], {
      cwd: harnessRoot,
      encoding: "utf8",
      timeout: measurementTimeoutMs,
    }).then(
      () => ({ exitCode: 0, stderr: "" }),
      (error: unknown) => {
        assert.ok(
          error instanceof Error &&
            "code" in error &&
            typeof error.code === "number" &&
            "stderr" in error &&
            typeof error.stderr === "string",
        );
        return { exitCode: error.code, stderr: error.stderr };
      },
    );

    // Then the CLI names every missing input and performs no candidate trial.
    assert.equal(execution.exitCode, 2);
    assert.match(execution.stderr, /warmups/u);
    assert.match(execution.stderr, /trials/u);
    assert.match(execution.stderr, /fixture/u);
    assert.match(execution.stderr, /host-load-policy/u);
    assert.match(execution.stderr, /runtime-versions/u);
    assert.match(execution.stderr, /terminal/u);
    assert.match(execution.stderr, /output-dir/u);
    assert.match(execution.stderr, /artifact-evidence/u);
  });

  it("writes one bounded recorded trial per candidate", async (context) => {
    // Given reproducibility metadata and package evidence for the shared candidate matrix.
    const temporaryRoot = await mkdtemp(join(tmpdir(), "eden-measure-test-"));
    context.after(async () => rm(temporaryRoot, { force: true, recursive: true }));
    const outputDirectory = join(temporaryRoot, "results");
    const sourceCommit = (
      await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" })
    ).stdout.trim();
    const artifactArguments: string[] = [];
    for (const [index, candidateId] of candidateIds.entries()) {
      const evidencePath = join(temporaryRoot, `${candidateId}.json`);
      await writeFile(
        evidencePath,
        JSON.stringify({
          artifact: { sha256: String(index + 1).repeat(64), sizeBytes: 100 + index },
          candidateId,
          deployment: { installedSizeBytes: 200 + index },
          source: { commit: sourceCommit, dirty: true },
          status: "passed",
          versions: { bun: "1.3.14", node: process.version, pnpm: "11.7.0" },
        }),
        "utf8",
      );
      artifactArguments.push("--artifact-evidence", evidencePath);
    }

    // When the entrypoint records one trial after zero warm-ups.
    const execution = await execFileAsync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/measure.ts",
        "--",
        "--warmups",
        "0",
        "--trials",
        "1",
        "--fixture",
        terminalSpikeFixture.fixtureId,
        "--runtime-versions",
        `node=${process.version},bun=1.3.14`,
        "--terminal",
        "test-pty",
        "--host-load-policy",
        "isolated-test",
        "--output-dir",
        relative(repoRoot, outputDirectory),
        ...artifactArguments,
      ],
      { cwd: harnessRoot, encoding: "utf8", timeout: measurementTimeoutMs },
    );

    // Then each candidate has one durable record without raw terminal transcripts.
    assert.equal(execution.stderr, "");
    assert.deepEqual(
      (await readdir(outputDirectory)).toSorted(),
      candidateIds
        .map((candidateId) => `${process.platform}-${process.arch}-test-pty-${candidateId}.json`)
        .toSorted(),
    );
    for (const candidateId of candidateIds) {
      const record: unknown = JSON.parse(
        await readFile(
          join(outputDirectory, `${process.platform}-${process.arch}-test-pty-${candidateId}.json`),
          "utf8",
        ),
      );
      assert.ok(typeof record === "object" && record !== null && "trials" in record);
      assert.ok(Array.isArray(record.trials));
      assert.equal(record.trials.length, 1);
      for (const trial of record.trials) {
        assert.ok(typeof trial === "object" && trial !== null && !("transcript" in trial));
      }
    }
  });
});

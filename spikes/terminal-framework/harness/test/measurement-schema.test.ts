import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const harnessRoot = fileURLToPath(new URL("../", import.meta.url));

it("rejects a result that does not satisfy the committed schema", async (context) => {
  // Given one candidate result is missing every required evidence field.
  const temporaryRoot = await mkdtemp(join(tmpdir(), "eden-schema-test-"));
  context.after(async () => rm(temporaryRoot, { force: true, recursive: true }));
  const resultPath = join(temporaryRoot, "linux-x64-test-pty-ink-node.json");
  await writeFile(resultPath, '{"schemaVersion":"1"}\n', "utf8");

  // When the committed result validator reads the directory.
  const execution = await execFileAsync(
    process.execPath,
    ["--import", "tsx", "src/validate-results.ts", temporaryRoot],
    { cwd: harnessRoot, encoding: "utf8" },
  ).then(
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

  // Then validation fails with the attributable result filename.
  assert.equal(execution.exitCode, 1);
  assert.match(execution.stderr, /linux-x64-test-pty-ink-node\.json/u);
});

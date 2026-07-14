import { strictEqual } from "node:assert";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { decodeProductEvent } from "@eden/contracts";

import { runHeadless } from "../src/headless.ts";

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    io: {
      stderr: (value: string) => stderr.push(value),
      stdout: (value: string) => stdout.push(value),
    },
    stderr,
    stdout,
  };
}

test("approved headless execution writes only cursor-ordered ProductEvent NDJSON", async () => {
  // Given: explicit approval and an isolated state directory.
  const captured = output();
  const stateDirectory = await mkdtemp(join(tmpdir(), "eden-headless-"));

  // When: one fake task traverses the product client.
  const exitCode = await runHeadless(
    { approveFakeAction: true, task: "Index the fake workspace" },
    {
      cwd: ".",
      io: captured.io,
      stateDirectory,
    },
  );

  // Then: stdout is schema-valid NDJSON ending in verifier-backed success.
  strictEqual(exitCode, 0);
  strictEqual(captured.stderr.length, 0);
  const lines = captured.stdout.join("").trim().split("\n");
  const decoded = lines.map((line) => decodeProductEvent(JSON.parse(line)));
  strictEqual(
    decoded.every((result) => result.ok),
    true,
  );
  const last = decoded.at(-1);
  strictEqual(
    last?.ok && last.value.type === "run.terminal" && last.value.outcome.state === "succeeded",
    true,
  );
});

test("headless execution without approval exits before any receipt or success", async () => {
  // Given: a non-interactive task without explicit fake-action approval.
  const captured = output();
  const stateDirectory = await mkdtemp(join(tmpdir(), "eden-headless-"));

  // When: the headless surface reaches approval.
  const exitCode = await runHeadless(
    { approveFakeAction: false, task: "Index the fake workspace" },
    {
      cwd: ".",
      io: captured.io,
      stateDirectory,
    },
  );

  // Then: it returns the stable approval error, no terminal success, and no receipt.
  strictEqual(exitCode, 2);
  strictEqual(JSON.parse(captured.stderr.join("")).code, "approval_required");
  strictEqual(captured.stdout.join("").includes("run.terminal"), false);
  const runDirectories = await readdir(join(stateDirectory, "runs"));
  const receipts = await readdir(
    join(stateDirectory, "runs", runDirectories[0] ?? "", "receipts"),
  ).catch(() => []);
  strictEqual(receipts.length, 0);
});

import { deepStrictEqual, strictEqual } from "node:assert";
import { mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
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

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "eden-headless-"));
  const stateDirectory = join(base, "state");
  const workspaceDirectory = join(base, "workspace");
  await mkdir(workspaceDirectory);
  return { stateDirectory, workspaceDirectory };
}

test("action approval cannot bypass fresh workspace trust", async () => {
  // Given: a fresh exact workspace and only fake-action approval.
  const captured = output();
  const directories = await fixture();

  // When: headless task start reaches the restricted runtime.
  const exitCode = await runHeadless(
    { approveFakeAction: true, task: "Index the fake workspace", trustWorkspace: false },
    {
      cwd: directories.workspaceDirectory,
      io: captured.io,
      stateDirectory: directories.stateDirectory,
    },
  );

  // Then: stderr is structured, stdout is empty, and no run exists.
  strictEqual(exitCode, 2);
  strictEqual(captured.stdout.length, 0);
  strictEqual(JSON.parse(captured.stderr.join("")).code, "workspace_trust_required");
  deepStrictEqual(await readdir(directories.stateDirectory), []);
});

test("workspace trust cannot bypass fake-action approval", async () => {
  // Given: a fresh exact workspace and only explicit workspace trust.
  const captured = output();
  const directories = await fixture();

  // When: headless execution reaches the separate action approval.
  const exitCode = await runHeadless(
    { approveFakeAction: false, task: "Index the fake workspace", trustWorkspace: true },
    {
      cwd: directories.workspaceDirectory,
      io: captured.io,
      stateDirectory: directories.stateDirectory,
    },
  );

  // Then: two awaiting events are emitted, but no receipt or success exists.
  strictEqual(exitCode, 2);
  strictEqual(JSON.parse(captured.stderr.join("")).code, "approval_required");
  const decoded = captured.stdout
    .join("")
    .trim()
    .split("\n")
    .map((line) => decodeProductEvent(JSON.parse(line)));
  strictEqual(decoded.length, 2);
  strictEqual(
    decoded.every((result) => result.ok),
    true,
  );
  strictEqual(captured.stdout.join("").includes("run.terminal"), false);
  const runDirectories = await readdir(join(directories.stateDirectory, "runs"));
  const receipts = await readdir(
    join(directories.stateDirectory, "runs", runDirectories[0] ?? "", "receipts"),
  ).catch(() => []);
  strictEqual(receipts.length, 0);
});

test("both grants succeed and persisted trust is reused without revision drift", async () => {
  // Given: one exact workspace and isolated durable state.
  const directories = await fixture();
  const first = output();

  // When: both grants are supplied, then only action approval is supplied on relaunch.
  const firstExit = await runHeadless(
    { approveFakeAction: true, task: "Index the fake workspace", trustWorkspace: true },
    {
      cwd: directories.workspaceDirectory,
      io: first.io,
      stateDirectory: directories.stateDirectory,
    },
  );
  const trustDirectory = join(directories.stateDirectory, "workspace-trust", "v1");
  const trustFile = (await readdir(trustDirectory))[0];
  if (trustFile === undefined) throw new Error("Expected a persisted trust record.");
  const before = await readFile(join(trustDirectory, trustFile), "utf8");
  const second = output();
  const secondExit = await runHeadless(
    { approveFakeAction: true, task: "Index the fake workspace", trustWorkspace: false },
    {
      cwd: directories.workspaceDirectory,
      io: second.io,
      stateDirectory: directories.stateDirectory,
    },
  );

  // Then: both streams end in verified success and trust bytes stay idempotent.
  strictEqual(firstExit, 0);
  strictEqual(secondExit, 0);
  strictEqual(first.stderr.length, 0);
  strictEqual(second.stderr.length, 0);
  for (const captured of [first, second]) {
    const decoded = captured.stdout
      .join("")
      .trim()
      .split("\n")
      .map((line) => decodeProductEvent(JSON.parse(line)));
    strictEqual(
      decoded.every((result) => result.ok),
      true,
    );
    const last = decoded.at(-1);
    strictEqual(
      last?.ok && last.value.type === "run.terminal" && last.value.outcome.state === "succeeded",
      true,
    );
  }
  strictEqual(await readFile(join(trustDirectory, trustFile), "utf8"), before);
});

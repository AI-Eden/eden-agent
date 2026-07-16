import { strictEqual } from "node:assert";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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
  const captured = output();
  const directories = await fixture();
  const exitCode = await runHeadless(
    { approveFakeAction: true, task: "Index the fake workspace", trustWorkspace: false },
    {
      cwd: directories.workspaceDirectory,
      io: captured.io,
      stateDirectory: directories.stateDirectory,
    },
  );

  strictEqual(exitCode, 2);
  strictEqual(captured.stdout.length, 0);
  strictEqual(JSON.parse(captured.stderr.join("")).code, "workspace_trust_required");
});

test("workspace trust cannot bypass fake-action approval", async () => {
  const captured = output();
  const directories = await fixture();
  const exitCode = await runHeadless(
    { approveFakeAction: false, task: "Index the fake workspace", trustWorkspace: true },
    {
      cwd: directories.workspaceDirectory,
      io: captured.io,
      stateDirectory: directories.stateDirectory,
    },
  );

  strictEqual(exitCode, 2);
  strictEqual(JSON.parse(captured.stderr.join("")).code, "approval_required");
  const decoded = captured.stdout
    .join("")
    .trim()
    .split("\n")
    .map((line) => decodeProductEvent(JSON.parse(line)));
  strictEqual(decoded.length, 4);
  strictEqual(
    decoded.every((result) => result.ok),
    true,
  );
  strictEqual(captured.stdout.join("").includes("run.terminal"), false);
  const partitions = await readdir(join(directories.stateDirectory, "runs", "v1"));
  const partition = partitions[0];
  if (partition === undefined) throw new Error("Expected one workspace run partition.");
  const runRoot = join(directories.stateDirectory, "runs", "v1", partition);
  const runDirectories = await readdir(runRoot);
  const receipts = await readdir(join(runRoot, runDirectories[0] ?? "", "receipts")).catch(
    () => [],
  );
  strictEqual(receipts.length, 1);
  strictEqual(
    receipts[0],
    `${Buffer.from(`${runDirectories[0]}:fake-model`).toString("base64url")}.json`,
  );
});

test("both grants succeed and persisted trust is reused without revision drift", async () => {
  const directories = await fixture();
  const first = output();
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

test("unexpected state failures use fixed copy without leaking local paths", async () => {
  const captured = output();
  const directories = await fixture();
  await writeFile(directories.stateDirectory, "not a directory", "utf8");

  const exitCode = await runHeadless(
    { approveFakeAction: true, task: "Index the fake workspace", trustWorkspace: true },
    {
      cwd: directories.workspaceDirectory,
      io: captured.io,
      stateDirectory: directories.stateDirectory,
    },
  );

  strictEqual(exitCode, 1);
  const error = JSON.parse(captured.stderr.join(""));
  strictEqual(error.code, "runtime_failure");
  strictEqual(captured.stderr.join("").includes(directories.stateDirectory), false);
  strictEqual(captured.stderr.join("").includes("EEXIST"), false);
});

import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { WorkspaceTrustService } from "../src/workspace/index.ts";

type ProcessResult = {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;
  readonly stdout: string;
};

function runProcess(arguments_: readonly string[]) {
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, "fixtures", "workspace-trust-matrix-process.ts"), ...arguments_],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stderr = "";
  let stdout = "";
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  const result = new Promise<ProcessResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stderr, stdout }));
  });
  return { child, result };
}

async function waitForPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      await lstat(path);
      return;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    await delay(10);
  }
  throw new Error("Timed out waiting for the process matrix barrier.");
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "eden-trust-matrix-"));
  const cwd = join(root, "workspace");
  const stateDirectory = join(root, "state");
  await mkdir(cwd);
  return { cwd, root, stateDirectory };
}

async function trust(cwd: string, stateDirectory: string): Promise<WorkspaceTrustService> {
  const service = await WorkspaceTrustService.open({ cwd, stateDirectory });
  const review = service.getReview();
  await service.resolve({
    commandId: "parent-trust",
    decision: "trust",
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  });
  return service;
}

test("real processes serialize same-revision state-changing trust commands", async () => {
  const paths = await fixture();
  const acquiredA = join(paths.root, "acquired-a");
  const acquiredB = join(paths.root, "acquired-b");
  const release = join(paths.root, "release");
  const first = runProcess([
    "resolve",
    paths.cwd,
    paths.stateDirectory,
    "trust",
    acquiredA,
    release,
  ]);
  const second = runProcess([
    "resolve",
    paths.cwd,
    paths.stateDirectory,
    "trust",
    acquiredB,
    release,
  ]);
  try {
    await Promise.all([waitForPath(acquiredA), waitForPath(acquiredB)]);
    await writeFile(release, "release\n", "utf8");
    const results = await Promise.all([first.result, second.result]);
    deepStrictEqual(results.map((result) => result.code).sort(), [0, 2]);
    strictEqual(results.filter((result) => result.stderr === "stale_revision\n").length, 1);
    const service = await WorkspaceTrustService.open({
      cwd: paths.cwd,
      stateDirectory: paths.stateDirectory,
    });
    strictEqual(service.getReview().revision, 1);
    strictEqual(service.getReview().workspace.trust, "trusted");
  } finally {
    await writeFile(release, "release\n", "utf8");
    first.child.kill("SIGKILL");
    second.child.kill("SIGKILL");
  }
});

test("real start processes reject retargeting and preserve one colliding run", async () => {
  const paths = await fixture();
  const other = join(paths.root, "other-workspace");
  const link = join(paths.root, "workspace-link");
  await mkdir(other);
  await symlink(paths.cwd, link, "dir");
  const service = await trust(link, paths.stateDirectory);
  const acquired = join(paths.root, "opened");
  const release = join(paths.root, "release");
  const idConsumed = join(paths.root, "id-consumed");
  const modelCalled = join(paths.root, "model-called");
  const delayed = runProcess([
    "start-delayed",
    link,
    paths.stateDirectory,
    "run-process-retarget",
    acquired,
    release,
    idConsumed,
    modelCalled,
  ]);
  try {
    await waitForPath(acquired);
    await rm(link);
    await symlink(other, link, "dir");
    await writeFile(release, "release\n", "utf8");
    deepStrictEqual(await delayed.result, {
      code: 2,
      signal: null,
      stderr: "workspace_identity_changed\n",
      stdout: "",
    });
    await rejects(lstat(idConsumed), { code: "ENOENT" });
    await rejects(lstat(modelCalled), { code: "ENOENT" });
    await rejects(lstat(join(paths.stateDirectory, "runs")), { code: "ENOENT" });
  } finally {
    await writeFile(release, "release\n", "utf8");
    delayed.child.kill("SIGKILL");
  }

  await rm(link);
  await symlink(paths.cwd, link, "dir");
  strictEqual((await service.refresh()).workspace.trust, "trusted");
  const runId = "run-process-collision";
  deepStrictEqual(await runProcess(["start", link, paths.stateDirectory, runId]).result, {
    code: 0,
    signal: null,
    stderr: "",
    stdout: "start:passed\n",
  });
  const journalPath = join(
    paths.stateDirectory,
    "runs",
    "v1",
    service.identity.workspaceId,
    runId,
    "journal.jsonl",
  );
  const before = await readFile(journalPath, "utf8");
  deepStrictEqual(await runProcess(["start", link, paths.stateDirectory, runId]).result, {
    code: 2,
    signal: null,
    stderr: "run_id_collision\n",
    stdout: "",
  });
  strictEqual(await readFile(journalPath, "utf8"), before);
});

test("real starts abort on contention and fail closed after a killed or malformed owner", async () => {
  const paths = await fixture();
  const service = await trust(paths.cwd, paths.stateDirectory);
  const acquired = join(paths.root, "holder-acquired");
  const release = join(paths.root, "holder-release");
  const holder = runProcess(["hold-lock", paths.cwd, paths.stateDirectory, acquired, release]);
  await waitForPath(acquired);
  const runPartition = join(paths.stateDirectory, "runs", "v1", service.identity.workspaceId);
  try {
    deepStrictEqual(
      await runProcess(["start-abort", paths.cwd, paths.stateDirectory, "run-process-aborted"])
        .result,
      { code: 2, signal: null, stderr: "operation_aborted\n", stdout: "" },
    );
    await rejects(lstat(runPartition), { code: "ENOENT" });

    holder.child.kill("SIGKILL");
    const killed = await holder.result;
    strictEqual(killed.signal, "SIGKILL");
    deepStrictEqual(
      await runProcess(["start", paths.cwd, paths.stateDirectory, "run-process-orphaned"]).result,
      { code: 2, signal: null, stderr: "workspace_state_busy\n", stdout: "" },
    );
    await rejects(lstat(runPartition), { code: "ENOENT" });

    const lockPath = join(
      paths.stateDirectory,
      "workspace-locks",
      "v1",
      `${service.identity.workspaceId}.lock`,
    );
    await rm(lockPath, { force: true, recursive: true });
    await mkdir(lockPath, { recursive: true });
    await writeFile(join(lockPath, "owner.json"), "{malformed\n", "utf8");
    deepStrictEqual(
      await runProcess(["start", paths.cwd, paths.stateDirectory, "run-process-malformed"]).result,
      { code: 2, signal: null, stderr: "workspace_state_busy\n", stdout: "" },
    );
    await rejects(lstat(runPartition), { code: "ENOENT" });
    deepStrictEqual(await readdir(join(paths.stateDirectory, "workspace-locks", "v1")), [
      `${service.identity.workspaceId}.lock`,
    ]);
  } finally {
    await writeFile(release, "release\n", "utf8");
    holder.child.kill("SIGKILL");
  }
});

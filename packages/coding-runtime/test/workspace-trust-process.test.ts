import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { WorkspaceTrustService } from "../src/workspace/index.ts";

type ProcessResult = {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
};

function runProcess(arguments_: readonly string[]) {
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, "fixtures", "workspace-trust-process.ts"), ...arguments_],
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
  let settled = false;
  const result = new Promise<ProcessResult>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      settled = true;
      resolve({ code, stderr, stdout });
    });
  });
  return {
    child,
    get settled() {
      return settled;
    },
    result,
  };
}

async function waitForPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await lstat(path);
      return;
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    await delay(10);
  }
  throw new Error("Timed out waiting for the child-process barrier.");
}

async function trust(service: WorkspaceTrustService): Promise<void> {
  const review = await service.refresh();
  await service.resolve({
    commandId: `parent-trust-${review.revision}`,
    decision: "trust",
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  });
}

test("real processes prove start-wins and revoke-wins trust ordering", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-trust-process-"));
  const cwd = join(root, "workspace");
  const stateDirectory = join(root, "state");
  const acquiredPath = join(root, "start-acquired");
  const releasePath = join(root, "release-start");
  await mkdir(cwd);
  const owner = await WorkspaceTrustService.open({ cwd, stateDirectory });
  await trust(owner);
  const children: ReturnType<typeof runProcess>[] = [];
  const launch = (arguments_: readonly string[]) => {
    const process = runProcess(arguments_);
    children.push(process);
    return process;
  };

  try {
    const started = launch(["start", cwd, stateDirectory, acquiredPath, releasePath]);
    await waitForPath(acquiredPath);
    const revokeAfterStart = launch(["restrict", cwd, stateDirectory]);
    deepStrictEqual(await revokeAfterStart.result, {
      code: 0,
      stderr: "",
      stdout: "restrict:passed\n",
    });
    strictEqual(started.settled, false);
    await writeFile(releasePath, "release\n", "utf8");
    deepStrictEqual(await started.result, { code: 0, stderr: "", stdout: "start:passed\n" });
    strictEqual((await owner.refresh()).workspace.trust, "restricted");
    const partition = join(
      stateDirectory,
      "runs",
      "v1",
      owner.identity.workspaceId,
      "run-process-start",
    );
    const records = (await readFile(join(partition, "journal.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    deepStrictEqual(
      records.map((record) => record.type),
      ["run.started", "effect.requested", "fake.model.completed"],
    );
    strictEqual(records[0]?.payload.workspace.trust, "trusted");
    strictEqual((await readdir(join(partition, "receipts"))).length, 1);

    await trust(owner);
    const revokeBeforeStart = launch(["restrict", cwd, stateDirectory]);
    strictEqual((await revokeBeforeStart.result).code, 0);
    const runsBefore = await readdir(
      join(stateDirectory, "runs", "v1", owner.identity.workspaceId),
    );
    const startAfterRevoke = launch([
      "start",
      cwd,
      stateDirectory,
      join(root, "must-not-acquire"),
      releasePath,
    ]);
    deepStrictEqual(await startAfterRevoke.result, {
      code: 2,
      stderr: "workspace_trust_required\n",
      stdout: "",
    });
    deepStrictEqual(
      await readdir(join(stateDirectory, "runs", "v1", owner.identity.workspaceId)),
      runsBefore,
    );
    await rejects(lstat(join(root, "must-not-acquire")), { code: "ENOENT" });
  } finally {
    await writeFile(releasePath, "release\n", "utf8");
    for (const process of children) process.child.kill("SIGKILL");
  }
});

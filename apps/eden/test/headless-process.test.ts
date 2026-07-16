import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { spawn } from "node:child_process";
import { lstat, mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { InProcessAgentClient } from "@eden/coding-runtime";
import { decodeProductEvent } from "@eden/contracts";

type ProcessResult = {
  readonly code: number | null;
  readonly stderr: string;
  readonly stdout: string;
};

function runProcess(arguments_: readonly string[]) {
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, "fixtures", "headless-trust-process.ts"), ...arguments_],
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
  throw new Error("Timed out waiting for the headless process barrier.");
}

async function trust(client: InProcessAgentClient): Promise<void> {
  const review = await client.getWorkspaceReview();
  await client.resolveWorkspaceTrust({
    commandId: `headless-process-trust-${review.revision}`,
    decision: "trust",
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  });
}

test("real headless processes prove start-wins and revoke-wins through terminal truth", {
  timeout: 15_000,
}, async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-headless-process-"));
  const cwd = join(root, "workspace");
  const stateDirectory = join(root, "state");
  const acquiredPath = join(root, "start-acquired");
  const releasePath = join(root, "release-start");
  await mkdir(cwd);
  const owner = await InProcessAgentClient.open({ cwd, stateDirectory });
  await trust(owner);
  const children: Array<ReturnType<typeof runProcess>> = [];
  const launch = (arguments_: readonly string[]) => {
    const child = runProcess(arguments_);
    children.push(child);
    return child;
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
    const startResult = await started.result;
    strictEqual(startResult.code, 0);
    strictEqual(startResult.stderr, "");
    const events = startResult.stdout
      .trim()
      .split("\n")
      .map((line) => decodeProductEvent(JSON.parse(line)));
    strictEqual(events.length, 10);
    strictEqual(
      events.every((event) => event.ok),
      true,
    );
    const terminal = events.at(-1);
    strictEqual(
      terminal?.ok &&
        terminal.value.type === "run.terminal" &&
        terminal.value.outcome.state === "succeeded",
      true,
    );
    strictEqual((await owner.getWorkspaceReview()).workspace.trust, "restricted");

    await trust(owner);
    const revokeBeforeStart = launch(["restrict", cwd, stateDirectory]);
    strictEqual((await revokeBeforeStart.result).code, 0);
    const partition = join(
      stateDirectory,
      "runs",
      "v1",
      (await owner.getWorkspaceReview()).workspace.workspaceId,
    );
    const runsBefore = await readdir(partition);
    const blockedPath = join(root, "must-not-acquire");
    const startAfterRevoke = launch(["start", cwd, stateDirectory, blockedPath, releasePath]);
    const blocked = await startAfterRevoke.result;
    strictEqual(blocked.code, 2);
    strictEqual(blocked.stdout, "");
    strictEqual(JSON.parse(blocked.stderr).code, "workspace_trust_required");
    deepStrictEqual(await readdir(partition), runsBefore);
    await rejects(lstat(blockedPath), { code: "ENOENT" });
  } finally {
    try {
      await writeFile(releasePath, "release\n", "utf8");
    } finally {
      for (const child of children) {
        if (!child.settled) child.child.kill("SIGKILL");
      }
      await Promise.allSettled(children.map((child) => child.result));
      await owner.close();
    }
  }
});

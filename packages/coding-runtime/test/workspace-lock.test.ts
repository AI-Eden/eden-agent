import { rejects, strictEqual } from "node:assert";
import { link, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  acquireWorkspaceLock,
  type WorkspaceLockTimer,
  WorkspaceStateLockError,
} from "../src/workspace/workspace-lock.ts";

function immediateTimer(): WorkspaceLockTimer {
  let now = 0;
  return {
    now: () => now,
    wait: async (milliseconds, signal) => {
      if (signal?.aborted === true) return Promise.reject(new Error("aborted"));
      now += milliseconds;
    },
  };
}

async function stateDirectory() {
  return mkdtemp(join(tmpdir(), "eden-workspace-lock-"));
}

test("a valid owner blocks another process for the frozen bounded wait", async () => {
  const state = await stateDirectory();
  const first = await acquireWorkspaceLock({
    acquiredAt: "2026-07-16T00:00:00.000Z",
    stateDirectory: state,
    token: "first-owner",
    workspaceId: "workspace-1",
  });

  await rejects(
    acquireWorkspaceLock({
      acquiredAt: "2026-07-16T00:00:01.000Z",
      stateDirectory: state,
      timer: immediateTimer(),
      token: "second-owner",
      workspaceId: "workspace-1",
    }),
    (error) =>
      error instanceof WorkspaceStateLockError &&
      error.productError.code === "workspace_state_busy" &&
      error.productError.recoverability === "retry",
  );
  await first.release();
});

test("an orphaned or malformed lock fails closed without automatic reclamation", async () => {
  const state = await stateDirectory();
  const lockPath = join(state, "workspace-locks", "v1", "workspace-1.lock");
  await mkdir(lockPath, { recursive: true });
  await writeFile(join(lockPath, "owner.json"), '{"version":1,"token":"forged"}\n', "utf8");

  await rejects(
    acquireWorkspaceLock({
      acquiredAt: "2026-07-16T00:00:01.000Z",
      stateDirectory: state,
      timer: immediateTimer(),
      workspaceId: "workspace-1",
    }),
    (error) =>
      error instanceof WorkspaceStateLockError &&
      error.productError.code === "workspace_state_busy",
  );
  await rejects(mkdir(lockPath), { code: "EEXIST" });
});

test("release preserves a lock whose owner bytes lose their trusted file shape", async (context) => {
  const cases = [
    {
      name: "hard-linked",
      mutate: (ownerPath: string, state: string) => link(ownerPath, join(state, "owner-alias")),
    },
    {
      name: "exact byte-limit invalid owner",
      mutate: (ownerPath: string) => writeFile(ownerPath, Buffer.alloc(4_096, 0x20)),
    },
    {
      name: "oversized",
      mutate: (ownerPath: string) => writeFile(ownerPath, Buffer.alloc(4_097, 0x20)),
    },
    {
      name: "invalid UTF-8",
      mutate: (ownerPath: string) => writeFile(ownerPath, Buffer.from([0x7b, 0xff, 0x7d, 0x0a])),
    },
  ] as const;

  for (const fixture of cases) {
    await context.test(fixture.name, async () => {
      const state = await stateDirectory();
      const lockPath = join(state, "workspace-locks", "v1", "workspace-1.lock");
      const ownerPath = join(lockPath, "owner.json");
      const lock = await acquireWorkspaceLock({
        acquiredAt: "2026-07-16T00:00:00.000Z",
        stateDirectory: state,
        token: "trusted-owner",
        workspaceId: "workspace-1",
      });
      await fixture.mutate(ownerPath, state);

      await lock.release();

      await rejects(mkdir(lockPath), { code: "EEXIST" });
    });
  }
});

test("an aborted lock request fails before it can become owner", async () => {
  const state = await stateDirectory();
  const controller = new AbortController();
  controller.abort();

  await rejects(
    acquireWorkspaceLock({
      acquiredAt: "2026-07-16T00:00:01.000Z",
      signal: controller.signal,
      stateDirectory: state,
      workspaceId: "workspace-1",
    }),
    (error) =>
      error instanceof WorkspaceStateLockError && error.productError.code === "operation_aborted",
  );
  const acquired = await acquireWorkspaceLock({
    acquiredAt: "2026-07-16T00:00:02.000Z",
    stateDirectory: state,
    workspaceId: "workspace-1",
  });
  strictEqual(typeof acquired.release, "function");
  await acquired.release();
});

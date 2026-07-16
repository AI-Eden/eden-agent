import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rm, rmdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { ProductError } from "@eden/contracts";
import Type from "typebox";
import Schema from "typebox/schema";

import { ensureStateSubdirectory, StatePathError } from "../state-path.ts";

const ownerLimit = 4_096;
const pollMilliseconds = 25;
const waitMilliseconds = 2_000;
const closed = { additionalProperties: false } as const;
const OwnerSchema = Type.Object(
  {
    version: Type.Literal(1),
    token: Type.String({ maxLength: 256, minLength: 1 }),
    pid: Type.Integer({ minimum: 0 }),
    acquiredAt: Type.String({ maxLength: 128, minLength: 1 }),
  },
  closed,
);
const ownerValidator = Schema.Compile(OwnerSchema);
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

type LockOwner = Type.Static<typeof OwnerSchema>;

export type WorkspaceLockTimer = {
  readonly now: () => number;
  readonly wait: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
};

export type WorkspaceLockOptions = {
  readonly acquiredAt: string;
  readonly signal?: AbortSignal;
  readonly stateDirectory: string;
  readonly timer?: WorkspaceLockTimer;
  readonly token?: string;
  readonly workspaceId: string;
};

export class WorkspaceStateLockError extends Error {
  readonly name = "WorkspaceStateLockError";
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

function busyError(): WorkspaceStateLockError {
  return new WorkspaceStateLockError({
    code: "workspace_state_busy",
    message: "The workspace state is busy or its coordination record is invalid.",
    recoverability: "retry",
    suggestedActions: [
      "Close other Eden processes and reconfigure the local state directory if contention persists.",
    ],
  });
}

function abortedError(): WorkspaceStateLockError {
  return new WorkspaceStateLockError({
    code: "operation_aborted",
    message: "The operation was aborted.",
    recoverability: "retry",
    suggestedActions: ["Retry the operation when ready."],
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw abortedError();
}

function sameOwnerIdentity(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return (
    right.isFile() &&
    !right.isSymbolicLink() &&
    right.nlink === 1 &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size
  );
}

function defaultTimer(): WorkspaceLockTimer {
  return {
    now: () => Date.now(),
    wait: (milliseconds, signal) =>
      new Promise((resolveWait, reject) => {
        if (signal?.aborted === true) {
          reject(abortedError());
          return;
        }
        const timeout = setTimeout(finish, milliseconds);
        function finish() {
          signal?.removeEventListener("abort", abort);
          resolveWait();
        }
        function abort() {
          clearTimeout(timeout);
          signal?.removeEventListener("abort", abort);
          reject(abortedError());
        }
        signal?.addEventListener("abort", abort, { once: true });
      }),
  };
}

async function readOwner(path: string, signal?: AbortSignal): Promise<LockOwner | null> {
  try {
    checkAborted(signal);
    const before = await lstat(path);
    checkAborted(signal);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size > ownerLimit
    ) {
      return null;
    }
    const handle = await open(path, "r");
    try {
      checkAborted(signal);
      const opened = await handle.stat();
      checkAborted(signal);
      if (!sameOwnerIdentity(before, opened)) return null;
      const bytes = Buffer.alloc(opened.size);
      let offset = 0;
      while (offset < bytes.length) {
        checkAborted(signal);
        const result = await handle.read(
          bytes,
          offset,
          Math.min(4_096, bytes.length - offset),
          offset,
        );
        checkAborted(signal);
        if (result.bytesRead === 0) break;
        offset += result.bytesRead;
      }
      if (offset !== bytes.length || !sameOwnerIdentity(before, await handle.stat())) return null;
      checkAborted(signal);
      if (!sameOwnerIdentity(before, await lstat(path))) return null;
      checkAborted(signal);
      const value: unknown = JSON.parse(fatalUtf8Decoder.decode(bytes));
      return ownerValidator.Check(value) ? value : null;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof WorkspaceStateLockError) throw error;
    return null;
  }
}

async function writeOwner(path: string, owner: LockOwner): Promise<void> {
  const source = `${JSON.stringify(owner)}\n`;
  if (Buffer.byteLength(source, "utf8") > ownerLimit) throw busyError();
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(source, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export type WorkspaceLock = {
  readonly release: () => Promise<void>;
};

export async function acquireWorkspaceLock(options: WorkspaceLockOptions): Promise<WorkspaceLock> {
  const timer = options.timer ?? defaultTimer();
  let lockParent: string;
  try {
    lockParent = await ensureStateSubdirectory(options.stateDirectory, ["workspace-locks", "v1"]);
  } catch (error) {
    if (error instanceof StatePathError) throw busyError();
    throw error;
  }
  const lockPath = resolve(lockParent, `${options.workspaceId}.lock`);
  const ownerPath = resolve(lockPath, "owner.json");
  const token = options.token ?? randomUUID();
  const startedAt = timer.now();
  while (true) {
    if (options.signal?.aborted === true) throw abortedError();
    try {
      await mkdir(lockPath, { mode: 0o700 });
      try {
        await writeOwner(ownerPath, {
          acquiredAt: options.acquiredAt,
          pid: process.pid,
          token,
          version: 1,
        });
      } catch (error) {
        await rm(ownerPath, { force: true });
        await rmdir(lockPath).catch(() => undefined);
        throw error;
      }
      return {
        release: async () => {
          const current = await readOwner(ownerPath);
          if (current?.token !== token) return;
          await rm(ownerPath, { force: true });
          await rmdir(lockPath).catch(() => undefined);
        },
      };
    } catch (error) {
      if (!(isNodeError(error) && error.code === "EEXIST")) {
        if (error instanceof WorkspaceStateLockError) throw error;
        throw busyError();
      }
      if (timer.now() - startedAt >= waitMilliseconds) throw busyError();
      await timer.wait(pollMilliseconds, options.signal);
    }
  }
}

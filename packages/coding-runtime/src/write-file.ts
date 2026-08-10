import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import {
  type ActionEnvelopeV1,
  decodeActionEnvelope,
  type WriteFileOperation,
} from "@eden/contracts";

import { acquireWorkspaceLock } from "./workspace/workspace-lock.ts";

export type WriteFileServiceOptions = {
  readonly beforeOpen?: () => Promise<void>;
  readonly now?: () => string;
  readonly stateDirectory: string;
  readonly workspaceRoot: string;
};

export type PrepareWriteFile = {
  readonly actionId: string;
  readonly canonicalRootHash: string;
  readonly content: string;
  readonly path: string;
  readonly proposalRevision: number;
  readonly runId: string;
  readonly workspaceId: string;
};

export type WriteFileObservation = {
  readonly byteLength: number;
  readonly path: string;
  readonly sha256: string;
  readonly state: "completed";
};

export type WriteFileReconciliation = {
  readonly state: "completed" | "not_started" | "unknown";
};

type ParentIdentity = {
  readonly device: string;
  readonly inode: string;
  readonly parentPath: string;
  readonly targetPath: string;
};

export class WriteFileError extends Error {
  readonly name = "WriteFileError";
  readonly productError: {
    readonly code: string;
    readonly message: string;
    readonly recoverability: "ask-user" | "fatal" | "reconfigure" | "retry";
    readonly suggestedActions: readonly string[];
  };

  constructor(
    code: string,
    message: string,
    recoverability: "ask-user" | "fatal" | "reconfigure" | "retry" = "ask-user",
  ) {
    super(message);
    this.productError = {
      code,
      message,
      recoverability,
      suggestedActions: ["Inspect the target and parent identity before starting a new task."],
    };
  }
}

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function portablePath(path: string): string {
  return (process.platform === "win32" ? path.replaceAll("\\", "/") : path) || ".";
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw new WriteFileError(
      "operation_aborted",
      "The new-file action was cancelled before creation.",
      "retry",
    );
  }
}

function matchesRequestedMode(actualMode: bigint, requestedMode: number): boolean {
  return process.platform === "win32" || Number(actualMode & 0o777n) === requestedMode;
}

export class WriteFileService {
  readonly #beforeOpen: (() => Promise<void>) | undefined;
  readonly #now: () => string;
  readonly #stateDirectory: string;
  readonly #workspaceRoot: string;

  constructor(options: WriteFileServiceOptions) {
    this.#beforeOpen = options.beforeOpen;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#stateDirectory = options.stateDirectory;
    this.#workspaceRoot = resolve(options.workspaceRoot);
  }

  async #parentIdentity(path: string): Promise<ParentIdentity> {
    const targetPath = resolve(this.#workspaceRoot, path);
    if (!isInside(this.#workspaceRoot, targetPath) || targetPath === this.#workspaceRoot) {
      throw new WriteFileError(
        "path_outside_workspace",
        "The new-file target leaves the workspace.",
      );
    }
    const parentPath = dirname(targetPath);
    if (!isInside(this.#workspaceRoot, parentPath)) {
      throw new WriteFileError(
        "path_outside_workspace",
        "The new-file parent leaves the workspace.",
      );
    }
    let metadata: Awaited<ReturnType<typeof lstat>>;
    try {
      metadata = await lstat(parentPath, { bigint: true });
    } catch (error) {
      throw new WriteFileError(
        isMissing(error) ? "write_parent_missing" : "write_parent_unavailable",
        "The new-file parent directory is unavailable.",
      );
    }
    if (metadata.isSymbolicLink()) {
      throw new WriteFileError(
        "write_parent_linked",
        "The new-file parent cannot be a symbolic link.",
      );
    }
    if (!metadata.isDirectory()) {
      throw new WriteFileError(
        "write_parent_invalid",
        "The new-file parent must be one existing real directory.",
      );
    }
    const canonicalParent = await realpath(parentPath);
    const canonicalRoot = await realpath(this.#workspaceRoot);
    const expectedCanonicalParent = resolve(
      canonicalRoot,
      relative(this.#workspaceRoot, parentPath),
    );
    if (canonicalParent !== expectedCanonicalParent || !isInside(canonicalRoot, canonicalParent)) {
      throw new WriteFileError(
        "write_parent_linked",
        "The new-file parent cannot cross a linked path.",
      );
    }
    return {
      device: metadata.dev.toString(),
      inode: metadata.ino.toString(),
      parentPath,
      targetPath,
    };
  }

  async #requireAbsent(targetPath: string): Promise<void> {
    try {
      await lstat(targetPath);
      throw new WriteFileError("write_target_exists", "The new-file target already exists.");
    } catch (error) {
      if (isMissing(error)) return;
      throw error;
    }
  }

  async prepare(input: PrepareWriteFile, signal?: AbortSignal): Promise<ActionEnvelopeV1> {
    checkAborted(signal);
    const bytes = new TextEncoder().encode(input.content);
    if (bytes.byteLength > 32_768) {
      throw new WriteFileError("write_content_too_large", "A new file cannot exceed 32 KiB.");
    }
    const parent = await this.#parentIdentity(input.path);
    await this.#requireAbsent(parent.targetPath);
    const envelope: ActionEnvelopeV1 = {
      actionId: input.actionId,
      actionVersion: 1,
      authority: {
        environmentClass: "none",
        executionMode: "trusted_host_policy_only",
        network: "not_requested",
        policyVersion: 1,
        ruleSetRevision: "r3-safe-actuation-v1",
      },
      baseSnapshots: [],
      budgets: { outputBytes: null, timeoutMs: null },
      cwd: ".",
      kind: "write_file",
      lifetime: { kind: "single_use_proposal_revision", revision: input.proposalRevision },
      operation: {
        byteLength: bytes.byteLength,
        content: input.content,
        mode: 0o644,
        parent: {
          device: parent.device,
          inode: parent.inode,
          path: portablePath(relative(this.#workspaceRoot, parent.parentPath)),
        },
        path: input.path,
        sha256: hash(bytes),
        targetState: "absent",
        type: "write_file",
      },
      proposalRevision: input.proposalRevision,
      runId: input.runId,
      scope: { capability: "workspace.write.new_utf8_exclusive", paths: [input.path] },
      workspace: {
        canonicalRootHash: input.canonicalRootHash,
        workspaceId: input.workspaceId,
      },
    };
    const decoded = decodeActionEnvelope(envelope);
    if (!decoded.ok)
      throw new WriteFileError("invalid_action_envelope", decoded.error.message, "fatal");
    return decoded.value;
  }

  async #operation(envelope: ActionEnvelopeV1): Promise<WriteFileOperation> {
    const decoded = decodeActionEnvelope(envelope);
    if (
      !decoded.ok ||
      decoded.value.kind !== "write_file" ||
      decoded.value.operation.type !== "write_file"
    ) {
      throw new WriteFileError(
        "invalid_action_envelope",
        "The write-file envelope is invalid.",
        "fatal",
      );
    }
    const bytes = new TextEncoder().encode(decoded.value.operation.content);
    if (
      bytes.byteLength !== decoded.value.operation.byteLength ||
      hash(bytes) !== decoded.value.operation.sha256
    ) {
      throw new WriteFileError(
        "write_content_mismatch",
        "The approved new-file bytes do not match their digest.",
        "fatal",
      );
    }
    return decoded.value.operation;
  }

  async #matchingParent(operation: WriteFileOperation): Promise<ParentIdentity> {
    const parent = await this.#parentIdentity(operation.path);
    if (
      parent.device !== operation.parent.device ||
      parent.inode !== operation.parent.inode ||
      portablePath(relative(this.#workspaceRoot, parent.parentPath)) !== operation.parent.path
    ) {
      throw new WriteFileError("write_parent_stale", "The approved parent identity changed.");
    }
    return parent;
  }

  async execute(envelope: ActionEnvelopeV1, signal?: AbortSignal): Promise<WriteFileObservation> {
    const operation = await this.#operation(envelope);
    const lock = await acquireWorkspaceLock({
      acquiredAt: this.#now(),
      stateDirectory: this.#stateDirectory,
      workspaceId: envelope.workspace.workspaceId,
      ...(signal === undefined ? {} : { signal }),
    });
    try {
      checkAborted(signal);
      const parent = await this.#matchingParent(operation);
      await this.#requireAbsent(parent.targetPath);
      await this.#beforeOpen?.();
      const handle = await open(parent.targetPath, "wx", operation.mode);
      try {
        if (process.platform !== "win32") await handle.chmod(operation.mode);
        await handle.writeFile(new TextEncoder().encode(operation.content));
        await handle.sync();
        const opened = await handle.stat({ bigint: true });
        if (!opened.isFile() || opened.isSymbolicLink() || opened.nlink !== 1n) {
          throw new WriteFileError(
            "write_target_invalid",
            "The created target is not one regular unlinked file.",
          );
        }
      } finally {
        await handle.close();
      }
      const observed = await lstat(parent.targetPath, { bigint: true });
      if (
        !observed.isFile() ||
        observed.isSymbolicLink() ||
        observed.nlink !== 1n ||
        !matchesRequestedMode(observed.mode, operation.mode)
      ) {
        throw new WriteFileError(
          "write_verification_failed",
          "The created file metadata does not match approval.",
        );
      }
      const verify = await open(parent.targetPath, "r");
      let bytes: Buffer;
      try {
        bytes = await verify.readFile();
      } finally {
        await verify.close();
      }
      if (bytes.byteLength !== operation.byteLength || hash(bytes) !== operation.sha256) {
        throw new WriteFileError(
          "write_verification_failed",
          "The created bytes do not match approval.",
        );
      }
      await this.#matchingParent(operation);
      const directory = await open(parent.parentPath, "r").catch(() => null);
      try {
        await directory?.sync().catch(() => undefined);
      } finally {
        await directory?.close();
      }
      return {
        byteLength: operation.byteLength,
        path: operation.path,
        sha256: operation.sha256,
        state: "completed",
      };
    } finally {
      await lock.release();
    }
  }

  async readReviewBase(envelope: ActionEnvelopeV1): Promise<string> {
    const operation = await this.#operation(envelope);
    const parent = await this.#matchingParent(operation);
    await this.#requireAbsent(parent.targetPath);
    return "";
  }

  async reconcile(envelope: ActionEnvelopeV1): Promise<WriteFileReconciliation> {
    let operation: WriteFileOperation;
    try {
      operation = await this.#operation(envelope);
      const parent = await this.#matchingParent(operation);
      try {
        const metadata = await lstat(parent.targetPath, { bigint: true });
        if (
          !metadata.isFile() ||
          metadata.isSymbolicLink() ||
          metadata.nlink !== 1n ||
          !matchesRequestedMode(metadata.mode, operation.mode)
        ) {
          return { state: "unknown" };
        }
        const handle = await open(parent.targetPath, "r");
        let bytes: Buffer;
        try {
          bytes = await handle.readFile();
        } finally {
          await handle.close();
        }
        return bytes.byteLength === operation.byteLength && hash(bytes) === operation.sha256
          ? { state: "completed" }
          : { state: "unknown" };
      } catch (error) {
        return isMissing(error) ? { state: "not_started" } : { state: "unknown" };
      }
    } catch {
      return { state: "unknown" };
    }
  }
}

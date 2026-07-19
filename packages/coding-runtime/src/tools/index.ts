import { createHash } from "node:crypto";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  decodeRepositoryToolCall,
  type ListFilesEntry,
  type ProductError,
  type RepositoryToolCall,
  type RepositoryToolResult,
} from "@eden/contracts";

const listVisitLimit = 4_096;
const listRowLimit = 256;
const modelContentByteLimit = 24 * 1_024;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

export interface ToolResult {
  readonly modelContent: string;
  readonly productData: RepositoryToolResult;
  readonly diagnostics: {
    readonly name: "list_files" | "read_file";
    readonly source: "trusted-workspace";
    readonly status: "failed" | "succeeded";
    readonly toolCallId: string;
  };
}

export type RepositoryToolServiceOptions = {
  readonly workspaceRoot: string;
};

type FileIdentity = {
  readonly dev: bigint | number;
  readonly ino: bigint | number;
};

class RepositoryToolError extends Error {
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

function toolError(
  code: string,
  message: string,
  recoverability: ProductError["recoverability"] = "reconfigure",
  suggestedAction = "Revise the repository tool call and retry.",
): RepositoryToolError {
  return new RepositoryToolError({
    code,
    message,
    recoverability,
    suggestedActions: [suggestedAction],
  });
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function portablePath(path: string): string {
  return path.split(sep).join("/") || ".";
}

function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function utf8SequenceLength(byte: number): number | null {
  if (byte >= 0xc2 && byte <= 0xdf) return 2;
  if (byte >= 0xe0 && byte <= 0xef) return 3;
  if (byte >= 0xf0 && byte <= 0xf4) return 4;
  return null;
}

function isIncompleteUtf8Suffix(bytes: Uint8Array, offset: number): boolean {
  const first = bytes[offset];
  if (first === undefined) return false;
  const expected = utf8SequenceLength(first);
  if (expected === null || bytes.length - offset >= expected) return false;
  for (let index = offset + 1; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === undefined || (byte & 0xc0) !== 0x80) return false;
  }
  return true;
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function comparePortablePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    throw toolError(
      "operation_aborted",
      "The repository tool operation was aborted.",
      "retry",
      "Retry the repository tool operation when ready.",
    );
  }
}

function failureIdentity(call: unknown): {
  readonly name: "list_files" | "read_file";
  readonly toolCallId: string;
} {
  if (typeof call !== "object" || call === null) {
    return { name: "list_files", toolCallId: "invalid-tool-call" };
  }
  const name = "name" in call && call.name === "read_file" ? "read_file" : "list_files";
  const toolCallId =
    "toolCallId" in call && typeof call.toolCallId === "string" && call.toolCallId.length > 0
      ? call.toolCallId.slice(0, 256)
      : "invalid-tool-call";
  return { name, toolCallId };
}

export class RepositoryToolService {
  private readonly rootIdentity: FileIdentity;
  private readonly workspaceRoot: string;

  private constructor(workspaceRoot: string, rootIdentity: FileIdentity) {
    this.workspaceRoot = workspaceRoot;
    this.rootIdentity = rootIdentity;
  }

  static async open(options: RepositoryToolServiceOptions): Promise<RepositoryToolService> {
    const workspaceRoot = await realpath(options.workspaceRoot);
    const metadata = await lstat(workspaceRoot);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw toolError(
        "workspace_identity_changed",
        "The trusted workspace identity is unavailable.",
      );
    }
    return new RepositoryToolService(workspaceRoot, { dev: metadata.dev, ino: metadata.ino });
  }

  private async verifyRoot(): Promise<void> {
    let metadata: Awaited<ReturnType<typeof lstat>>;
    try {
      metadata = await lstat(this.workspaceRoot);
    } catch {
      throw toolError("workspace_identity_changed", "The trusted workspace identity changed.");
    }
    if (
      !metadata.isDirectory() ||
      metadata.isSymbolicLink() ||
      !sameIdentity(this.rootIdentity, metadata)
    ) {
      throw toolError("workspace_identity_changed", "The trusted workspace identity changed.");
    }
  }

  private async resolvePath(path: string): Promise<{
    readonly absolutePath: string;
    readonly metadata: Awaited<ReturnType<typeof lstat>>;
  }> {
    let current = this.workspaceRoot;
    if (path !== ".") {
      for (const segment of path.split("/")) {
        current = join(current, segment);
        let metadata: Awaited<ReturnType<typeof lstat>>;
        try {
          metadata = await lstat(current);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            throw toolError("tool_path_not_found", "The repository tool path was not found.");
          }
          throw toolError("tool_io_failed", "The repository tool path could not be inspected.");
        }
        if (metadata.isSymbolicLink()) {
          throw toolError("tool_path_linked", "Linked repository tool paths are not allowed.");
        }
      }
    }
    const absolutePath = resolve(current);
    if (!isInside(this.workspaceRoot, absolutePath)) {
      throw toolError("tool_path_invalid", "The repository tool path is invalid.");
    }
    const canonical = await realpath(absolutePath).catch(() => {
      throw toolError("tool_path_not_found", "The repository tool path was not found.");
    });
    if (!isInside(this.workspaceRoot, canonical) || canonical !== absolutePath) {
      throw toolError("tool_path_linked", "Linked repository tool paths are not allowed.");
    }
    return { absolutePath, metadata: await lstat(absolutePath) };
  }

  private async listFiles(
    call: Extract<RepositoryToolCall, { readonly name: "list_files" }>,
    signal?: AbortSignal,
  ): Promise<RepositoryToolResult> {
    abortIfNeeded(signal);
    await this.verifyRoot();
    const target = await this.resolvePath(call.arguments.path);
    if (!target.metadata.isDirectory()) {
      throw toolError("tool_path_not_directory", "The list_files path is not a directory.");
    }

    const discovered: ListFilesEntry[] = [];
    const directories = [{ absolutePath: target.absolutePath, relativePath: call.arguments.path }];
    let visited = 0;
    while (directories.length > 0) {
      abortIfNeeded(signal);
      const directory = directories.shift();
      if (directory === undefined) break;
      const handle = await opendir(directory.absolutePath).catch(() => {
        throw toolError("tool_io_failed", "The repository directory could not be listed.");
      });
      try {
        for await (const entry of handle) {
          abortIfNeeded(signal);
          visited += 1;
          if (visited > listVisitLimit) {
            throw toolError(
              "tool_visit_limit",
              "The repository listing exceeded the visit limit.",
              "reconfigure",
              "List a narrower repository path and retry.",
            );
          }
          const absolutePath = join(directory.absolutePath, entry.name);
          const metadata = await lstat(absolutePath).catch(() => {
            throw toolError("tool_io_failed", "A repository entry could not be inspected.");
          });
          if (metadata.isSymbolicLink()) {
            throw toolError("tool_path_linked", "Linked repository tool paths are not allowed.");
          }
          const path = portablePath(relative(this.workspaceRoot, absolutePath));
          if (metadata.isDirectory()) {
            discovered.push({ kind: "directory", path, size: null });
            directories.push({ absolutePath, relativePath: path });
          } else if (metadata.isFile()) {
            discovered.push({ kind: "file", path, size: metadata.size });
          } else {
            throw toolError(
              "tool_file_type_unsupported",
              "The repository contains an unsupported file type in the requested scope.",
              "reconfigure",
              "List a narrower repository path that contains only regular files and directories.",
            );
          }
        }
      } finally {
        await handle.close().catch(() => undefined);
      }
    }
    discovered.sort((left, right) => comparePortablePaths(left.path, right.path));

    const entries: ListFilesEntry[] = [];
    let continuation: string | null = null;
    const after = call.arguments.continuation;
    for (const entry of discovered) {
      if (after !== null && comparePortablePaths(entry.path, after) <= 0) continue;
      const nextEntries = [...entries, entry];
      if (
        nextEntries.length > listRowLimit ||
        Buffer.byteLength(JSON.stringify(nextEntries), "utf8") > modelContentByteLimit
      ) {
        continuation = entries.at(-1)?.path ?? after;
        break;
      }
      entries.push(entry);
    }
    await this.verifyRoot();
    return {
      data: {
        contentHash: sha256(JSON.stringify(entries)),
        continuation,
        entries,
        sourcePath: call.arguments.path,
        truncated: continuation !== null,
        visited,
      },
      name: "list_files",
      status: "succeeded",
      toolCallId: call.toolCallId,
    };
  }

  private async readFile(
    call: Extract<RepositoryToolCall, { readonly name: "read_file" }>,
    signal?: AbortSignal,
  ): Promise<RepositoryToolResult> {
    abortIfNeeded(signal);
    await this.verifyRoot();
    const target = await this.resolvePath(call.arguments.path);
    if (!target.metadata.isFile()) {
      throw toolError("tool_path_not_file", "The read_file path is not a regular file.");
    }
    if (target.metadata.nlink !== 1) {
      throw toolError("tool_path_linked", "Linked repository tool paths are not allowed.");
    }
    if (call.arguments.offset > target.metadata.size) {
      throw toolError("tool_read_offset_invalid", "The read_file offset is outside the file.");
    }

    const handle = await open(target.absolutePath, "r").catch(() => {
      throw toolError("tool_io_failed", "The repository file could not be read.");
    });
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        !sameIdentity(target.metadata, opened) ||
        opened.size !== target.metadata.size
      ) {
        throw toolError(
          "workspace_identity_changed",
          "The repository file changed before reading.",
        );
      }
      const requestedBytes = Math.min(call.arguments.maxBytes, opened.size - call.arguments.offset);
      const bytes = Buffer.alloc(requestedBytes);
      let bytesRead = 0;
      while (bytesRead < bytes.length) {
        abortIfNeeded(signal);
        const result = await handle.read(
          bytes,
          bytesRead,
          bytes.length - bytesRead,
          call.arguments.offset + bytesRead,
        );
        if (result.bytesRead === 0) break;
        bytesRead += result.bytesRead;
      }
      const complete = bytes.subarray(0, bytesRead);
      if (
        complete.length > 0 &&
        (complete[0] ?? 0) >= 0x80 &&
        ((complete[0] ?? 0) & 0xc0) === 0x80
      ) {
        throw toolError("tool_read_offset_invalid", "The read_file offset splits UTF-8 content.");
      }
      let accepted = complete.length;
      let content: string | null = null;
      while (accepted >= Math.max(0, complete.length - 3)) {
        try {
          const decoded = fatalUtf8Decoder.decode(complete.subarray(0, accepted));
          if (accepted === complete.length || isIncompleteUtf8Suffix(complete, accepted)) {
            content = decoded;
            break;
          }
        } catch {
          // Continue only across the maximum UTF-8 suffix width.
        }
        accepted -= 1;
      }
      if (content === null || content.includes("\0")) {
        throw toolError(
          "tool_binary_unsupported",
          "The repository file is not supported UTF-8 text.",
        );
      }
      if (accepted === 0 && complete.length > 0) {
        throw toolError(
          "tool_read_chunk_too_small",
          "The read_file byte limit cannot contain the next UTF-8 character.",
          "reconfigure",
          "Increase maxBytes and retry the same offset.",
        );
      }
      const acceptedBytes = complete.subarray(0, accepted);
      const nextValue = call.arguments.offset + accepted;
      const nextOffset = nextValue < opened.size ? nextValue : null;
      const after = await handle.stat();
      const current = await lstat(target.absolutePath);
      if (
        !sameIdentity(opened, after) ||
        opened.size !== after.size ||
        !sameIdentity(opened, current) ||
        opened.size !== current.size
      ) {
        throw toolError("workspace_identity_changed", "The repository file changed while reading.");
      }
      await this.verifyRoot();
      return {
        data: {
          bytesRead: accepted,
          content,
          contentHash: sha256(acceptedBytes),
          nextOffset,
          offset: call.arguments.offset,
          sourcePath: call.arguments.path,
          totalBytes: opened.size,
        },
        name: "read_file",
        status: "succeeded",
        toolCallId: call.toolCallId,
      };
    } finally {
      await handle.close();
    }
  }

  private async executeProduct(call: unknown, signal?: AbortSignal): Promise<RepositoryToolResult> {
    const identity = failureIdentity(call);
    try {
      const decoded = decodeRepositoryToolCall(call);
      if (!decoded.ok) {
        throw toolError("tool_call_invalid", "The repository tool call is invalid.", "fatal");
      }
      return decoded.value.name === "list_files"
        ? await this.listFiles(decoded.value, signal)
        : await this.readFile(decoded.value, signal);
    } catch (error) {
      const productError =
        error instanceof RepositoryToolError
          ? error.productError
          : toolError("tool_io_failed", "The repository tool operation failed.").productError;
      return { ...identity, error: productError, status: "failed" };
    }
  }

  async execute(call: unknown, signal?: AbortSignal): Promise<ToolResult> {
    const productData = await this.executeProduct(call, signal);
    const modelContent =
      productData.status === "failed"
        ? JSON.stringify({ error: productData.error })
        : productData.name === "read_file"
          ? productData.data.content
          : JSON.stringify(productData.data.entries);
    return {
      diagnostics: {
        name: productData.name,
        source: "trusted-workspace",
        status: productData.status,
        toolCallId: productData.toolCallId,
      },
      modelContent,
      productData,
    };
  }
}

import { createHash } from "node:crypto";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  decodeRepositoryToolCall,
  decodeRepositoryToolResult,
  type GitStatusEntry,
  type ListFilesEntry,
  type ProductError,
  type RepositoryCapabilityReview,
  type RepositoryToolCall,
  type RepositoryToolResult,
  type SearchMatch,
} from "@eden/contracts";

import {
  type NativeProcessObservation,
  type NativeProcessPort,
  NativeProcessRunner,
} from "../native-process.ts";

const listVisitLimit = 4_096;
const listRowLimit = 256;
const modelContentByteLimit = 24 * 1_024;
const nativeOutputByteLimit = 2 * 1_024 * 1_024;
const nativeToolTimeoutMs = 5_000;
const ripgrepBinaryByteLimit = 32 * 1_024 * 1_024;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

export interface ToolResult {
  readonly modelContent: string;
  readonly productData: RepositoryToolResult;
  readonly diagnostics: {
    readonly name: RepositoryToolCall["name"];
    readonly source: "trusted-workspace";
    readonly status: "failed" | "succeeded";
    readonly toolCallId: string;
  };
}

export type RepositoryToolServiceOptions = {
  readonly gitExecutable?: string;
  readonly nativeProcess?: NativeProcessPort;
  readonly ripgrepAsset?: {
    readonly contentHash: string;
    readonly path: string;
    readonly version: "15.0.0";
  };
  readonly ripgrepAssetError?: ProductError;
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
  readonly name: RepositoryToolCall["name"];
  readonly toolCallId: string;
} {
  if (typeof call !== "object" || call === null) {
    return { name: "list_files", toolCallId: "invalid-tool-call" };
  }
  const name =
    "name" in call &&
    (call.name === "read_file" || call.name === "search_repository" || call.name === "git_status")
      ? call.name
      : "list_files";
  const toolCallId =
    "toolCallId" in call && typeof call.toolCallId === "string" && call.toolCallId.length > 0
      ? call.toolCallId.slice(0, 256)
      : "invalid-tool-call";
  return { name, toolCallId };
}

function nativeEnvironment(includePath: boolean): Record<string, string> {
  const environment: Record<string, string> = {
    GCM_INTERACTIVE: "Never",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_OPTIONAL_LOCKS: "0",
    GIT_PAGER: "cat",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    NO_COLOR: "1",
    PAGER: "cat",
  };
  const names = includePath
    ? ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "COMSPEC", "TEMP", "TMP"]
    : ["SystemRoot", "WINDIR", "TEMP", "TMP"];
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  environment.GIT_CONFIG_GLOBAL = process.platform === "win32" ? "NUL" : "/dev/null";
  return environment;
}

function decodeNativeText(value: Uint8Array): string {
  try {
    return fatalUtf8Decoder.decode(value);
  } catch {
    throw toolError("native_output_invalid", "A native repository tool returned invalid UTF-8.");
  }
}

function requireExited(
  observation: NativeProcessObservation,
  toolName: "git" | "ripgrep",
): Extract<NativeProcessObservation, { readonly status: "exited" }> {
  if (observation.status === "exited") return observation;
  const label = toolName === "git" ? "Git" : "ripgrep";
  switch (observation.status) {
    case "aborted":
      throw toolError(
        "operation_aborted",
        `The ${label} operation was aborted.`,
        "retry",
        `Retry the ${label} operation when ready.`,
      );
    case "timed-out":
      throw toolError(
        "native_tool_timeout",
        `The ${label} operation exceeded the five-second limit.`,
        "retry",
        `Narrow the repository operation and retry ${label}.`,
      );
    case "output-overflow":
      throw toolError(
        "native_output_overflow",
        `The ${label} output exceeded its internal capture limit.`,
        "reconfigure",
        "Narrow the repository operation and retry.",
      );
    case "cleanup-failed":
      throw toolError(
        "native_process_cleanup_failed",
        `The ${label} process tree could not be terminated safely.`,
        "fatal",
        "Close Eden, terminate the remaining native process tree, and inspect the host before retrying.",
      );
    case "spawn-failed":
      throw toolError(
        toolName === "git" ? "git_unavailable" : "ripgrep_asset_unavailable",
        `${label} is unavailable.`,
        "reconfigure",
        toolName === "git"
          ? "Install Git from https://git-scm.com/downloads and recheck repository prerequisites."
          : "Restore the complete Eden archive and recheck repository prerequisites.",
      );
  }
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const actualParts = actual.split(".").map(Number);
  const minimumParts = minimum.split(".").map(Number);
  if (
    actualParts.length < 2 ||
    minimumParts.length < 2 ||
    [...actualParts, ...minimumParts].some((part) => !Number.isSafeInteger(part) || part < 0)
  ) {
    return false;
  }
  for (let index = 0; index < Math.max(actualParts.length, minimumParts.length); index += 1) {
    const left = actualParts[index] ?? 0;
    const right = minimumParts[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

export class RepositoryToolService {
  private readonly gitExecutable: string;
  private readonly nativeProcess: NativeProcessPort;
  private readonly ripgrepAsset: RepositoryToolServiceOptions["ripgrepAsset"];
  private readonly ripgrepAssetError: ProductError | undefined;
  private readonly rootIdentity: FileIdentity;
  private readonly workspaceRoot: string;

  private constructor(
    workspaceRoot: string,
    rootIdentity: FileIdentity,
    options: RepositoryToolServiceOptions,
  ) {
    this.gitExecutable = options.gitExecutable ?? "git";
    this.nativeProcess = options.nativeProcess ?? new NativeProcessRunner();
    this.ripgrepAsset = options.ripgrepAsset;
    this.ripgrepAssetError = options.ripgrepAssetError;
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
    return new RepositoryToolService(
      workspaceRoot,
      { dev: metadata.dev, ino: metadata.ino },
      options,
    );
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

  private async verifyRipgrep(signal?: AbortSignal): Promise<{
    readonly contentHash: string;
    readonly path: string;
    readonly version: "15.0.0";
  }> {
    abortIfNeeded(signal);
    if (this.ripgrepAssetError !== undefined) {
      throw new RepositoryToolError(this.ripgrepAssetError);
    }
    const asset = this.ripgrepAsset;
    if (
      asset === undefined ||
      !isAbsolute(asset.path) ||
      !/^sha256:[a-f0-9]{64}$/u.test(asset.contentHash)
    ) {
      throw toolError(
        "ripgrep_asset_missing",
        "The pinned application-local ripgrep asset is missing.",
        "reconfigure",
        "Restore the complete Eden archive and recheck repository prerequisites.",
      );
    }
    let before: Awaited<ReturnType<typeof lstat>>;
    try {
      before = await lstat(asset.path);
    } catch {
      throw toolError(
        "ripgrep_asset_missing",
        "The pinned application-local ripgrep asset is missing.",
        "reconfigure",
        "Restore the complete Eden archive and recheck repository prerequisites.",
      );
    }
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size <= 0 ||
      before.size > ripgrepBinaryByteLimit ||
      (process.platform !== "win32" && (before.mode & 0o111) === 0)
    ) {
      throw toolError(
        "ripgrep_asset_invalid",
        "The pinned application-local ripgrep asset is invalid.",
        "reconfigure",
        "Restore the complete Eden archive and recheck repository prerequisites.",
      );
    }
    const handle = await open(asset.path, "r").catch(() => {
      throw toolError("ripgrep_asset_invalid", "The pinned ripgrep asset cannot be read.");
    });
    let bytes: Uint8Array;
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.size !== before.size ||
        !sameIdentity(before, opened)
      ) {
        throw toolError("ripgrep_asset_modified", "The pinned ripgrep asset changed.");
      }
      bytes = await handle.readFile();
      const after = await handle.stat();
      const current = await lstat(asset.path);
      if (
        bytes.byteLength !== opened.size ||
        !sameIdentity(opened, after) ||
        opened.size !== after.size ||
        !sameIdentity(opened, current) ||
        opened.size !== current.size
      ) {
        throw toolError("ripgrep_asset_modified", "The pinned ripgrep asset changed.");
      }
    } finally {
      await handle.close();
    }
    const contentHash = sha256(bytes);
    if (contentHash !== asset.contentHash) {
      throw toolError(
        "ripgrep_asset_modified",
        "The pinned application-local ripgrep asset failed integrity verification.",
        "reconfigure",
        "Restore the complete Eden archive and recheck repository prerequisites.",
      );
    }
    const versionResult = requireExited(
      await this.nativeProcess.run(
        {
          arguments: ["--version"],
          cwd: this.workspaceRoot,
          environment: nativeEnvironment(false),
          executable: asset.path,
          maxStderrBytes: 4_096,
          maxStdoutBytes: 4_096,
          timeoutMs: nativeToolTimeoutMs,
        },
        signal,
      ),
      "ripgrep",
    );
    if (versionResult.exitCode !== 0 || versionResult.stderr.byteLength !== 0) {
      throw toolError("ripgrep_asset_invalid", "The pinned ripgrep version probe failed.");
    }
    const match = /^ripgrep ([0-9]+\.[0-9]+\.[0-9]+)/u.exec(decodeNativeText(versionResult.stdout));
    if (match?.[1] !== asset.version || asset.version !== "15.0.0") {
      throw toolError(
        "ripgrep_asset_incompatible",
        "The application-local ripgrep version is incompatible.",
        "reconfigure",
        "Restore the complete Eden archive and recheck repository prerequisites.",
      );
    }
    return { contentHash, path: asset.path, version: asset.version };
  }

  private async probeGit(signal?: AbortSignal): Promise<string> {
    abortIfNeeded(signal);
    const result = requireExited(
      await this.nativeProcess.run(
        {
          arguments: ["--version"],
          cwd: this.workspaceRoot,
          environment: nativeEnvironment(true),
          executable: this.gitExecutable,
          maxStderrBytes: 4_096,
          maxStdoutBytes: 4_096,
          timeoutMs: nativeToolTimeoutMs,
        },
        signal,
      ),
      "git",
    );
    if (result.exitCode !== 0 || result.stderr.byteLength !== 0) {
      throw toolError(
        "git_unavailable",
        "Git could not be probed.",
        "reconfigure",
        "Install Git from https://git-scm.com/downloads and recheck repository prerequisites.",
      );
    }
    const match = /^git version ([0-9]+\.[0-9]+(?:\.[0-9]+)?)/u.exec(
      decodeNativeText(result.stdout).trim(),
    );
    const version = match?.[1];
    if (version === undefined || !versionAtLeast(version, "2.31.0")) {
      throw toolError(
        "git_incompatible",
        "Git 2.31.0 or newer is required.",
        "reconfigure",
        "Update Git from https://git-scm.com/downloads and recheck repository prerequisites.",
      );
    }
    return version;
  }

  async reviewCapabilities(signal?: AbortSignal): Promise<RepositoryCapabilityReview> {
    const ripgrepPromise = this.verifyRipgrep(signal).then(
      (asset) => ({
        contentHash: asset.contentHash,
        error: null,
        minimumVersion: "15.0.0" as const,
        name: "ripgrep" as const,
        state: "ready" as const,
        version: asset.version,
      }),
      (error: unknown) => {
        const productError =
          error instanceof RepositoryToolError
            ? error.productError
            : toolError("ripgrep_asset_unavailable", "ripgrep is unavailable.").productError;
        return {
          contentHash: null,
          error: productError,
          minimumVersion: "15.0.0" as const,
          name: "ripgrep" as const,
          state: "blocked" as const,
          version: null,
        };
      },
    );
    const gitPromise = this.probeGit(signal).then(
      (version) => ({
        contentHash: null,
        error: null,
        minimumVersion: "2.31.0" as const,
        name: "git" as const,
        state: "ready" as const,
        version,
      }),
      (error: unknown) => {
        const productError =
          error instanceof RepositoryToolError
            ? error.productError
            : toolError("git_unavailable", "Git is unavailable.").productError;
        return {
          contentHash: null,
          error: productError,
          minimumVersion: "2.31.0" as const,
          name: "git" as const,
          state: "blocked" as const,
          version: null,
        };
      },
    );
    const [ripgrep, git] = await Promise.all([ripgrepPromise, gitPromise]);
    return {
      git,
      ripgrep,
      state: git.state === "ready" && ripgrep.state === "ready" ? "ready" : "blocked",
    };
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
            if (metadata.nlink !== 1) {
              throw toolError("tool_path_linked", "Linked repository tool paths are not allowed.");
            }
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
        try {
          await handle.close();
        } catch {
          // Node and Bun differ when async iteration already closed the directory handle.
        }
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

  private async preflightSearchPath(
    call: Extract<RepositoryToolCall, { readonly name: "search_repository" }>,
    signal?: AbortSignal,
  ): Promise<void> {
    const target = await this.resolvePath(call.arguments.path);
    if (target.metadata.isFile()) {
      if (target.metadata.nlink !== 1) {
        throw toolError("tool_path_linked", "Linked repository tool paths are not allowed.");
      }
      return;
    }
    if (!target.metadata.isDirectory()) {
      throw toolError("tool_file_type_unsupported", "The search scope has an unsupported type.");
    }
    abortIfNeeded(signal);
  }

  private parseSearchOutput(output: Uint8Array): SearchMatch[] {
    const text = decodeNativeText(output);
    const matches: SearchMatch[] = [];
    const records = text.length === 0 ? [] : text.trimEnd().split("\n");
    if (records.length > 8_192) {
      throw toolError("native_output_invalid", "ripgrep returned too many protocol records.");
    }
    for (const record of records) {
      let value: unknown;
      try {
        value = JSON.parse(record);
      } catch {
        throw toolError("native_output_invalid", "ripgrep returned malformed JSON.");
      }
      if (typeof value !== "object" || value === null || !("type" in value)) {
        throw toolError("native_output_invalid", "ripgrep returned an invalid protocol record.");
      }
      if (value.type === "begin" || value.type === "end" || value.type === "summary") continue;
      if (value.type !== "match" || !("data" in value)) {
        throw toolError(
          "native_output_invalid",
          "ripgrep returned an unsupported protocol record.",
        );
      }
      const data = value.data;
      if (
        typeof data !== "object" ||
        data === null ||
        !("path" in data) ||
        !("lines" in data) ||
        !("line_number" in data) ||
        !("submatches" in data) ||
        typeof data.path !== "object" ||
        data.path === null ||
        !("text" in data.path) ||
        typeof data.path.text !== "string" ||
        typeof data.lines !== "object" ||
        data.lines === null ||
        !("text" in data.lines) ||
        typeof data.lines.text !== "string" ||
        !Number.isSafeInteger(data.line_number) ||
        Number(data.line_number) < 1 ||
        !Array.isArray(data.submatches)
      ) {
        throw toolError("native_output_invalid", "ripgrep returned an invalid match record.");
      }
      const path = data.path.text.startsWith("./") ? data.path.text.slice(2) : data.path.text;
      for (const submatch of data.submatches) {
        if (
          typeof submatch !== "object" ||
          submatch === null ||
          !("start" in submatch) ||
          !Number.isSafeInteger(submatch.start) ||
          Number(submatch.start) < 0
        ) {
          throw toolError("native_output_invalid", "ripgrep returned an invalid submatch.");
        }
        matches.push({
          byteColumn: Number(submatch.start) + 1,
          lineNumber: Number(data.line_number),
          path,
          preview: data.lines.text,
        });
        if (matches.length > 4_096) {
          throw toolError("native_output_overflow", "ripgrep returned too many matches.");
        }
      }
    }
    return matches;
  }

  private async searchRepository(
    call: Extract<RepositoryToolCall, { readonly name: "search_repository" }>,
    signal?: AbortSignal,
  ): Promise<RepositoryToolResult> {
    abortIfNeeded(signal);
    await this.verifyRoot();
    await this.preflightSearchPath(call, signal);
    const asset = await this.verifyRipgrep(signal);
    const observation = requireExited(
      await this.nativeProcess.run(
        {
          arguments: [
            "--json",
            "--no-config",
            "--color",
            "never",
            "--line-number",
            "--column",
            "--sort",
            "path",
            "--max-columns",
            "4096",
            "--max-columns-preview",
            "--no-follow",
            "--glob",
            "!.git/**",
            "--",
            call.arguments.pattern,
            call.arguments.path,
          ],
          cwd: this.workspaceRoot,
          environment: nativeEnvironment(false),
          executable: asset.path,
          maxStderrBytes: 64 * 1_024,
          maxStdoutBytes: nativeOutputByteLimit,
          timeoutMs: nativeToolTimeoutMs,
        },
        signal,
      ),
      "ripgrep",
    );
    if (
      (observation.exitCode !== 0 && observation.exitCode !== 1) ||
      observation.stderr.byteLength !== 0
    ) {
      throw toolError(
        "repository_search_failed",
        "ripgrep could not complete the repository search.",
        "reconfigure",
        "Check repository readability or narrow the search scope and retry.",
      );
    }
    const allMatches = this.parseSearchOutput(observation.stdout);
    const cursor = call.arguments.continuation ?? 0;
    if (cursor > allMatches.length) {
      throw toolError(
        "tool_search_continuation_invalid",
        "The repository search continuation is no longer valid.",
        "retry",
        "Restart the repository search without a continuation.",
      );
    }
    const matches: SearchMatch[] = [];
    for (const match of allMatches.slice(cursor)) {
      const next = [...matches, match];
      if (
        next.length > 256 ||
        Buffer.byteLength(JSON.stringify(next), "utf8") > modelContentByteLimit
      ) {
        break;
      }
      matches.push(match);
    }
    const consumed = cursor + matches.length;
    const truncated = consumed < allMatches.length;
    await this.verifyRoot();
    return {
      data: {
        contentHash: sha256(JSON.stringify(matches)),
        continuation: truncated ? consumed : null,
        engine: { contentHash: asset.contentHash, name: "ripgrep", version: asset.version },
        matches,
        sourcePath: call.arguments.path,
        truncated,
      },
      name: "search_repository",
      status: "succeeded",
      toolCallId: call.toolCallId,
    };
  }

  private gitEntryKind(
    type: "1" | "2" | "?" | "u",
    xy: string,
    score?: string,
  ): GitStatusEntry["kind"] {
    if (type === "?") return "untracked";
    if (type === "u" || xy.includes("U")) return "unmerged";
    if (type === "2") return score?.startsWith("C") === true ? "copied" : "renamed";
    if (xy.includes("A")) return "added";
    if (xy.includes("D")) return "deleted";
    return "modified";
  }

  private parseGitStatus(output: Uint8Array): GitStatusEntry[] {
    const text = decodeNativeText(output);
    const records = text.split("\0");
    if (records.at(-1) !== "") {
      throw toolError("native_output_invalid", "Git status output was not NUL-terminated.");
    }
    records.pop();
    const entries: GitStatusEntry[] = [];
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record === undefined || record.length < 3) {
        throw toolError("native_output_invalid", "Git returned an invalid status record.");
      }
      const type = record[0];
      let xy: string;
      let path: string;
      let originalPath: string | null = null;
      let score: string | undefined;
      if (type === "?") {
        xy = "??";
        path = record.slice(2);
      } else if (type === "1") {
        const fields = record.split(" ");
        if (fields.length < 9)
          throw toolError("native_output_invalid", "Git returned an invalid ordinary record.");
        xy = fields[1] ?? "";
        path = fields.slice(8).join(" ");
      } else if (type === "2") {
        const fields = record.split(" ");
        if (fields.length < 10)
          throw toolError("native_output_invalid", "Git returned an invalid rename record.");
        xy = fields[1] ?? "";
        score = fields[8];
        path = fields.slice(9).join(" ");
        originalPath = records[index + 1] ?? null;
        index += 1;
      } else if (type === "u") {
        const fields = record.split(" ");
        if (fields.length < 11)
          throw toolError("native_output_invalid", "Git returned an invalid unmerged record.");
        xy = fields[1] ?? "";
        path = fields.slice(10).join(" ");
      } else {
        throw toolError("native_output_invalid", "Git returned an unsupported status record.");
      }
      if (!/^[.MADRCUT?!]{2}$/u.test(xy) || path.length === 0) {
        throw toolError("native_output_invalid", "Git returned invalid status fields.");
      }
      entries.push({
        indexStatus: xy[0] ?? ".",
        kind: this.gitEntryKind(type, xy, score),
        originalPath,
        path,
        worktreeStatus: xy[1] ?? ".",
      });
      if (
        entries.length > 256 ||
        Buffer.byteLength(JSON.stringify(entries), "utf8") > modelContentByteLimit
      ) {
        throw toolError(
          "git_status_result_limit",
          "Git status exceeded the bounded result limit.",
          "reconfigure",
          "Reduce the repository status set and recheck.",
        );
      }
    }
    return entries.sort((left, right) => comparePortablePaths(left.path, right.path));
  }

  private async gitStatus(
    call: Extract<RepositoryToolCall, { readonly name: "git_status" }>,
    signal?: AbortSignal,
  ): Promise<RepositoryToolResult> {
    abortIfNeeded(signal);
    await this.verifyRoot();
    const gitVersion = await this.probeGit(signal);
    const observation = requireExited(
      await this.nativeProcess.run(
        {
          arguments: [
            "--no-optional-locks",
            "-c",
            "core.quotepath=false",
            "-c",
            "color.ui=false",
            "-c",
            "core.fsmonitor=false",
            "status",
            "--porcelain=v2",
            "-z",
            "--untracked-files=all",
            "--ignore-submodules=none",
          ],
          cwd: this.workspaceRoot,
          environment: nativeEnvironment(true),
          executable: this.gitExecutable,
          maxStderrBytes: 64 * 1_024,
          maxStdoutBytes: nativeOutputByteLimit,
          timeoutMs: nativeToolTimeoutMs,
        },
        signal,
      ),
      "git",
    );
    if (observation.exitCode !== 0 || observation.stderr.byteLength !== 0) {
      throw toolError(
        "git_repository_required",
        "Git status requires a readable Git worktree.",
        "reconfigure",
        "Open a Git worktree and recheck repository prerequisites.",
      );
    }
    const entries = this.parseGitStatus(observation.stdout);
    await this.verifyRoot();
    return {
      data: {
        contentHash: sha256(JSON.stringify(entries)),
        entries,
        gitVersion,
        sourcePath: ".",
      },
      name: "git_status",
      status: "succeeded",
      toolCallId: call.toolCallId,
    };
  }

  private async executeProduct(call: unknown, signal?: AbortSignal): Promise<RepositoryToolResult> {
    const identity = failureIdentity(call);
    try {
      const decoded = decodeRepositoryToolCall(call);
      if (!decoded.ok) {
        throw toolError("tool_call_invalid", "The repository tool call is invalid.", "fatal");
      }
      let result: RepositoryToolResult;
      switch (decoded.value.name) {
        case "list_files":
          result = await this.listFiles(decoded.value, signal);
          break;
        case "read_file":
          result = await this.readFile(decoded.value, signal);
          break;
        case "search_repository":
          result = await this.searchRepository(decoded.value, signal);
          break;
        case "git_status":
          result = await this.gitStatus(decoded.value, signal);
          break;
      }
      const validated = decodeRepositoryToolResult(result);
      if (!validated.ok) {
        throw toolError("tool_result_invalid", "The repository tool result is invalid.", "fatal");
      }
      return validated.value;
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
          : productData.name === "search_repository"
            ? JSON.stringify(productData.data.matches)
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

import { createHash } from "node:crypto";
import { access, constants as fsConstants, lstat, readFile, realpath } from "node:fs/promises";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  type ActionEnvelopeV1,
  decodeActionEnvelope,
  type RunCommandOperation,
} from "@eden/contracts";

import { type NativeProcessPort, NativeProcessRunner } from "./native-process.ts";

export type RunCommandServiceOptions = {
  readonly nativeProcess?: NativeProcessPort;
  readonly now?: () => string;
  readonly path?: string;
  readonly workspaceRoot: string;
};

export type PrepareRunCommand = {
  readonly actionId: string;
  readonly args: readonly string[];
  readonly canonicalRootHash: string;
  readonly cwd: string;
  readonly network: "host_unrestricted";
  readonly program: string;
  readonly proposalRevision: number;
  readonly reason: string;
  readonly runId: string;
  readonly timeoutMs: number;
  readonly workspaceId: string;
};

export type RunCommandOutputObservation = {
  readonly content: string;
  readonly index: number;
  readonly stream: "stderr" | "stdout";
};

export type RunCommandObservation = {
  readonly cleanupStatus: "complete" | "failed" | "unknown";
  readonly completedAt: string;
  readonly exitCode: number | null;
  readonly outcome:
    | "cancelled"
    | "cleanup_failed"
    | "exited"
    | "invalid_output"
    | "output_overflow"
    | "spawn_failed"
    | "timed_out";
  readonly startedAt: string;
  readonly stderrBytes: number;
  readonly stderrSha256: string;
  readonly stdoutBytes: number;
  readonly stdoutSha256: string;
};

export class RunCommandError extends Error {
  readonly name = "RunCommandError";
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
      suggestedActions: ["Inspect the exact command identity and durable output before retrying."],
    };
  }
}

type BoundFile = {
  readonly byteLength: number;
  readonly device: string;
  readonly inode: string;
  readonly path: string;
  readonly sha256: string;
};

type BoundDirectory = {
  readonly device: string;
  readonly inode: string;
  readonly path: string;
};

const utf8 = new TextEncoder();
const fatalUtf8 = new TextDecoder("utf-8", { fatal: true });

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function commandEnvironment(path: string): Record<string, string> {
  return { LANG: "C.UTF-8", LC_ALL: "C.UTF-8", NO_COLOR: "1", PATH: path };
}

function chunks(content: string): string[] {
  if (content.length === 0) return [];
  const result: string[] = [];
  let rest = content;
  while (rest.length > 0) {
    let end = Math.min(rest.length, 8_192);
    while (end > 0 && utf8.encode(rest.slice(0, end)).byteLength > 8_192) end -= 1;
    if (end === 0)
      throw new RunCommandError(
        "command_output_invalid",
        "Command output cannot be chunked as UTF-8.",
        "fatal",
      );
    result.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  return result;
}

export class RunCommandService {
  readonly #nativeProcess: NativeProcessPort;
  readonly #now: () => string;
  readonly #path: string;
  readonly #workspaceRoot: string;

  constructor(options: RunCommandServiceOptions) {
    this.#nativeProcess = options.nativeProcess ?? new NativeProcessRunner();
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#path = (options.path ?? process.env.PATH ?? "")
      .split(delimiter)
      .filter((entry) => entry.length > 0 && isAbsolute(entry))
      .join(delimiter);
    this.#workspaceRoot = resolve(options.workspaceRoot);
  }

  async #bindDirectory(path: string): Promise<BoundDirectory> {
    const resolved = resolve(this.#workspaceRoot, path);
    if (!isInside(this.#workspaceRoot, resolved)) {
      throw new RunCommandError(
        "command_cwd_outside_workspace",
        "The command cwd leaves the workspace.",
      );
    }
    const canonicalRoot = await realpath(this.#workspaceRoot);
    const canonical = await realpath(resolved).catch(() => null);
    if (
      canonical === null ||
      canonicalRoot !== this.#workspaceRoot ||
      canonical !== resolved ||
      !isInside(canonicalRoot, canonical)
    ) {
      throw new RunCommandError(
        "command_cwd_invalid",
        "The command cwd must be one existing real workspace directory.",
      );
    }
    const metadata = await lstat(resolved, { bigint: true });
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new RunCommandError(
        "command_cwd_invalid",
        "The command cwd must be one real directory.",
      );
    }
    return { device: metadata.dev.toString(), inode: metadata.ino.toString(), path: resolved };
  }

  async #bindExecutable(program: string): Promise<BoundFile> {
    for (const directory of this.#path.split(delimiter).filter((entry) => entry.length > 0)) {
      const candidates =
        process.platform === "win32" && !program.toLowerCase().endsWith(".exe")
          ? [join(directory, `${program}.exe`), join(directory, program)]
          : [join(directory, program)];
      for (const candidate of candidates) {
        try {
          await access(
            candidate,
            process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
          );
          const canonical = await realpath(candidate);
          const metadata = await lstat(canonical, { bigint: true });
          if (
            !metadata.isFile() ||
            metadata.isSymbolicLink() ||
            metadata.nlink !== 1n ||
            metadata.size > 134_217_728n
          )
            continue;
          const bytes = await readFile(canonical);
          return {
            byteLength: bytes.byteLength,
            device: metadata.dev.toString(),
            inode: metadata.ino.toString(),
            path: canonical,
            sha256: hash(bytes),
          };
        } catch {
          // Try the next runtime-owned PATH candidate.
        }
      }
    }
    throw new RunCommandError(
      "command_executable_unavailable",
      "The named command executable is unavailable.",
      "reconfigure",
    );
  }

  async prepare(input: PrepareRunCommand, signal?: AbortSignal): Promise<ActionEnvelopeV1> {
    if (signal?.aborted === true)
      throw new RunCommandError("operation_aborted", "Command preparation was cancelled.", "retry");
    const cwd = await this.#bindDirectory(input.cwd);
    const executable = await this.#bindExecutable(input.program);
    const envelope: ActionEnvelopeV1 = {
      actionId: input.actionId,
      actionVersion: 1,
      authority: {
        environmentClass: "closed_non_secret",
        executionMode: "trusted_host_policy_only",
        network: "host_unrestricted",
        policyVersion: 1,
        ruleSetRevision: "r3-safe-actuation-v1",
      },
      baseSnapshots: [],
      budgets: { outputBytes: 131_072, timeoutMs: input.timeoutMs },
      cwd: ".",
      kind: "run_command",
      lifetime: { kind: "single_use_proposal_revision", revision: input.proposalRevision },
      operation: {
        args: [...input.args],
        cwd: input.cwd,
        cwdIdentity: { device: cwd.device, inode: cwd.inode },
        environment: { lang: "C.UTF-8", lcAll: "C.UTF-8", noColor: "1", path: this.#path },
        executable,
        network: input.network,
        program: input.program,
        reason: input.reason,
        timeoutMs: input.timeoutMs,
        type: "run_command",
      },
      proposalRevision: input.proposalRevision,
      runId: input.runId,
      scope: { capability: "process.execute.structured_trusted_host", paths: [input.cwd] },
      workspace: { canonicalRootHash: input.canonicalRootHash, workspaceId: input.workspaceId },
    };
    const decoded = decodeActionEnvelope(envelope);
    if (!decoded.ok)
      throw new RunCommandError("invalid_action_envelope", decoded.error.message, "fatal");
    return decoded.value;
  }

  async #operation(envelope: ActionEnvelopeV1): Promise<RunCommandOperation> {
    const decoded = decodeActionEnvelope(envelope);
    if (
      !decoded.ok ||
      decoded.value.kind !== "run_command" ||
      decoded.value.operation.type !== "run_command"
    ) {
      throw new RunCommandError(
        "invalid_action_envelope",
        "The run-command envelope is invalid.",
        "fatal",
      );
    }
    return decoded.value.operation;
  }

  async #revalidate(operation: RunCommandOperation): Promise<void> {
    const cwd = await this.#bindDirectory(operation.cwd);
    if (cwd.device !== operation.cwdIdentity.device || cwd.inode !== operation.cwdIdentity.inode) {
      throw new RunCommandError("command_cwd_stale", "The approved command cwd identity changed.");
    }
    await access(
      operation.executable.path,
      process.platform === "win32" ? fsConstants.F_OK : fsConstants.X_OK,
    );
    const metadata = await lstat(operation.executable.path, { bigint: true });
    const bytes = await readFile(operation.executable.path);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1n ||
      metadata.dev.toString() !== operation.executable.device ||
      metadata.ino.toString() !== operation.executable.inode ||
      bytes.byteLength !== operation.executable.byteLength ||
      hash(bytes) !== operation.executable.sha256
    ) {
      throw new RunCommandError(
        "command_executable_stale",
        "The approved executable identity changed.",
      );
    }
  }

  async execute(
    envelope: ActionEnvelopeV1,
    observe: (observation: RunCommandOutputObservation) => Promise<void>,
    markDispatchStarted: () => Promise<void>,
    signal?: AbortSignal,
  ): Promise<RunCommandObservation> {
    const operation = await this.#operation(envelope);
    await this.#revalidate(operation);
    if (signal?.aborted === true)
      throw new RunCommandError(
        "operation_aborted",
        "Command execution was cancelled before dispatch.",
        "retry",
      );
    await markDispatchStarted();
    const startedAt = this.#now();
    const observation = await this.#nativeProcess.run(
      {
        arguments: operation.args,
        cwd: resolve(this.#workspaceRoot, operation.cwd),
        environment: commandEnvironment(operation.environment.path),
        executable: operation.executable.path,
        maxStderrBytes: 65_536,
        maxStdoutBytes: 65_536,
        timeoutMs: operation.timeoutMs,
      },
      signal,
    );
    const completedAt = this.#now();
    let stdout: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let stderr: Uint8Array<ArrayBufferLike> = new Uint8Array();
    let exitCode: number | null = null;
    let outcome: RunCommandObservation["outcome"];
    let cleanupStatus: RunCommandObservation["cleanupStatus"] = "complete";
    if (observation.status === "exited") {
      stdout = observation.stdout;
      stderr = observation.stderr;
      exitCode = observation.exitCode;
      outcome = "exited";
    } else {
      outcome =
        observation.status === "aborted"
          ? "cancelled"
          : observation.status === "timed-out"
            ? "timed_out"
            : observation.status === "output-overflow"
              ? "output_overflow"
              : observation.status === "cleanup-failed"
                ? "cleanup_failed"
                : "spawn_failed";
      if (observation.status === "cleanup-failed") cleanupStatus = "failed";
    }
    let stdoutText = "";
    let stderrText = "";
    try {
      stdoutText = fatalUtf8.decode(stdout);
      stderrText = fatalUtf8.decode(stderr);
    } catch {
      outcome = "invalid_output";
      exitCode = null;
      stdout = new Uint8Array();
      stderr = new Uint8Array();
      stdoutText = "";
      stderrText = "";
    }
    for (const [stream, content] of [
      ["stdout", stdoutText],
      ["stderr", stderrText],
    ] as const) {
      for (const [index, chunk] of chunks(content).entries()) {
        await observe({ content: chunk, index, stream });
      }
    }
    return {
      cleanupStatus,
      completedAt,
      exitCode,
      outcome,
      startedAt,
      stderrBytes: stderr.byteLength,
      stderrSha256: hash(stderr),
      stdoutBytes: stdout.byteLength,
      stdoutSha256: hash(stdout),
    };
  }
}

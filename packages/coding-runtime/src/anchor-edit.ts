import { createHash } from "node:crypto";
import { lstat, open, realpath, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
  type ActionEnvelopeV1,
  type AnchorEditOperation,
  type AnchorReplacement,
  decodeActionEnvelope,
  type ProductError,
} from "@eden/contracts";

import {
  type NativeProcessObservation,
  type NativeProcessPort,
  NativeProcessRunner,
} from "./native-process.ts";
import { acquireWorkspaceLock } from "./workspace/workspace-lock.ts";

const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const fileByteLimit = 1_048_576;
const nativeOutputLimit = 2_097_152;
const gitTimeoutMs = 5_000;

type TargetSnapshot = {
  readonly bytes: Uint8Array;
  readonly mode: number;
  readonly path: string;
  readonly sha256: string;
  readonly text: string;
};

export class AnchorEditError extends Error {
  readonly productError: ProductError;

  constructor(
    code: string,
    message: string,
    recoverability: ProductError["recoverability"] = "fatal",
  ) {
    super(message);
    this.name = "AnchorEditError";
    this.productError = {
      code,
      message,
      recoverability,
      suggestedActions: ["Inspect the target and request a fresh edit proposal."],
    };
  }
}

export type AnchorEditServiceOptions = {
  readonly workspaceRoot: string;
  readonly stateDirectory: string;
  readonly gitExecutable?: string;
  readonly nativeProcess?: NativeProcessPort;
  readonly now?: () => string;
};

export type PrepareAnchorEdit = {
  readonly actionId: string;
  readonly runId: ActionEnvelopeV1["runId"];
  readonly proposalRevision: number;
  readonly workspaceId: string;
  readonly canonicalRootHash: string;
  readonly path: string;
  readonly replacements: readonly AnchorReplacement[];
};

export type AnchorEditObservation = {
  readonly state: "completed";
  readonly path: string;
  readonly baseSha256: string;
  readonly desiredSha256: string;
  readonly byteLength: number;
};

export type AnchorEditReconciliation = {
  readonly state: "completed" | "not_started" | "unknown";
};

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function sameIdentity(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function gitEnvironment(): Record<string, string> {
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
    GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
  };
  for (const name of ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

function requireExited(
  observation: NativeProcessObservation,
): Extract<NativeProcessObservation, { readonly status: "exited" }> {
  if (observation.status !== "exited") {
    throw new AnchorEditError(
      "git_tracked_query_failed",
      "Git could not prove that the edit target is tracked.",
      observation.status === "aborted" ? "retry" : "reconfigure",
    );
  }
  return observation;
}

function desiredText(base: string, replacements: readonly AnchorReplacement[]): string {
  const spans: { readonly start: number; readonly end: number; readonly replacement: string }[] =
    [];
  for (const replacement of replacements) {
    const first = base.indexOf(replacement.oldText);
    const second = first < 0 ? -1 : base.indexOf(replacement.oldText, first + 1);
    if (first < 0 || second >= 0) {
      throw new AnchorEditError(
        "anchor_not_unique",
        "Every AnchorEdit oldText must occur exactly once in the approved base snapshot.",
      );
    }
    spans.push({
      start: first,
      end: first + replacement.oldText.length,
      replacement: replacement.newText,
    });
  }
  const ordered = [...spans].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous !== undefined && current !== undefined && previous.end > current.start) {
      throw new AnchorEditError("anchor_overlap", "AnchorEdit replacements cannot overlap.");
    }
  }
  let result = base;
  for (const span of ordered.toReversed()) {
    result = `${result.slice(0, span.start)}${span.replacement}${result.slice(span.end)}`;
  }
  if (result === base) {
    throw new AnchorEditError("anchor_edit_unchanged", "AnchorEdit must change the target bytes.");
  }
  return result;
}

export class AnchorEditService {
  readonly #gitExecutable: string;
  readonly #nativeProcess: NativeProcessPort;
  readonly #now: () => string;
  readonly #stateDirectory: string;
  readonly #workspaceRoot: string;

  constructor(options: AnchorEditServiceOptions) {
    this.#workspaceRoot = options.workspaceRoot;
    this.#stateDirectory = options.stateDirectory;
    this.#gitExecutable = options.gitExecutable ?? "git";
    this.#nativeProcess = options.nativeProcess ?? new NativeProcessRunner();
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async #readTarget(path: string): Promise<TargetSnapshot> {
    const root = await realpath(this.#workspaceRoot);
    const candidate = resolve(root, path);
    if (!inside(root, candidate)) {
      throw new AnchorEditError(
        "path_outside_workspace",
        "The edit path leaves the trusted workspace.",
      );
    }
    const parent = await realpath(dirname(candidate));
    if (!inside(root, parent)) {
      throw new AnchorEditError("path_outside_workspace", "The edit parent leaves the workspace.");
    }
    const target = join(parent, basename(candidate));
    const before = await lstat(target).catch(() => {
      throw new AnchorEditError("edit_target_unavailable", "The edit target is unavailable.");
    });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
      throw new AnchorEditError(
        "edit_target_unsupported",
        "AnchorEdit requires one regular, non-linked file.",
      );
    }
    if (before.size > fileByteLimit) {
      throw new AnchorEditError("edit_target_too_large", "The edit target exceeds 1 MiB.");
    }
    const handle = await open(target, "r");
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(before, opened)) {
        throw new AnchorEditError("edit_target_stale", "The edit target identity changed.");
      }
      const bytes = await handle.readFile();
      const after = await handle.stat();
      if (!sameIdentity(opened, after) || bytes.byteLength !== after.size) {
        throw new AnchorEditError(
          "edit_target_stale",
          "The edit target changed while it was read.",
        );
      }
      const named = await lstat(target);
      if (!sameIdentity(opened, named)) {
        throw new AnchorEditError(
          "edit_target_stale",
          "The edit target path changed while it was read.",
        );
      }
      let text: string;
      try {
        text = fatalUtf8Decoder.decode(bytes);
      } catch {
        throw new AnchorEditError("edit_target_invalid_utf8", "AnchorEdit requires valid UTF-8.");
      }
      return {
        bytes,
        mode: opened.mode & 0o777,
        path: target,
        sha256: hash(bytes),
        text,
      };
    } finally {
      await handle.close();
    }
  }

  async #requireTracked(path: string, signal?: AbortSignal): Promise<void> {
    const observation = requireExited(
      await this.#nativeProcess.run(
        {
          executable: this.#gitExecutable,
          arguments: ["--no-pager", "ls-files", "--error-unmatch", "-z", "--", path],
          cwd: await realpath(this.#workspaceRoot),
          environment: gitEnvironment(),
          maxStdoutBytes: nativeOutputLimit,
          maxStderrBytes: nativeOutputLimit,
          timeoutMs: gitTimeoutMs,
        },
        signal,
      ),
    );
    if (observation.exitCode !== 0) {
      throw new AnchorEditError(
        "edit_target_untracked",
        "AnchorEdit can modify only an existing Git-tracked file.",
      );
    }
    const output = fatalUtf8Decoder.decode(observation.stdout);
    if (output !== `${path}\0`) {
      throw new AnchorEditError(
        "git_tracked_query_invalid",
        "Git returned an unexpected trackedness result.",
      );
    }
  }

  async prepare(input: PrepareAnchorEdit, signal?: AbortSignal): Promise<ActionEnvelopeV1> {
    await this.#requireTracked(input.path, signal);
    const base = await this.#readTarget(input.path);
    const desired = desiredText(base.text, input.replacements);
    const desiredBytes = new TextEncoder().encode(desired);
    if (desiredBytes.byteLength > fileByteLimit) {
      throw new AnchorEditError("edit_result_too_large", "The edit result exceeds 1 MiB.");
    }
    const envelope: ActionEnvelopeV1 = {
      actionVersion: 1,
      actionId: input.actionId,
      runId: input.runId,
      proposalRevision: input.proposalRevision,
      kind: "anchor_edit",
      operation: {
        type: "anchor_edit",
        path: input.path,
        baseByteLength: base.bytes.byteLength,
        baseSha256: base.sha256,
        desiredByteLength: desiredBytes.byteLength,
        desiredSha256: hash(desiredBytes),
        replacements: [...input.replacements],
      },
      workspace: {
        workspaceId: input.workspaceId,
        canonicalRootHash: input.canonicalRootHash,
      },
      cwd: ".",
      scope: {
        capability: "workspace.write.existing_tracked_utf8",
        paths: [input.path],
      },
      baseSnapshots: [{ path: input.path, byteLength: base.bytes.byteLength, sha256: base.sha256 }],
      authority: {
        policyVersion: 1,
        ruleSetRevision: "r2-safe-actuation-v1",
        environmentClass: "none",
        network: "not_requested",
        executionMode: "trusted_host_policy_only",
      },
      budgets: { timeoutMs: null, outputBytes: null },
      lifetime: {
        kind: "single_use_proposal_revision",
        revision: input.proposalRevision,
      },
    };
    const decoded = decodeActionEnvelope(envelope);
    if (!decoded.ok) throw new AnchorEditError("invalid_action_envelope", decoded.error.message);
    return decoded.value;
  }

  async execute(envelope: ActionEnvelopeV1, signal?: AbortSignal): Promise<AnchorEditObservation> {
    const decoded = decodeActionEnvelope(envelope);
    if (
      !decoded.ok ||
      decoded.value.operation.type !== "anchor_edit" ||
      decoded.value.kind !== "anchor_edit"
    ) {
      throw new AnchorEditError("invalid_action_envelope", "The AnchorEdit envelope is invalid.");
    }
    const operation = decoded.value.operation as AnchorEditOperation;
    const lock = await acquireWorkspaceLock({
      acquiredAt: this.#now(),
      stateDirectory: this.#stateDirectory,
      workspaceId: decoded.value.workspace.workspaceId,
      ...(signal === undefined ? {} : { signal }),
    });
    try {
      await this.#requireTracked(operation.path, signal);
      const base = await this.#readTarget(operation.path);
      if (
        base.bytes.byteLength !== operation.baseByteLength ||
        base.sha256 !== operation.baseSha256
      ) {
        throw new AnchorEditError(
          "edit_target_stale",
          "The edit target no longer matches its base.",
        );
      }
      const desired = new TextEncoder().encode(desiredText(base.text, operation.replacements));
      if (
        desired.byteLength !== operation.desiredByteLength ||
        hash(desired) !== operation.desiredSha256
      ) {
        throw new AnchorEditError(
          "edit_desired_mismatch",
          "The desired snapshot changed after approval.",
        );
      }
      const temporary = join(
        dirname(base.path),
        `.eden-edit-${createHash("sha256").update(envelope.actionId).digest("hex").slice(0, 16)}.tmp`,
      );
      let replaced = false;
      const handle = await open(temporary, "wx", base.mode);
      try {
        await handle.chmod(base.mode);
        await handle.writeFile(desired);
        await handle.sync();
      } finally {
        await handle.close();
      }
      try {
        const current = await this.#readTarget(operation.path);
        if (
          current.sha256 !== operation.baseSha256 ||
          current.bytes.byteLength !== operation.baseByteLength
        ) {
          throw new AnchorEditError("edit_target_stale", "The target changed before replacement.");
        }
        await rename(temporary, base.path);
        replaced = true;
        const observed = await this.#readTarget(operation.path);
        if (
          observed.sha256 !== operation.desiredSha256 ||
          observed.bytes.byteLength !== operation.desiredByteLength
        ) {
          throw new AnchorEditError(
            "edit_verification_failed",
            "The replaced file is not the approved result.",
          );
        }
        const directory = await open(dirname(base.path), "r").catch(() => null);
        try {
          await directory?.sync().catch(() => undefined);
        } finally {
          await directory?.close();
        }
        return {
          state: "completed",
          path: operation.path,
          baseSha256: operation.baseSha256,
          desiredSha256: operation.desiredSha256,
          byteLength: operation.desiredByteLength,
        };
      } finally {
        if (!replaced) await unlink(temporary).catch(() => undefined);
      }
    } finally {
      await lock.release();
    }
  }

  async readReviewBase(envelope: ActionEnvelopeV1): Promise<string> {
    const decoded = decodeActionEnvelope(envelope);
    if (
      !decoded.ok ||
      decoded.value.operation.type !== "anchor_edit" ||
      decoded.value.kind !== "anchor_edit"
    ) {
      throw new AnchorEditError("invalid_action_envelope", "The AnchorEdit envelope is invalid.");
    }
    const current = await this.#readTarget(decoded.value.operation.path);
    if (
      current.bytes.byteLength !== decoded.value.operation.baseByteLength ||
      current.sha256 !== decoded.value.operation.baseSha256
    ) {
      throw new AnchorEditError(
        "edit_target_stale",
        "The review base no longer matches the approved proposal.",
      );
    }
    return current.text;
  }

  async reconcile(envelope: ActionEnvelopeV1): Promise<AnchorEditReconciliation> {
    if (envelope.operation.type !== "anchor_edit") return { state: "unknown" };
    try {
      const current = await this.#readTarget(envelope.operation.path);
      if (
        current.bytes.byteLength === envelope.operation.desiredByteLength &&
        current.sha256 === envelope.operation.desiredSha256
      ) {
        return { state: "completed" };
      }
      if (
        current.bytes.byteLength === envelope.operation.baseByteLength &&
        current.sha256 === envelope.operation.baseSha256
      ) {
        return { state: "not_started" };
      }
      return { state: "unknown" };
    } catch {
      return { state: "unknown" };
    }
  }
}

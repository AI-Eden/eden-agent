import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";

import type {
  ActionEnvelopeV1,
  AttributedChangedFile,
  ChangeReview,
  CheckDiagnostic,
  ClosedCheckObservation,
  PatchObservation,
  ProductError,
  RepositoryToolResult,
} from "@eden/contracts";
import type { GitReviewSnapshot } from "@eden/kernel";

import {
  type NativeProcessObservation,
  type NativeProcessPort,
  NativeProcessRunner,
} from "./native-process.ts";
import { RepositoryToolService, type RepositoryToolServiceOptions } from "./tools/index.ts";

const captureByteLimit = 2_097_152;
const reviewByteLimit = 24_576;
const timeoutMs = 5_000;
const fatalUtf8 = new TextDecoder("utf-8", { fatal: true });
const utf8 = new TextEncoder();

type GitStatusSuccess = Extract<
  RepositoryToolResult,
  { readonly name: "git_status"; readonly status: "succeeded" }
>;

export type GitReviewCapture = {
  readonly check: ClosedCheckObservation;
  readonly head: string;
  readonly observedAt: string;
  readonly status: GitStatusSuccess["data"];
  readonly trackedPatch: PatchObservation;
};

export class GitReviewError extends Error {
  readonly productError: ProductError;

  constructor(
    code: string,
    message: string,
    recoverability: ProductError["recoverability"] = "fatal",
  ) {
    super(message);
    this.name = "GitReviewError";
    this.productError = {
      code,
      message,
      recoverability,
      suggestedActions: ["Inspect the repository state and request a fresh review."],
    };
  }
}

export type GitReviewServiceOptions = {
  readonly gitExecutable?: string;
  readonly nativeProcess?: NativeProcessPort;
  readonly now?: () => string;
  readonly repositoryTools?: Omit<RepositoryToolServiceOptions, "workspaceRoot">;
  readonly workspaceRoot: string;
};

function hash(value: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function nativeEnvironment(): Record<string, string> {
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

function requireExit(
  observation: NativeProcessObservation,
  operation: string,
): Extract<NativeProcessObservation, { readonly status: "exited" }> {
  if (observation.status !== "exited") {
    throw new GitReviewError(
      observation.status === "output-overflow"
        ? "git_capture_limit_exceeded"
        : `git_${operation}_unavailable`,
      `Git ${operation} did not produce one complete bounded observation.`,
      observation.status === "aborted" || observation.status === "timed-out"
        ? "retry"
        : "reconfigure",
    );
  }
  return observation;
}

function decode(bytes: Uint8Array, operation: string): string {
  try {
    return fatalUtf8.decode(bytes);
  } catch {
    throw new GitReviewError(
      `git_${operation}_invalid_utf8`,
      `Git ${operation} returned invalid UTF-8.`,
    );
  }
}

function completePatch(content: string, byteLimit = reviewByteLimit): PatchObservation {
  const byteLength = utf8.encode(content).byteLength;
  if (byteLength > byteLimit) {
    return {
      error: {
        code: "review_budget_exceeded",
        message: "The complete patch exceeds its closed review budget.",
        recoverability: "ask-user",
        suggestedActions: ["Narrow the workspace change set before requesting another edit."],
      },
      state: "blocked",
    };
  }
  return { byteLength, content, contentHash: hash(content), state: "complete" };
}

type ResolvedAnchor = {
  readonly desiredEnd: number;
  readonly desiredStart: number;
  readonly end: number;
  readonly replacement: string;
  readonly start: number;
};

function resolveAnchors(base: string, envelope: ActionEnvelopeV1): readonly ResolvedAnchor[] {
  if (envelope.operation.type !== "anchor_edit") {
    throw new GitReviewError("review_action_invalid", "Review requires one AnchorEdit envelope.");
  }
  const spans = envelope.operation.replacements.map((replacement) => {
    const start = base.indexOf(replacement.oldText);
    if (start < 0 || base.indexOf(replacement.oldText, start + 1) >= 0) {
      throw new GitReviewError(
        "review_base_stale",
        "The approved anchors no longer identify the captured base.",
      );
    }
    return {
      end: start + replacement.oldText.length,
      replacement: replacement.newText,
      start,
    };
  });
  const ordered = spans.sort((left, right) => left.start - right.start);
  for (const [index, span] of ordered.entries()) {
    const previous = ordered[index - 1];
    if (previous !== undefined && previous.end > span.start) {
      throw new GitReviewError("review_anchor_overlap", "Approved review anchors overlap.");
    }
  }
  let delta = 0;
  return ordered.map((span) => {
    const desiredStart = span.start + delta;
    const desiredEnd = desiredStart + span.replacement.length;
    delta += span.replacement.length - (span.end - span.start);
    return { ...span, desiredEnd, desiredStart };
  });
}

function applyAnchors(base: string, envelope: ActionEnvelopeV1): string {
  let desired = base;
  for (const span of resolveAnchors(base, envelope).toReversed()) {
    desired = `${desired.slice(0, span.start)}${span.replacement}${desired.slice(span.end)}`;
  }
  return desired;
}

function splitLines(value: string): string[] {
  return value.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
}

function lineStarts(lines: readonly string[]): number[] {
  const starts = [0];
  for (const line of lines) starts.push((starts.at(-1) ?? 0) + line.length);
  return starts;
}

function lineIndex(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = Math.max(0, starts.length - 2);
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low;
}

function patchLine(line: string, prefix: " " | "-" | "+"): string {
  return line.endsWith("\n")
    ? `${prefix}${line}`
    : `${prefix}${line}\n\\ No newline at end of file\n`;
}

type PatchWindow = {
  baseEnd: number;
  baseStart: number;
  desiredEnd: number;
  desiredStart: number;
};

function mergeWindows(windows: readonly PatchWindow[]): PatchWindow[] {
  const merged: PatchWindow[] = [];
  for (const window of windows) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      (window.baseStart <= previous.baseEnd || window.desiredStart <= previous.desiredEnd)
    ) {
      previous.baseEnd = Math.max(previous.baseEnd, window.baseEnd);
      previous.desiredEnd = Math.max(previous.desiredEnd, window.desiredEnd);
      continue;
    }
    merged.push({ ...window });
  }
  return merged;
}

export function createEdenPatch(envelope: ActionEnvelopeV1, baseText: string): PatchObservation {
  if (envelope.operation.type === "write_file") {
    if (baseText !== "") {
      throw new GitReviewError(
        "review_base_stale",
        "A new-file review requires an absent empty base.",
      );
    }
    const desired = envelope.operation.content;
    if (
      utf8.encode(desired).byteLength !== envelope.operation.byteLength ||
      hash(desired) !== envelope.operation.sha256
    ) {
      throw new GitReviewError(
        "review_desired_mismatch",
        "The new-file review bytes do not match the approved snapshot.",
      );
    }
    const lines = splitLines(desired);
    const patch = [
      `diff --git a/${envelope.operation.path} b/${envelope.operation.path}\n`,
      "new file mode 100644\n",
      "--- /dev/null\n",
      `+++ b/${envelope.operation.path}\n`,
      `@@ -0,0 +1,${lines.length} @@\n`,
      ...lines.map((line) => patchLine(line, "+")),
    ].join("");
    return completePatch(patch, 57_344);
  }
  if (envelope.operation.type !== "anchor_edit") {
    throw new GitReviewError("review_action_invalid", "Review requires one AnchorEdit envelope.");
  }
  if (
    utf8.encode(baseText).byteLength !== envelope.operation.baseByteLength ||
    hash(baseText) !== envelope.operation.baseSha256
  ) {
    throw new GitReviewError(
      "review_base_stale",
      "The review base does not match the approved snapshot.",
    );
  }
  const desired = applyAnchors(baseText, envelope);
  if (
    utf8.encode(desired).byteLength !== envelope.operation.desiredByteLength ||
    hash(desired) !== envelope.operation.desiredSha256
  ) {
    throw new GitReviewError(
      "review_desired_mismatch",
      "The review delta does not match the approved desired snapshot.",
    );
  }
  const path = envelope.operation.path;
  const baseLines = splitLines(baseText);
  const desiredLines = splitLines(desired);
  const baseStarts = lineStarts(baseLines);
  const desiredStarts = lineStarts(desiredLines);
  const windows = mergeWindows(
    resolveAnchors(baseText, envelope).map((span) => {
      const baseFirst = lineIndex(baseStarts, span.start);
      const baseLast = lineIndex(baseStarts, Math.max(span.start, span.end - 1));
      const desiredFirst = lineIndex(desiredStarts, span.desiredStart);
      const desiredLast = lineIndex(
        desiredStarts,
        Math.max(span.desiredStart, span.desiredEnd - 1),
      );
      return {
        baseEnd: Math.min(baseLines.length, baseLast + 4),
        baseStart: Math.max(0, baseFirst - 3),
        desiredEnd: Math.min(desiredLines.length, desiredLast + 4),
        desiredStart: Math.max(0, desiredFirst - 3),
      };
    }),
  );
  const hunks = windows.map((window) => {
    const before = baseLines.slice(window.baseStart, window.baseEnd);
    const after = desiredLines.slice(window.desiredStart, window.desiredEnd);
    let prefix = 0;
    while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
      prefix += 1;
    }
    let suffix = 0;
    while (
      suffix < before.length - prefix &&
      suffix < after.length - prefix &&
      before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
    ) {
      suffix += 1;
    }
    const contextBefore = before.slice(0, prefix);
    const removed = before.slice(prefix, before.length - suffix);
    const added = after.slice(prefix, after.length - suffix);
    const contextAfter = suffix === 0 ? [] : before.slice(before.length - suffix);
    return [
      `@@ -${window.baseStart + 1},${before.length} +${window.desiredStart + 1},${after.length} @@\n`,
      ...contextBefore.map((line) => patchLine(line, " ")),
      ...removed.map((line) => patchLine(line, "-")),
      ...added.map((line) => patchLine(line, "+")),
      ...contextAfter.map((line) => patchLine(line, " ")),
    ].join("");
  });
  return completePatch(
    [`diff --eden a/${path} b/${path}\n`, `--- a/${path}\n`, `+++ b/${path}\n`, ...hunks].join(""),
  );
}

function parseDiagnostics(content: string): CheckDiagnostic[] {
  if (content.length === 0) return [];
  const diagnostics: CheckDiagnostic[] = [];
  for (const rawLine of content.split("\n")) {
    if (rawLine.length === 0) continue;
    if (rawLine.startsWith("+") && diagnostics.length > 0) continue;
    const match = /^(.*):([1-9][0-9]*): (.+)$/u.exec(rawLine);
    if (match === null) {
      throw new GitReviewError(
        "git_diff_check_output_invalid",
        "Git diff-check returned an unknown diagnostic shape.",
      );
    }
    const [, path, line, message] = match;
    if (path === undefined || line === undefined || message === undefined) {
      throw new GitReviewError(
        "git_diff_check_output_invalid",
        "Git diff-check returned an incomplete diagnostic.",
      );
    }
    const lineNumber = Number(line);
    const pathSegments = path.split("/");
    if (
      path.length === 0 ||
      path.length > 4_096 ||
      path.startsWith("/") ||
      path.startsWith("\\") ||
      /^[A-Za-z]:/u.test(path) ||
      path.includes("\\") ||
      hasControlCharacter(path) ||
      pathSegments.some((segment) => segment.length === 0 || segment === "." || segment === "..") ||
      message.length === 0 ||
      message.length > 4_096 ||
      hasControlCharacter(message) ||
      !Number.isSafeInteger(lineNumber)
    ) {
      throw new GitReviewError(
        "git_diff_check_output_invalid",
        "Git diff-check returned a diagnostic outside the closed contract.",
      );
    }
    diagnostics.push({
      diagnosticId: hash(`${path}\0${line}\0${message}`),
      line: lineNumber,
      message,
      path,
    });
  }
  if (utf8.encode(JSON.stringify(diagnostics)).byteLength > reviewByteLimit) {
    throw new GitReviewError(
      "review_budget_exceeded",
      "The complete diff-check diagnostics exceed the 24 KiB review budget.",
      "ask-user",
    );
  }
  return diagnostics;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

export class GitReviewService {
  readonly #gitExecutable: string;
  readonly #nativeProcess: NativeProcessPort;
  readonly #now: () => string;
  readonly #repositoryTools: Promise<RepositoryToolService>;
  readonly #workspaceRoot: string;

  constructor(options: GitReviewServiceOptions) {
    this.#workspaceRoot = options.workspaceRoot;
    this.#gitExecutable = options.gitExecutable ?? "git";
    this.#nativeProcess = options.nativeProcess ?? new NativeProcessRunner();
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#repositoryTools = RepositoryToolService.open({
      ...options.repositoryTools,
      gitExecutable: this.#gitExecutable,
      nativeProcess: this.#nativeProcess,
      workspaceRoot: options.workspaceRoot,
    });
  }

  async #run(arguments_: readonly string[], operation: string, signal?: AbortSignal) {
    const root = await realpath(this.#workspaceRoot);
    return requireExit(
      await this.#nativeProcess.run(
        {
          arguments: arguments_,
          cwd: root,
          environment: nativeEnvironment(),
          executable: this.#gitExecutable,
          maxStderrBytes: captureByteLimit,
          maxStdoutBytes: captureByteLimit,
          timeoutMs,
        },
        signal,
      ),
      operation,
    );
  }

  async #head(signal?: AbortSignal): Promise<string> {
    const observation = await this.#run(
      ["--no-pager", "rev-parse", "--verify", "HEAD"],
      "head",
      signal,
    );
    if (observation.exitCode !== 0 || observation.stderr.byteLength !== 0) {
      throw new GitReviewError("git_head_unavailable", "Git could not capture HEAD.");
    }
    const head = decode(observation.stdout, "head").trimEnd();
    if (!/^[a-f0-9]{40,64}$/u.test(head)) {
      throw new GitReviewError("git_head_invalid", "Git returned an invalid HEAD identity.");
    }
    return head;
  }

  async #requireHead(expectedHead: string, signal?: AbortSignal): Promise<void> {
    if ((await this.#head(signal)) !== expectedHead) {
      throw new GitReviewError(
        "review_head_changed",
        "HEAD changed during review capture, so the evidence cannot use the captured base.",
        "ask-user",
      );
    }
  }

  async #status(signal?: AbortSignal): Promise<GitStatusSuccess["data"]> {
    const result = (
      await (
        await this.#repositoryTools
      ).execute({ arguments: {}, name: "git_status", toolCallId: "safe-review-status" }, signal)
    ).productData;
    if (result.status !== "succeeded" || result.name !== "git_status") {
      throw new GitReviewError(
        "git_status_unavailable",
        "Git status could not be captured for review.",
      );
    }
    return result.data;
  }

  async #patch(signal?: AbortSignal): Promise<PatchObservation> {
    const observation = await this.#run(
      [
        "--no-pager",
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--src-prefix=a/",
        "--dst-prefix=b/",
        "HEAD",
        "--",
      ],
      "diff",
      signal,
    );
    if (observation.exitCode !== 0 || observation.stderr.byteLength !== 0) {
      throw new GitReviewError("git_diff_failed", "Git could not capture the tracked patch.");
    }
    return completePatch(decode(observation.stdout, "diff"));
  }

  async #check(head: string, signal?: AbortSignal): Promise<ClosedCheckObservation> {
    await this.#requireHead(head, signal);
    const observedAt = this.#now();
    const observation = await this.#run(
      [
        "--no-pager",
        "diff",
        "--check",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "HEAD",
        "--",
      ],
      "diff_check",
      signal,
    );
    if (![0, 2].includes(observation.exitCode) || observation.stderr.byteLength !== 0) {
      throw new GitReviewError(
        "git_diff_check_failed",
        "Git diff-check did not produce a closed result.",
      );
    }
    const diagnostics = parseDiagnostics(decode(observation.stdout, "diff_check"));
    await this.#requireHead(head, signal);
    return {
      checkId: `check-${hash(`${head}\0${observedAt}\0${JSON.stringify(diagnostics)}`).slice(7)}`,
      contentHash: hash(JSON.stringify(diagnostics)),
      diagnostics,
      head,
      observedAt,
      status: diagnostics.length === 0 ? "passed" : "failed",
      template: "git_diff_check",
    };
  }

  async capture(signal?: AbortSignal): Promise<GitReviewCapture> {
    const head = await this.#head(signal);
    const observedAt = this.#now();
    const [status, trackedPatch, check] = await Promise.all([
      this.#status(signal),
      this.#patch(signal),
      this.#check(head, signal),
    ]);
    await this.#requireHead(head, signal);
    return { check, head, observedAt, status, trackedPatch };
  }

  async captureSnapshot(signal?: AbortSignal): Promise<GitReviewSnapshot> {
    const head = await this.#head(signal);
    const observedAt = this.#now();
    const [status, trackedPatch] = await Promise.all([this.#status(signal), this.#patch(signal)]);
    await this.#requireHead(head, signal);
    return {
      head,
      observedAt,
      statusEntries: status.entries,
      statusHash: status.contentHash,
      trackedPatch,
    };
  }

  captureCheck(head: string, signal?: AbortSignal): Promise<ClosedCheckObservation> {
    return this.#check(head, signal);
  }

  async review(
    baseline: GitReviewCapture,
    envelope: ActionEnvelopeV1,
    edenPatch: PatchObservation,
    signal?: AbortSignal,
  ): Promise<ChangeReview> {
    if (envelope.operation.type !== "anchor_edit") {
      throw new GitReviewError("review_action_invalid", "Review requires one AnchorEdit envelope.");
    }
    const operation = envelope.operation;
    const current = await this.capture(signal);
    if (current.head !== baseline.head) {
      throw new GitReviewError(
        "review_head_changed",
        "HEAD changed after approval, so the review cannot use the captured base.",
        "ask-user",
      );
    }
    const baselinePaths = new Set(
      baseline.status.entries
        .filter((entry) => entry.kind !== "untracked")
        .map((entry) => entry.path),
    );
    const changedFiles: AttributedChangedFile[] = current.status.entries.flatMap((entry) => {
      if (entry.kind === "untracked") return [];
      const eden = entry.path === operation.path;
      return [
        {
          attribution: eden ? (baselinePaths.has(entry.path) ? "both" : "eden") : "pre_existing",
          path: entry.path,
          status: entry.kind === "copied" ? "renamed" : entry.kind,
        },
      ];
    });
    const baselineDiagnosticIds = new Set(
      baseline.check.diagnostics.map((diagnostic) => diagnostic.diagnosticId),
    );
    return {
      baselineCheck: baseline.check,
      changedFiles,
      currentCheck: current.check,
      currentTrackedPatch: current.trackedPatch,
      edenPatch,
      executionMode: "trusted_host_policy_only",
      head: current.head,
      isolation: "none",
      network: "not_requested",
      newlyObservedDiagnostics: current.check.diagnostics
        .filter((diagnostic) => !baselineDiagnosticIds.has(diagnostic.diagnosticId))
        .map((diagnostic) => diagnostic.diagnosticId),
      observedAt: current.observedAt,
      statusHash: current.status.contentHash,
      untrackedPaths: current.status.entries
        .filter((entry) => entry.kind === "untracked")
        .map((entry) => entry.path),
    };
  }
}

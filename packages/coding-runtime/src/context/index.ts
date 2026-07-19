import { createHash } from "node:crypto";
import { lstat, open, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type {
  ContextAdmissionSummary,
  ContextPriority,
  ContextSelectionItem,
  InstructionSnapshotSummary,
  ProductError,
} from "@eden/contracts";

const instructionFileByteLimit = 32 * 1024;
const instructionChainByteLimit = 128 * 1024;
const outputReserveLimit = 8_192;
const safetyReserveTokens = 2_048;

export interface ContextItem {
  readonly content: string;
  readonly contextItemId: string;
  readonly order: number;
  readonly priority: ContextPriority;
  readonly scopePath: string;
  readonly source: string;
}

export type ContextLimits = {
  readonly contextWindowTokens: number;
  readonly maxOutputTokens: number;
};

export type ContextTarget = {
  readonly activatedContextItemIds: readonly string[];
  readonly relativePath: string;
};

export type InstructionSnapshot = InstructionSnapshotSummary & {
  readonly content: string;
};

export type PreparedContext = {
  readonly instructions: readonly InstructionSnapshot[];
  readonly selectedItems: readonly ContextItem[];
  readonly summary: ContextAdmissionSummary;
};

export type ContextAdmissionServiceOptions = {
  readonly estimateTokens?: ((content: string) => number) | undefined;
  readonly workspaceRoot: string;
};

export type PrepareContextOptions = {
  readonly items: readonly ContextItem[];
  readonly limits: ContextLimits | null;
  readonly targets: readonly ContextTarget[];
};

export class ContextAdmissionError extends Error {
  readonly name = "ContextAdmissionError";
  readonly productError: ProductError;
  readonly summary: ContextAdmissionSummary | null;

  constructor(productError: ProductError, summary: ContextAdmissionSummary | null = null) {
    super(productError.message);
    this.productError = productError;
    this.summary = summary;
  }
}

function contextError(
  code: string,
  message: string,
  recoverability: ProductError["recoverability"] = "reconfigure",
  suggestedAction = "Inspect the context inputs and retry.",
  summary: ContextAdmissionSummary | null = null,
): ContextAdmissionError {
  return new ContextAdmissionError(
    { code, message, recoverability, suggestedActions: [suggestedAction] },
    summary,
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function portablePath(path: string): string {
  return path.split(sep).join("/") || ".";
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function hashContent(content: Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function priorityRank(priority: ContextPriority): number {
  return priority === "P0" ? 0 : priority === "P1" ? 1 : 2;
}

function reasonFor(priority: ContextPriority, selected: boolean): ContextSelectionItem["reason"] {
  if (!selected) return "budget_omitted";
  if (priority === "P0") return "required";
  return priority === "P1" ? "recent_context" : "supporting_evidence";
}

function validateLimits(limits: ContextLimits | null): ContextLimits {
  if (
    limits === null ||
    !Number.isSafeInteger(limits.contextWindowTokens) ||
    limits.contextWindowTokens <= 0 ||
    !Number.isSafeInteger(limits.maxOutputTokens) ||
    limits.maxOutputTokens <= 0
  ) {
    throw contextError(
      "context_profile_limits_required",
      "Provider context limits are required before context admission.",
      "reconfigure",
      "Configure an active provider profile with explicit limits.",
    );
  }
  return limits;
}

type LoadedInstruction = InstructionSnapshot & {
  readonly byteLength: number;
};

export class ContextAdmissionService {
  private readonly estimateTokens: (content: string) => number;
  private readonly workspaceRoot: string;

  private constructor(workspaceRoot: string, estimateTokens: (content: string) => number) {
    this.workspaceRoot = workspaceRoot;
    this.estimateTokens = estimateTokens;
  }

  static async open(options: ContextAdmissionServiceOptions): Promise<ContextAdmissionService> {
    const workspaceRoot = await realpath(options.workspaceRoot);
    return new ContextAdmissionService(
      workspaceRoot,
      options.estimateTokens ??
        ((content) =>
          content.length === 0 ? 0 : Math.ceil(Buffer.byteLength(content, "utf8") / 4)),
    );
  }

  private async resolveTarget(relativePath: string): Promise<string> {
    if (relativePath.length === 0 || relativePath.length > 4_096 || isAbsolute(relativePath)) {
      throw contextError("context_path_invalid", "The context path is invalid.");
    }
    const lexical = resolve(this.workspaceRoot, relativePath);
    if (!isInside(this.workspaceRoot, lexical)) {
      throw contextError("context_path_invalid", "The context path is invalid.");
    }
    try {
      const canonical = await realpath(lexical);
      if (!isInside(this.workspaceRoot, canonical)) {
        throw contextError("context_path_invalid", "The context path is invalid.");
      }
      const metadata = await lstat(canonical);
      return metadata.isDirectory() ? canonical : dirname(canonical);
    } catch (error) {
      if (error instanceof ContextAdmissionError) throw error;
      throw contextError("context_path_invalid", "The context path is invalid.");
    }
  }

  private directoriesFor(targetDirectory: string): readonly string[] {
    const path = relative(this.workspaceRoot, targetDirectory);
    if (path === "") return [this.workspaceRoot];
    const segments = path.split(sep);
    if (segments.length > 256) {
      throw contextError("context_path_invalid", "The context path is invalid.");
    }
    const directories = [this.workspaceRoot];
    let current = this.workspaceRoot;
    for (const segment of segments) {
      current = resolve(current, segment);
      directories.push(current);
    }
    return directories;
  }

  private async loadInstruction(
    directory: string,
    activatedContextItemIds: readonly string[],
  ): Promise<LoadedInstruction | null> {
    const path = resolve(directory, "AGENTS.md");
    let metadata: Awaited<ReturnType<typeof lstat>>;
    try {
      metadata = await lstat(path);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw contextError("instruction_unavailable", "An applicable instruction is unavailable.");
    }
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.nlink !== 1 ||
      metadata.size > instructionFileByteLimit
    ) {
      const code =
        metadata.size > instructionFileByteLimit
          ? "instruction_file_too_large"
          : "instruction_unavailable";
      throw contextError(
        code,
        code === "instruction_file_too_large"
          ? "An applicable instruction exceeds the file budget."
          : "An applicable instruction is unavailable.",
      );
    }

    const handle = await open(path, "r").catch(() => {
      throw contextError("instruction_unavailable", "An applicable instruction is unavailable.");
    });
    try {
      const opened = await handle.stat();
      if (
        !opened.isFile() ||
        opened.nlink !== 1 ||
        opened.dev !== metadata.dev ||
        opened.ino !== metadata.ino ||
        opened.size > instructionFileByteLimit
      ) {
        throw contextError("instruction_unavailable", "An applicable instruction is unavailable.");
      }
      const bytes = await handle.readFile();
      if (bytes.byteLength !== opened.size || bytes.byteLength > instructionFileByteLimit) {
        throw contextError("instruction_unavailable", "An applicable instruction is unavailable.");
      }
      let content: string;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw contextError("instruction_unavailable", "An applicable instruction is unavailable.");
      }
      const scopePath = portablePath(relative(this.workspaceRoot, directory));
      const sourcePath = scopePath === "." ? "AGENTS.md" : `${scopePath}/AGENTS.md`;
      return {
        activatedContextItemIds: [...activatedContextItemIds],
        byteLength: bytes.byteLength,
        content,
        contentHash: hashContent(bytes),
        precedence: scopePath === "." ? 0 : scopePath.split("/").length,
        scopePath,
        selectionReason: scopePath === "." ? "trusted_root" : "path_scope",
        sourcePath,
      };
    } finally {
      await handle.close();
    }
  }

  private async loadInstructions(
    targets: readonly ContextTarget[],
  ): Promise<readonly LoadedInstruction[]> {
    if (targets.length > 256) {
      throw contextError("context_input_invalid", "The context input is invalid.", "fatal");
    }
    const bySource = new Map<
      string,
      LoadedInstruction & { readonly activatedContextItemIds: readonly string[] }
    >();
    for (const target of targets) {
      if (
        target.activatedContextItemIds.length === 0 ||
        target.activatedContextItemIds.length > 256 ||
        target.activatedContextItemIds.some((id) => id.length === 0 || id.length > 256)
      ) {
        throw contextError("context_input_invalid", "The context input is invalid.", "fatal");
      }
      const targetDirectory = await this.resolveTarget(target.relativePath);
      for (const directory of this.directoriesFor(targetDirectory)) {
        const loaded = await this.loadInstruction(directory, target.activatedContextItemIds);
        if (loaded === null) continue;
        const existing = bySource.get(loaded.sourcePath);
        if (existing !== undefined && existing.contentHash !== loaded.contentHash) {
          throw contextError(
            "instruction_changed",
            "An applicable instruction changed during admission.",
          );
        }
        const activatedContextItemIds =
          existing === undefined
            ? [...new Set(loaded.activatedContextItemIds)].sort()
            : [
                ...new Set([
                  ...existing.activatedContextItemIds,
                  ...loaded.activatedContextItemIds,
                ]),
              ].sort();
        if (activatedContextItemIds.length > 256) {
          throw contextError("context_input_invalid", "The context input is invalid.", "fatal");
        }
        bySource.set(
          loaded.sourcePath,
          existing === undefined
            ? loaded
            : {
                ...existing,
                activatedContextItemIds,
              },
        );
      }
    }
    const instructions = [...bySource.values()].sort(
      (left, right) =>
        left.precedence - right.precedence || left.sourcePath.localeCompare(right.sourcePath),
    );
    if (instructions.length > 256) {
      throw contextError("context_input_invalid", "The context input is invalid.", "fatal");
    }
    if (
      instructions.reduce((total, item) => total + item.byteLength, 0) > instructionChainByteLimit
    ) {
      throw contextError(
        "instruction_chain_too_large",
        "The applicable instruction chain exceeds the aggregate budget.",
      );
    }
    return instructions;
  }

  private estimatedTokens(content: string): number {
    const estimate = this.estimateTokens(content);
    if (!Number.isSafeInteger(estimate) || estimate < 0) {
      throw contextError(
        "context_estimate_invalid",
        "The context token estimate is invalid.",
        "fatal",
      );
    }
    return estimate;
  }

  async prepare(options: PrepareContextOptions): Promise<PreparedContext> {
    const limits = validateLimits(options.limits);
    const instructions = await this.loadInstructions(options.targets);
    const instructionItems: ContextItem[] = instructions.map((instruction, index) => ({
      content: instruction.content,
      contextItemId: `instruction-${index}-${instruction.contentHash.slice(7, 19)}`,
      order: index,
      priority: "P0",
      scopePath: instruction.scopePath,
      source: "repository_instruction",
    }));
    const items = [...options.items, ...instructionItems];
    if (items.length > 1_024) {
      throw contextError("context_input_invalid", "The context input is invalid.", "fatal");
    }
    const seen = new Set<string>();
    for (const item of items) {
      if (
        item.contextItemId.length === 0 ||
        item.contextItemId.length > 256 ||
        item.source.length === 0 ||
        item.source.length > 512 ||
        item.scopePath.length === 0 ||
        item.scopePath.length > 4_096 ||
        isAbsolute(item.scopePath) ||
        !isInside(this.workspaceRoot, resolve(this.workspaceRoot, item.scopePath)) ||
        !Number.isSafeInteger(item.order) ||
        item.order < 0 ||
        seen.has(item.contextItemId)
      ) {
        throw contextError("context_input_invalid", "The context input is invalid.", "fatal");
      }
      seen.add(item.contextItemId);
    }
    const ranked = items
      .map((item, index) => ({ item, index, tokens: this.estimatedTokens(item.content) }))
      .sort(
        (left, right) =>
          priorityRank(left.item.priority) - priorityRank(right.item.priority) ||
          left.item.order - right.item.order ||
          left.index - right.index,
      );
    const outputReserveTokens = Math.min(limits.maxOutputTokens, outputReserveLimit);
    const usableInputTokens = Math.max(
      0,
      limits.contextWindowTokens - outputReserveTokens - safetyReserveTokens,
    );
    const budget = {
      contextWindowTokens: limits.contextWindowTokens,
      outputReserveTokens,
      safetyReserveTokens,
      selectedInputTokens: 0,
      usableInputTokens,
    };
    const p0Tokens = ranked
      .filter(({ item }) => item.priority === "P0")
      .reduce((total, item) => total + item.tokens, 0);
    if (p0Tokens > usableInputTokens) {
      const blocker = {
        code: "context_p0_overflow",
        message: "Required context does not fit before provider access.",
        recoverability: "reconfigure" as const,
        suggestedActions: ["Increase explicit model limits or reduce required context."],
      };
      throw contextError(
        blocker.code,
        blocker.message,
        blocker.recoverability,
        blocker.suggestedActions[0],
        {
          blocker,
          budget,
          instructions: instructions.map(
            ({ content: _content, byteLength: _bytes, ...item }) => item,
          ),
          items: ranked.map(({ item, tokens }) => ({
            contextItemId: item.contextItemId,
            estimatedTokens: tokens,
            priority: item.priority,
            reason: item.priority === "P0" ? "required_overflow" : "budget_omitted",
            selected: false,
            selection: "omitted",
            source: item.source,
            scopePath: item.scopePath,
          })),
          state: "blocked",
        },
      );
    }

    let selectedInputTokens = 0;
    const selectedItems: ContextItem[] = [];
    const ledger: ContextSelectionItem[] = [];
    for (const { item, tokens } of ranked) {
      const selected = item.priority === "P0" || selectedInputTokens + tokens <= usableInputTokens;
      if (selected) {
        selectedInputTokens += tokens;
        selectedItems.push(item);
      }
      ledger.push({
        contextItemId: item.contextItemId,
        estimatedTokens: tokens,
        priority: item.priority,
        reason: reasonFor(item.priority, selected),
        selected,
        selection: selected ? "complete" : "omitted",
        source: item.source,
        scopePath: item.scopePath,
      });
    }
    const summary: ContextAdmissionSummary = {
      blocker: null,
      budget: { ...budget, selectedInputTokens },
      instructions: instructions.map(({ content: _content, byteLength: _bytes, ...item }) => item),
      items: ledger,
      state: "ready",
    };
    return { instructions, selectedItems, summary };
  }

  async verifyInstructions(instructions: readonly InstructionSnapshot[]): Promise<void> {
    for (const snapshot of instructions) {
      try {
        const directory =
          snapshot.scopePath === "."
            ? this.workspaceRoot
            : resolve(this.workspaceRoot, snapshot.scopePath);
        const current = await this.loadInstruction(directory, snapshot.activatedContextItemIds);
        if (
          current === null ||
          current.contentHash !== snapshot.contentHash ||
          current.content !== snapshot.content
        ) {
          throw contextError(
            "instruction_changed",
            "An applicable instruction changed during admission.",
          );
        }
      } catch (error) {
        if (
          error instanceof ContextAdmissionError &&
          error.productError.code === "instruction_changed"
        ) {
          throw error;
        }
        throw contextError(
          "instruction_changed",
          "An applicable instruction changed during admission.",
        );
      }
    }
  }

  async dispatch<T>(prepared: PreparedContext, operation: () => Promise<T>): Promise<T> {
    await this.verifyInstructions(prepared.instructions);
    return operation();
  }
}

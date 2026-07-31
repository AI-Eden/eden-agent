import { type FileHandle, lstat, mkdir, open } from "node:fs/promises";
import { join } from "node:path";

import { decodeRepositoryToolResult } from "@eden/contracts";
import { decodeKernelEvent, type KernelEffect, type KernelEvent } from "@eden/kernel";
import { decodeFakeModelResponse, FakeModelDriver, type ModelDriver } from "@eden/providers/fake";
import type {
  ModelStepDriver,
  ModelStepRequestV1,
  ModelVisibleTextListener,
} from "@eden/providers/model-step";

import { fakeAction } from "./fake-action.ts";
import type { EffectHost, ReconciliationResult } from "./runtime.ts";
import { RepositoryToolService, type RepositoryToolServiceOptions } from "./tools/index.ts";

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

const receiptByteLimit = 65_536;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

function sameReceiptIdentity(
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

type ReceiptRead =
  | { readonly kind: "invalid" }
  | { readonly kind: "missing" }
  | { readonly content: string; readonly kind: "ready" };

async function readReceipt(path: string): Promise<ReceiptRead> {
  try {
    const before = await lstat(path);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      before.size > receiptByteLimit
    ) {
      return { kind: "invalid" };
    }
    const handle = await open(path, "r");
    try {
      const opened = await handle.stat();
      if (!sameReceiptIdentity(before, opened)) return { kind: "invalid" };
      const bytes = Buffer.alloc(opened.size);
      let offset = 0;
      while (offset < bytes.length) {
        const result = await handle.read(
          bytes,
          offset,
          Math.min(4_096, bytes.length - offset),
          offset,
        );
        if (result.bytesRead === 0) break;
        offset += result.bytesRead;
      }
      if (offset !== bytes.length || !sameReceiptIdentity(before, await handle.stat())) {
        return { kind: "invalid" };
      }
      if (!sameReceiptIdentity(before, await lstat(path))) return { kind: "invalid" };
      return { content: fatalUtf8Decoder.decode(bytes), kind: "ready" };
    } finally {
      await handle.close();
    }
  } catch (error) {
    return { kind: isMissingFile(error) ? "missing" : "invalid" };
  }
}

async function ensureReceiptDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700 });
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
  const metadata = await lstat(path);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("The receipt directory is invalid.");
  }
}

async function inspectReceiptDirectory(path: string): Promise<"invalid" | "missing" | "ready"> {
  try {
    const metadata = await lstat(path);
    return metadata.isDirectory() && !metadata.isSymbolicLink() ? "ready" : "invalid";
  } catch (error) {
    return isMissingFile(error) ? "missing" : "invalid";
  }
}

function receiptName(effectId: string, attemptId?: string): string {
  const identity = attemptId === undefined ? effectId : `${effectId}:${attemptId}`;
  return `${Buffer.from(identity).toString("base64url")}.json`;
}

function modelFailure(code: string, message: string): KernelEvent {
  return {
    error: {
      code,
      message,
      recoverability: "retry",
      suggestedActions: [
        "Start a new deterministic fake task after resolving the provider failure.",
      ],
    },
    type: "run.blocked",
  };
}

async function observationFor(
  effect: KernelEffect,
  cwd: string,
  modelDriver: ModelDriver,
  repositoryTools: () => Promise<RepositoryToolService>,
  signal?: AbortSignal,
): Promise<KernelEvent> {
  switch (effect.type) {
    case "provider.model.step":
      throw new Error("Provider model effects require an explicit attempt identity.");
    case "fake.model.complete": {
      const effectSignal = signal ?? new AbortController().signal;
      try {
        const toolResult =
          effect.toolResult === undefined
            ? undefined
            : decodeRepositoryToolResult(effect.toolResult);
        if (toolResult !== undefined && !toolResult.ok) {
          return modelFailure(
            "repository_tool_result_invalid",
            "The repository tool result failed contract validation.",
          );
        }
        const response = await modelDriver.complete(
          toolResult === undefined
            ? { task: effect.task, version: 1 }
            : { task: effect.task, toolResult: toolResult.value, version: 1 },
          effectSignal,
        );
        const decoded = decodeFakeModelResponse(response);
        if (!decoded.ok) {
          return modelFailure(
            "fake_model_output_invalid",
            "The deterministic fake model returned an invalid response.",
          );
        }
        if (decoded.value.proposal.kind === "repository-tool-call") {
          if (effect.toolResult !== undefined) {
            return modelFailure(
              "fake_model_tool_budget_exceeded",
              "The deterministic fake model exceeded the one-tool-call budget.",
            );
          }
          return {
            effectId: effect.effectId,
            toolCall: decoded.value.proposal.call,
            type: "fake.model.tool-requested",
          };
        }
        return {
          action: fakeAction(effect.runId, cwd, decoded.value.proposal.summary),
          effectId: effect.effectId,
          type: "fake.model.completed",
        };
      } catch (error) {
        return effectSignal.aborted || (error instanceof Error && error.name === "AbortError")
          ? modelFailure("operation_aborted", "The deterministic fake model operation was aborted.")
          : modelFailure("fake_model_failed", "The deterministic fake model failed.");
      }
    }
    case "repository.tool.execute": {
      const execution = await (await repositoryTools()).execute(effect.toolCall, signal);
      return {
        effectId: effect.effectId,
        result: execution.productData,
        type: "repository.tool.completed",
      };
    }
    case "anchor_edit.execute":
    case "anchor_edit.prepare":
    case "repository_check.execute":
    case "repository_check.prepare":
    case "review.eden_patch.capture":
    case "review.git_snapshot.capture":
    case "review.git_check.capture":
      throw new Error("AnchorEdit effects require the safe-actuation effect host.");
    case "fake.action.execute":
      return { effectId: effect.effectId, type: "fake.action.completed" };
    case "fake.verification.run":
      return {
        effectId: effect.effectId,
        evidenceRef: `${effect.runId}:fake-evidence`,
        passed: true,
        type: "verification.completed",
      };
  }
}

function observationMatches(effect: KernelEffect, observation: KernelEvent): boolean {
  switch (effect.type) {
    case "provider.model.step":
      return (
        observation.type === "model.step.completed" && observation.effectId === effect.effectId
      );
    case "fake.model.complete":
      return (
        ((observation.type === "fake.model.completed" ||
          observation.type === "fake.model.tool-requested") &&
          observation.effectId === effect.effectId) ||
        observation.type === "run.blocked"
      );
    case "repository.tool.execute":
      return (
        observation.type === "repository.tool.completed" &&
        observation.effectId === effect.effectId &&
        observation.result.toolCallId === effect.toolCall.toolCallId &&
        observation.result.name === effect.toolCall.name
      );
    case "anchor_edit.execute":
      return (
        observation.type === "anchor_edit.completed" && observation.effectId === effect.effectId
      );
    case "anchor_edit.prepare":
      return (
        observation.type === "safe.action.proposed" && observation.effectId === effect.effectId
      );
    case "repository_check.execute":
      return (
        observation.type === "repository.check.completed" &&
        observation.effectId === effect.effectId
      );
    case "repository_check.prepare":
      return (
        observation.type === "safe.action.proposed" && observation.effectId === effect.effectId
      );
    case "review.eden_patch.capture":
      return (
        observation.type === "review.eden_patch.captured" &&
        observation.effectId === effect.effectId
      );
    case "review.git_snapshot.capture":
      return (
        observation.type === "review.git_snapshot.captured" &&
        observation.effectId === effect.effectId
      );
    case "review.git_check.capture":
      return (
        observation.type === "review.git_check.completed" &&
        observation.effectId === effect.effectId
      );
    case "fake.action.execute":
      return (
        observation.type === "fake.action.completed" && observation.effectId === effect.effectId
      );
    case "fake.verification.run":
      return (
        observation.type === "verification.completed" && observation.effectId === effect.effectId
      );
  }
}

export class FakeToolHost implements EffectHost {
  private readonly cwd: string;
  private readonly modelDriver: ModelDriver;
  private readonly modelStepDriver: ModelStepDriver | undefined;
  private readonly onVisibleText: ModelVisibleTextListener | undefined;
  private readonly receiptsDirectory: string;
  private readonly repositoryToolOptions: Omit<RepositoryToolServiceOptions, "workspaceRoot">;
  private repositoryTools: Promise<RepositoryToolService> | undefined;

  constructor(
    receiptsDirectory: string,
    cwd = ".",
    modelDriver: ModelDriver = new FakeModelDriver(),
    repositoryToolOptions: Omit<RepositoryToolServiceOptions, "workspaceRoot"> = {},
    modelStepDriver?: ModelStepDriver,
    onVisibleText?: ModelVisibleTextListener,
  ) {
    this.cwd = cwd;
    this.modelDriver = modelDriver;
    this.modelStepDriver = modelStepDriver;
    this.onVisibleText = onVisibleText;
    this.receiptsDirectory = receiptsDirectory;
    this.repositoryToolOptions = repositoryToolOptions;
  }

  private openRepositoryTools(): Promise<RepositoryToolService> {
    this.repositoryTools ??= RepositoryToolService.open({
      ...this.repositoryToolOptions,
      workspaceRoot: this.cwd,
    });
    return this.repositoryTools;
  }

  async reconcile(effect: KernelEffect): Promise<ReconciliationResult> {
    const directory = await inspectReceiptDirectory(this.receiptsDirectory);
    if (directory === "missing") return { status: "not-started" };
    if (directory === "invalid") return { status: "unknown" };
    const path = join(this.receiptsDirectory, receiptName(effect.effectId));
    const receipt = await readReceipt(path);
    if (receipt.kind === "missing") return { status: "not-started" };
    if (receipt.kind === "invalid") return { status: "unknown" };
    const { content } = receipt;
    try {
      const value: unknown = JSON.parse(content);
      if (
        typeof value !== "object" ||
        value === null ||
        !("effectId" in value) ||
        !("observation" in value)
      ) {
        return { status: "unknown" };
      }
      if (value.effectId !== effect.effectId) {
        return { status: "unknown" };
      }
      const decoded = decodeKernelEvent(value.observation);
      if (!decoded.ok || !observationMatches(effect, decoded.value)) {
        return { status: "unknown" };
      }
      return { observation: decoded.value, status: "completed" };
    } catch {
      return { status: "unknown" };
    }
  }

  async execute(effect: KernelEffect, signal?: AbortSignal): Promise<KernelEvent> {
    if (effect.type === "provider.model.step") {
      throw new Error("Provider model effects require executeModelAttempt().");
    }
    const reconciled = await this.reconcile(effect);
    if (reconciled.status === "completed") {
      return reconciled.observation;
    }
    if (reconciled.status === "unknown") {
      throw new Error("Cannot execute an effect with an unknown receipt state.");
    }
    await ensureReceiptDirectory(this.receiptsDirectory);
    const observation = await observationFor(
      effect,
      this.cwd,
      this.modelDriver,
      () => this.openRepositoryTools(),
      signal,
    );
    const path = join(this.receiptsDirectory, receiptName(effect.effectId));
    let handle: FileHandle | undefined;
    try {
      handle = await open(path, "wx");
      await handle.writeFile(
        `${JSON.stringify({ effectId: effect.effectId, observation })}\n`,
        "utf8",
      );
      await handle.sync();
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      const raced = await this.reconcile(effect);
      if (raced.status === "completed") {
        return raced.observation;
      }
      throw new Error("Concurrent receipt creation did not produce a valid receipt.");
    } finally {
      await handle?.close();
    }
    return observation;
  }

  async reconcileModelAttempt(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    attemptId: string,
  ): Promise<ReconciliationResult> {
    const directory = await inspectReceiptDirectory(this.receiptsDirectory);
    if (directory === "missing") return { status: "not-started" };
    if (directory === "invalid") return { status: "unknown" };
    const receipt = await readReceipt(
      join(this.receiptsDirectory, receiptName(effect.effectId, attemptId)),
    );
    if (receipt.kind === "missing") return { status: "not-started" };
    if (receipt.kind === "invalid") return { status: "unknown" };
    try {
      const value: unknown = JSON.parse(receipt.content);
      if (
        typeof value !== "object" ||
        value === null ||
        !("effectId" in value) ||
        !("attemptId" in value) ||
        !("observation" in value) ||
        value.effectId !== effect.effectId ||
        value.attemptId !== attemptId
      ) {
        return { status: "unknown" };
      }
      const decoded = decodeKernelEvent(value.observation);
      if (
        !decoded.ok ||
        decoded.value.type !== "model.step.completed" ||
        decoded.value.effectId !== effect.effectId ||
        decoded.value.observation.attemptId !== attemptId
      ) {
        return { status: "unknown" };
      }
      return { observation: decoded.value, status: "completed" };
    } catch {
      return { status: "unknown" };
    }
  }

  async executeModelAttempt(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    request: ModelStepRequestV1,
    signal?: AbortSignal,
  ): Promise<KernelEvent> {
    const { attemptId } = request;
    const reconciled = await this.reconcileModelAttempt(effect, attemptId);
    if (reconciled.status === "completed") return reconciled.observation;
    if (reconciled.status === "unknown") {
      throw new Error("Cannot execute a model attempt with unknown receipt state.");
    }
    if (this.modelStepDriver === undefined) {
      throw new Error("The provider model-step driver is unavailable.");
    }
    await ensureReceiptDirectory(this.receiptsDirectory);
    const observation = await this.modelStepDriver.completeModelStep(
      request,
      signal ?? new AbortController().signal,
      this.onVisibleText,
    );
    const event: KernelEvent = {
      effectId: effect.effectId,
      observation,
      type: "model.step.completed",
    };
    const path = join(this.receiptsDirectory, receiptName(effect.effectId, attemptId));
    let handle: FileHandle | undefined;
    try {
      handle = await open(path, "wx");
      await handle.writeFile(
        `${JSON.stringify({ attemptId, effectId: effect.effectId, observation: event })}\n`,
        "utf8",
      );
      await handle.sync();
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) {
        throw error;
      }
      const raced = await this.reconcileModelAttempt(effect, attemptId);
      if (raced.status === "completed") return raced.observation;
      throw new Error("Concurrent model-attempt receipt creation did not produce a valid receipt.");
    } finally {
      await handle?.close();
    }
    return event;
  }
}

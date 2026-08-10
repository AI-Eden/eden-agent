import { createHash } from "node:crypto";

import type { KernelEffect, KernelEvent } from "@eden/kernel";

import { AnchorEditError, type AnchorEditService } from "./anchor-edit.ts";
import { createEdenPatch, GitReviewError, type GitReviewService } from "./git-review.ts";
import {
  createSafeApproval,
  evaluateSafeActuationPolicy,
  safeActionDigest,
} from "./policy/index.ts";
import { RunCommandError, type RunCommandService } from "./run-command.ts";
import type {
  EffectExecutionControl,
  EffectHost,
  EffectObservationListener,
  EffectReconciliationContext,
  ReconciliationResult,
} from "./runtime.ts";
import { WriteFileError, type WriteFileService } from "./write-file.ts";

export type SafeActuationEffectHostHooks = {
  readonly now?: () => string;
  readonly onReconcile?: () => void;
};

function completedEvent(
  effect: Extract<KernelEffect, { readonly type: "anchor_edit.execute" }>,
  recovered: boolean,
): KernelEvent {
  if (effect.envelope.operation.type !== "anchor_edit") {
    throw new Error("The AnchorEdit effect contains a different operation.");
  }
  return {
    effectId: effect.effectId,
    observation: {
      baseSha256: effect.envelope.operation.baseSha256,
      byteLength: effect.envelope.operation.desiredByteLength,
      desiredSha256: effect.envelope.operation.desiredSha256,
      path: effect.envelope.operation.path,
      state: "completed",
    },
    recovered,
    type: "anchor_edit.completed",
  };
}

function completedWriteEvent(
  effect: Extract<KernelEffect, { readonly type: "write_file.execute" }>,
  recovered: boolean,
): KernelEvent {
  if (effect.envelope.operation.type !== "write_file") {
    throw new Error("The write-file effect contains a different operation.");
  }
  return {
    effectId: effect.effectId,
    observation: {
      byteLength: effect.envelope.operation.byteLength,
      path: effect.envelope.operation.path,
      sha256: effect.envelope.operation.sha256,
      state: "completed",
    },
    recovered,
    type: "write_file.completed",
  };
}

function utf8Base64(content: string): string {
  const bytes = new TextEncoder().encode(content);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export class SafeActuationEffectHost implements EffectHost {
  readonly #anchorEdit: AnchorEditService;
  readonly #gitReview: GitReviewService | undefined;
  readonly #hooks: SafeActuationEffectHostHooks;
  readonly #runCommand: RunCommandService | undefined;
  readonly #writeFile: WriteFileService | undefined;

  constructor(
    anchorEdit: AnchorEditService,
    hooks: SafeActuationEffectHostHooks = {},
    gitReview?: GitReviewService,
    writeFile?: WriteFileService,
    runCommand?: RunCommandService,
  ) {
    this.#anchorEdit = anchorEdit;
    this.#gitReview = gitReview;
    this.#hooks = hooks;
    this.#runCommand = runCommand;
    this.#writeFile = writeFile;
  }

  async execute(
    effect: KernelEffect,
    signal?: AbortSignal,
    observe?: EffectObservationListener,
    control?: EffectExecutionControl,
  ): Promise<KernelEvent> {
    try {
      return await this.#execute(effect, signal, observe, control);
    } catch (error) {
      if (
        error instanceof AnchorEditError ||
        error instanceof GitReviewError ||
        error instanceof RunCommandError ||
        error instanceof WriteFileError
      ) {
        return { error: error.productError, type: "run.blocked" };
      }
      return {
        error: {
          code: "safe_actuation_failed",
          message: "Safe actuation could not produce one complete closed observation.",
          recoverability: "fatal",
          suggestedActions: ["Inspect the durable run evidence before starting a new task."],
        },
        type: "run.blocked",
      };
    }
  }

  async #execute(
    effect: KernelEffect,
    signal?: AbortSignal,
    observe?: EffectObservationListener,
    control?: EffectExecutionControl,
  ): Promise<KernelEvent> {
    if (effect.type === "anchor_edit.prepare") {
      const actionId = `action-${effect.toolCall.toolCallId}`;
      const envelope = await this.#anchorEdit.prepare(
        {
          actionId,
          canonicalRootHash: `sha256:${createHash("sha256")
            .update(`eden-canonical-root-v1\0${effect.workspace.root}`)
            .digest("hex")}`,
          path: effect.toolCall.arguments.path,
          proposalRevision: effect.proposalRevision,
          replacements: effect.toolCall.arguments.replacements,
          runId: effect.runId,
          workspaceId: effect.workspace.workspaceId,
        },
        signal,
      );
      const evaluatedAt = this.#hooks.now?.() ?? new Date().toISOString();
      const policy = evaluateSafeActuationPolicy(envelope, evaluatedAt);
      if (policy.decision !== "ask") {
        throw new Error("The prepared AnchorEdit did not produce the required ask decision.");
      }
      const approval = createSafeApproval({
        approvalId: `approval-${effect.toolCall.toolCallId}`,
        envelope,
        expectedRevision: effect.expectedRevision,
      });
      return {
        action: {
          actionId,
          approvalId: approval.approvalId,
          canonicalDisplay: `AnchorEdit ${JSON.stringify(effect.toolCall.arguments.path)}: ${effect.toolCall.arguments.replacements.length} replacement(s)`,
          cwd: ".",
          digest: safeActionDigest(envelope),
          reason: policy.reason,
          safeActuation: {
            approval: {
              actionDigest: approval.actionDigest,
              expectedRevision: approval.expectedRevision,
              proposalRevision: approval.proposalRevision,
              state: approval.state,
            },
            envelope,
            parentActionId: effect.parentActionId,
            policy,
          },
          scope: effect.toolCall.arguments.path,
        },
        effectId: effect.effectId,
        type: "safe.action.proposed",
      };
    }
    if (effect.type === "write_file.prepare") {
      if (this.#writeFile === undefined) throw new Error("Write-file service is unavailable.");
      const actionId = `action-${effect.toolCall.toolCallId}`;
      const envelope = await this.#writeFile.prepare(
        {
          actionId,
          canonicalRootHash: `sha256:${createHash("sha256")
            .update(`eden-canonical-root-v1\0${effect.workspace.root}`)
            .digest("hex")}`,
          content: effect.toolCall.arguments.content,
          path: effect.toolCall.arguments.path,
          proposalRevision: effect.proposalRevision,
          runId: effect.runId,
          workspaceId: effect.workspace.workspaceId,
        },
        signal,
      );
      const policy = evaluateSafeActuationPolicy(
        envelope,
        this.#hooks.now?.() ?? new Date().toISOString(),
      );
      if (policy.decision !== "ask") {
        throw new Error("The prepared write-file action did not produce an ask decision.");
      }
      const approval = createSafeApproval({
        approvalId: `approval-${effect.toolCall.toolCallId}`,
        envelope,
        expectedRevision: effect.expectedRevision,
      });
      return {
        action: {
          actionId,
          approvalId: approval.approvalId,
          canonicalDisplay: `Create ${JSON.stringify(effect.toolCall.arguments.path)} (${envelope.operation.type === "write_file" ? envelope.operation.byteLength : 0} bytes)`,
          cwd: ".",
          digest: safeActionDigest(envelope),
          reason: policy.reason,
          safeActuation: {
            approval: {
              actionDigest: approval.actionDigest,
              expectedRevision: approval.expectedRevision,
              proposalRevision: approval.proposalRevision,
              state: approval.state,
            },
            envelope,
            parentActionId: null,
            policy,
          },
          scope: effect.toolCall.arguments.path,
        },
        effectId: effect.effectId,
        type: "safe.action.proposed",
      };
    }
    if (effect.type === "run_command.prepare") {
      if (this.#runCommand === undefined) throw new Error("Run-command service is unavailable.");
      const actionId = `action-${effect.toolCall.toolCallId}`;
      const envelope = await this.#runCommand.prepare(
        {
          actionId,
          args: effect.toolCall.arguments.args,
          canonicalRootHash: `sha256:${createHash("sha256")
            .update(`eden-canonical-root-v1\0${effect.workspace.root}`)
            .digest("hex")}`,
          cwd: effect.toolCall.arguments.cwd,
          network: effect.toolCall.arguments.network,
          program: effect.toolCall.arguments.program,
          proposalRevision: effect.proposalRevision,
          reason: effect.toolCall.arguments.reason,
          runId: effect.runId,
          timeoutMs: effect.toolCall.arguments.timeoutMs,
          workspaceId: effect.workspace.workspaceId,
        },
        signal,
      );
      const policy = evaluateSafeActuationPolicy(
        envelope,
        this.#hooks.now?.() ?? new Date().toISOString(),
      );
      if (policy.decision !== "ask") {
        throw new Error("The prepared run-command action did not produce an ask decision.");
      }
      const approval = createSafeApproval({
        approvalId: `approval-${effect.toolCall.toolCallId}`,
        envelope,
        expectedRevision: effect.expectedRevision,
      });
      const display = `${effect.toolCall.arguments.program} ${effect.toolCall.arguments.args
        .map((argument) => JSON.stringify(argument))
        .join(" ")}`.trim();
      return {
        action: {
          actionId,
          approvalId: approval.approvalId,
          canonicalDisplay: display.length <= 4_096 ? display : `${display.slice(0, 4_095)}…`,
          cwd: effect.toolCall.arguments.cwd,
          digest: safeActionDigest(envelope),
          reason: policy.reason,
          safeActuation: {
            approval: {
              actionDigest: approval.actionDigest,
              expectedRevision: approval.expectedRevision,
              proposalRevision: approval.proposalRevision,
              state: approval.state,
            },
            envelope,
            parentActionId: null,
            policy,
          },
          scope: effect.toolCall.arguments.cwd,
        },
        effectId: effect.effectId,
        type: "safe.action.proposed",
      };
    }
    if (effect.type === "anchor_edit.execute") {
      await this.#anchorEdit.execute(effect.envelope, signal);
      return completedEvent(effect, false);
    }
    if (effect.type === "write_file.execute") {
      if (this.#writeFile === undefined) throw new Error("Write-file service is unavailable.");
      await this.#writeFile.execute(effect.envelope, signal);
      return completedWriteEvent(effect, false);
    }
    if (effect.type === "run_command.execute") {
      if (this.#runCommand === undefined || observe === undefined || control === undefined) {
        throw new Error("Run-command durable observation is unavailable.");
      }
      const observation = await this.#runCommand.execute(
        effect.envelope,
        (item) =>
          observe({
            byteLength: new TextEncoder().encode(item.content).byteLength,
            contentBase64: utf8Base64(item.content),
            effectId: effect.effectId,
            index: item.index,
            stream: item.stream,
            type: "run_command.output",
          }),
        control.markDispatchStarted,
        signal,
      );
      return { effectId: effect.effectId, observation, type: "run_command.completed" };
    }
    if (effect.type === "review.eden_patch.capture") {
      const base =
        effect.envelope.operation.type === "write_file"
          ? await this.#writeFile?.readReviewBase(effect.envelope)
          : await this.#anchorEdit.readReviewBase(effect.envelope);
      if (base === undefined) throw new Error("Write-file review is unavailable.");
      return {
        actionId: effect.actionId,
        effectId: effect.effectId,
        patch: createEdenPatch(effect.envelope, base),
        type: "review.eden_patch.captured",
      };
    }
    if (effect.type === "review.git_snapshot.capture") {
      if (this.#gitReview === undefined) throw new Error("Git review is unavailable.");
      const snapshot = await this.#gitReview.captureSnapshot(signal);
      if (
        effect.phase === "current" &&
        (effect.expectedHead === null || effect.expectedHead !== snapshot.head)
      ) {
        throw new GitReviewError(
          "review_head_changed",
          "HEAD changed after approval, so the review cannot use the captured base.",
          "ask-user",
        );
      }
      return {
        actionId: effect.actionId,
        effectId: effect.effectId,
        phase: effect.phase,
        snapshot,
        type: "review.git_snapshot.captured",
      };
    }
    if (effect.type === "review.git_check.capture") {
      if (this.#gitReview === undefined) throw new Error("Git review is unavailable.");
      return {
        actionId: effect.actionId,
        check: await this.#gitReview.captureCheck(effect.head, signal),
        effectId: effect.effectId,
        phase: effect.phase,
        type: "review.git_check.completed",
      };
    }
    throw new Error(`Unsupported safe-actuation effect: ${effect.type}`);
  }

  async reconcile(
    effect: KernelEffect,
    _observe?: EffectObservationListener,
    context?: EffectReconciliationContext,
  ): Promise<ReconciliationResult> {
    if (
      effect.type === "anchor_edit.prepare" ||
      effect.type === "write_file.prepare" ||
      effect.type === "run_command.prepare"
    ) {
      this.#hooks.onReconcile?.();
      return { status: "not-started" };
    }
    if (
      effect.type === "review.eden_patch.capture" ||
      effect.type === "review.git_snapshot.capture" ||
      effect.type === "review.git_check.capture"
    ) {
      this.#hooks.onReconcile?.();
      return { status: "not-started" };
    }
    if (effect.type === "write_file.execute") {
      if (this.#writeFile === undefined) return { status: "unknown" };
      this.#hooks.onReconcile?.();
      const result = await this.#writeFile.reconcile(effect.envelope);
      switch (result.state) {
        case "completed":
          return { observation: completedWriteEvent(effect, true), status: "completed" };
        case "not_started":
          return { status: "not-started" };
        case "unknown":
          return { status: "unknown" };
      }
    }
    if (effect.type === "run_command.execute") {
      this.#hooks.onReconcile?.();
      return context?.dispatchStarted === true ? { status: "unknown" } : { status: "not-started" };
    }
    if (effect.type !== "anchor_edit.execute") {
      return { status: "unknown" };
    }
    this.#hooks.onReconcile?.();
    const result = await this.#anchorEdit.reconcile(effect.envelope);
    switch (result.state) {
      case "completed":
        return { observation: completedEvent(effect, true), status: "completed" };
      case "not_started":
        return { status: "not-started" };
      case "unknown":
        return { status: "unknown" };
    }
  }
}

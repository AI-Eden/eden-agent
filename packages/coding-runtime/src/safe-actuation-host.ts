import { createHash } from "node:crypto";

import type { KernelEffect, KernelEvent } from "@eden/kernel";

import { AnchorEditError, type AnchorEditService } from "./anchor-edit.ts";
import { createEdenPatch, GitReviewError, type GitReviewService } from "./git-review.ts";
import {
  createSafeApproval,
  evaluateSafeActuationPolicy,
  safeActionDigest,
} from "./policy/index.ts";
import type { EffectHost, ReconciliationResult } from "./runtime.ts";

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

export class SafeActuationEffectHost implements EffectHost {
  readonly #anchorEdit: AnchorEditService;
  readonly #gitReview: GitReviewService | undefined;
  readonly #hooks: SafeActuationEffectHostHooks;

  constructor(
    anchorEdit: AnchorEditService,
    hooks: SafeActuationEffectHostHooks = {},
    gitReview?: GitReviewService,
  ) {
    this.#anchorEdit = anchorEdit;
    this.#gitReview = gitReview;
    this.#hooks = hooks;
  }

  async execute(effect: KernelEffect, signal?: AbortSignal): Promise<KernelEvent> {
    try {
      return await this.#execute(effect, signal);
    } catch (error) {
      if (error instanceof AnchorEditError || error instanceof GitReviewError) {
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

  async #execute(effect: KernelEffect, signal?: AbortSignal): Promise<KernelEvent> {
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
    if (effect.type === "anchor_edit.execute") {
      await this.#anchorEdit.execute(effect.envelope, signal);
      return completedEvent(effect, false);
    }
    if (effect.type === "review.eden_patch.capture") {
      const base = await this.#anchorEdit.readReviewBase(effect.envelope);
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

  async reconcile(effect: KernelEffect): Promise<ReconciliationResult> {
    if (effect.type === "anchor_edit.prepare") {
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

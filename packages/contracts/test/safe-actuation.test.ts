import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import {
  type ActionEnvelopeV1,
  type ChangeReview,
  decodeActionEnvelope,
  decodeChangeReview,
  decodePolicyDecision,
} from "../src/index.ts";

const baseEnvelope: ActionEnvelopeV1 = {
  actionVersion: 1,
  actionId: "action-safe-1",
  runId: "run-safe-1",
  proposalRevision: 4,
  kind: "anchor_edit",
  operation: {
    type: "anchor_edit",
    path: "src/example.ts",
    baseByteLength: 18,
    baseSha256: `sha256:${"1".repeat(64)}`,
    desiredByteLength: 19,
    desiredSha256: `sha256:${"2".repeat(64)}`,
    replacements: [{ oldText: "old", newText: "newer", expectedOccurrences: 1 }],
  },
  workspace: {
    workspaceId: "workspace-safe-1",
    canonicalRootHash: `sha256:${"3".repeat(64)}`,
  },
  cwd: ".",
  scope: {
    capability: "workspace.write.existing_tracked_utf8",
    paths: ["src/example.ts"],
  },
  baseSnapshots: [
    {
      path: "src/example.ts",
      byteLength: 18,
      sha256: `sha256:${"1".repeat(64)}`,
    },
  ],
  authority: {
    policyVersion: 1,
    ruleSetRevision: "r2-safe-actuation-v1",
    environmentClass: "none",
    network: "not_requested",
    executionMode: "trusted_host_policy_only",
  },
  budgets: { timeoutMs: null, outputBytes: null },
  lifetime: { kind: "single_use_proposal_revision", revision: 4 },
};

describe("safe-actuation contracts", () => {
  it("accepts one closed canonical AnchorEdit envelope and policy decision", () => {
    deepStrictEqual(decodeActionEnvelope(baseEnvelope), { ok: true, value: baseEnvelope });
    strictEqual(
      decodePolicyDecision({
        decision: "ask",
        ruleId: "r2.anchor-edit.tracked-utf8",
        ruleSetRevision: "r2-safe-actuation-v1",
        actionDigest: "a".repeat(64),
        reason: "Tracked UTF-8 modifications require one exact approval.",
        evaluatedAt: "2026-07-28T08:00:00.000Z",
      }).ok,
      true,
    );
  });

  it("rejects wider, stale, malformed, and unknown action values", () => {
    strictEqual(decodeActionEnvelope({ ...baseEnvelope, extra: "renderer-authority" }).ok, false);
    strictEqual(
      decodeActionEnvelope({
        ...baseEnvelope,
        cwd: "src",
      }).ok,
      false,
    );
    strictEqual(
      decodeActionEnvelope({
        ...baseEnvelope,
        operation: { ...baseEnvelope.operation, path: "../outside.ts" },
      }).ok,
      false,
    );
    strictEqual(
      decodeActionEnvelope({
        ...baseEnvelope,
        lifetime: { ...baseEnvelope.lifetime, revision: 3 },
      }).ok,
      false,
    );
  });

  it("accepts complete attributed review and rejects truncation", () => {
    const review: ChangeReview = {
      head: "b".repeat(40),
      observedAt: "2026-07-28T08:01:00.000Z",
      statusHash: `sha256:${"4".repeat(64)}`,
      edenPatch: {
        state: "complete",
        byteLength: 5,
        content: "delta",
        contentHash: `sha256:${"5".repeat(64)}`,
      },
      currentTrackedPatch: {
        state: "complete",
        byteLength: 4,
        content: "diff",
        contentHash: `sha256:${"6".repeat(64)}`,
      },
      changedFiles: [{ path: "src/example.ts", status: "modified", attribution: "both" }],
      baselineCheck: {
        checkId: "check-before",
        template: "git_diff_check",
        head: "b".repeat(40),
        observedAt: "2026-07-28T08:00:00.000Z",
        status: "passed",
        diagnostics: [],
        contentHash: `sha256:${"7".repeat(64)}`,
      },
      currentCheck: {
        checkId: "check-after",
        template: "git_diff_check",
        head: "b".repeat(40),
        observedAt: "2026-07-28T08:01:00.000Z",
        status: "passed",
        diagnostics: [],
        contentHash: `sha256:${"7".repeat(64)}`,
      },
      newlyObservedDiagnostics: [],
      untrackedPaths: [],
      executionMode: "trusted_host_policy_only",
      isolation: "none",
      network: "not_requested",
    };

    deepStrictEqual(decodeChangeReview(review), { ok: true, value: review });
    strictEqual(
      decodeChangeReview({
        ...review,
        edenPatch: { ...review.edenPatch, truncated: true },
      }).ok,
      false,
    );
  });
});

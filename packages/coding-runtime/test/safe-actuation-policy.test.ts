import { deepStrictEqual, strictEqual } from "node:assert";
import { describe, it } from "node:test";

import type { ActionEnvelopeV1, AnchorEditOperation } from "@eden/contracts";

import {
  canonicalActionBytes,
  consumeSafeApproval,
  createSafeApproval,
  evaluateSafeActuationPolicy,
  isNarrowerAnchorEdit,
  safeActionDigest,
} from "../src/index.ts";

const envelope: ActionEnvelopeV1 = {
  actionVersion: 1,
  actionId: "action-1",
  runId: "run-safe-1",
  proposalRevision: 4,
  kind: "anchor_edit",
  operation: {
    type: "anchor_edit",
    path: "src/a.ts",
    baseByteLength: 3,
    baseSha256: `sha256:${"1".repeat(64)}`,
    desiredByteLength: 3,
    desiredSha256: `sha256:${"2".repeat(64)}`,
    replacements: [{ oldText: "a", newText: "b", expectedOccurrences: 1 }],
  },
  workspace: {
    workspaceId: "workspace-1",
    canonicalRootHash: `sha256:${"3".repeat(64)}`,
  },
  cwd: ".",
  scope: {
    capability: "workspace.write.existing_tracked_utf8",
    paths: ["src/a.ts"],
  },
  baseSnapshots: [{ path: "src/a.ts", byteLength: 3, sha256: `sha256:${"1".repeat(64)}` }],
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

const expectedCanonicalJson = `{"actionVersion":1,"authority":{"environmentClass":"none","executionMode":"trusted_host_policy_only","network":"not_requested","policyVersion":1,"ruleSetRevision":"r2-safe-actuation-v1"},"baseSnapshots":[{"byteLength":3,"path":"src/a.ts","sha256":"sha256:${"1".repeat(64)}"}],"budgets":{"outputBytes":null,"timeoutMs":null},"cwd":".","kind":"anchor_edit","lifetime":{"kind":"single_use_proposal_revision","revision":4},"operation":{"baseByteLength":3,"baseSha256":"sha256:${"1".repeat(64)}","desiredByteLength":3,"desiredSha256":"sha256:${"2".repeat(64)}","path":"src/a.ts","replacements":[{"expectedOccurrences":1,"newText":"b","oldText":"a"}],"type":"anchor_edit"},"proposalRevision":4,"runId":"run-safe-1","scope":{"capability":"workspace.write.existing_tracked_utf8","paths":["src/a.ts"]},"workspace":{"canonicalRootHash":"sha256:${"3".repeat(64)}","workspaceId":"workspace-1"}}`;

describe("safe-actuation authority", () => {
  it("produces the independently frozen canonical bytes and digest", () => {
    const bytes = canonicalActionBytes(envelope);
    strictEqual(new TextDecoder().decode(bytes), `eden.action.v1\0${expectedCanonicalJson}`);
    strictEqual(
      safeActionDigest(envelope),
      "a1e4761abaddc98b0dbbe2efd78db4cd5d17d51cb4342912091f8e7d03c19f59",
    );
    strictEqual(
      safeActionDigest({ ...envelope, actionId: "another-correlation-id" }),
      safeActionDigest(envelope),
    );
  });

  it("asks for AnchorEdit and allows only the frozen Git templates", () => {
    const decision = evaluateSafeActuationPolicy(envelope, "2026-07-28T09:00:00.000Z");
    deepStrictEqual(decision, {
      decision: "ask",
      ruleId: "r2.anchor-edit.tracked-utf8",
      ruleSetRevision: "r2-safe-actuation-v1",
      actionDigest: safeActionDigest(envelope),
      reason: "Tracked UTF-8 modifications require one exact approval.",
      evaluatedAt: "2026-07-28T09:00:00.000Z",
    });
  });

  it("consumes one exact approval and rejects stale, changed, and reused grants", () => {
    const grant = createSafeApproval({
      approvalId: "approval-1",
      envelope,
      expectedRevision: 4,
    });
    const consumed = consumeSafeApproval(grant, envelope, 4);
    strictEqual(consumed.ok, true);
    if (!consumed.ok) return;
    strictEqual(consumed.approval.state, "consumed");
    strictEqual(consumeSafeApproval(consumed.approval, envelope, 4).ok, false);
    strictEqual(consumeSafeApproval(grant, { ...envelope, proposalRevision: 5 }, 4).ok, false);
    strictEqual(consumeSafeApproval(grant, envelope, 5).ok, false);
  });

  it("accepts one capability-narrow child and rejects broader authority", () => {
    const anchorOperation = envelope.operation as AnchorEditOperation;
    const parent: ActionEnvelopeV1 = {
      ...envelope,
      operation: {
        ...anchorOperation,
        replacements: [
          ...anchorOperation.replacements,
          { oldText: "c", newText: "d", expectedOccurrences: 1 },
        ],
      },
    };
    const narrower: ActionEnvelopeV1 = {
      ...envelope,
      actionId: "action-2",
    };
    strictEqual(isNarrowerAnchorEdit(parent, narrower), true);
    strictEqual(
      isNarrowerAnchorEdit(parent, {
        ...envelope,
        actionId: "action-3",
        scope: { ...envelope.scope, paths: ["src/b.ts"] },
      }),
      false,
    );
  });
});

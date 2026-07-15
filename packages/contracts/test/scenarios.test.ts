import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  awaitingApprovalProductView,
  decodeProductView,
  decodeResolveWorkspaceTrustCommand,
  decodeWorkspaceReview,
  executingProductView,
  restrictedWorkspaceReview,
  reviewProductView,
  trustedWorkspaceReview,
} from "@eden/contracts";

const fixtures = [awaitingApprovalProductView, executingProductView, reviewProductView] as const;

describe("deterministic product view scenarios", () => {
  it("exports a dedicated pre-run workspace review boundary", () => {
    // Given: onboarding exists before any run-scoped ProductView.
    const reviews = [restrictedWorkspaceReview, trustedWorkspaceReview] as const;

    // When: both deterministic states cross the public decoder.
    const results = reviews.map((review) => decodeWorkspaceReview(review));
    const longRootReview = {
      ...restrictedWorkspaceReview,
      workspace: { ...restrictedWorkspaceReview.workspace, root: `/${"w".repeat(512)}` },
    };

    // Then: trust changes task entry only and both closed values decode.
    assert.deepEqual(
      results.map((result) => result.ok),
      [true, true],
    );
    assert.equal(restrictedWorkspaceReview.authority.taskStart, "blocked");
    assert.equal(trustedWorkspaceReview.authority.taskStart, "allowed");
    assert.equal(decodeWorkspaceReview(longRootReview).ok, true);
    assert.deepEqual(
      { ...restrictedWorkspaceReview.authority, taskStart: "allowed" },
      trustedWorkspaceReview.authority,
    );
    assert.equal(
      decodeResolveWorkspaceTrustCommand({
        commandId: "command-trust-1",
        decision: "trust",
        expectedRevision: 0,
        protocolVersion: 1,
        type: "workspace.trust.resolve",
        workspaceId: restrictedWorkspaceReview.workspace.workspaceId,
      }).ok,
      true,
    );
  });

  it("round-trips awaiting-approval, executing, and review views", () => {
    assert.deepEqual(
      fixtures.map((fixture) => decodeProductView(JSON.parse(JSON.stringify(fixture))).ok),
      [true, true, true],
    );
    assert.equal(awaitingApprovalProductView.approval?.actionId, "action-test-1");
    assert.equal(executingProductView.terminalOutcome, null);
    assert.equal(reviewProductView.terminalOutcome?.state, "succeeded");
  });

  it("keeps scenario data attributable and renderer-independent", () => {
    assert.equal(awaitingApprovalProductView.phase, "awaiting-approval");
    assert.equal(awaitingApprovalProductView.currentAction?.actionId, "action-test-1");
    assert.equal(awaitingApprovalProductView.approval?.digest, "sha256:action-test-1");
    assert.equal(executingProductView.changedFiles[0]?.path, "packages/contracts/src/protocol.ts");
    assert.equal(reviewProductView.checks[0]?.requirement, "required");
    assert.ok(reviewProductView.residualRisk);
    assert.ok(reviewProductView.nextActions.length > 0);
    assert.equal(executingProductView.workspace.root, "/work/eden-agent");
  });

  it("rejects renderer state, secret canaries, raw diagnostics, bad versions, and unknown phases", () => {
    const invalidViews = [
      { ...executingProductView, focus: "progress" },
      { ...executingProductView, SECRET_CANARY: "do-not-leak" },
      { ...executingProductView, providerPayload: { reasoning: "hidden" } },
      { ...executingProductView, stack: "Error: raw stack" },
      { ...executingProductView, protocolVersion: 2 },
      { ...executingProductView, phase: "autonomous-magic" },
      {
        ...executingProductView,
        workspace: { ...executingProductView.workspace, environmentSecret: "do-not-leak" },
      },
    ];

    for (const value of invalidViews) {
      assert.equal(decodeProductView(value).ok, false);
    }
  });

  it("rejects authority escalation and secrets in workspace review values", () => {
    // Given: untrusted additions and broadened authority at the pre-run boundary.
    const invalidReviews = [
      { ...restrictedWorkspaceReview, providerKey: "SECRET_CANARY" },
      {
        ...restrictedWorkspaceReview,
        authority: { ...restrictedWorkspaceReview.authority, network: "allowed" },
      },
      {
        ...restrictedWorkspaceReview,
        workspace: { ...restrictedWorkspaceReview.workspace, trustParent: true },
      },
      { ...restrictedWorkspaceReview, focus: "trust" },
    ];

    // When and Then: the closed decoder rejects every escalation or renderer-local field.
    for (const value of invalidReviews) assert.equal(decodeWorkspaceReview(value).ok, false);
  });
});

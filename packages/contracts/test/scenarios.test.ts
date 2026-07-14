import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  awaitingApprovalProductView,
  decodeProductView,
  executingProductView,
  reviewProductView,
} from "@eden/contracts";

const fixtures = [awaitingApprovalProductView, executingProductView, reviewProductView] as const;

describe("deterministic product view scenarios", () => {
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
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  awaitingApprovalProductView,
  decodeContextAdmissionSummary,
  decodeProductView,
} from "@eden/contracts";

const budget = {
  contextWindowTokens: 16_384,
  outputReserveTokens: 8_192,
  safetyReserveTokens: 2_048,
  selectedInputTokens: 320,
  usableInputTokens: 6_144,
} as const;

const summary = {
  blocker: null,
  budget,
  instructions: [
    {
      activatedContextItemIds: ["repository-alpha"],
      contentHash: `sha256:${"a".repeat(64)}`,
      precedence: 1,
      scopePath: "packages/alpha",
      selectionReason: "path_scope",
      sourcePath: "packages/alpha/AGENTS.md",
    },
  ],
  items: [
    {
      contextItemId: "task-current",
      estimatedTokens: 120,
      priority: "P0",
      reason: "required",
      selected: true,
      selection: "complete",
      source: "current_task",
      scopePath: ".",
    },
    {
      contextItemId: "older-turn",
      estimatedTokens: 200,
      priority: "P2",
      reason: "budget_omitted",
      selected: false,
      selection: "omitted",
      source: "conversation",
      scopePath: ".",
    },
  ],
  state: "ready",
} as const;

describe("context admission contracts", () => {
  it("decodes one closed ready summary with instruction provenance and selection ledger", () => {
    const decoded = decodeContextAdmissionSummary(summary);
    assert.equal(decoded.ok, true);
    if (decoded.ok) assert.deepEqual(decoded.value, summary);
  });

  it("projects the same closed summary through an R2 ProductView without changing R1 fixtures", () => {
    const decoded = decodeProductView({ ...awaitingApprovalProductView, context: summary });
    assert.equal(decoded.ok, true);
    if (decoded.ok) assert.deepEqual(decoded.value.context, summary);
    assert.equal(decodeProductView(awaitingApprovalProductView).ok, true);
  });

  it("rejects unknown fields, malformed hashes, inconsistent budgets, and blocked state without an error", () => {
    for (const value of [
      { ...summary, rendererFocus: "context" },
      {
        ...summary,
        instructions: [{ ...summary.instructions[0], contentHash: "not-a-hash" }],
      },
      {
        ...summary,
        budget: { ...budget, selectedInputTokens: budget.usableInputTokens + 1 },
      },
      {
        ...summary,
        items: [{ ...summary.items[0], selection: "omitted", selected: true }],
      },
      { ...summary, state: "blocked" },
    ]) {
      assert.equal(decodeContextAdmissionSummary(value).ok, false);
    }
  });
});

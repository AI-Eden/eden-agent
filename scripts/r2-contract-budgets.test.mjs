import { strictEqual } from "node:assert";
import { test } from "node:test";

import { r2ContractBudgets } from "./r2-contract-budgets.mjs";

function journalBytes(type, payload) {
  return Buffer.byteLength(
    `${JSON.stringify({
      causationId: "effect-r2",
      correlationId: "run-r2",
      eventId: "event-r2",
      journalVersion: 1,
      payload,
      recordedAt: "2026-07-19T00:00:00.000Z",
      redaction: { fields: [], status: "not-required" },
      runId: "run-r2-budget",
      sequence: 0,
      type,
    })}\n`,
    "utf8",
  );
}

function boundedFixtureSizes() {
  return {
    instruction: journalBytes("repository.instructions.activated", {
      activatedContextItemIds: ["context-r2"],
      content: "i".repeat(r2ContractBudgets.instructionFileBytes),
      contentHash: "0".repeat(64),
      precedence: 0,
      scope: ".",
      selectionReason: "trusted-root",
      sourcePath: "AGENTS.md",
    }),
    model: journalBytes("model.step.observed", {
      attemptId: "attempt-r2",
      finishStatus: "complete",
      privateContinuity: "c".repeat(r2ContractBudgets.privateContinuityBytes),
      usage: "unknown",
      visibleText: "a".repeat(r2ContractBudgets.visibleAssistantBytes),
    }),
    tool: journalBytes("tool.observed", {
      diagnostics: { status: "sanitized" },
      modelContent: "t".repeat(r2ContractBudgets.toolModelContentBytes),
      product: { continuation: null, rows: [] },
      toolCallId: "tool-call-r2",
    }),
  };
}

test("R2 closed fixtures retain journal headroom and oversized variants cross the hard limit", () => {
  const fixtures = boundedFixtureSizes();
  const headroomLimit = Math.floor(
    r2ContractBudgets.journalRecordBytes * r2ContractBudgets.maximumRecordFillRatio,
  );

  for (const size of Object.values(fixtures)) {
    strictEqual(size < headroomLimit, true);
  }

  for (const [type, payload] of [
    ["model.step.observed", { visibleText: "a".repeat(r2ContractBudgets.journalRecordBytes) }],
    [
      "repository.instructions.activated",
      { content: "i".repeat(r2ContractBudgets.journalRecordBytes) },
    ],
    ["tool.observed", { modelContent: "t".repeat(r2ContractBudgets.journalRecordBytes) }],
  ]) {
    strictEqual(journalBytes(type, payload) > r2ContractBudgets.journalRecordBytes, true);
  }
});

test("the maximum first-slice closed run fixture stays below the existing run budget", () => {
  const fixtures = boundedFixtureSizes();
  const instructionCount = Math.ceil(
    r2ContractBudgets.instructionChainBytes / r2ContractBudgets.instructionFileBytes,
  );
  const fixtureBytes =
    instructionCount * fixtures.instruction +
    r2ContractBudgets.modelSteps * fixtures.model +
    r2ContractBudgets.toolCalls * fixtures.tool;

  strictEqual(
    fixtureBytes < r2ContractBudgets.journalRunBytes * r2ContractBudgets.maximumRunFillRatio,
    true,
  );
});

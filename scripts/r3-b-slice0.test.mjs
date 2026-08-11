import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import {
  awaitingApprovalProductView,
  ConversationTurnSchema,
  decodeProductView,
  executingProductView,
  ProductPhaseSchema,
  ProductViewSchema,
  RepositoryToolCallSchema,
  reviewProductView,
  TerminalOutcomeSchema,
} from "../packages/contracts/src/index.ts";

function unionLiterals(schema) {
  return schema.anyOf.map((entry) => entry.const);
}

function objectUnionPropertyLiterals(schema, property) {
  return schema.anyOf.flatMap((entry) => {
    const value = entry.properties[property];
    if (value.const !== undefined) return [value.const];
    return unionLiterals(value);
  });
}

test("R3-B inventories every current ProductView phase, turn, terminal, and tool variant", () => {
  deepStrictEqual(unionLiterals(ProductPhaseSchema), [
    "awaiting-approval",
    "executing",
    "awaiting-retry",
    "review",
  ]);
  deepStrictEqual(objectUnionPropertyLiterals(ConversationTurnSchema, "role"), [
    "user",
    "user",
    "assistant",
  ]);
  const activeInputTurn = ConversationTurnSchema.anyOf.find(
    (entry) => entry.properties.source !== undefined,
  );
  deepStrictEqual(unionLiterals(activeInputTurn.properties.source), ["steer", "queue"]);
  deepStrictEqual(objectUnionPropertyLiterals(TerminalOutcomeSchema, "state"), [
    "completed",
    "succeeded",
    "failed",
    "blocked",
    "cancelled",
  ]);
  deepStrictEqual(objectUnionPropertyLiterals(RepositoryToolCallSchema, "name"), [
    "list_files",
    "read_file",
    "search_repository",
    "git_status",
    "git_diff",
    "anchor_edit",
    "write_file",
    "run_command",
    "repository_check",
  ]);

  const retryView = {
    ...executingProductView,
    currentAction: null,
    phase: "awaiting-retry",
    retry: {
      available: true,
      reason: {
        code: "network",
        message: "The provider request was proven not started.",
        recoverability: "retry",
        suggestedActions: ["Retry the same committed conversation turn once."],
      },
    },
  };
  for (const view of [
    awaitingApprovalProductView,
    executingProductView,
    retryView,
    reviewProductView,
  ]) {
    strictEqual(decodeProductView(view).ok, true);
  }
});

test("R3-B records the current bounded ProductView collection capacities", () => {
  const properties = ProductViewSchema.properties;
  deepStrictEqual(
    {
      attempts: properties.attempts.maxItems,
      changedFiles: properties.changedFiles.maxItems,
      checks: properties.checks.maxItems,
      conversation: properties.conversation.maxItems,
      tools: properties.tools.maxItems,
    },
    { attempts: 36, changedFiles: 256, checks: 128, conversation: 13, tools: 16 },
  );
});

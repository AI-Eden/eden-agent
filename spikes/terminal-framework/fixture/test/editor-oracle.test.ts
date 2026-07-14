import { deepStrictEqual } from "node:assert";
import { test } from "node:test";

import { terminalScenarioOracle } from "../src/oracle.ts";

test("Chinese editing and multiline paste preserve graphemes and literal shortcuts", () => {
  // Given: the approved Chinese editing and paste scenario.
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "composer",
      forbiddenVisibleText: ["status: cancelled"],
      recoveryAction: null,
      status: "composing",
      visibleText: ["composer: 你好界", "请保留 /cancel 文本", "第二行"],
    },
    id: "chinese-editing-paste",
    initialState: { focus: "composer", status: "composing" },
    inputSequence: [
      "type:你好世界",
      "ArrowLeft",
      "Backspace",
      "End",
      "paste:\n请保留 /cancel 文本\n第二行",
    ],
  } as const;

  // When: a candidate reads the shared Chinese editing and paste row.
  const chineseEditingPaste = terminalScenarioOracle.find(
    (row) => row.id === "chinese-editing-paste",
  );

  // Then: the expected text preserves grapheme editing and literal pasted content.
  deepStrictEqual(chineseEditingPaste, expectedRow);
});

test("repeated Backspace deletes consecutive graphemes before the cursor", () => {
  // Given: the approved repeated grapheme-deletion scenario.
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "composer",
      forbiddenVisibleText: [],
      recoveryAction: null,
      status: "composing",
      visibleText: ["composer: 界"],
    },
    id: "repeated-grapheme-deletion",
    initialState: { focus: "composer", status: "composing" },
    inputSequence: ["type:你好世界", "ArrowLeft", "Backspace", "Backspace", "Backspace"],
  } as const;

  // When: a candidate reads the shared repeated-deletion row.
  const repeatedDeletion = terminalScenarioOracle.find(
    (row) => row.id === "repeated-grapheme-deletion",
  );

  // Then: the cursor moves left after each deleted grapheme.
  deepStrictEqual(repeatedDeletion, expectedRow);
});

test("Left and Right move the composer cursor across graphemes", () => {
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "composer",
      forbiddenVisibleText: [],
      recoveryAction: null,
      status: "composing",
      visibleText: ["composer: 你好界"],
    },
    id: "bidirectional-grapheme-navigation",
    initialState: { focus: "composer", status: "composing" },
    inputSequence: ["type:你好", "ArrowLeft", "ArrowRight", "type:界"],
  } as const;

  const bidirectionalNavigation = terminalScenarioOracle.find(
    (row) => row.id === "bidirectional-grapheme-navigation",
  );

  deepStrictEqual(bidirectionalNavigation, expectedRow);
});

test("Delete removes the grapheme after the composer cursor", () => {
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "composer",
      forbiddenVisibleText: [],
      recoveryAction: null,
      status: "composing",
      visibleText: ["composer: 好"],
    },
    id: "forward-grapheme-deletion",
    initialState: { focus: "composer", status: "composing" },
    inputSequence: ["type:你好", "Home", "Delete"],
  } as const;

  const forwardDeletion = terminalScenarioOracle.find(
    (row) => row.id === "forward-grapheme-deletion",
  );

  deepStrictEqual(forwardDeletion, expectedRow);
});

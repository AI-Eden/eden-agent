import { deepStrictEqual } from "node:assert";
import { test } from "node:test";

import { terminalScenarioOracle } from "../src/oracle.ts";

test("primary approval preserves action identity and does not claim completion", () => {
  // Given: the approved primary-approval scenario.
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "progress",
      forbiddenVisibleText: ["succeeded"],
      recoveryAction: null,
      status: "approved",
      visibleText: [
        "pnpm --filter @eden/kernel test",
        "cwd: .",
        "reason: Run the required kernel transition checks.",
        "scope: workspace tests only",
        "status: approved",
      ],
    },
    id: "primary-approval",
    initialState: { focus: "approval", status: "pending" },
    inputSequence: ["Enter", "a"],
  } as const;

  // When: a candidate reads the shared primary-approval row.
  const primaryApproval = terminalScenarioOracle.find((row) => row.id === "primary-approval");

  // Then: the candidate receives the complete black-box expectation.
  deepStrictEqual(primaryApproval, expectedRow);
});

test("denial keeps the command unchanged and exposes a recovery path", () => {
  // Given: the approved denial-and-recovery scenario.
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "composer",
      forbiddenVisibleText: ["executing", "succeeded"],
      recoveryAction: "Revise the task or request a safer action.",
      status: "denied",
      visibleText: [
        "pnpm --filter @eden/kernel test",
        "status: denied",
        "Revise the task or request a safer action.",
        "composer: Please use a read-only check first.",
      ],
    },
    id: "denial-recovery",
    initialState: { focus: "approval", status: "pending" },
    inputSequence: ["d", "Tab", "type:Please use a read-only check first."],
  } as const;

  // When: a candidate reads the shared denial-and-recovery row.
  const denialRecovery = terminalScenarioOracle.find((row) => row.id === "denial-recovery");

  // Then: denial remains visible and cannot execute the action implicitly.
  deepStrictEqual(denialRecovery, expectedRow);
});

test("failed check review keeps failure recovery diff and action attributable", () => {
  // Given: the approved failing-check review scenario.
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "recovery",
      forbiddenVisibleText: ["succeeded"],
      recoveryAction: "Open failure details and rerun the required check.",
      status: "check-failed",
      visibleText: [
        "check: typecheck failed",
        "failure: RunState transition is not exhaustive.",
        "recovery: Open failure details and rerun the required check.",
        "changed: packages/kernel/src/index.ts",
        "diff: packages/kernel/src/index.ts",
      ],
    },
    id: "failing-check-review",
    initialState: { focus: "progress", status: "running" },
    inputSequence: ["r", "Tab", "Enter"],
  } as const;

  // When: a candidate reads the shared failing-check review row.
  const failingCheckReview = terminalScenarioOracle.find(
    (row) => row.id === "failing-check-review",
  );

  // Then: review evidence remains bound to one action and recovery path.
  deepStrictEqual(failingCheckReview, expectedRow);
});

test("resize preserves action safety and focus across every approved width", () => {
  // Given: the approved narrow medium and wide resize sequence.
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: ["timeline", "diff context"],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "approval",
      forbiddenVisibleText: [],
      recoveryAction: null,
      status: "pending",
      visibleText: [
        "trust: workspace",
        "status: pending",
        "pnpm --filter @eden/kernel test",
        "focus: approval",
      ],
    },
    id: "resize-action-safety",
    initialState: { focus: "approval", status: "pending" },
    inputSequence: ["resize:60x20", "resize:100x30", "resize:160x45"],
  } as const;

  // When: a candidate reads the shared resize row.
  const resizeActionSafety = terminalScenarioOracle.find(
    (row) => row.id === "resize-action-safety",
  );

  // Then: every width keeps the selected action safe and identifiable.
  deepStrictEqual(resizeActionSafety, expectedRow);
});

test("stress navigation returns to the prior action and focus", () => {
  // Given: the approved large-output and large-diff navigation scenario.
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "running",
      focus: "progress",
      forbiddenVisibleText: [],
      recoveryAction: null,
      status: "running",
      visibleText: [
        "output marker: output-09999",
        "diff file: synthetic/file-20.ts",
        "selected action: pnpm --filter @eden/kernel test",
      ],
    },
    id: "stress-navigation",
    initialState: { focus: "progress", status: "running" },
    inputSequence: ["o", "End", "d", "End", "Escape"],
  } as const;

  // When: a candidate reads the shared stress-navigation row.
  const stressNavigation = terminalScenarioOracle.find((row) => row.id === "stress-navigation");

  // Then: output and diff markers remain reachable without losing action context.
  deepStrictEqual(stressNavigation, expectedRow);
});

test("normal exit and forced cancellation restore the parent shell", () => {
  // Given: the approved normal-exit and forced-cancellation scenario.
  const expectedRow = {
    expectedState: {
      allowedCollapsedContent: [],
      canonicalActionText: "pnpm --filter @eden/kernel test",
      exitResult: "normal:0; cancelled:130; shell-sentinel:ok",
      focus: "shell",
      forbiddenVisibleText: ["cursor hidden", "alternate screen active"],
      recoveryAction: null,
      status: "cancelled",
      visibleText: ["shell sentinel: EDEN_TUI_RESTORED"],
    },
    id: "exit-cleanup",
    initialState: { focus: "approval", status: "pending" },
    inputSequence: ["q", "restart", "Ctrl+C", "shell:echo EDEN_TUI_RESTORED"],
  } as const;

  // When: a candidate reads the shared exit-cleanup row.
  const exitCleanup = terminalScenarioOracle.find((row) => row.id === "exit-cleanup");

  // Then: both exit paths return control to a usable shell.
  deepStrictEqual(exitCleanup, expectedRow);
});

export type TerminalScenarioOracleRow = {
  readonly id: string;
  readonly initialState: {
    readonly focus: string;
    readonly status: string;
  };
  readonly inputSequence: readonly string[];
  readonly expectedState: {
    readonly allowedCollapsedContent: readonly string[];
    readonly canonicalActionText: string;
    readonly exitResult: string;
    readonly focus: string;
    readonly forbiddenVisibleText: readonly string[];
    readonly recoveryAction: string | null;
    readonly status: string;
    readonly visibleText: readonly string[];
  };
};

export const terminalScenarioOracle: readonly TerminalScenarioOracleRow[] = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
];

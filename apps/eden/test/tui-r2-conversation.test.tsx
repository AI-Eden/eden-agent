import { expect, test } from "bun:test";

import { executingProductView, type ProductView, trustedWorkspaceReview } from "@eden/contracts";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";

import { EdenTuiLayout } from "../src/tui-layout.tsx";

const baseProps = {
  authorityPending: null,
  catalog: null,
  compact: false,
  composerFocused: false,
  draft: "",
  error: null,
  expandedToolIds: new Set<string>(),
  focusId: "run.exit" as const,
  height: 40,
  historyError: null,
  inspection: null,
  liveModelText: null,
  layoutMode: "wide" as const,
  onDraftChange: () => undefined,
  onComposerKeyDown: () => undefined,
  onProfileDraftChange: () => undefined,
  onProfileKeyDown: () => undefined,
  onProfileSave: async () => undefined,
  onStart: async () => undefined,
  overlay: null,
  palette: [],
  paletteIndex: 0,
  profileCatalog: null,
  profileDraft: "",
  profileEditorFocused: false,
  providerReadiness: null,
  readinessConfirmationFocused: false,
  review: trustedWorkspaceReview,
  runPane: "conversation" as const,
  selectedIndex: 0,
  surface: "workspace" as const,
  timeline: ["model.attempt.updated", "tool.updated", "conversation.updated"] as const,
  width: 100,
};

test("R2 conversation keeps the complete answer primary and provider continuity private", async () => {
  const view: ProductView = {
    ...executingProductView,
    approval: null,
    attempts: [
      {
        attemptId: "attempt-1",
        error: null,
        reason: "initial",
        state: "completed",
        step: 1,
        usage: { state: "unknown" },
      },
      {
        attemptId: "attempt-2",
        error: null,
        reason: "initial",
        state: "completed",
        step: 2,
        usage: { completionTokens: 9, promptTokens: 41, state: "exact", totalTokens: 50 },
      },
    ],
    conversation: [
      { content: "Find the marker.", role: "user", turnId: "user-run-test-1" },
      {
        attemptId: "attempt-1",
        content: "I will inspect repository evidence.",
        role: "assistant",
        status: "complete",
        turnId: "assistant-attempt-1",
      },
      {
        attemptId: "attempt-2",
        content: "README.md:1 contains the marker.",
        role: "assistant",
        status: "complete",
        turnId: "assistant-attempt-2",
      },
    ],
    currentAction: null,
    phase: "review",
    retry: { available: false, reason: null },
    terminalOutcome: { answer: "README.md:1 contains the marker.", state: "completed" },
  };
  const renderer = await testRender(<EdenTuiLayout {...baseProps} view={view} />, {
    height: 40,
    width: 100,
  });
  try {
    await act(async () => renderer.flush());
    const frame = renderer.captureCharFrame();
    expect(frame).toContain("assistant · complete");
    expect(frame).toContain("README.md:1 contains the marker.");
    expect(frame).toContain("outcome: completed");
    expect(frame).toContain("provider network");
    expect(frame).toContain("allowed");
    expect(frame).not.toContain("privateContinuity");
    expect(frame).not.toContain("reasoning_content");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

test("R2 interrupted conversation renders incomplete truth and an explicit retry control", async () => {
  const error = {
    code: "network",
    message: "The provider stream was interrupted after visible output.",
    recoverability: "ask-user" as const,
    suggestedActions: ["Explicitly retry from the last committed conversation turn."],
  };
  const view: ProductView = {
    ...executingProductView,
    approval: null,
    attempts: [
      {
        attemptId: "attempt-1",
        error,
        reason: "initial",
        state: "interrupted",
        step: 1,
        usage: { state: "unknown" },
      },
    ],
    conversation: [
      { content: "Find the marker.", role: "user", turnId: "user-run-test-1" },
      {
        attemptId: "attempt-1",
        content: "Incomplete provider text",
        role: "assistant",
        status: "incomplete",
        turnId: "assistant-attempt-1-incomplete",
      },
    ],
    currentAction: null,
    phase: "awaiting-retry",
    retry: { available: true, reason: error },
    terminalOutcome: null,
  };
  const renderer = await testRender(<EdenTuiLayout {...baseProps} view={view} />, {
    height: 40,
    width: 100,
  });
  try {
    await act(async () => renderer.flush());
    const frame = renderer.captureCharFrame();
    expect(frame).toContain("assistant · incomplete");
    expect(frame).toContain("Incomplete provider text");
    expect(frame).toContain("model attempt: interrupted or unknown");
    expect(frame).toContain("retry from last committed turn: u");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

test("responsive composition exposes narrow switching, a medium drawer, and a wide review pane", async () => {
  const view: ProductView = {
    ...executingProductView,
    approval: null,
    currentAction: null,
    phase: "review",
    terminalOutcome: { answer: "完整答案 stays primary.", state: "completed" },
  };
  const cases = [
    {
      expected: "view: conversation · Ctrl+P switches conversation/co",
      height: 20,
      layoutMode: "narrow" as const,
      width: 60,
    },
    {
      expected: "composition: conversation + contextual drawer",
      height: 24,
      layoutMode: "medium" as const,
      width: 80,
    },
    {
      expected: "composition: session navigation + conversation + review pane",
      height: 30,
      layoutMode: "wide" as const,
      width: 100,
    },
  ];
  for (const scenario of cases) {
    const renderer = await testRender(
      <EdenTuiLayout
        {...baseProps}
        compact={scenario.layoutMode === "narrow"}
        height={scenario.height}
        layoutMode={scenario.layoutMode}
        view={view}
        width={scenario.width}
      />,
      { height: scenario.height, width: scenario.width },
    );
    try {
      await act(async () => renderer.flush());
      const frame = renderer.captureCharFrame();
      expect(frame).toContain(scenario.expected);
      expect(frame).toContain("完整答案 stays primary.");
      expect(frame).toContain("AUTHORITY");
    } finally {
      act(() => renderer.renderer.destroy());
    }
  }
});

test("folded tool evidence never replaces or folds the complete final answer", async () => {
  const toolCallId = "tool-call-folded-1";
  const view: ProductView = {
    ...executingProductView,
    approval: null,
    currentAction: null,
    phase: "review",
    terminalOutcome: { answer: "Final sourced answer remains complete.", state: "completed" },
    tools: [
      {
        call: {
          arguments: { maxBytes: 1024, offset: 0, path: "README.md" },
          name: "read_file",
          toolCallId,
        },
        result: {
          data: {
            bytesRead: 18,
            content: "hidden tool detail",
            contentHash: `sha256:${"a".repeat(64)}`,
            nextOffset: null,
            offset: 0,
            sourcePath: "README.md",
            totalBytes: 18,
          },
          name: "read_file",
          status: "succeeded",
          toolCallId,
        },
        state: "completed",
      },
    ],
  };
  const renderer = await testRender(
    <EdenTuiLayout
      {...baseProps}
      compact
      expandedToolIds={new Set()}
      height={20}
      layoutMode="narrow"
      runPane="context"
      view={view}
      width={60}
    />,
    { height: 20, width: 60 },
  );
  try {
    await act(async () => renderer.flush());
    const frame = renderer.captureCharFrame();
    expect(frame).toContain("tool details: folded");
    expect(frame).not.toContain("hidden tool detail");
    expect(frame).toContain("Final sourced answer remains complete.");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

test("safe-actuation review keeps Eden and repository patches separate with attribution", async () => {
  const view: ProductView = {
    ...executingProductView,
    approval: null,
    changedFiles: [
      { attribution: "both", path: "src/说明.ts", status: "modified" },
      { attribution: "pre_existing", path: "other.ts", status: "modified" },
    ],
    currentAction: null,
    phase: "review",
    review: {
      actionDigest: "a".repeat(64),
      actionId: "action-review",
      approval: {
        approvalId: "approval-review",
        expectedRevision: 12,
        proposalRevision: 2,
        state: "consumed",
      },
      baselineCheck: {
        checkId: "check-baseline",
        contentHash: `sha256:${"b".repeat(64)}`,
        diagnostics: [],
        head: "c".repeat(40),
        observedAt: "2026-07-28T10:00:00.000Z",
        status: "passed",
        template: "git_diff_check",
      },
      changedFiles: [
        { attribution: "both", path: "src/说明.ts", status: "modified" },
        { attribution: "pre_existing", path: "other.ts", status: "modified" },
      ],
      currentCheck: {
        checkId: "check-current",
        contentHash: `sha256:${"d".repeat(64)}`,
        diagnostics: [
          {
            diagnosticId: "diagnostic-new",
            line: 4,
            message: "trailing whitespace.",
            path: "src/说明.ts",
          },
        ],
        head: "c".repeat(40),
        observedAt: "2026-07-28T10:01:00.000Z",
        status: "failed",
        template: "git_diff_check",
      },
      currentTrackedPatch: {
        byteLength: 19,
        content: "CURRENT REPO PATCH\n",
        contentHash: `sha256:${"e".repeat(64)}`,
        state: "complete",
      },
      edenPatch: {
        byteLength: 16,
        content: "EDEN ONLY PATCH\n",
        contentHash: `sha256:${"f".repeat(64)}`,
        state: "complete",
      },
      executionMode: "trusted_host_policy_only",
      head: "c".repeat(40),
      isolation: "none",
      network: "not_requested",
      newlyObservedDiagnostics: ["diagnostic-new"],
      observedAt: "2026-07-28T10:01:00.000Z",
      policy: {
        decision: "ask",
        evaluatedAt: "2026-07-28T09:59:00.000Z",
        reason: "One exact tracked UTF-8 edit requires approval.",
        ruleId: "r2.anchor-edit.tracked-utf8",
        ruleSetRevision: "r2-safe-actuation-v1",
      },
      residualRisk: "Trusted-host policy only; no OS isolation or verifier success is claimed.",
      statusHash: `sha256:${"1".repeat(64)}`,
      untrackedPaths: ["notes/未跟踪.txt"],
    },
    terminalOutcome: {
      answer: "The approved edit is complete; review includes diff-check diagnostics.",
      state: "completed",
    },
  };
  const renderer = await testRender(
    <EdenTuiLayout
      {...baseProps}
      focusId="run.review"
      height={60}
      layoutMode="wide"
      runPane="recovery"
      view={view}
      width={120}
    />,
    { height: 60, width: 120 },
  );
  try {
    await act(async () => renderer.flush());
    const frame = renderer.captureCharFrame();
    expect(frame).toContain("SAFE ACTUATION REVIEW");
    expect(frame).toContain("both · modified · src/说明.ts");
    expect(frame).toContain("pre-existing · modified · other.ts");
    expect(frame).toContain("untracked · notes/未跟踪.txt");
    await act(async () => {
      renderer.mockInput.pressArrow("down");
      await renderer.flush();
    });
    const reviewChecks = renderer.captureCharFrame();
    expect(reviewChecks).toContain("baseline git diff-check: passed");
    expect(reviewChecks).toContain("current git diff-check: failed");
    await act(async () => {
      renderer.mockInput.pressKey("END");
      await renderer.flush();
    });
    const reviewTail = renderer.captureCharFrame();
    expect(reviewTail).toContain("EDEN CHANGE");
    expect(reviewTail).toContain("EDEN ONLY PATCH");
    expect(reviewTail).toContain("CURRENT REPOSITORY");
    expect(reviewTail).toContain("CURRENT REPO PATCH");
    expect(reviewTail).toContain("new · src/说明.ts:4 · trailing whitespace.");
    expect(reviewTail).toContain("no OS isolation or verifier");
    expect(reviewTail).toContain("success is claimed.");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

test("safe-actuation approval exposes exact authority without claiming isolation", async () => {
  const digest = "9".repeat(64);
  const view: ProductView = {
    ...executingProductView,
    approval: {
      actionId: "action-safe-approval",
      approvalId: "approval-safe-approval",
      authority: {
        baseSnapshots: [
          {
            byteLength: 42,
            path: "src/example.ts",
            sha256: `sha256:${"8".repeat(64)}`,
          },
        ],
        executionMode: "trusted_host_policy_only",
        isolation: "none",
        lifetime: "single_use_proposal_revision",
        network: "not_requested",
        policyRuleId: "r2.anchor-edit.tracked-utf8",
        policyRuleSetRevision: "r2-safe-actuation-v1",
        proposalRevision: 4,
      },
      canonicalDisplay: 'AnchorEdit "src/example.ts": 1 replacement(s)',
      cwd: ".",
      digest,
      reason: "Tracked UTF-8 modifications require one exact approval.",
      recoveryAction: "Approve this exact digest once, or deny it.",
      scope: "src/example.ts",
    },
    currentAction: {
      actionId: "action-safe-approval",
      cwd: ".",
      display: 'AnchorEdit "src/example.ts": 1 replacement(s)',
      reason: "Tracked UTF-8 modifications require one exact approval.",
      scope: "src/example.ts",
    },
    phase: "awaiting-approval",
  };
  const renderer = await testRender(
    <EdenTuiLayout
      {...baseProps}
      focusId="run.approve"
      height={40}
      layoutMode="wide"
      runPane="recovery"
      view={view}
      width={120}
    />,
    { height: 40, width: 120 },
  );
  try {
    await act(async () => renderer.flush());
    const frame = renderer.captureCharFrame();
    expect(frame).toContain("digest:");
    expect(frame).toContain("9999999999999999999999999999999999999999999999999999999999");
    expect(frame).toContain("workspace trust is separate");
    await act(async () => {
      renderer.mockInput.pressKey("END");
      await renderer.flush();
    });
    const authorityTail = renderer.captureCharFrame();
    expect(authorityTail).toContain("policy: r2.anchor-edit.tracked-utf8 · r2-safe-actuation-v1");
    expect(authorityTail).toContain("one use at proposal revision 4");
    expect(authorityTail).toContain("isolation none · network");
    expect(authorityTail).toContain("not_requested");
    expect(authorityTail).toContain("base: src/example.ts · 42 bytes");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

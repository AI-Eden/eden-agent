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
  timeline: ["approval.presented", "tool.updated", "review.updated"] as const,
  width: 100,
};

test("R3-A command approval exposes exact trusted-host authority at every accepted width", async () => {
  const view: ProductView = {
    ...executingProductView,
    approval: {
      actionId: "action-command-approval",
      approvalId: "approval-command-approval",
      authority: {
        baseSnapshots: [],
        executionMode: "trusted_host_policy_only",
        isolation: "none",
        lifetime: "single_use_proposal_revision",
        network: "host_unrestricted",
        policyRuleId: "r3.run-command.closed-v1",
        policyRuleSetRevision: "r3-safe-actuation-v1",
        process: {
          args: ["--test", "test/fix.test.mjs"],
          executablePath: "/usr/bin/node",
          program: "node",
          timeoutMs: 30_000,
        },
        proposalRevision: 7,
      },
      canonicalDisplay: 'Run node "--test" "test/fix.test.mjs"',
      cwd: ".",
      digest: "7".repeat(64),
      reason: "Run the deterministic fixture test after the approved edits.",
      recoveryAction: "Approve this exact command once, or deny it.",
      scope: ".",
    },
    currentAction: {
      actionId: "action-command-approval",
      cwd: ".",
      display: 'Run node "--test" "test/fix.test.mjs"',
      reason: "Run the deterministic fixture test after the approved edits.",
      scope: ".",
    },
    phase: "awaiting-approval",
  };

  for (const [width, height, layoutMode] of [
    [60, 20, "narrow"],
    [80, 24, "medium"],
    [100, 30, "wide"],
  ] as const) {
    const renderer = await testRender(
      <EdenTuiLayout
        {...baseProps}
        compact={layoutMode === "narrow"}
        focusId="run.approve"
        height={height}
        layoutMode={layoutMode}
        runPane="recovery"
        view={view}
        width={width}
      />,
      { height, width },
    );
    try {
      await act(async () => renderer.flush());
      let frames = renderer.captureCharFrame();
      for (let step = 0; step < 24 && !frames.includes("timeout 30000 ms"); step += 1) {
        await act(async () => {
          renderer.mockInput.pressArrow("down");
          await renderer.flush();
        });
        frames += renderer.captureCharFrame();
      }
      const normalized = frames.replace(/[^\p{L}\p{N}._/-]+/gu, " ").replaceAll(/\s+/gu, " ");
      expect(normalized).toContain("approval pending");
      expect(normalized).toContain("isolation none");
      expect(normalized).toContain("network host_unrestricted");
      expect(normalized).toContain("process /usr/bin/node");
      expect(normalized).toContain("timeout 30000 ms");
    } finally {
      act(() => renderer.renderer.destroy());
    }
  }
});

test("R3-A command and diff cards preserve bounded output, identity, and completed truth", async () => {
  const commandToolCallId = "tool-command-card";
  const diffToolCallId = "tool-diff-card";
  const contentHash = `sha256:${"1".repeat(64)}`;
  const patchHash = `sha256:${"2".repeat(64)}`;
  const statusHash = `sha256:${"3".repeat(64)}`;
  const view: ProductView = {
    ...executingProductView,
    approval: null,
    currentAction: null,
    phase: "review",
    terminalOutcome: {
      answer: "The bounded coding task is complete and awaits human review.",
      state: "completed",
    },
    tools: [
      {
        call: {
          arguments: {
            args: ["--test", "test/fix.test.mjs"],
            cwd: ".",
            network: "host_unrestricted",
            program: "node",
            reason: "Run the deterministic fixture test after the approved edits.",
            timeoutMs: 30_000,
          },
          name: "run_command",
          toolCallId: commandToolCallId,
        },
        result: {
          data: {
            actionId: "action-command-card",
            cleanupStatus: "complete",
            completedAt: "2026-08-11T03:00:01.000Z",
            cwd: ".",
            executablePath: "/usr/bin/node",
            exitCode: 0,
            outcome: "exited",
            startedAt: "2026-08-11T03:00:00.000Z",
            stderr: "",
            stderrBytes: 0,
            stderrSha256: contentHash,
            stdout: "tests 1\npass 1\n",
            stdoutBytes: 15,
            stdoutSha256: contentHash,
          },
          name: "run_command",
          status: "completed",
          toolCallId: commandToolCallId,
        },
        state: "completed",
      },
      {
        call: {
          arguments: { continuation: null, path: "." },
          name: "git_diff",
          toolCallId: diffToolCallId,
        },
        result: {
          data: {
            bytesRead: 25,
            content: "+export const fixed = 1;\n",
            contentHash,
            continuation: null,
            head: "4".repeat(40),
            offset: 0,
            patchHash,
            sourcePath: ".",
            statusHash,
            totalBytes: 25,
          },
          name: "git_diff",
          status: "succeeded",
          toolCallId: diffToolCallId,
        },
        state: "completed",
      },
    ],
  };

  const renderer = await testRender(
    <EdenTuiLayout
      {...baseProps}
      expandedToolIds={new Set([commandToolCallId, diffToolCallId])}
      focusId="run.tools"
      height={60}
      layoutMode="wide"
      runPane="context"
      view={view}
      width={120}
    />,
    { height: 60, width: 120 },
  );
  try {
    await act(async () => renderer.flush());
    let frames = renderer.captureCharFrame();
    for (let step = 0; step < 32 && !frames.includes("repository diff:"); step += 1) {
      await act(async () => {
        renderer.mockInput.pressArrow("down");
        await renderer.flush();
      });
      frames += renderer.captureCharFrame();
    }
    expect(frames).toContain("approved structured host command");
    expect(frames).toContain("outcome: exited · exit: 0 · cleanup: complete");
    expect(frames).toContain("tests 1");
    expect(frames).toContain("repository diff:");
    expect(frames).toContain("+export const fixed = 1;");
    expect(frames).toContain("outcome: completed");
    expect(frames).not.toContain("outcome: succeeded");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

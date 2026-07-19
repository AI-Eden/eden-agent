import { expect, test } from "bun:test";

import { executingProductView, type ProductView, trustedWorkspaceReview } from "@eden/contracts";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";

import { EdenTuiLayout } from "../src/tui-layout.tsx";

const baseProps = {
  catalog: null,
  compact: false,
  composerFocused: false,
  draft: "",
  error: null,
  height: 40,
  historyError: null,
  inspection: null,
  liveModelText: null,
  onDraftChange: () => undefined,
  onProfileDraftChange: () => undefined,
  onProfileSave: async () => undefined,
  onStart: async () => undefined,
  profileCatalog: null,
  profileDraft: "",
  profileEditorFocused: false,
  providerReadiness: null,
  readinessConfirmationFocused: false,
  review: trustedWorkspaceReview,
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

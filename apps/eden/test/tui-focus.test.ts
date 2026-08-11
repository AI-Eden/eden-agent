import { expect, test } from "bun:test";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useKeyboard, useRenderer } from "@opentui/react";
import { testRender } from "@opentui/react/test-utils";
import { act, createElement, useMemo } from "react";

import { densityForLayout, tuiDesignTokens } from "../src/tui-design.ts";
import {
  activeComposerActionForKey,
  activeComposerOwnsKey,
  commandForKey,
  focusOrder,
  layoutModeForViewport,
  leaveActiveComposerFocus,
  moveFocus,
  paletteEntries,
  reconcileFocus,
  type TuiFocusContext,
} from "../src/tui-focus.ts";
import { toolPresentationRegistry } from "../src/tui-tool-cards.tsx";

test("design tokens keep semantic state and narrow fallbacks deterministic", () => {
  expect(tuiDesignTokens.color.awaiting).not.toBe(tuiDesignTokens.color.danger);
  expect(tuiDesignTokens.focus.active).toBe(">");
  expect(tuiDesignTokens.state.disabled).toBe("disabled");
  expect(densityForLayout("narrow")).toEqual({ border: false, gap: 0, padding: 0 });
  expect(densityForLayout("wide")).toEqual({ border: true, gap: 1, padding: 1 });
});

test("the typed tool registry exhaustively owns every current repository capability", () => {
  expect(Object.keys(toolPresentationRegistry).sort()).toEqual([
    "anchor_edit",
    "git_diff",
    "git_status",
    "list_files",
    "read_file",
    "repository_check",
    "run_command",
    "search_repository",
    "write_file",
  ]);
  expect(toolPresentationRegistry.run_command.authority).toContain(
    "approved structured host command",
  );
  expect(toolPresentationRegistry.anchor_edit.authority).toContain("approval-gated");
  expect(toolPresentationRegistry.read_file.authority).toContain("read-only");
});

const trustedWorkspace: TuiFocusContext = {
  hasProfile: true,
  hasRepositoryReview: true,
  hasReview: false,
  hasTools: false,
  overlay: null,
  runState: "none",
  surface: "workspace",
  workspaceState: "trusted",
};

test("the focus graph owns stable workspace order and excludes disabled actions", () => {
  expect(focusOrder(trustedWorkspace)).toEqual([
    "workspace.composer",
    "workspace.history",
    "workspace.profile",
    "workspace.connection",
    "workspace.repository",
    "workspace.revoke",
  ]);
  expect(
    focusOrder({
      ...trustedWorkspace,
      hasProfile: false,
      workspaceState: "restricted",
    }),
  ).toEqual(["workspace.trust", "workspace.history", "workspace.profile", "workspace.repository"]);
  expect(focusOrder({ ...trustedWorkspace, workspaceState: "updating" })).toEqual([
    "workspace.history",
    "workspace.profile",
    "workspace.connection",
    "workspace.repository",
  ]);
});

test("focus movement wraps, reverses, and preserves identity across responsive modes", () => {
  expect(moveFocus(trustedWorkspace, "workspace.composer", 1)).toBe("workspace.history");
  expect(moveFocus(trustedWorkspace, "workspace.composer", -1)).toBe("workspace.revoke");
  expect(reconcileFocus(trustedWorkspace, "workspace.connection")).toBe("workspace.connection");
  expect(reconcileFocus({ ...trustedWorkspace, hasProfile: false }, "workspace.connection")).toBe(
    "workspace.composer",
  );
  expect(layoutModeForViewport(60, 20)).toBe("narrow");
  expect(layoutModeForViewport(80, 24)).toBe("medium");
  expect(layoutModeForViewport(100, 30)).toBe("wide");
});

test("one key router maps navigation, activation, overlays, and surfaced mnemonics", () => {
  expect(commandForKey(trustedWorkspace, { name: "tab" })).toEqual({ type: "focus-next" });
  expect(commandForKey(trustedWorkspace, { name: "tab", shift: true })).toEqual({
    type: "focus-previous",
  });
  expect(commandForKey(trustedWorkspace, { name: "return" })).toEqual({ type: "activate" });
  expect(commandForKey(trustedWorkspace, { ctrl: true, name: "p" })).toEqual({
    type: "open-palette",
  });
  expect(commandForKey(trustedWorkspace, { name: "?" })).toEqual({ type: "open-help" });
  expect(commandForKey(trustedWorkspace, { name: "/", shift: true })).toEqual({
    type: "open-help",
  });
  expect(commandForKey(trustedWorkspace, { name: "h" })).toEqual({
    commandId: "history",
    type: "invoke",
  });
  expect(commandForKey({ ...trustedWorkspace, overlay: "help" }, { name: "escape" })).toEqual({
    type: "close-overlay",
  });
});

test("active composer chords keep newline distinct from steer and queue", () => {
  expect(activeComposerActionForKey({ name: "return" })).toBe("steer");
  expect(activeComposerActionForKey({ meta: true, name: "return" })).toBe("queue");
  expect(activeComposerActionForKey({ name: "return", option: true })).toBe("queue");
  expect(activeComposerActionForKey({ name: "return", shift: true })).toBe("newline");
  expect(activeComposerActionForKey({ name: "a" })).toBe(null);
});

test("terminal keys bypass a stale active-composer focus", () => {
  expect(
    activeComposerOwnsKey(
      { ...trustedWorkspace, hasConversationInput: true, runState: "active" },
      "run.composer",
    ),
  ).toBe(true);
  expect(
    activeComposerOwnsKey(
      { ...trustedWorkspace, hasConversationInput: true, runState: "terminal" },
      "run.composer",
    ),
  ).toBe(false);
  expect(
    commandForKey(
      { ...trustedWorkspace, hasConversationInput: true, runState: "terminal" },
      { name: "q" },
    ),
  ).toEqual({ commandId: "exit", type: "invoke" });
});

test("Escape can leave the active composer for an executable run control", () => {
  expect(
    leaveActiveComposerFocus(
      { ...trustedWorkspace, hasConversationInput: true, runState: "active" },
      "run.composer",
    ),
  ).toBe("run.cancel");
  expect(
    leaveActiveComposerFocus(
      { ...trustedWorkspace, hasConversationInput: true, runState: "approval" },
      "run.composer",
    ),
  ).toBe("run.cancel");
});

test("run and history states expose only actions that can execute", () => {
  expect(
    focusOrder({ ...trustedWorkspace, hasConversationInput: true, runState: "active" }),
  ).toEqual(["run.composer", "run.cancel"]);
  expect(focusOrder({ ...trustedWorkspace, runState: "approval" })).toEqual([
    "run.approve",
    "run.deny",
    "run.cancel",
  ]);
  expect(
    focusOrder({ ...trustedWorkspace, hasConversationInput: true, runState: "approval" }),
  ).toEqual(["run.approve", "run.deny", "run.composer", "run.cancel"]);
  expect(focusOrder({ ...trustedWorkspace, runState: "retry" })).toEqual([
    "run.retry",
    "run.cancel",
  ]);
  expect(focusOrder({ ...trustedWorkspace, runState: "terminal" })).toEqual(["run.exit"]);
  expect(focusOrder({ ...trustedWorkspace, hasReview: true, runState: "terminal" })).toEqual([
    "run.review",
    "run.exit",
  ]);
  expect(focusOrder({ ...trustedWorkspace, surface: "history", runState: "none" })).toEqual([
    "history.list",
    "history.back",
  ]);
  expect(focusOrder({ ...trustedWorkspace, surface: "inspection", runState: "none" })).toEqual([
    "inspection.back",
  ]);
});

test("run palette exposes explicit narrow conversation, context, and recovery switching", () => {
  const entries = paletteEntries({
    ...trustedWorkspace,
    hasTools: true,
    runState: "approval",
  });
  expect(entries.map((entry) => entry.commandId)).toContain("show-conversation");
  expect(entries.map((entry) => entry.commandId)).toContain("show-context");
  expect(entries.map((entry) => entry.commandId)).toContain("show-recovery");
  expect(entries.map((entry) => entry.commandId)).toContain("history");
  expect(entries.find((entry) => entry.commandId === "show-recovery")?.enabled).toBe(true);
  const terminalEntries = paletteEntries({
    ...trustedWorkspace,
    hasReview: true,
    runState: "terminal",
  });
  expect(terminalEntries.find((entry) => entry.commandId === "show-recovery")?.enabled).toBe(true);
  expect(commandForKey({ ...trustedWorkspace, runState: "active" }, { name: "h" })).toEqual({
    commandId: "history",
    type: "invoke",
  });
});

test("the selected OpenTUI stack delivers navigation and overlay keys to the graph owner", async () => {
  const received: Array<{ ctrl: boolean; name: string; shift: boolean }> = [];
  function ProbeSurface() {
    useKeyboard((key) => received.push({ ctrl: key.ctrl, name: key.name, shift: key.shift }));
    return createElement("text", null, "probe");
  }
  function Probe() {
    const renderer = useRenderer();
    const keymap = useMemo(() => createDefaultOpenTuiKeymap(renderer), [renderer]);
    return createElement(KeymapProvider, { keymap }, createElement(ProbeSurface));
  }
  const renderer = await testRender(createElement(Probe), { height: 10, width: 40 });
  try {
    await act(async () => {
      renderer.mockInput.pressTab();
      renderer.mockInput.pressTab({ shift: true });
      renderer.mockInput.pressKey("p", { ctrl: true });
      renderer.mockInput.pressKey("?");
      await renderer.flush();
    });
    expect(received).toEqual([
      { ctrl: false, name: "tab", shift: false },
      { ctrl: false, name: "tab", shift: true },
      { ctrl: true, name: "p", shift: false },
      { ctrl: false, name: "?", shift: false },
    ]);
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

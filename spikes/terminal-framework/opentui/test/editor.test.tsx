import { describe, expect, it } from "bun:test";
import { terminalScenarioOracle } from "@eden/terminal-spike-fixture/oracle";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { OpenTuiSpikeApp } from "../src/app.tsx";

describe("OpenTUI composer", () => {
  it("preserves Chinese graphemes and literal shortcuts during editing and paste", async () => {
    // Given the shared Chinese-editing scenario starts in the composer.
    const chineseOracle = terminalScenarioOracle.find((row) => row.id === "chinese-editing-paste");
    expect(chineseOracle).toBeDefined();
    if (chineseOracle === undefined) {
      return;
    }
    const setup = await testRender(<OpenTuiSpikeApp initialState={chineseOracle.initialState} />, {
      height: 30,
      width: 100,
    });
    await act(async () => setup.flush());

    try {
      // When Chinese text is edited by grapheme and the fixed multiline corpus is pasted.
      await act(async () => setup.mockInput.typeText("你好世界"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressArrow("left"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressBackspace());
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressKey("END"));
      await act(async () => setup.flush());
      await act(async () => setup.mockInput.pasteBracketedText("\n请保留 /cancel 文本\n第二行"));
      await act(async () => setup.flush());
      const frame = setup.captureCharFrame();

      // Then the exact oracle corpus remains visible and no cancellation state appears.
      for (const visibleText of chineseOracle.expectedState.visibleText) {
        expect(frame).toContain(visibleText);
      }
      const frameRows = frame.split("\n");
      const composerRow = frameRows.findIndex((line) => line.startsWith("composer: "));
      expect(composerRow).toBeGreaterThanOrEqual(0);
      expect(frameRows[composerRow]).toStartWith("composer: 你好界");
      expect(frameRows[composerRow + 1]).toStartWith("          请保留 /cancel 文本");
      expect(frameRows[composerRow + 2]).toStartWith("          第二行");
      expect(frame).toContain(`focus: ${chineseOracle.expectedState.focus}`);
      for (const forbiddenText of chineseOracle.expectedState.forbiddenVisibleText) {
        expect(frame).not.toContain(forbiddenText);
      }
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("moves the composer cursor after every repeated grapheme deletion", async () => {
    // Given the composer contains four Chinese graphemes with the cursor before the final grapheme.
    const repeatedDeletionOracle = terminalScenarioOracle.find(
      (row) => row.id === "repeated-grapheme-deletion",
    );
    expect(repeatedDeletionOracle).toBeDefined();
    if (repeatedDeletionOracle === undefined) {
      return;
    }
    const setup = await testRender(
      <OpenTuiSpikeApp initialState={repeatedDeletionOracle.initialState} />,
      { height: 30, width: 100 },
    );
    await act(async () => setup.flush());

    try {
      await act(async () => setup.mockInput.typeText("你好世界"));
      act(() => setup.mockInput.pressArrow("left"));
      await act(async () => setup.flush());

      // When the operator presses Backspace three times.
      for (let count = 0; count < 3; count++) {
        act(() => setup.mockInput.pressBackspace());
        await act(async () => setup.flush());
      }
      const frame = setup.captureCharFrame();

      // Then each keypress deletes the preceding grapheme and moves the cursor left.
      for (const visibleText of repeatedDeletionOracle.expectedState.visibleText) {
        expect(frame).toContain(visibleText);
      }
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("deletes the grapheme after the composer cursor", async () => {
    const forwardDeletionOracle = terminalScenarioOracle.find(
      (row) => row.id === "forward-grapheme-deletion",
    );
    expect(forwardDeletionOracle).toBeDefined();
    if (forwardDeletionOracle === undefined) {
      return;
    }
    const setup = await testRender(
      <OpenTuiSpikeApp initialState={forwardDeletionOracle.initialState} />,
      { height: 30, width: 100 },
    );
    await act(async () => setup.flush());

    try {
      await act(async () => setup.mockInput.typeText("你好"));
      act(() => setup.mockInput.pressKey("HOME"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressKey("DELETE"));
      await act(async () => setup.flush());
      const frame = setup.captureCharFrame();

      for (const visibleText of forwardDeletionOracle.expectedState.visibleText) {
        expect(frame).toContain(visibleText);
      }
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
});

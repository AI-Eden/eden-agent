import { describe, expect, it } from "bun:test";
import { terminalSizePresets } from "@eden/terminal-spike-fixture";
import { terminalScenarioOracle } from "@eden/terminal-spike-fixture/oracle";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { OpenTuiSpikeApp } from "../src/app.tsx";

describe("OpenTUI renderer resilience", () => {
  it("preserves action safety and focus across every approved terminal size", async () => {
    // Given the shared resize scenario starts on the selected approval.
    const resizeOracle = terminalScenarioOracle.find((row) => row.id === "resize-action-safety");
    expect(resizeOracle).toBeDefined();
    if (resizeOracle === undefined) {
      return;
    }
    const firstViewport = terminalSizePresets[0];
    const setup = await testRender(<OpenTuiSpikeApp initialState={resizeOracle.initialState} />, {
      height: firstViewport.rows,
      width: firstViewport.columns,
    });

    try {
      // When OpenTUI renders each approved narrow, medium, and wide viewport.
      for (const viewport of terminalSizePresets) {
        act(() => setup.resize(viewport.columns, viewport.rows));
        await act(async () => setup.flush());
        const frame = setup.captureCharFrame();

        // Then the current action and exact viewport remain observable.
        expect(frame).toContain(`viewport: ${viewport.columns}x${viewport.rows}`);
        for (const visibleText of resizeOracle.expectedState.visibleText) {
          expect(frame).toContain(visibleText);
        }
      }
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("returns to the selected action after navigating large output and diff", async () => {
    // Given the shared stress scenario starts with progress focused.
    const stressOracle = terminalScenarioOracle.find((row) => row.id === "stress-navigation");
    expect(stressOracle).toBeDefined();
    if (stressOracle === undefined) {
      return;
    }
    const setup = await testRender(<OpenTuiSpikeApp initialState={stressOracle.initialState} />, {
      height: 30,
      kittyKeyboard: true,
      width: 100,
    });
    await act(async () => setup.flush());

    try {
      // When output and diff end markers are visited before returning with Escape.
      act(() => setup.mockInput.pressKey("o"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressKey("END"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressKey("d"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressKey("END"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressEscape());
      await act(async () => setup.flush());
      const frame = setup.captureCharFrame();

      // Then both markers and the restored action focus match the shared oracle.
      for (const visibleText of stressOracle.expectedState.visibleText) {
        expect(frame).toContain(visibleText);
      }
      expect(frame).toContain(`focus: ${stressOracle.expectedState.focus}`);
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("reports a normal exit and restores the shell surface", async () => {
    // Given the shared exit scenario and a normal-exit result observer.
    const exitOracle = terminalScenarioOracle.find((row) => row.id === "exit-cleanup");
    expect(exitOracle).toBeDefined();
    if (exitOracle === undefined) {
      return;
    }
    const exitResults: string[] = [];
    const setup = await testRender(
      <OpenTuiSpikeApp
        initialState={exitOracle.initialState}
        onExit={(result) => exitResults.push(result)}
      />,
      { exitOnCtrlC: false, height: 30, width: 100 },
    );
    await act(async () => setup.flush());

    try {
      // When the documented normal-exit key is pressed.
      act(() => setup.mockInput.pressKey("q"));
      await act(async () => setup.flush());
      const frame = setup.captureCharFrame();

      // Then exit code zero and the restored shell sentinel are observable.
      expect(exitResults).toEqual(["normal:0"]);
      expect(frame).toContain("focus: shell");
      expect(frame).toContain("shell sentinel: EDEN_TUI_RESTORED");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("reports forced cancellation and restores the shell surface", async () => {
    // Given the shared exit scenario with renderer auto-exit disabled.
    const exitOracle = terminalScenarioOracle.find((row) => row.id === "exit-cleanup");
    expect(exitOracle).toBeDefined();
    if (exitOracle === undefined) {
      return;
    }
    const exitResults: string[] = [];
    const setup = await testRender(
      <OpenTuiSpikeApp
        initialState={exitOracle.initialState}
        onExit={(result) => exitResults.push(result)}
      />,
      { exitOnCtrlC: false, height: 30, width: 100 },
    );
    await act(async () => setup.flush());

    try {
      // When Ctrl+C is delivered through the OpenTUI key parser.
      act(() => setup.mockInput.pressCtrlC());
      await act(async () => setup.flush());
      const frame = setup.captureCharFrame();

      // Then code 130, cancelled state, and shell recovery are observable.
      expect(exitResults).toEqual(["cancelled:130"]);
      expect(frame).toContain("status: cancelled");
      expect(frame).toContain("focus: shell");
      expect(frame).toContain("shell sentinel: EDEN_TUI_RESTORED");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
});

import { describe, expect, it } from "bun:test";
import { terminalSpikeFixture } from "@eden/terminal-spike-fixture";
import { terminalScenarioOracle } from "@eden/terminal-spike-fixture/oracle";
import { testRender } from "@opentui/react/test-utils";
import { act } from "react";
import { OpenTuiSpikeApp } from "../src/app.tsx";

describe("OpenTUI shared renderer", () => {
  it("renders the canonical approval when the shared primary scenario starts", async () => {
    // Given the shared primary-approval state and a medium terminal.
    const primaryOracle = terminalScenarioOracle.find((row) => row.id === "primary-approval");
    expect(primaryOracle).toBeDefined();
    if (primaryOracle === undefined) {
      return;
    }
    const setup = await testRender(<OpenTuiSpikeApp initialState={primaryOracle.initialState} />, {
      height: 30,
      width: 100,
    });
    try {
      // When OpenTUI completes the initial frame.
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();

      // Then the complete canonical approval remains visible.
      expect(frame).toContain(terminalSpikeFixture.approval.command);
      expect(frame).toContain(`cwd: ${terminalSpikeFixture.approval.cwd}`);
      expect(frame).toContain(`reason: ${terminalSpikeFixture.approval.reason}`);
      expect(frame).toContain(`scope: ${terminalSpikeFixture.approval.scope}`);
      expect(frame).toContain("status: pending");
      expect(frame).toContain("focus: approval");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("approves the canonical action when the displayed approval sequence is entered", async () => {
    // Given the shared primary-approval state is rendered through OpenTUI.
    const primaryOracle = terminalScenarioOracle.find((row) => row.id === "primary-approval");
    expect(primaryOracle).toBeDefined();
    if (primaryOracle === undefined) {
      return;
    }
    const setup = await testRender(<OpenTuiSpikeApp initialState={primaryOracle.initialState} />, {
      height: 30,
      width: 100,
    });
    await act(async () => {
      await setup.flush();
    });

    try {
      // When the user inspects and approves the displayed action.
      act(() => {
        setup.mockInput.pressEnter();
        setup.mockInput.pressKey("a");
      });
      await act(async () => {
        await setup.flush();
      });
      const frame = setup.captureCharFrame();

      // Then the oracle-visible approved state replaces the pending state.
      for (const visibleText of primaryOracle.expectedState.visibleText) {
        expect(frame).toContain(visibleText);
      }
      for (const forbiddenText of primaryOracle.expectedState.forbiddenVisibleText) {
        expect(frame).not.toContain(forbiddenText);
      }
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("keeps the canonical action denied while the recovery request is composed", async () => {
    // Given the shared denial scenario is pending at the approval region.
    const denialOracle = terminalScenarioOracle.find((row) => row.id === "denial-recovery");
    expect(denialOracle).toBeDefined();
    if (denialOracle === undefined) {
      return;
    }
    const setup = await testRender(<OpenTuiSpikeApp initialState={denialOracle.initialState} />, {
      height: 30,
      width: 100,
    });
    await act(async () => {
      await setup.flush();
    });

    try {
      // When the action is denied and a safer request is typed in the composer.
      act(() => setup.mockInput.pressKey("d"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressTab());
      await act(async () => setup.flush());
      await act(async () => setup.mockInput.typeText("Please use a read-only check first."));
      await act(async () => setup.flush());
      const frame = setup.captureCharFrame();

      // Then denial, recovery, and literal composer text match the shared oracle.
      for (const visibleText of denialOracle.expectedState.visibleText) {
        expect(frame).toContain(visibleText);
      }
      for (const forbiddenText of denialOracle.expectedState.forbiddenVisibleText) {
        expect(frame).not.toContain(forbiddenText);
      }
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("keeps approval pending when denial is modified with Alt", async () => {
    // Given the approval action is selected.
    const setup = await testRender(
      <OpenTuiSpikeApp initialState={{ focus: "approval", status: "pending" }} />,
      { height: 30, width: 100 },
    );
    await act(async () => setup.flush());

    try {
      // When the operator presses Alt+d instead of the displayed plain d shortcut.
      act(() => setup.mockInput.pressKey("d", { meta: true }));
      await act(async () => setup.flush());
      const frame = setup.captureCharFrame();

      // Then no denial action is triggered by the modified key.
      expect(frame).toContain("status: pending");
      expect(frame).not.toContain("Revise the task or request a safer action.");
    } finally {
      act(() => setup.renderer.destroy());
    }
  });

  it("keeps failure recovery and review evidence attributable to one action", async () => {
    // Given the shared failing-check scenario starts in progress.
    const reviewOracle = terminalScenarioOracle.find((row) => row.id === "failing-check-review");
    expect(reviewOracle).toBeDefined();
    if (reviewOracle === undefined) {
      return;
    }
    const setup = await testRender(<OpenTuiSpikeApp initialState={reviewOracle.initialState} />, {
      height: 30,
      width: 100,
    });
    await act(async () => setup.flush());

    try {
      // When review is opened and the failed check recovery is selected.
      act(() => setup.mockInput.pressKey("r"));
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressTab());
      await act(async () => setup.flush());
      act(() => setup.mockInput.pressEnter());
      await act(async () => setup.flush());
      const frame = setup.captureCharFrame();

      // Then every required review datum remains visible under recovery focus.
      for (const visibleText of reviewOracle.expectedState.visibleText) {
        expect(frame).toContain(visibleText);
      }
      expect(frame).toContain(`status: ${reviewOracle.expectedState.status}`);
      expect(frame).toContain(`focus: ${reviewOracle.expectedState.focus}`);
      for (const forbiddenText of reviewOracle.expectedState.forbiddenVisibleText) {
        expect(frame).not.toContain(forbiddenText);
      }
    } finally {
      act(() => setup.renderer.destroy());
    }
  });
});

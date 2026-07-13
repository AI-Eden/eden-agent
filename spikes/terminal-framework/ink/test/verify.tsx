import assert from "node:assert/strict";
import { terminalSizePresets, terminalSpikeFixture } from "@eden/terminal-spike-fixture";
import { terminalScenarioOracle } from "@eden/terminal-spike-fixture/oracle";
import { render } from "ink-testing-library";
import { InkSpikeApp } from "../src/app.tsx";

const settleRender = () => new Promise<void>((resolve) => setImmediate(resolve));

const primaryOracle = terminalScenarioOracle.find((row) => row.id === "primary-approval");
assert.ok(primaryOracle);
const rendered = render(<InkSpikeApp initialState={primaryOracle.initialState} />);

try {
  // Given the shared fixture is rendered at the approval action.
  const initialFrame = rendered.lastFrame() ?? "";

  // Then the complete canonical approval details are visible.
  assert.match(initialFrame, new RegExp(terminalSpikeFixture.approval.command, "u"));
  assert.match(initialFrame, new RegExp(terminalSpikeFixture.approval.cwd, "u"));
  assert.match(initialFrame, new RegExp(terminalSpikeFixture.approval.reason, "u"));
  assert.match(initialFrame, new RegExp(terminalSpikeFixture.approval.scope, "u"));
  assert.match(initialFrame, /status: pending/u);
  assert.match(initialFrame, /focus: approval/u);

  // When the displayed approval key is pressed.
  rendered.stdin.write("\r");
  await settleRender();
  rendered.stdin.write("a");
  await settleRender();

  // Then approval is visible and focus moves to progress without a completion claim.
  const approvedFrame = rendered.lastFrame() ?? "";
  assert.match(approvedFrame, /status: approved/u);
  assert.match(approvedFrame, /focus: progress/u);
  assert.doesNotMatch(approvedFrame, /task completed/u);
  for (const visibleText of primaryOracle.expectedState.visibleText) {
    assert.ok(approvedFrame.includes(visibleText));
  }
} finally {
  rendered.unmount();
}

const denialOracle = terminalScenarioOracle.find((row) => row.id === "denial-recovery");
assert.ok(denialOracle);
const denied = render(<InkSpikeApp initialState={denialOracle.initialState} />);

try {
  // Given the shared denial scenario starts at the pending approval.
  for (const input of ["d", "\t", "Please use a read-only check first."]) {
    denied.stdin.write(input);
    await settleRender();
  }

  // Then denial remains attributable to the unchanged action and exposes recovery.
  const deniedFrame = denied.lastFrame() ?? "";
  for (const visibleText of denialOracle.expectedState.visibleText) {
    assert.match(deniedFrame, new RegExp(visibleText, "u"));
  }
  for (const forbiddenText of denialOracle.expectedState.forbiddenVisibleText) {
    assert.doesNotMatch(deniedFrame, new RegExp(forbiddenText, "u"));
  }
} finally {
  denied.unmount();
}

const reviewOracle = terminalScenarioOracle.find((row) => row.id === "failing-check-review");
assert.ok(reviewOracle);
const reviewed = render(<InkSpikeApp initialState={reviewOracle.initialState} />);

try {
  for (const input of ["r", "\t", "\r"]) {
    reviewed.stdin.write(input);
    await settleRender();
  }
  const reviewFrame = reviewed.lastFrame() ?? "";
  for (const visibleText of reviewOracle.expectedState.visibleText) {
    assert.match(reviewFrame, new RegExp(visibleText, "u"));
  }
  for (const forbiddenText of reviewOracle.expectedState.forbiddenVisibleText) {
    assert.doesNotMatch(reviewFrame, new RegExp(forbiddenText, "u"));
  }
} finally {
  reviewed.unmount();
}

const chineseOracle = terminalScenarioOracle.find((row) => row.id === "chinese-editing-paste");
assert.ok(chineseOracle);
const composed = render(<InkSpikeApp initialState={chineseOracle.initialState} />);

try {
  for (const input of ["你好世界", "\u001B[D", "\u007F", "\n请保留 /cancel 文本\n第二行"]) {
    composed.stdin.write(input);
    await settleRender();
  }
  const composedFrame = composed.lastFrame() ?? "";
  for (const visibleText of chineseOracle.expectedState.visibleText) {
    assert.ok(composedFrame.includes(visibleText), composedFrame);
  }
  for (const forbiddenText of chineseOracle.expectedState.forbiddenVisibleText) {
    assert.ok(!composedFrame.includes(forbiddenText));
  }
} finally {
  composed.unmount();
}

const shortcutText = render(
  <InkSpikeApp initialState={{ focus: "composer", status: "composing" }} />,
);

try {
  shortcutText.stdin.write("a");
  await settleRender();
  shortcutText.stdin.write("q");
  await settleRender();
  const shortcutFrame = shortcutText.lastFrame() ?? "";
  assert.ok(shortcutFrame.includes("composer: aq"));
  assert.ok(shortcutFrame.includes("status: composing"));
  assert.ok(shortcutFrame.includes("focus: composer"));
} finally {
  shortcutText.unmount();
}

const resizeOracle = terminalScenarioOracle.find((row) => row.id === "resize-action-safety");
assert.ok(resizeOracle);
const resized = render(
  <InkSpikeApp initialState={resizeOracle.initialState} viewport={terminalSizePresets[0]} />,
);

try {
  for (const viewport of terminalSizePresets) {
    resized.rerender(<InkSpikeApp initialState={resizeOracle.initialState} viewport={viewport} />);
    await settleRender();
    const resizedFrame = resized.lastFrame() ?? "";
    assert.ok(resizedFrame.includes(`viewport: ${viewport.columns}x${viewport.rows}`));
    for (const visibleText of resizeOracle.expectedState.visibleText) {
      assert.ok(resizedFrame.includes(visibleText));
    }
  }
} finally {
  resized.unmount();
}

const stressOracle = terminalScenarioOracle.find((row) => row.id === "stress-navigation");
assert.ok(stressOracle);
const stressed = render(<InkSpikeApp initialState={stressOracle.initialState} />);

try {
  for (const input of ["o", "\u001B[F", "d", "\u001B[F", "\u001B"]) {
    stressed.stdin.write(input);
    await settleRender();
  }
  const stressFrame = stressed.lastFrame() ?? "";
  for (const visibleText of stressOracle.expectedState.visibleText) {
    assert.ok(stressFrame.includes(visibleText));
  }
} finally {
  stressed.unmount();
}

const exitOracle = terminalScenarioOracle.find((row) => row.id === "exit-cleanup");
assert.ok(exitOracle);
const exitResults: string[] = [];
const exited = render(
  <InkSpikeApp
    initialState={exitOracle.initialState}
    onExit={(result) => exitResults.push(result)}
  />,
);

try {
  exited.stdin.write("q");
  await settleRender();
  assert.ok(exitResults.includes("normal:0"));
  exited.rerender(
    <InkSpikeApp
      key="restart"
      initialState={exitOracle.initialState}
      onExit={(result) => exitResults.push(result)}
    />,
  );
  exited.stdin.write("\u0003");
  await settleRender();
  assert.ok(exitResults.includes("cancelled:130"));
  const exitFrame = exited.lastFrame() ?? "";
  for (const visibleText of exitOracle.expectedState.visibleText) {
    assert.ok(exitFrame.includes(visibleText));
  }
  for (const forbiddenText of exitOracle.expectedState.forbiddenVisibleText) {
    assert.ok(!exitFrame.includes(forbiddenText));
  }
} finally {
  exited.unmount();
}

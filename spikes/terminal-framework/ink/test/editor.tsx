import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { terminalScenarioOracle } from "@eden/terminal-spike-fixture/oracle";
import { render as renderInk } from "ink";
import { render as renderForText } from "ink-testing-library";
import { InkSpikeApp } from "../src/app.tsx";

const settleRender = () => new Promise<void>((resolve) => setImmediate(resolve));
const render = renderForText;

class InteractiveOutput extends PassThrough {
  readonly columns = 100;
  readonly isTTY = true;
  readonly rows = 24;
}

class InteractiveInput extends PassThrough {
  readonly isTTY = true;

  ref() {
    return this;
  }

  setRawMode() {
    return this;
  }

  unref() {
    return this;
  }
}

const chineseOracle = terminalScenarioOracle.find((row) => row.id === "chinese-editing-paste");
assert.ok(chineseOracle);
const composed = render(<InkSpikeApp initialState={chineseOracle.initialState} />);

try {
  for (const input of [
    "你好世界",
    "\u001B[D",
    "\u007F",
    "\u001B[F",
    "\u001B[200~\n请保留 /cancel 文本\n第二行\u001B[201~",
  ]) {
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

const repeatedDeletionOracle = terminalScenarioOracle.find(
  (row) => row.id === "repeated-grapheme-deletion",
);
assert.ok(repeatedDeletionOracle);
const repeatedDeletion = render(<InkSpikeApp initialState={repeatedDeletionOracle.initialState} />);

try {
  // Given the composer contains four Chinese graphemes with the cursor before the final grapheme.
  repeatedDeletion.stdin.write("你好世界");
  await settleRender();
  repeatedDeletion.stdin.write("\u001B[D");
  await settleRender();

  // When the operator presses Backspace three times.
  for (let count = 0; count < 3; count++) {
    repeatedDeletion.stdin.write("\u007F");
    await settleRender();
  }
  const repeatedDeletionFrame = repeatedDeletion.lastFrame() ?? "";

  // Then each keypress deletes the preceding grapheme and moves the cursor left.
  for (const visibleText of repeatedDeletionOracle.expectedState.visibleText) {
    assert.ok(repeatedDeletionFrame.includes(visibleText), repeatedDeletionFrame);
  }
} finally {
  repeatedDeletion.unmount();
}

const forwardDeletionOracle = terminalScenarioOracle.find(
  (row) => row.id === "forward-grapheme-deletion",
);
assert.ok(forwardDeletionOracle);
const forwardDeletion = render(<InkSpikeApp initialState={forwardDeletionOracle.initialState} />);

try {
  forwardDeletion.stdin.write("你好");
  await settleRender();
  forwardDeletion.stdin.write("\u001B[H");
  await settleRender();
  forwardDeletion.stdin.write("\u001B[3~");
  await settleRender();
  const forwardDeletionFrame = forwardDeletion.lastFrame() ?? "";

  for (const visibleText of forwardDeletionOracle.expectedState.visibleText) {
    assert.ok(forwardDeletionFrame.includes(visibleText), forwardDeletionFrame);
  }
} finally {
  forwardDeletion.unmount();
}

const bidirectionalNavigationOracle = terminalScenarioOracle.find(
  (row) => row.id === "bidirectional-grapheme-navigation",
);
assert.ok(bidirectionalNavigationOracle);
const bidirectionalNavigation = render(
  <InkSpikeApp initialState={bidirectionalNavigationOracle.initialState} />,
);

try {
  // Given the cursor is between two Chinese graphemes.
  bidirectionalNavigation.stdin.write("你好");
  await settleRender();
  bidirectionalNavigation.stdin.write("\u001B[D");
  await settleRender();

  // When the operator moves right and inserts another grapheme.
  bidirectionalNavigation.stdin.write("\u001B[C");
  await settleRender();
  bidirectionalNavigation.stdin.write("界");
  await settleRender();

  // Then insertion occurs after the second grapheme.
  const bidirectionalFrame = bidirectionalNavigation.lastFrame() ?? "";
  for (const visibleText of bidirectionalNavigationOracle.expectedState.visibleText) {
    assert.ok(bidirectionalFrame.includes(visibleText), bidirectionalFrame);
  }
} finally {
  bidirectionalNavigation.unmount();
}

const interactiveStdout = new InteractiveOutput();
const interactiveStdin = new InteractiveInput();
let interactiveOutput = "";
interactiveStdout.on("data", (chunk: Buffer) => {
  interactiveOutput += chunk.toString();
});
const cursorAnchoring = renderInk(<InkSpikeApp />, {
  exitOnCtrlC: false,
  interactive: true,
  patchConsole: false,
  stdin: interactiveStdin as unknown as NodeJS.ReadStream,
  stdout: interactiveStdout as unknown as NodeJS.WriteStream,
});

try {
  // Given the composer has focus at the end of two Chinese graphemes.
  interactiveStdin.write("d");
  await settleRender();
  interactiveStdin.write("\t");
  await settleRender();
  await cursorAnchoring.waitUntilRenderFlush();
  interactiveOutput = "";
  interactiveStdin.write("你好");
  await settleRender();
  await cursorAnchoring.waitUntilRenderFlush();

  // When Ink commits the updated composer frame.
  // Then the terminal cursor is shown after the ten-column label and four grapheme columns.
  assert.ok(interactiveOutput.includes("\u001B[15G\u001B[?25h"), JSON.stringify(interactiveOutput));
  assert.ok(
    !interactiveOutput.includes("\u001B[11G\u001B[?25h"),
    JSON.stringify(interactiveOutput),
  );
} finally {
  cursorAnchoring.unmount();
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

const modifiedDenial = render(
  <InkSpikeApp initialState={{ focus: "approval", status: "pending" }} />,
);

try {
  // Given the approval action is selected.
  // When the operator presses Alt+d instead of the displayed plain d shortcut.
  modifiedDenial.stdin.write("\u001Bd");
  await settleRender();
  const modifiedFrame = modifiedDenial.lastFrame() ?? "";

  // Then no denial action is triggered by the modified key.
  assert.ok(modifiedFrame.includes("status: pending"));
  assert.ok(!modifiedFrame.includes("Revise the task or request a safer action."));
} finally {
  modifiedDenial.unmount();
}

import {
  generateLargeDiff,
  generateLargeOutput,
  terminalSpikeFixture,
} from "@eden/terminal-spike-fixture";
import { decodePasteBytes } from "@opentui/core";
import { useKeyboard, usePaste, useTerminalDimensions } from "@opentui/react";
import { useEffect, useRef, useState } from "react";

const graphemeSegmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
const splitGraphemes = (text: string) =>
  Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);

type OpenTuiSpikeAppProps = {
  readonly initialState?: {
    readonly focus: string;
    readonly status: string;
  };
  readonly onExit?: (result: "normal:0" | "cancelled:130") => void;
  readonly onReady?: () => void;
};

export function OpenTuiSpikeApp({ initialState, onExit, onReady }: OpenTuiSpikeAppProps) {
  const { height, width } = useTerminalDimensions();
  const [status, setStatus] = useState(initialState?.status ?? "pending");
  const [focus, setFocus] = useState(initialState?.focus ?? "approval");
  const [draft, setDraft] = useState<string>(terminalSpikeFixture.composer.draft);
  const cursor = useRef(0);
  const [outputMarkerVisible, setOutputMarkerVisible] = useState(false);
  const [diffMarkerVisible, setDiffMarkerVisible] = useState(false);

  useKeyboard((key) => {
    if (key.name === "c" && key.ctrl) {
      setStatus("cancelled");
      setFocus("shell");
      onExit?.("cancelled:130");
      return;
    }

    if (focus === "composer" && key.name === "left") {
      cursor.current = Math.max(0, cursor.current - 1);
      return;
    }

    if (focus === "composer" && key.name === "backspace") {
      setDraft((currentDraft) => {
        const graphemes = splitGraphemes(currentDraft);
        if (cursor.current > 0) {
          graphemes.splice(cursor.current - 1, 1);
        }
        return graphemes.join("");
      });
      return;
    }

    if (focus === "composer" && key.raw.length === 1) {
      const insertedGraphemes = splitGraphemes(key.raw);
      setDraft((currentDraft) => {
        const graphemes = splitGraphemes(currentDraft);
        graphemes.splice(cursor.current, 0, ...insertedGraphemes);
        return graphemes.join("");
      });
      cursor.current += insertedGraphemes.length;
      return;
    }

    if (key.name === "q") {
      setStatus("exited");
      setFocus("shell");
      onExit?.("normal:0");
      return;
    }

    if (key.name === "a" && focus === "approval") {
      setStatus("approved");
      setFocus("progress");
      return;
    }

    if (key.name === "d" && focus === "approval") {
      setStatus("denied");
      return;
    }

    if (key.name === "tab" && status === "denied") {
      setFocus("composer");
      return;
    }

    if (key.name === "r" && focus === "progress") {
      setStatus("check-failed");
      setFocus("review");
      return;
    }

    if (key.name === "o" && focus === "progress") {
      setFocus("output");
      return;
    }

    if (key.name === "end" && focus === "output") {
      setOutputMarkerVisible(true);
      return;
    }

    if (key.name === "d" && focus === "output") {
      setFocus("diff");
      return;
    }

    if (key.name === "end" && focus === "diff") {
      setDiffMarkerVisible(true);
      return;
    }

    if (key.name === "escape" && focus === "diff") {
      setFocus("progress");
      return;
    }

    if (key.name === "tab" && focus === "review") {
      setFocus("recovery");
    }
  });

  usePaste((event) => {
    if (focus !== "composer") {
      return;
    }
    const insertedGraphemes = splitGraphemes(decodePasteBytes(event.bytes));
    setDraft((currentDraft) => {
      const graphemes = splitGraphemes(currentDraft);
      graphemes.splice(cursor.current, 0, ...insertedGraphemes);
      return graphemes.join("");
    });
    cursor.current += insertedGraphemes.length;
  });

  useEffect(() => onReady?.(), [onReady]);

  return (
    <box style={{ flexDirection: "column" }}>
      <text>trust: {terminalSpikeFixture.session.workspace.trustMode}</text>
      <text>
        viewport: {width}x{height}
      </text>
      <text>command: {terminalSpikeFixture.approval.command}</text>
      <text>selected action: {terminalSpikeFixture.approval.command}</text>
      <text>cwd: {terminalSpikeFixture.approval.cwd}</text>
      <text>reason: {terminalSpikeFixture.approval.reason}</text>
      <text>scope: {terminalSpikeFixture.approval.scope}</text>
      <text>status: {status}</text>
      <text>focus: {focus}</text>
      <text>approve: a</text>
      {status === "denied" && <text>Revise the task or request a safer action.</text>}
      {focus === "composer" && <text>composer: {draft}</text>}
      {status === "check-failed" && (
        <box style={{ flexDirection: "column" }}>
          <text>check: typecheck failed</text>
          <text>failure: {terminalSpikeFixture.review.checks[1].summary}</text>
          <text>recovery: {terminalSpikeFixture.review.checks[1].recovery}</text>
          <text>changed: {terminalSpikeFixture.review.changedFiles[0].path}</text>
          <text>diff: {terminalSpikeFixture.review.changedFiles[0].path}</text>
        </box>
      )}
      {outputMarkerVisible && <text>output marker: {generateLargeOutput().marker}</text>}
      {diffMarkerVisible && <text>diff file: {generateLargeDiff().marker}</text>}
      {focus === "shell" && <text>shell sentinel: EDEN_TUI_RESTORED</text>}
    </box>
  );
}

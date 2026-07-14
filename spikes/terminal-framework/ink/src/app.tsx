import {
  generateLargeDiff,
  generateLargeOutput,
  terminalSpikeFixture,
} from "@eden/terminal-spike-fixture";
import { Box, Text, useInput, useWindowSize } from "ink";
import { useEffect, useState } from "react";

const graphemeSegmenter = new Intl.Segmenter("zh", { granularity: "grapheme" });
const splitGraphemes = (text: string) =>
  Array.from(graphemeSegmenter.segment(text), ({ segment }) => segment);

type InkSpikeAppProps = {
  readonly initialState?: {
    readonly focus: string;
    readonly status: string;
  };
  readonly onExit?: (result: "normal:0" | "cancelled:130") => void;
  readonly onReady?: () => void;
  readonly viewport?: {
    readonly columns: number;
    readonly rows: number;
  };
};

export function InkSpikeApp({ initialState, onExit, onReady, viewport }: InkSpikeAppProps) {
  const windowSize = useWindowSize();
  const visibleViewport = viewport ?? windowSize;
  const [status, setStatus] = useState(initialState?.status ?? "pending");
  const [focus, setFocus] = useState(initialState?.focus ?? "approval");
  const [draft, setDraft] = useState<string>(terminalSpikeFixture.composer.draft);
  const [cursor, setCursor] = useState(0);
  const [outputMarkerVisible, setOutputMarkerVisible] = useState(false);
  const [diffMarkerVisible, setDiffMarkerVisible] = useState(false);

  useInput((input, key) => {
    if (input === "q" && focus !== "composer") {
      setStatus("exited");
      setFocus("shell");
      onExit?.("normal:0");
      return;
    }

    if (input === "c" && key.ctrl) {
      setStatus("cancelled");
      setFocus("shell");
      onExit?.("cancelled:130");
      return;
    }

    if (input === "a" && focus === "approval") {
      setStatus("approved");
      setFocus("progress");
      return;
    }

    if (input === "d" && focus === "approval") {
      setStatus("denied");
      return;
    }

    if (key.tab && status === "denied") {
      setFocus("composer");
      return;
    }

    if (input === "r" && focus === "progress") {
      setStatus("check-failed");
      setFocus("review");
      return;
    }

    if (input === "o" && focus === "progress") {
      setFocus("output");
      return;
    }

    if (key.end && focus === "output") {
      setOutputMarkerVisible(true);
      return;
    }

    if (input === "d" && focus === "output") {
      setFocus("diff");
      return;
    }

    if (key.end && focus === "diff") {
      setDiffMarkerVisible(true);
      return;
    }

    if (key.escape && focus === "diff") {
      setFocus("progress");
      return;
    }

    if (key.tab && focus === "review") {
      setFocus("recovery");
      return;
    }

    if (focus === "composer" && key.leftArrow) {
      setCursor((currentCursor) => Math.max(0, currentCursor - 1));
      return;
    }

    if (focus === "composer" && key.backspace) {
      setDraft((currentDraft) => {
        const graphemes = splitGraphemes(currentDraft);
        if (cursor > 0) {
          graphemes.splice(cursor - 1, 1);
        }
        return graphemes.join("");
      });
      return;
    }

    if (focus === "composer" && input.length > 0) {
      const insertedGraphemes = splitGraphemes(input);
      setDraft((currentDraft) => {
        const graphemes = splitGraphemes(currentDraft);
        graphemes.splice(cursor, 0, ...insertedGraphemes);
        return graphemes.join("");
      });
      setCursor((currentCursor) => currentCursor + insertedGraphemes.length);
    }
  });

  useEffect(() => onReady?.(), [onReady]);

  return (
    <Box flexDirection="column">
      <Text>trust: {terminalSpikeFixture.session.workspace.trustMode}</Text>
      <Text>
        viewport: {visibleViewport.columns}x{visibleViewport.rows}
      </Text>
      <Text>command: {terminalSpikeFixture.approval.command}</Text>
      <Text>selected action: {terminalSpikeFixture.approval.command}</Text>
      <Text>cwd: {terminalSpikeFixture.approval.cwd}</Text>
      <Text>reason: {terminalSpikeFixture.approval.reason}</Text>
      <Text>scope: {terminalSpikeFixture.approval.scope}</Text>
      <Text>status: {status}</Text>
      <Text>focus: {focus}</Text>
      <Text>approve: a</Text>
      {status === "denied" && <Text>Revise the task or request a safer action.</Text>}
      {focus === "composer" && <Text>composer: {draft}</Text>}
      {status === "check-failed" && (
        <Box flexDirection="column">
          <Text>check: typecheck failed</Text>
          <Text>failure: {terminalSpikeFixture.review.checks[1].summary}</Text>
          <Text>recovery: {terminalSpikeFixture.review.checks[1].recovery}</Text>
          <Text>changed: {terminalSpikeFixture.review.changedFiles[0].path}</Text>
          <Text>diff: {terminalSpikeFixture.review.changedFiles[0].path}</Text>
        </Box>
      )}
      {outputMarkerVisible && <Text>output marker: {generateLargeOutput().marker}</Text>}
      {diffMarkerVisible && <Text>diff file: {generateLargeDiff().marker}</Text>}
      {focus === "shell" && <Text>shell sentinel: EDEN_TUI_RESTORED</Text>}
    </Box>
  );
}

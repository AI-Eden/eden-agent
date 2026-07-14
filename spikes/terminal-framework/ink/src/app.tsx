import {
  generateLargeDiff,
  generateLargeOutput,
  terminalSpikeFixture,
} from "@eden/terminal-spike-fixture";
import { Box, Text, useInput, usePaste, useWindowSize } from "ink";
import { useEffect, useReducer, useState } from "react";
import { InkComposer } from "./composer.tsx";
import { composerReducer, createComposerState } from "./composer-state.ts";

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
  const [composer, dispatchComposer] = useReducer(
    composerReducer,
    terminalSpikeFixture.composer.draft,
    createComposerState,
  );
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

    if (input === "d" && !key.meta && focus === "approval") {
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

    if (input === "d" && !key.meta && focus === "output") {
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
      dispatchComposer({ type: "left" });
      return;
    }

    if (focus === "composer" && key.rightArrow) {
      dispatchComposer({ type: "right" });
      return;
    }

    if (focus === "composer" && key.home) {
      dispatchComposer({ type: "home" });
      return;
    }

    if (focus === "composer" && key.end) {
      dispatchComposer({ type: "end" });
      return;
    }

    if (focus === "composer" && key.backspace) {
      dispatchComposer({ type: "backspace" });
      return;
    }

    if (focus === "composer" && key.delete) {
      dispatchComposer({ type: "delete" });
      return;
    }

    if (focus === "composer" && !key.ctrl && !key.meta && input.length > 0) {
      dispatchComposer({ text: input, type: "insert" });
    }
  });

  usePaste((text) => {
    if (focus !== "composer") {
      return;
    }
    dispatchComposer({ text, type: "insert" });
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
      {focus === "composer" && <InkComposer state={composer} />}
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

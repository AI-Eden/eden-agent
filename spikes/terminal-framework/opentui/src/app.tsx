import {
  generateLargeDiff,
  generateLargeOutput,
  terminalSpikeFixture,
} from "@eden/terminal-spike-fixture";
import { registerManagedTextareaLayer } from "@opentui/keymap/addons/opentui";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";

type OpenTuiSpikeAppProps = {
  readonly initialState?: {
    readonly focus: string;
    readonly status: string;
  };
  readonly onExit?: (result: "normal:0" | "cancelled:130") => void;
  readonly onReady?: () => void;
};

export function OpenTuiSpikeApp(props: OpenTuiSpikeAppProps) {
  const renderer = useRenderer();
  const keymap = useMemo(() => createDefaultOpenTuiKeymap(renderer), [renderer]);

  useEffect(
    () =>
      registerManagedTextareaLayer(keymap, renderer, {
        enabled: () => renderer.currentFocusedEditor !== null,
      }),
    [keymap, renderer],
  );

  return (
    <KeymapProvider keymap={keymap}>
      <OpenTuiSpikeSurface {...props} />
    </KeymapProvider>
  );
}

function OpenTuiSpikeSurface({ initialState, onExit, onReady }: OpenTuiSpikeAppProps) {
  const { height, width } = useTerminalDimensions();
  const [status, setStatus] = useState(initialState?.status ?? "pending");
  const [focus, setFocus] = useState(initialState?.focus ?? "approval");
  const [outputMarkerVisible, setOutputMarkerVisible] = useState(false);
  const [diffMarkerVisible, setDiffMarkerVisible] = useState(false);

  useKeyboard((key) => {
    if (key.name === "c" && key.ctrl) {
      setStatus("cancelled");
      setFocus("shell");
      onExit?.("cancelled:130");
      return;
    }

    if (key.name === "q" && focus !== "composer") {
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

    if (key.name === "d" && !key.meta && !key.option && focus === "approval") {
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

    if (key.name === "d" && !key.meta && !key.option && focus === "output") {
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
      {focus === "composer" && (
        <box style={{ flexDirection: "row", width: "100%" }}>
          <text>composer: </text>
          <textarea
            focused
            initialValue={terminalSpikeFixture.composer.draft}
            minHeight={1}
            maxHeight={6}
            style={{ flexGrow: 1 }}
          />
        </box>
      )}
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

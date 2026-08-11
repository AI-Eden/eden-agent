import type { ProductView } from "@eden/contracts";
import type { KeyEvent, Renderable, TextareaRenderable } from "@opentui/core";
import type { CommandContext } from "@opentui/keymap";
import { registerManagedTextareaLayer } from "@opentui/keymap/addons/opentui";
import { useKeymap } from "@opentui/keymap/react";
import { useRenderer } from "@opentui/react";
import { useEffect, useLayoutEffect, useRef } from "react";

import { tuiDesignTokens } from "./tui-design.ts";
import { activeComposerActionForKey } from "./tui-focus.ts";
import { fitTerminalLine } from "./tui-text.ts";

export type ActiveRunComposerProps = {
  readonly compact: boolean;
  readonly conversationInput: NonNullable<ProductView["conversationInput"]>;
  readonly draft: string;
  readonly focused: boolean;
  readonly onDraftChange: (value: string) => void;
  readonly onKeyDown: (event: KeyEvent) => void;
  readonly onSubmit: (mode: "queue" | "steer", content: string) => void;
  readonly width: number;
};

export function ActiveRunComposer(props: ActiveRunComposerProps) {
  const keymap = useKeymap();
  const renderer = useRenderer();
  const latestProps = useRef(props);
  const textareaRef = useRef<TextareaRenderable | null>(null);
  latestProps.current = props;

  useEffect(
    () =>
      registerManagedTextareaLayer(keymap, renderer, {
        priority: 100,
        bindings: [
          { key: "shift+return", cmd: "input.newline" },
          { key: "shift+kpenter", cmd: "input.newline" },
          { key: "meta+return", cmd: "eden.active-input.queue" },
          { key: "meta+kpenter", cmd: "eden.active-input.queue" },
          { key: "return", cmd: "eden.active-input.steer" },
          { key: "kpenter", cmd: "eden.active-input.steer" },
        ],
        commands: [
          {
            name: "eden.active-input.steer",
            run: ({ event }: CommandContext<Renderable, KeyEvent>) => {
              const current = latestProps.current;
              const action = activeComposerActionForKey(event);
              if (action !== "steer") return false;
              if (
                current.draft.length > 0 &&
                current.conversationInput.submission.steer.available
              ) {
                current.onSubmit("steer", current.draft);
              }
              return true;
            },
          },
          {
            name: "eden.active-input.queue",
            run: ({ event }: CommandContext<Renderable, KeyEvent>) => {
              const current = latestProps.current;
              const action = activeComposerActionForKey(event);
              if (action !== "queue") return false;
              if (
                current.draft.length > 0 &&
                current.conversationInput.submission.queue.available
              ) {
                current.onSubmit("queue", current.draft);
              }
              return true;
            },
          },
        ],
      }),
    [keymap, renderer],
  );

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (textarea !== null && textarea.editBuffer.getText() !== props.draft) {
      textarea.setText(props.draft);
    }
  }, [props.draft]);

  const steerReason = props.conversationInput.submission.steer.reason;
  const queueReason = props.conversationInput.submission.queue.reason;
  const draftBytes = new TextEncoder().encode(props.draft).byteLength;
  const newlineShortcut =
    renderer.capabilities?.kitty_keyboard === true
      ? "Shift+Enter newline"
      : "Ctrl+J newline (legacy keyboard mode)";
  return (
    <box
      style={{
        border: !props.compact,
        flexDirection: "column",
        flexShrink: 0,
        padding: props.compact ? 0 : 1,
        width: "100%",
      }}
    >
      <text fg={tuiDesignTokens.color.accent}>STEER OR QUEUE</text>
      <textarea
        ref={textareaRef}
        focused={props.focused}
        initialValue={props.draft}
        onContentChange={() => props.onDraftChange(textareaRef.current?.editBuffer.getText() ?? "")}
        onKeyDown={props.onKeyDown}
        placeholder="Add context to the active run"
        style={{ height: props.compact ? 3 : 4, width: "100%" }}
      />
      <text fg={tuiDesignTokens.color.muted}>
        {fitTerminalLine(
          `Enter steer · Alt+Enter queue · ${newlineShortcut} · draft ${draftBytes}/4096 bytes`,
          props.width - (props.compact ? 2 : 6),
        )}
      </text>
      <text>
        pending {props.conversationInput.pending.length} · accepted{" "}
        {props.conversationInput.acceptedCount}/8 · remaining{" "}
        {props.conversationInput.remainingBytes} bytes · reserved{" "}
        {props.conversationInput.reservations.pending}
      </text>
      {steerReason !== null && (
        <text fg={tuiDesignTokens.color.awaiting}>steer unavailable: {steerReason.message}</text>
      )}
      {queueReason !== null && (
        <text fg={tuiDesignTokens.color.awaiting}>queue unavailable: {queueReason.message}</text>
      )}
    </box>
  );
}

import { expect, test } from "bun:test";
import type { ProductView } from "@eden/contracts";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useRenderer } from "@opentui/react";
import { testRender } from "@opentui/react/test-utils";
import { act, type ReactNode, useMemo, useState } from "react";

import { ActiveRunComposer } from "../src/tui-active-composer.tsx";

const conversationInput = {
  acceptedBytes: 0,
  acceptedCount: 0,
  closed: [],
  pending: [],
  remainingBytes: 16_384,
  reservations: { pending: 0, remainingModelSteps: 4 },
  submission: {
    queue: { available: true, reason: null },
    steer: { available: true, reason: null },
  },
} satisfies NonNullable<ProductView["conversationInput"]>;

function WithKeymap({ children }: { readonly children: ReactNode }) {
  const renderer = useRenderer();
  const keymap = useMemo(() => createDefaultOpenTuiKeymap(renderer), [renderer]);
  return <KeymapProvider keymap={keymap}>{children}</KeymapProvider>;
}

test("active composer keeps multiline CJK paste local until an explicit steer", async () => {
  const submissions: Array<{ content: string; mode: "queue" | "steer" }> = [];
  function Fixture() {
    const [draft, setDraft] = useState("");
    return (
      <ActiveRunComposer
        compact={false}
        conversationInput={conversationInput}
        draft={draft}
        focused
        onDraftChange={setDraft}
        onKeyDown={() => undefined}
        onSubmit={(mode, content) => submissions.push({ content, mode })}
        width={80}
      />
    );
  }
  const renderer = await testRender(
    <WithKeymap>
      <Fixture />
    </WithKeymap>,
    { height: 12, kittyKeyboard: true, width: 80 },
  );
  try {
    await act(async () => renderer.mockInput.pasteBracketedText("first line\n中文"));
    await act(async () => renderer.flush());
    expect(submissions).toEqual([]);
    expect(renderer.captureCharFrame()).toContain("first line");
    expect(renderer.captureCharFrame()).toContain("中文");
    await act(async () => renderer.mockInput.pressEnter({ shift: true }));
    await act(async () => renderer.mockInput.typeText("tail"));
    await act(async () => renderer.mockInput.pressEnter());
    expect(submissions).toEqual([{ content: "first line\n中文\ntail", mode: "steer" }]);
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

test("active composer maps Alt+Enter to queue and renders durable pending truth", async () => {
  const submissions: Array<{ content: string; mode: "queue" | "steer" }> = [];
  function Fixture() {
    const [draft, setDraft] = useState("Follow up after the answer.");
    return (
      <ActiveRunComposer
        compact
        conversationInput={{
          ...conversationInput,
          acceptedBytes: 25,
          acceptedCount: 1,
          pending: [
            {
              byteLength: 25,
              closureReason: null,
              commandId: "command-steer",
              content: "Inspect the failing test.",
              deliveredTurnId: null,
              messageId: "message-steer",
              mode: "steer",
              order: 0,
              reservation: { modelStep: 8, state: "reserved" },
              state: "accepted",
            },
          ],
          remainingBytes: 16_359,
          reservations: { pending: 1, remainingModelSteps: 3 },
          submission: {
            ...conversationInput.submission,
            steer: {
              available: false,
              reason: {
                code: "steer_capacity_reached",
                message: "One steering message is already pending.",
                recoverability: "ask-user",
                suggestedActions: ["Wait for delivery."],
              },
            },
          },
        }}
        draft={draft}
        focused
        onDraftChange={setDraft}
        onKeyDown={() => undefined}
        onSubmit={(mode, content) => submissions.push({ content, mode })}
        width={60}
      />
    );
  }
  const renderer = await testRender(
    <WithKeymap>
      <Fixture />
    </WithKeymap>,
    { height: 10, kittyKeyboard: true, width: 60 },
  );
  try {
    await act(async () => renderer.mockInput.pressEnter({ meta: true }));
    await act(async () => renderer.flush());
    expect(submissions).toEqual([{ content: "Follow up after the answer.", mode: "queue" }]);
    const frame = renderer.captureCharFrame();
    expect(frame).toContain("pending 1");
    expect(frame).toContain("steer unavailable");
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

test("legacy keyboard mode keeps Ctrl+J as a distinguishable newline fallback", async () => {
  const submissions: Array<{ content: string; mode: "queue" | "steer" }> = [];
  function Fixture() {
    const [draft, setDraft] = useState("");
    return (
      <ActiveRunComposer
        compact
        conversationInput={conversationInput}
        draft={draft}
        focused
        onDraftChange={setDraft}
        onKeyDown={() => undefined}
        onSubmit={(mode, content) => submissions.push({ content, mode })}
        width={60}
      />
    );
  }
  const renderer = await testRender(
    <WithKeymap>
      <Fixture />
    </WithKeymap>,
    { height: 10, width: 60 },
  );
  try {
    await renderer.waitForFrame((frame) => frame.includes("Ctrl+J newline"));
    await act(async () => renderer.mockInput.typeText("first"));
    await act(async () => renderer.mockInput.pressKey("j", { ctrl: true }));
    await act(async () => renderer.mockInput.typeText("tail"));
    await act(async () => renderer.mockInput.pressEnter());
    expect(submissions).toEqual([{ content: "first\ntail", mode: "steer" }]);
  } finally {
    act(() => renderer.renderer.destroy());
  }
});

import { randomUUID } from "node:crypto";

import type { AgentClient, ProductEvent, ProductView, RunId } from "@eden/contracts";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useMemo, useState } from "react";

export type EdenTuiAppProps = {
  readonly client: AgentClient;
  readonly onExit?: (code: 0 | 130) => void;
  readonly onReady?: (() => void) | undefined;
  readonly runId: RunId;
};

export function EdenTuiApp(props: EdenTuiAppProps) {
  const renderer = useRenderer();
  const keymap = useMemo(() => createDefaultOpenTuiKeymap(renderer), [renderer]);
  return (
    <KeymapProvider keymap={keymap}>
      <EdenTuiSurface {...props} />
    </KeymapProvider>
  );
}

function EdenTuiSurface({ client, onExit, onReady, runId }: EdenTuiAppProps) {
  const { height, width } = useTerminalDimensions();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [timeline, setTimeline] = useState<readonly ProductEvent["type"][]>([]);
  const [view, setView] = useState<ProductView | null>(null);

  const start = async (task: string) => {
    if (task.trim().length === 0) return;
    try {
      setView(
        await client.submit({
          commandId: randomUUID(),
          protocolVersion: 1,
          task,
          type: "run.start",
        }),
      );
      setFollowing(true);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task could not start.");
    }
  };

  const resolveApproval = async (decision: "approve" | "deny") => {
    if (view?.approval === null || view === null) return;
    try {
      setView(
        await client.submit({
          approvalId: view.approval.approvalId,
          commandId: randomUUID(),
          decision,
          expectedRevision: view.revision,
          protocolVersion: 1,
          runId,
          type: "approval.resolve",
        }),
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The approval could not be resolved.");
    }
  };

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
      if (view !== null && view.terminalOutcome === null) {
        void client
          .submit({
            commandId: randomUUID(),
            expectedRevision: view.revision,
            protocolVersion: 1,
            runId,
            type: "run.cancel",
          })
          .catch(() => undefined)
          .finally(() => onExit?.(130));
      } else {
        onExit?.(130);
      }
      return;
    }
    if (key.name === "q" && view?.terminalOutcome !== null && view !== null) {
      onExit?.(0);
      return;
    }
    if (view?.approval !== null && view !== null && !key.meta && !key.option) {
      if (key.name === "a") void resolveApproval("approve");
      if (key.name === "d") void resolveApproval("deny");
    }
  });

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => {
    if (!following) return;
    const controller = new AbortController();
    const follow = async () => {
      for await (const event of client.subscribe(runId, undefined, { signal: controller.signal })) {
        setTimeline((current) => [...current, event.type]);
        setView(await client.getSnapshot(runId));
      }
    };
    void follow().catch((cause) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "The event subscription failed.");
      }
    });
    return () => controller.abort();
  }, [client, following, runId]);

  const outcome = view?.terminalOutcome;
  const check = view?.checks[0];
  return (
    <box style={{ flexDirection: "column", padding: 1, width: "100%", height: "100%" }}>
      <text fg="#8BD5CA">Eden R1 Fake Task</text>
      <text>
        viewport: {width}x{height}
      </text>
      {view === null && (
        <box style={{ flexDirection: "column", marginTop: 1 }}>
          <text>Task</text>
          <input
            focused
            placeholder="Describe the fake task"
            value={draft}
            onInput={setDraft}
            onSubmit={() => void start(draft)}
            style={{ width: "100%" }}
          />
          <text fg="#777777">Enter submits · Ctrl+C exits</text>
        </box>
      )}
      {view !== null && (
        <box style={{ flexDirection: "column", marginTop: 1 }}>
          <text>phase: {view.phase}</text>
          <text>
            progress: {view.progress?.completed ?? 0}/{view.progress?.total ?? 3}
          </text>
          <text>timeline: {timeline.join(" > ")}</text>
          {view.approval !== null && (
            <box style={{ border: true, flexDirection: "column", padding: 1, width: "100%" }}>
              <text>approval: pending</text>
              <text>action: {view.approval.canonicalDisplay}</text>
              <text>cwd: {view.approval.cwd}</text>
              <text>reason: {view.approval.reason}</text>
              <text>scope: {view.approval.scope}</text>
              <text>approve: a · deny: d</text>
            </box>
          )}
          {outcome !== null && outcome !== undefined && (
            <box style={{ flexDirection: "column", marginTop: 1 }}>
              <text>outcome: {outcome.state}</text>
              {outcome.state === "succeeded" && <text>evidence: {outcome.evidenceRef}</text>}
              {(outcome.state === "blocked" || outcome.state === "failed") && (
                <text>error: {outcome.error.message}</text>
              )}
              {check !== undefined && <text>check: {check.status}</text>}
              <text>q exits</text>
            </box>
          )}
        </box>
      )}
      {error !== null && <text fg="#ED8796">error: {error}</text>}
    </box>
  );
}

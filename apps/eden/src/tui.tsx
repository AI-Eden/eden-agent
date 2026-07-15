import { randomUUID } from "node:crypto";

import type { AgentClient, ProductEvent, ProductView, WorkspaceReview } from "@eden/contracts";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type EdenTuiAppProps = {
  readonly client: AgentClient;
  readonly initialWorkspaceReview?: WorkspaceReview;
  readonly onExit?: (code: 0 | 130) => void;
  readonly onReady?: (() => void) | undefined;
  readonly onViewChange?: ((view: ProductView) => void) | undefined;
  readonly onWorkspaceReviewChange?: ((review: WorkspaceReview) => void) | undefined;
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

function EdenTuiSurface({
  client,
  initialWorkspaceReview,
  onExit,
  onReady,
  onViewChange,
  onWorkspaceReviewChange,
}: EdenTuiAppProps) {
  const { height, width } = useTerminalDimensions();
  const [composerFocused, setComposerFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [review, setReview] = useState<WorkspaceReview | null>(initialWorkspaceReview ?? null);
  const [timeline, setTimeline] = useState<readonly ProductEvent["type"][]>([]);
  const [view, setView] = useState<ProductView | null>(null);

  const publishReview = useCallback(
    (nextReview: WorkspaceReview) => {
      setReview(nextReview);
      onWorkspaceReviewChange?.(nextReview);
    },
    [onWorkspaceReviewChange],
  );

  const resolveTrust = async (decision: "trust" | "restrict") => {
    if (review === null || view !== null) return;
    try {
      const nextReview = await client.resolveWorkspaceTrust({
        commandId: randomUUID(),
        decision,
        expectedRevision: review.revision,
        protocolVersion: 1,
        type: "workspace.trust.resolve",
        workspaceId: review.workspace.workspaceId,
      });
      publishReview(nextReview);
      setComposerFocused(false);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workspace trust could not be updated.");
    }
  };

  const start = async (task: string) => {
    if (task.trim().length === 0 || review?.authority.taskStart !== "allowed") return;
    try {
      const nextView = await client.submit({
        commandId: randomUUID(),
        protocolVersion: 1,
        task,
        type: "run.start",
      });
      setView(nextView);
      setComposerFocused(false);
      onViewChange?.(nextView);
      setFollowing(true);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The task could not start.");
    }
  };

  const resolveApproval = async (decision: "approve" | "deny") => {
    if (view?.approval === null || view === null) return;
    try {
      const nextView = await client.submit({
        approvalId: view.approval.approvalId,
        commandId: randomUUID(),
        decision,
        expectedRevision: view.revision,
        protocolVersion: 1,
        runId: view.runId,
        type: "approval.resolve",
      });
      setView(nextView);
      onViewChange?.(nextView);
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
            runId: view.runId,
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
    if (view === null && review !== null && !key.meta && !key.option) {
      if (review.authority.taskStart === "allowed") {
        if (composerFocused) return;
        if (key.name === "return") setComposerFocused(true);
        if (key.name === "r") void resolveTrust("restrict");
        return;
      }
      if (key.name === "t") void resolveTrust("trust");
      if (key.name === "r") void resolveTrust("restrict");
      return;
    }
    if (view?.approval !== null && view !== null && !key.meta && !key.option) {
      if (key.name === "a") void resolveApproval("approve");
      if (key.name === "d") void resolveApproval("deny");
    }
  });

  useEffect(() => {
    if (initialWorkspaceReview !== undefined) {
      onWorkspaceReviewChange?.(initialWorkspaceReview);
      onReady?.();
      return;
    }
    let active = true;
    void client
      .getWorkspaceReview()
      .then((nextReview) => {
        if (active) publishReview(nextReview);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Workspace review could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) onReady?.();
      });
    return () => {
      active = false;
    };
  }, [client, initialWorkspaceReview, onReady, onWorkspaceReviewChange, publishReview]);

  const followedRunId = following ? (view?.runId ?? null) : null;
  useEffect(() => {
    if (followedRunId === null) return;
    const runId = followedRunId;
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
  }, [client, followedRunId]);

  const outcome = view?.terminalOutcome;
  const check = view?.checks[0];
  const compact = height <= 20 || width <= 60;
  const displayedWorkspace = view?.workspace ?? review?.workspace;
  return (
    <box style={{ flexDirection: "column", padding: 1, width: "100%", height: "100%" }}>
      <text fg="#8BD5CA">Eden R1 · deterministic fake · no credential required</text>
      {!compact && (
        <text>
          viewport: {width}x{height}
        </text>
      )}
      {review === null && <text>Loading workspace review…</text>}
      {review !== null && displayedWorkspace !== undefined && (
        <box style={{ flexDirection: "column" }}>
          <text>workspace: {displayedWorkspace.root}</text>
          <text>trust: {displayedWorkspace.trust}</text>
          {view === null && (
            <box style={{ flexDirection: "column" }}>
              <text>task start: {review.authority.taskStart}</text>
              <text>repository: read disabled · write denied</text>
              <text>execution: fake-only · network denied · sandbox not-configured</text>
              <text>Trust does not approve actions.</text>
              {review.notice !== null && (
                <box style={{ flexDirection: "column" }}>
                  <text fg="#ED8796">notice: {review.notice.message}</text>
                  <text>recovery: {review.notice.suggestedActions[0]}</text>
                </box>
              )}
              <text>trust exact workspace: t · restrict/revoke: r · Ctrl+C exits</text>
            </box>
          )}
        </box>
      )}
      {view === null && review?.authority.taskStart === "allowed" && (
        <box style={{ flexDirection: "column", marginTop: 1 }}>
          <text>Task</text>
          <input
            focused={composerFocused}
            placeholder="Describe the fake task"
            value={draft}
            onInput={setDraft}
            onSubmit={() => void start(draft)}
            style={{ width: "100%" }}
          />
          <text fg="#777777">
            {composerFocused
              ? "Enter submits · workspace trust does not approve the action"
              : "Enter focuses task · r revokes workspace trust"}
          </text>
        </box>
      )}
      {view !== null && (
        <box style={{ flexDirection: "column", marginTop: 1 }}>
          <text>phase: {view.phase}</text>
          {!compact && (
            <text>
              progress: {view.progress?.completed ?? 0}/{view.progress?.total ?? 3}
            </text>
          )}
          {!compact && <text>timeline: {timeline.join(" > ")}</text>}
          {view.approval !== null && (
            <box
              style={{
                border: !compact,
                flexDirection: "column",
                padding: compact ? 0 : 1,
                width: "100%",
              }}
            >
              <text>approval: pending · workspace trust is separate</text>
              <text>action: {view.approval.canonicalDisplay}</text>
              <text>cwd: {view.approval.cwd}</text>
              {!compact && <text>reason: {view.approval.reason}</text>}
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

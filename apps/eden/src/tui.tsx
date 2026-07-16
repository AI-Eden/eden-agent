import { randomUUID } from "node:crypto";

import { AgentClientError } from "@eden/coding-runtime";
import type {
  AgentClient,
  ProductEvent,
  ProductView,
  RunCatalog,
  RunInspection,
  WorkspaceReview,
} from "@eden/contracts";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useRunHistory } from "./tui-history.tsx";
import { EdenTuiLayout } from "./tui-layout.tsx";

export type EdenTuiAppProps = {
  readonly client: AgentClient;
  readonly initialWorkspaceReview?: WorkspaceReview;
  readonly onExit?: (code: 0 | 130) => void;
  readonly onReady?: (() => void) | undefined;
  readonly onRunCatalogChange?: ((catalog: RunCatalog) => void) | undefined;
  readonly onRunInspectionChange?: ((inspection: RunInspection) => void) | undefined;
  readonly onViewChange?: ((view: ProductView) => void) | undefined;
  readonly onWorkspaceReviewChange?: ((review: WorkspaceReview | null) => void) | undefined;
};

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof AgentClientError ? cause.productError.message : fallback;
}

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
  onRunCatalogChange,
  onRunInspectionChange,
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

  const leaveComposer = useCallback(() => setComposerFocused(false), []);
  const history = useRunHistory({
    client,
    onCatalogChange: onRunCatalogChange,
    onInspectionChange: onRunInspectionChange,
    onOpen: leaveComposer,
  });

  const publishReview = useCallback(
    (nextReview: WorkspaceReview) => {
      setReview(nextReview);
      onWorkspaceReviewChange?.(nextReview);
    },
    [onWorkspaceReviewChange],
  );

  const invalidateReview = useCallback(() => {
    setReview(null);
    onWorkspaceReviewChange?.(null);
  }, [onWorkspaceReviewChange]);

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
      let message = errorMessage(cause, "Workspace trust could not be updated.");
      const code = cause instanceof AgentClientError ? cause.productError.code : null;
      if (code === "workspace_identity_changed") {
        invalidateReview();
        setComposerFocused(false);
      } else if (code === "stale_revision") {
        invalidateReview();
        setComposerFocused(false);
        try {
          publishReview(await client.getWorkspaceReview());
        } catch {
          message = "Workspace authority could not be refreshed. Restart Eden and review it again.";
        }
      }
      setError(message);
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
      let message = errorMessage(cause, "The task could not start.");
      const code = cause instanceof AgentClientError ? cause.productError.code : null;
      if (code === "workspace_identity_changed") {
        invalidateReview();
        setComposerFocused(false);
      } else if (code === "workspace_trust_required" || code === "stale_revision") {
        invalidateReview();
        setComposerFocused(false);
        try {
          publishReview(await client.getWorkspaceReview());
        } catch {
          message = "Workspace authority could not be refreshed. Restart Eden and review it again.";
        }
      }
      setError(message);
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
      setError(errorMessage(cause, "The approval could not be resolved."));
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
    if (history.surface === "inspection") {
      if (!key.meta && !key.option && key.name === "b") {
        history.back();
      }
      return;
    }
    if (history.surface === "history") {
      if (key.meta || key.option) return;
      if (key.name === "b") {
        history.back();
      } else if (key.name === "up") {
        history.moveSelection(-1);
      } else if (key.name === "down") {
        history.moveSelection(1);
      } else if (key.name === "return") {
        void history.openInspection();
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
        if (key.name === "h") history.openHistory();
        if (key.name === "r") void resolveTrust("restrict");
        return;
      }
      if (key.name === "t") void resolveTrust("trust");
      if (key.name === "h") history.openHistory();
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
      void history.loadCatalog();
      onReady?.();
      return;
    }
    let active = true;
    void client
      .getWorkspaceReview()
      .then((nextReview) => {
        if (active) {
          publishReview(nextReview);
          void history.loadCatalog();
        }
      })
      .catch((cause) => {
        if (active) {
          setError(errorMessage(cause, "Workspace review could not be loaded."));
        }
      })
      .finally(() => {
        if (active) onReady?.();
      });
    return () => {
      active = false;
    };
  }, [
    client,
    initialWorkspaceReview,
    history.loadCatalog,
    onReady,
    onWorkspaceReviewChange,
    publishReview,
  ]);

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
        setError(errorMessage(cause, "The event subscription failed."));
      }
    });
    return () => controller.abort();
  }, [client, followedRunId]);

  const compact = height <= 20 || width <= 60;
  return (
    <EdenTuiLayout
      catalog={history.catalog}
      compact={compact}
      composerFocused={composerFocused}
      draft={draft}
      error={error}
      height={height}
      historyError={history.error}
      inspection={history.inspection}
      onDraftChange={setDraft}
      onStart={start}
      review={review}
      selectedIndex={history.selectedIndex}
      surface={history.surface}
      timeline={timeline}
      view={view}
      width={width}
    />
  );
}

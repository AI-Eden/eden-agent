import { randomUUID } from "node:crypto";

import { AgentClientError } from "@eden/coding-runtime/agent-client";
import type {
  AgentClient,
  ProductEvent,
  ProductView,
  ProviderProfileCatalog,
  ProviderProfileInput,
  ProviderReadiness,
  RunCatalog,
  RunInspection,
  WorkspaceReview,
} from "@eden/contracts";
import type { KeyEvent } from "@opentui/core";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useAppContext, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  activeComposerOwnsKey,
  commandForFocus,
  commandForKey,
  layoutModeForViewport,
  moveFocus,
  paletteEntries,
  reconcileFocus,
  type TuiCommandId,
  type TuiFocusContext,
  type TuiFocusId,
  type TuiOverlay,
  type TuiRunPane,
} from "./tui-focus.ts";
import { useRunHistory } from "./tui-history.tsx";
import { EdenTuiLayout } from "./tui-layout.tsx";

export type EdenTuiAppProps = {
  readonly client: AgentClient;
  readonly initialWorkspaceReview?: WorkspaceReview;
  readonly onExit?: (code: 0 | 130) => void;
  readonly onReady?: (() => void) | undefined;
  readonly onRunCatalogChange?: ((catalog: RunCatalog) => void) | undefined;
  readonly onRunInspectionChange?: ((inspection: RunInspection) => void) | undefined;
  readonly onProviderProfilesChange?: ((catalog: ProviderProfileCatalog) => void) | undefined;
  readonly onProviderReadinessChange?: ((readiness: ProviderReadiness) => void) | undefined;
  readonly onViewChange?: ((view: ProductView) => void) | undefined;
  readonly onWorkspaceReviewChange?: ((review: WorkspaceReview | null) => void) | undefined;
};

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof AgentClientError ? cause.productError.message : fallback;
}

function maskedProfileDraft(value: string): string {
  const marker = "|inline:";
  const start = value.lastIndexOf(marker);
  if (start < 0) return value;
  return `${value.slice(0, start + marker.length)}${"•".repeat(
    Array.from(value.slice(start + marker.length)).length,
  )}`;
}

function reconcileMaskedProfileDraft(previous: string, displayed: string): string {
  const previousDisplay = maskedProfileDraft(previous);
  if (displayed === previousDisplay) return previous;
  if (displayed.startsWith(previousDisplay)) {
    return `${previous}${displayed.slice(previousDisplay.length)}`;
  }
  if (previousDisplay.startsWith(displayed)) {
    return Array.from(previous).slice(0, Array.from(displayed).length).join("");
  }
  return displayed.includes("•") ? previous : displayed;
}

function useLayoutKeyboard(handler: (key: KeyEvent) => void): void {
  const { keyHandler } = useAppContext();
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  useLayoutEffect(() => {
    if (keyHandler === null) return;
    const dispatch = (key: KeyEvent) => handlerRef.current(key);
    keyHandler.on("keypress", dispatch);
    return () => {
      keyHandler.off("keypress", dispatch);
    };
  }, [keyHandler]);
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
  onProviderProfilesChange,
  onProviderReadinessChange,
  onRunCatalogChange,
  onRunInspectionChange,
  onViewChange,
  onWorkspaceReviewChange,
}: EdenTuiAppProps) {
  const { height, width } = useTerminalDimensions();
  const [authorityPending, setAuthorityPending] = useState<"restrict" | "trust" | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [focusId, setFocusId] = useState<TuiFocusId | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expandedToolIds, setExpandedToolIds] = useState<ReadonlySet<string>>(new Set());
  const [following, setFollowing] = useState(false);
  const [liveModelText, setLiveModelText] = useState<{
    readonly attemptId: string;
    readonly text: string;
  } | null>(null);
  const [profileCatalog, setProfileCatalog] = useState<ProviderProfileCatalog | null>(null);
  const [profileDraft, setProfileDraft] = useState("");
  const [overlay, setOverlay] = useState<TuiOverlay>(null);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [providerReadiness, setProviderReadiness] = useState<ProviderReadiness | null>(null);
  const [runPane, setRunPane] = useState<TuiRunPane>("conversation");
  const [review, setReview] = useState<WorkspaceReview | null>(initialWorkspaceReview ?? null);
  const [timeline, setTimeline] = useState<readonly ProductEvent["type"][]>([]);
  const [view, setView] = useState<ProductView | null>(null);
  const activeOperation = useRef<AbortController | null>(null);
  const focusBeforeOverlay = useRef<TuiFocusId | null>(null);
  const readyPublished = useRef(false);

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

  const publishProfiles = useCallback(
    (catalog: ProviderProfileCatalog) => {
      setProfileCatalog(catalog);
      onProviderProfilesChange?.(catalog);
    },
    [onProviderProfilesChange],
  );

  const publishReadiness = useCallback(
    (readiness: ProviderReadiness) => {
      setProviderReadiness(readiness);
      onProviderReadinessChange?.(readiness);
    },
    [onProviderReadinessChange],
  );

  const reloadProfiles = async () => {
    try {
      publishProfiles(await client.reloadProviderProfiles());
      publishReadiness(await client.getProviderReadiness());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "Provider profiles could not be reloaded."));
    }
  };

  const recheckRepository = async () => {
    try {
      publishReview(await client.getWorkspaceReview());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "Repository prerequisites could not be rechecked."));
    }
  };

  const checkProviderReadiness = async () => {
    if (profileCatalog?.activeProfileId === null || profileCatalog?.activeProfileId === undefined) {
      setError("Configure an active provider profile before checking the connection.");
      setOverlay(null);
      return;
    }
    try {
      const readiness = await client.checkProviderReadiness({
        commandId: randomUUID(),
        expectedRevision: profileCatalog.revision,
        possibleChargeConfirmed: true,
        profileId: profileCatalog.activeProfileId,
        protocolVersion: 1,
        type: "provider.readiness.check",
      });
      publishReadiness(readiness);
      publishProfiles(await client.reloadProviderProfiles());
      setError(readiness.error?.message ?? null);
    } catch (cause) {
      setError(errorMessage(cause, "The provider readiness check could not complete."));
    } finally {
      setOverlay(null);
    }
  };

  const saveProfile = async (source: string) => {
    if (profileCatalog === null) return;
    const [id, baseUrl, model, billingSource, contextWindow, maxOutput, credentialSource] = source
      .split("|")
      .map((part) => part.trim());
    const contextWindowTokens = Number(contextWindow);
    const maxOutputTokens = Number(maxOutput);
    const credential = credentialSource?.startsWith("env:")
      ? { name: credentialSource.slice(4), source: "environment" as const }
      : credentialSource?.startsWith("inline:")
        ? { source: "inline" as const, value: credentialSource.slice(7) }
        : null;
    if (
      id === undefined ||
      baseUrl === undefined ||
      model === undefined ||
      (billingSource !== "pay_as_you_go" &&
        billingSource !== "subscription_api_key" &&
        billingSource !== "custom") ||
      !Number.isSafeInteger(contextWindowTokens) ||
      contextWindowTokens <= 0 ||
      !Number.isSafeInteger(maxOutputTokens) ||
      maxOutputTokens <= 0 ||
      credential === null
    ) {
      setError("Profile input must contain seven valid pipe-separated fields.");
      return;
    }
    const profile: ProviderProfileInput = {
      baseUrl,
      billingSource,
      contextWindowTokens,
      credential,
      id,
      maxOutputTokens,
      model,
      protocol: "openai_chat_completions",
      reasoningDisplay: "off",
    };
    try {
      publishProfiles(
        await client.saveProviderProfile({
          commandId: randomUUID(),
          expectedRevision: profileCatalog.revision,
          profile,
          protocolVersion: 1,
          select: true,
          type: "provider.profile.save",
        }),
      );
      publishReadiness(await client.getProviderReadiness());
      setProfileDraft("");
      setOverlay(null);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "The provider profile could not be saved."));
    }
  };

  const selectNextProfile = async () => {
    if (profileCatalog === null || profileCatalog.profiles.length < 2) return;
    const current = profileCatalog.profiles.findIndex(
      (profile) => profile.id === profileCatalog.activeProfileId,
    );
    const next = profileCatalog.profiles[(current + 1) % profileCatalog.profiles.length];
    if (next === undefined) return;
    try {
      publishProfiles(
        await client.selectProviderProfile({
          commandId: randomUUID(),
          expectedRevision: profileCatalog.revision,
          profileId: next.id,
          protocolVersion: 1,
          type: "provider.profile.select",
        }),
      );
      publishReadiness(await client.getProviderReadiness());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "The provider profile could not be selected."));
    }
  };

  const deleteProfile = async () => {
    if (profileCatalog === null || profileCatalog.profiles.length === 0) return;
    const inactive = profileCatalog.profiles.find(
      (profile) => profile.id !== profileCatalog.activeProfileId,
    );
    const profileId = inactive?.id ?? profileCatalog.activeProfileId;
    if (profileId === null) return;
    try {
      publishProfiles(
        await client.deleteProviderProfile({
          commandId: randomUUID(),
          expectedRevision: profileCatalog.revision,
          profileId,
          protocolVersion: 1,
          type: "provider.profile.delete",
        }),
      );
      publishReadiness(await client.getProviderReadiness());
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "The provider profile could not be deleted."));
    }
  };

  const resolveTrust = async (decision: "trust" | "restrict") => {
    if (review === null || view !== null || authorityPending !== null) return;
    setAuthorityPending(decision);
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
    } finally {
      setAuthorityPending(null);
    }
  };

  const start = async (task: string) => {
    if (task.trim().length === 0 || review?.authority.taskStart !== "allowed") return;
    const controller = new AbortController();
    activeOperation.current = controller;
    let startedViewPublished = false;
    try {
      const nextView = await client.submit(
        {
          commandId: randomUUID(),
          protocolVersion: 1,
          task,
          type: "run.start",
        },
        {
          onRunStarted: (startedView) => {
            startedViewPublished = true;
            setView(startedView);
            setDraft("");
            setComposerFocused(false);
            setFollowing(true);
            onViewChange?.(startedView);
          },
          signal: controller.signal,
        },
      );
      setView(nextView);
      if (!startedViewPublished) {
        setDraft("");
        setComposerFocused(false);
        setFollowing(true);
      }
      onViewChange?.(nextView);
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
    } finally {
      if (activeOperation.current === controller) activeOperation.current = null;
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

  const retryModel = async () => {
    if (view === null || view.phase !== "awaiting-retry") return;
    const controller = new AbortController();
    activeOperation.current = controller;
    try {
      const nextView = await client.submit(
        {
          commandId: randomUUID(),
          expectedRevision: view.revision,
          protocolVersion: 1,
          runId: view.runId,
          type: "model.retry",
        },
        { signal: controller.signal },
      );
      setView(nextView);
      onViewChange?.(nextView);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, "The model attempt could not be retried."));
    } finally {
      if (activeOperation.current === controller) activeOperation.current = null;
    }
  };

  const submitActiveInput = async (mode: "queue" | "steer", content: string) => {
    const current = view;
    if (
      current === null ||
      current.terminalOutcome !== null ||
      current.conversationInput === undefined ||
      content.length === 0 ||
      !current.conversationInput.submission[mode].available
    ) {
      return;
    }
    try {
      const latest = await client.getSnapshot(current.runId);
      setView(latest);
      onViewChange?.(latest);
      if (
        latest.terminalOutcome !== null ||
        latest.conversationInput === undefined ||
        !latest.conversationInput.submission[mode].available
      ) {
        return;
      }
      const nextView = await client.submit({
        commandId: randomUUID(),
        content,
        expectedRevision: latest.revision,
        protocolVersion: 1,
        runId: latest.runId,
        type: mode === "steer" ? "conversation.steer" : "conversation.queue",
      });
      setView(nextView);
      setDraft("");
      setFocusId("run.composer");
      onViewChange?.(nextView);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause, `The ${mode} input could not be accepted.`));
    }
  };

  const focusContext = useMemo<TuiFocusContext>(() => {
    const runState =
      view === null
        ? "none"
        : view.terminalOutcome !== null
          ? "terminal"
          : view.approval !== null
            ? "approval"
            : view.phase === "awaiting-retry"
              ? "retry"
              : "active";
    return {
      canQueueInput: view?.conversationInput?.submission.queue.available === true,
      canSteerInput: view?.conversationInput?.submission.steer.available === true,
      hasConversationInput: view?.conversationInput !== undefined,
      hasProfile: (profileCatalog?.profiles.length ?? 0) > 0,
      hasRepositoryReview: review?.repository !== undefined,
      hasReview: view?.review !== undefined,
      hasTools: (view?.tools?.length ?? 0) > 0,
      overlay,
      runState,
      surface: history.surface,
      workspaceState:
        authorityPending !== null
          ? "updating"
          : review === null
            ? "loading"
            : review.workspace.trust === "trusted"
              ? "trusted"
              : "restricted",
    };
  }, [authorityPending, history.surface, overlay, profileCatalog?.profiles.length, review, view]);

  const palette = useMemo(() => paletteEntries(focusContext), [focusContext]);

  const closeOverlay = () => {
    if (overlay === "profile") setProfileDraft("");
    setOverlay(null);
    setPaletteIndex(0);
    setFocusId(focusBeforeOverlay.current);
    focusBeforeOverlay.current = null;
  };

  const openOverlay = (nextOverlay: "help" | "palette") => {
    focusBeforeOverlay.current = focusId;
    setComposerFocused(false);
    setPaletteIndex(0);
    setOverlay(nextOverlay);
  };

  const cancelAndExit = () => {
    if (activeOperation.current !== null) {
      activeOperation.current.abort();
      onExit?.(130);
      return;
    }
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
      return;
    }
    onExit?.(130);
  };

  const invokeCommand = (commandId: TuiCommandId) => {
    switch (commandId) {
      case "approve":
        void resolveApproval("approve");
        return;
      case "back":
        history.back();
        return;
      case "cancel":
        cancelAndExit();
        return;
      case "composer":
        if (view?.conversationInput !== undefined) setFocusId("run.composer");
        else if (review?.authority.taskStart === "allowed") setComposerFocused(true);
        return;
      case "connection":
        if (providerReadiness === null || providerReadiness.state === "unconfigured") {
          setError("Configure an active provider profile before checking the connection.");
        } else {
          focusBeforeOverlay.current = focusId;
          setOverlay("readiness");
        }
        return;
      case "connection-confirm":
        void checkProviderReadiness();
        return;
      case "delete-profile":
        void deleteProfile();
        return;
      case "deny":
        void resolveApproval("deny");
        return;
      case "exit":
        onExit?.(0);
        return;
      case "history":
        history.openHistory();
        return;
      case "profile":
        focusBeforeOverlay.current = focusId;
        setOverlay("profile");
        return;
      case "reload-profiles":
        void reloadProfiles();
        return;
      case "repository":
        void recheckRepository();
        return;
      case "queue-input":
        void submitActiveInput("queue", draft);
        return;
      case "retry":
        void retryModel();
        return;
      case "revoke":
        void resolveTrust("restrict");
        return;
      case "select-profile":
        void selectNextProfile();
        return;
      case "show-context":
        setRunPane("context");
        return;
      case "show-conversation":
        setRunPane("conversation");
        return;
      case "show-recovery":
        setRunPane("recovery");
        return;
      case "steer-input":
        void submitActiveInput("steer", draft);
        return;
      case "toggle-tools": {
        const ids = view?.tools?.map((activity) => activity.call.toolCallId) ?? [];
        if (ids.length === 0) return;
        setExpandedToolIds((current) => {
          const allExpanded = ids.every((id) => current.has(id));
          return allExpanded ? new Set() : new Set(ids);
        });
        return;
      }
      case "trust":
        void resolveTrust("trust");
    }
  };

  const handleComposerKeyDown = (key: {
    readonly ctrl: boolean;
    readonly name: string;
    preventDefault(): void;
    stopPropagation(): void;
  }) => {
    if (key.ctrl && key.name === "p") {
      key.preventDefault();
      key.stopPropagation();
      openOverlay("palette");
    } else if (key.ctrl && key.name === "c") {
      key.preventDefault();
      key.stopPropagation();
      cancelAndExit();
    } else if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      if (view?.conversationInput !== undefined) {
        setFocusId((current) => moveFocus(focusContext, current, 1));
      } else {
        setComposerFocused(false);
      }
    }
  };

  const handleProfileKeyDown = (key: {
    readonly ctrl: boolean;
    readonly name: string;
    preventDefault(): void;
    stopPropagation(): void;
  }) => {
    if (key.ctrl && key.name === "p") {
      key.preventDefault();
      key.stopPropagation();
      openOverlay("palette");
    } else if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      closeOverlay();
    }
  };

  const handleGraphKey = (key: KeyEvent) => {
    const activeComposerFocused = activeComposerOwnsKey(focusContext, focusId);
    if (
      (composerFocused || activeComposerFocused) &&
      !(key.ctrl && (key.name === "c" || key.name === "p"))
    ) {
      if (key.name === "escape") {
        key.preventDefault();
        key.stopPropagation();
        setComposerFocused(false);
      }
      return;
    }
    const command = commandForKey(focusContext, key);
    if (command === null) return;
    key.preventDefault();
    key.stopPropagation();
    if (command.type === "open-palette") {
      openOverlay("palette");
      return;
    }
    if (command.type === "open-help") {
      openOverlay("help");
      return;
    }
    if (command.type === "close-overlay") {
      closeOverlay();
      return;
    }
    if (command.type === "focus-next" || command.type === "focus-previous") {
      setFocusId((current) =>
        moveFocus(focusContext, current, command.type === "focus-next" ? 1 : -1),
      );
      return;
    }
    if (command.type === "move-selection") {
      if (overlay === "palette") {
        setPaletteIndex((current) =>
          palette.length === 0
            ? 0
            : (current + command.direction + palette.length) % palette.length,
        );
      } else if (history.surface === "history") {
        history.moveSelection(command.direction);
      }
      return;
    }
    if (command.type === "activate") {
      if (overlay === "palette") {
        const entry = palette[paletteIndex];
        if (entry?.enabled) {
          closeOverlay();
          invokeCommand(entry.commandId);
        }
        return;
      }
      if (history.surface === "history" && focusId === "history.list") {
        void history.openInspection();
        return;
      }
      const focusCommand = commandForFocus(focusId);
      if (focusCommand !== null) invokeCommand(focusCommand);
      return;
    }
    invokeCommand(command.commandId);
  };

  useLayoutKeyboard(handleGraphKey);

  useEffect(() => {
    setFocusId((current) => reconcileFocus(focusContext, current));
  }, [focusContext]);

  const approvalIdentity = view?.approval?.approvalId ?? null;
  const awaitingRetry = view?.phase === "awaiting-retry";
  const activeRunId = view?.runId ?? null;
  useEffect(() => {
    if (activeRunId === null) return;
    setRunPane(
      approvalIdentity !== null || awaitingRetry || view?.review !== undefined
        ? "recovery"
        : "conversation",
    );
  }, [activeRunId, approvalIdentity, awaitingRetry, view?.review]);

  useEffect(
    () => () => {
      activeOperation.current?.abort();
    },
    [],
  );

  useLayoutEffect(() => {
    if (initialWorkspaceReview === undefined || readyPublished.current) return;
    readyPublished.current = true;
    onReady?.();
  }, [initialWorkspaceReview, onReady]);

  useEffect(() => {
    if (initialWorkspaceReview !== undefined) {
      onWorkspaceReviewChange?.(initialWorkspaceReview);
      void history.loadCatalog();
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
        if (active && !readyPublished.current) {
          readyPublished.current = true;
          onReady?.();
        }
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

  useEffect(() => {
    let active = true;
    void client
      .getProviderProfiles()
      .then((catalog) => {
        if (active) publishProfiles(catalog);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause, "Provider profiles could not be loaded."));
      });
    return () => {
      active = false;
    };
  }, [client, publishProfiles]);

  useEffect(() => {
    let active = true;
    void client
      .getProviderReadiness()
      .then((readiness) => {
        if (active) publishReadiness(readiness);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause, "Provider readiness could not be loaded."));
      });
    return () => {
      active = false;
    };
  }, [client, publishReadiness]);

  useEffect(() => {
    if (client.subscribeModelText === undefined) return;
    const controller = new AbortController();
    const follow = async () => {
      for await (const delta of client.subscribeModelText?.({ signal: controller.signal }) ?? []) {
        setLiveModelText((current) => {
          if (current?.attemptId !== delta.attemptId || delta.offset === 0) {
            return { attemptId: delta.attemptId, text: delta.text };
          }
          if (current.text.length !== delta.offset) return current;
          return { attemptId: delta.attemptId, text: current.text + delta.text };
        });
      }
    };
    void follow().catch((cause) => {
      if (!controller.signal.aborted) {
        setError(errorMessage(cause, "The live model stream could not be displayed."));
      }
    });
    return () => controller.abort();
  }, [client]);

  const followedRunId = following ? (view?.runId ?? null) : null;
  useEffect(() => {
    if (followedRunId === null) return;
    const runId = followedRunId;
    const controller = new AbortController();
    const follow = async () => {
      for await (const event of client.subscribe(runId, undefined, { signal: controller.signal })) {
        setTimeline((current) => [...current, event.type]);
        if (event.type === "model.attempt.updated" && event.attempt.state !== "started") {
          setLiveModelText(null);
        }
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

  const layoutMode = layoutModeForViewport(width, height);
  return (
    <EdenTuiLayout
      authorityPending={authorityPending}
      catalog={history.catalog}
      compact={layoutMode === "narrow"}
      composerFocused={composerFocused}
      draft={draft}
      error={error}
      expandedToolIds={expandedToolIds}
      focusId={focusId}
      height={height}
      historyError={history.error}
      inspection={history.inspection}
      liveModelText={liveModelText?.text ?? null}
      layoutMode={layoutMode}
      onComposerKeyDown={handleComposerKeyDown}
      onActiveInput={(mode, content) => void submitActiveInput(mode, content)}
      onDraftChange={setDraft}
      onProfileDraftChange={(displayed) =>
        setProfileDraft((previous) => reconcileMaskedProfileDraft(previous, displayed))
      }
      onProfileKeyDown={handleProfileKeyDown}
      onProfileSave={() => saveProfile(profileDraft)}
      onStart={start}
      overlay={overlay}
      palette={palette}
      paletteIndex={paletteIndex}
      review={review}
      profileCatalog={profileCatalog}
      profileDraft={maskedProfileDraft(profileDraft)}
      profileEditorFocused={overlay === "profile"}
      providerReadiness={providerReadiness}
      readinessConfirmationFocused={overlay === "readiness"}
      selectedIndex={history.selectedIndex}
      surface={history.surface}
      timeline={timeline}
      runPane={runPane}
      view={view}
      width={width}
    />
  );
}

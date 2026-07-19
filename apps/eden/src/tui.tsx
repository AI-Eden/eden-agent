import { randomUUID } from "node:crypto";

import { AgentClientError } from "@eden/coding-runtime";
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
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { useKeyboard, useRenderer, useTerminalDimensions } from "@opentui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  const [composerFocused, setComposerFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [liveModelText, setLiveModelText] = useState<{
    readonly attemptId: string;
    readonly text: string;
  } | null>(null);
  const [profileCatalog, setProfileCatalog] = useState<ProviderProfileCatalog | null>(null);
  const [profileDraft, setProfileDraft] = useState("");
  const [profileEditorFocused, setProfileEditorFocused] = useState(false);
  const [providerReadiness, setProviderReadiness] = useState<ProviderReadiness | null>(null);
  const [readinessConfirmationFocused, setReadinessConfirmationFocused] = useState(false);
  const [review, setReview] = useState<WorkspaceReview | null>(initialWorkspaceReview ?? null);
  const [timeline, setTimeline] = useState<readonly ProductEvent["type"][]>([]);
  const [view, setView] = useState<ProductView | null>(null);
  const activeOperation = useRef<AbortController | null>(null);

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
      setReadinessConfirmationFocused(false);
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
      setReadinessConfirmationFocused(false);
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
      setProfileEditorFocused(false);
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
    const controller = new AbortController();
    activeOperation.current = controller;
    try {
      const nextView = await client.submit(
        {
          commandId: randomUUID(),
          protocolVersion: 1,
          task,
          type: "run.start",
        },
        { signal: controller.signal },
      );
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

  useKeyboard((key) => {
    if (key.ctrl && key.name === "c") {
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
    if (readinessConfirmationFocused) {
      key.preventDefault();
      key.stopPropagation();
      if (key.name === "y") void checkProviderReadiness();
      if (key.name === "n" || key.name === "escape") {
        setReadinessConfirmationFocused(false);
      }
      return;
    }
    if (profileEditorFocused) {
      if (key.name === "escape") {
        key.preventDefault();
        key.stopPropagation();
        setProfileDraft("");
        setProfileEditorFocused(false);
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
      if (composerFocused) return;
      if (key.name === "p") setProfileEditorFocused(true);
      if (key.name === "c") {
        if (providerReadiness === null || providerReadiness.state === "unconfigured") {
          setError("Configure an active provider profile before checking the connection.");
        } else {
          setReadinessConfirmationFocused(true);
        }
      }
      if (key.name === "s") void selectNextProfile();
      if (key.name === "x") void deleteProfile();
      if (key.name === "l") void reloadProfiles();
      if (key.name === "g") void recheckRepository();
      if (["p", "c", "s", "x", "l", "g"].includes(key.name)) return;
      if (review.authority.taskStart === "allowed") {
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
    if (view?.phase === "awaiting-retry" && !key.meta && !key.option && key.name === "u") {
      void retryModel();
    }
  });

  useEffect(
    () => () => {
      activeOperation.current?.abort();
    },
    [],
  );

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
      liveModelText={liveModelText?.text ?? null}
      onDraftChange={setDraft}
      onProfileDraftChange={(displayed) =>
        setProfileDraft((previous) => reconcileMaskedProfileDraft(previous, displayed))
      }
      onProfileSave={() => saveProfile(profileDraft)}
      onStart={start}
      review={review}
      profileCatalog={profileCatalog}
      profileDraft={maskedProfileDraft(profileDraft)}
      profileEditorFocused={profileEditorFocused}
      providerReadiness={providerReadiness}
      readinessConfirmationFocused={readinessConfirmationFocused}
      selectedIndex={history.selectedIndex}
      surface={history.surface}
      timeline={timeline}
      view={view}
      width={width}
    />
  );
}

import type {
  ProductError,
  ProductEvent,
  ProductView,
  ProviderProfileCatalog,
  ProviderReadiness,
  RunCatalog,
  RunInspection,
  WorkspaceReview,
} from "@eden/contracts";
import type { KeyEvent } from "@opentui/core";

import { RepositoryCheckCard } from "./repository-check-cards.tsx";
import { densityForLayout, tuiDesignTokens } from "./tui-design.ts";
import type {
  TuiFocusId,
  TuiLayoutMode,
  TuiOverlay,
  TuiPaletteEntry,
  TuiRunPane,
} from "./tui-focus.ts";
import { HistoryPanel, InspectionPanel } from "./tui-history.tsx";
import { fitTerminalLine, safeTerminalBlock } from "./tui-text.ts";

function ToolCard({
  activity,
  compact,
  expanded,
}: {
  readonly activity: NonNullable<ProductView["tools"]>[number];
  readonly compact: boolean;
  readonly expanded: boolean;
}) {
  const path = activity.call.name === "git_status" ? "." : activity.call.arguments.path;
  const safePath = fitTerminalLine(path, Number.MAX_SAFE_INTEGER);
  const result = activity.result;
  return (
    <box
      style={{
        border: compact ? tuiDesignTokens.border.surface : tuiDesignTokens.border.card,
        flexDirection: "column",
        flexShrink: 0,
        padding: compact ? tuiDesignTokens.spacing.none : tuiDesignTokens.spacing.panel,
        width: "100%",
      }}
    >
      <text>
        repository tool: {activity.call.name} · {activity.state}
      </text>
      {expanded && <text>source: {safePath} · authority: bounded read-only</text>}
      <text>
        {fitTerminalLine(
          `tool details: ${expanded ? "expanded" : "folded"} · focus tools + Enter/e toggles`,
          compact ? 56 : Number.MAX_SAFE_INTEGER,
        )}
      </text>
      {expanded && result?.status === "failed" && (
        <text fg={tuiDesignTokens.color.danger}>tool error: {result.error.message}</text>
      )}
      {expanded && result?.status === "succeeded" && result.name === "read_file" && (
        <box style={{ flexDirection: "column" }}>
          <text>
            bytes: {result.data.offset}+{result.data.bytesRead}/{result.data.totalBytes} · next:{" "}
            {result.data.nextOffset ?? "complete"}
          </text>
          <text>hash: {result.data.contentHash}</text>
          <text>repository result:</text>
          <text>{safeTerminalBlock(result.data.content)}</text>
        </box>
      )}
      {expanded && result?.status === "succeeded" && result.name === "list_files" && (
        <box style={{ flexDirection: "column" }}>
          <text>
            rows: {result.data.entries.length} · visited: {result.data.visited} · next:{" "}
            {result.data.continuation ?? "complete"}
          </text>
          <text>hash: {result.data.contentHash}</text>
          {result.data.entries.map((entry) => (
            <text key={entry.path}>
              {entry.kind}: {fitTerminalLine(entry.path, Number.MAX_SAFE_INTEGER)}
            </text>
          ))}
        </box>
      )}
      {expanded && result?.status === "succeeded" && result.name === "search_repository" && (
        <box style={{ flexDirection: "column" }}>
          <text>
            matches: {result.data.matches.length} · engine: {result.data.engine.name}{" "}
            {result.data.engine.version} · next: {result.data.continuation ?? "complete"}
          </text>
          <text>hash: {result.data.contentHash}</text>
          {result.data.matches.map((match) => (
            <text key={`${match.path}:${match.lineNumber}:${match.byteColumn}:${match.preview}`}>
              {fitTerminalLine(match.path, Number.MAX_SAFE_INTEGER)}:{match.lineNumber}:
              {match.byteColumn}: {safeTerminalBlock(match.preview)}
            </text>
          ))}
        </box>
      )}
      {expanded && result?.status === "succeeded" && result.name === "git_status" && (
        <box style={{ flexDirection: "column" }}>
          <text>
            rows: {result.data.entries.length} · Git {result.data.gitVersion}
          </text>
          <text>hash: {result.data.contentHash}</text>
          {result.data.entries.map((entry) => (
            <text key={`${entry.path}:${entry.originalPath ?? ""}`}>
              {entry.indexStatus}
              {entry.worktreeStatus} {entry.kind}:{" "}
              {fitTerminalLine(entry.path, Number.MAX_SAFE_INTEGER)}
              {entry.originalPath === null
                ? ""
                : ` ← ${fitTerminalLine(entry.originalPath, Number.MAX_SAFE_INTEGER)}`}
            </text>
          ))}
        </box>
      )}
    </box>
  );
}

function ReviewPatch({
  label,
  patch,
}: {
  readonly label: string;
  readonly patch: NonNullable<ProductView["review"]>["edenPatch"];
}) {
  return (
    <box style={{ flexDirection: "column", width: "100%" }}>
      <text>{label}</text>
      {patch.state === "complete" ? (
        <>
          <text>
            {patch.byteLength} bytes · {patch.contentHash}
          </text>
          <text>{safeTerminalBlock(patch.content)}</text>
        </>
      ) : (
        <text fg={tuiDesignTokens.color.danger}>blocked: {patch.error.message}</text>
      )}
    </box>
  );
}

function SafeActuationReview({
  focused,
  height,
  review,
}: {
  readonly focused: boolean;
  readonly height: number;
  readonly review: NonNullable<ProductView["review"]>;
}) {
  const newlyObserved = new Set(review.newlyObservedDiagnostics);
  return (
    <scrollbox
      focused={focused}
      scrollY
      style={{
        border: tuiDesignTokens.border.card,
        flexDirection: "column",
        height,
        padding: tuiDesignTokens.spacing.panel,
        width: "100%",
      }}
    >
      <text>SAFE ACTUATION REVIEW · arrows scroll · Tab exits review</text>
      <text>digest: {review.actionDigest}</text>
      <text>
        policy: {review.policy.ruleId} · {review.policy.ruleSetRevision} · {review.policy.decision}
      </text>
      <text>
        approval: {review.approval.state} · one use · proposal revision{" "}
        {review.approval.proposalRevision}
      </text>
      <text>
        execution: trusted host · isolation {review.isolation} · network {review.network}
      </text>
      <text>
        HEAD {review.head} · observed {review.observedAt}
      </text>
      <text>status hash: {review.statusHash}</text>
      <text>CHANGED FILES</text>
      {review.changedFiles.map((file) => (
        <text key={`${file.path}:${file.status}`}>
          {file.attribution === "pre_existing" ? "pre-existing" : file.attribution} · {file.status}{" "}
          · {file.path}
        </text>
      ))}
      {review.untrackedPaths.map((path) => (
        <text key={path}>untracked · {path}</text>
      ))}
      <text>
        baseline git diff-check: {review.baselineCheck.status} · {review.baselineCheck.contentHash}
      </text>
      {review.baselineCheck.diagnostics.map((diagnostic) => (
        <text key={`baseline:${diagnostic.diagnosticId}`}>
          baseline · {diagnostic.path}:{diagnostic.line} · {diagnostic.message}
        </text>
      ))}
      <text>
        current git diff-check: {review.currentCheck.status} · {review.currentCheck.contentHash}
      </text>
      {review.currentCheck.diagnostics.map((diagnostic) => (
        <text key={`current:${diagnostic.diagnosticId}`}>
          {newlyObserved.has(diagnostic.diagnosticId) ? "new" : "pre-existing"} · {diagnostic.path}:
          {diagnostic.line} · {diagnostic.message}
        </text>
      ))}
      <ReviewPatch label="EDEN CHANGE" patch={review.edenPatch} />
      <ReviewPatch label="CURRENT REPOSITORY" patch={review.currentTrackedPatch} />
      <text>RESIDUAL RISK</text>
      <text>{review.residualRisk}</text>
    </scrollbox>
  );
}

export type EdenTuiLayoutProps = {
  readonly authorityPending: "restrict" | "trust" | null;
  readonly catalog: RunCatalog | null;
  readonly compact: boolean;
  readonly composerFocused: boolean;
  readonly draft: string;
  readonly error: string | null;
  readonly expandedToolIds: ReadonlySet<string>;
  readonly focusId: TuiFocusId | null;
  readonly height: number;
  readonly historyError: ProductError | null;
  readonly inspection: RunInspection | null;
  readonly liveModelText: string | null;
  readonly layoutMode: TuiLayoutMode;
  readonly onDraftChange: (value: string) => void;
  readonly onComposerKeyDown: (event: KeyEvent) => void;
  readonly onProfileDraftChange: (value: string) => void;
  readonly onProfileKeyDown: (event: KeyEvent) => void;
  readonly onProfileSave: () => Promise<void>;
  readonly onStart: (task: string) => Promise<void>;
  readonly overlay: TuiOverlay;
  readonly palette: readonly TuiPaletteEntry[];
  readonly paletteIndex: number;
  readonly review: WorkspaceReview | null;
  readonly runPane: TuiRunPane;
  readonly profileCatalog: ProviderProfileCatalog | null;
  readonly profileDraft: string;
  readonly profileEditorFocused: boolean;
  readonly providerReadiness: ProviderReadiness | null;
  readonly readinessConfirmationFocused: boolean;
  readonly selectedIndex: number;
  readonly surface: "history" | "inspection" | "workspace";
  readonly timeline: readonly ProductEvent["type"][];
  readonly view: ProductView | null;
  readonly width: number;
};

export function EdenTuiLayout(props: EdenTuiLayoutProps) {
  const outcome = props.view?.terminalOutcome;
  const check = props.view?.checks[0];
  const displayedWorkspace = props.view?.workspace ?? props.review?.workspace;
  const activeProfile = props.profileCatalog?.profiles.find(
    (profile) => profile.id === props.profileCatalog?.activeProfileId,
  );
  const phase = props.view?.phase ?? (props.review === null ? "loading" : "workspace-review");
  const density = densityForLayout(props.layoutMode);
  const conversationVisible = props.layoutMode !== "narrow" || props.runPane === "conversation";
  const contextVisible = props.layoutMode !== "narrow" || props.runPane === "context";
  const recoveryVisible = props.layoutMode !== "narrow" || props.runPane === "recovery";
  return (
    <box
      style={{
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        padding: tuiDesignTokens.spacing.panel,
        width: "100%",
      }}
    >
      <text fg={tuiDesignTokens.color.accent} style={{ flexShrink: 0 }}>
        {fitTerminalLine(
          "Eden R2 · conversation + bounded runtime evidence · no credential required for R1 demo",
          props.width - 4,
        )}
      </text>
      {props.surface === "workspace" && props.error !== null && (
        <text fg={tuiDesignTokens.color.danger} style={{ flexShrink: 0 }}>
          {fitTerminalLine(`error: ${props.error}`, props.width - 4)}
        </text>
      )}
      {props.surface === "workspace" && props.authorityPending !== null && (
        <text fg={tuiDesignTokens.color.awaiting} style={{ flexShrink: 0 }}>
          authority update: {props.authorityPending} awaiting durable commit
        </text>
      )}
      {!props.compact && (
        <text style={{ flexShrink: 0 }}>
          viewport: {props.width}x{props.height} · layout: {props.layoutMode}
        </text>
      )}
      {displayedWorkspace !== undefined && (
        <box
          style={{
            border: props.layoutMode === "wide",
            flexDirection: "column",
            flexShrink: 0,
            padding: props.layoutMode === "wide" ? 1 : 0,
          }}
        >
          <text>
            {fitTerminalLine(
              `AUTHORITY · trust: ${displayedWorkspace.trust} · phase: ${phase} · focus: ${props.focusId ?? "none"}`,
              props.width - 4,
            )}
          </text>
          {props.layoutMode !== "wide" && <text>focus: {props.focusId ?? "none"}</text>}
          <text>
            {fitTerminalLine(
              `workspace ${displayedWorkspace.root} · profile: ${activeProfile?.id ?? "not configured"} · model: ${activeProfile?.model ?? "none"} · credential: ${activeProfile?.credential.presence ?? "absent"}`,
              props.width - 4,
            )}
          </text>
          <text>
            {fitTerminalLine(
              `network ${props.view?.attempts === undefined ? "denied" : "provider only"} · repository semantic read-only · write denied · trusted host/no isolation · context ${props.review?.context.state ?? "loading"}`,
              props.width - 4,
            )}
          </text>
        </box>
      )}
      {props.overlay === "palette" && (
        <box style={{ border: true, flexDirection: "column", padding: 1 }}>
          <text fg={tuiDesignTokens.color.accent}>Command palette</text>
          {props.palette.map((entry, index) => (
            <text key={entry.commandId}>
              {index === props.paletteIndex
                ? tuiDesignTokens.focus.active
                : tuiDesignTokens.focus.idle}{" "}
              [{entry.enabled ? tuiDesignTokens.state.ready : tuiDesignTokens.state.disabled}]{" "}
              {entry.label}
              {entry.shortcut === null ? "" : ` · ${entry.shortcut}`}
            </text>
          ))}
          <text>Up/Down selects · Enter activates · Esc closes</text>
        </box>
      )}
      {props.overlay === "help" && (
        <box style={{ border: true, flexDirection: "column", padding: 1 }}>
          <text fg={tuiDesignTokens.color.accent}>Shortcut help</text>
          <text>Tab/Shift+Tab focus · arrows select · Enter activates · Esc returns/collapses</text>
          <text>Ctrl+P palette · ? help · Ctrl+C durable cancel/exit</text>
          <text>h history · p profile · c connection · g repository · e tool evidence</text>
          <text>a approve · d deny · u retry · q exit · Esc closes help</text>
        </box>
      )}
      {props.review === null && <text>Loading workspace review…</text>}
      {props.review !== null && displayedWorkspace !== undefined && (
        <box style={{ flexDirection: "column", flexShrink: 0 }}>
          {props.view === null && props.layoutMode === "wide" && (
            <text>{fitTerminalLine(`workspace: ${displayedWorkspace.root}`, props.width - 4)}</text>
          )}
          {props.view === null && props.layoutMode === "wide" && (
            <text>trust: {displayedWorkspace.trust}</text>
          )}
          {props.view === null &&
            props.surface === "workspace" &&
            !props.profileEditorFocused &&
            !props.readinessConfirmationFocused &&
            props.overlay !== "palette" &&
            props.overlay !== "help" && (
              <box style={{ flexDirection: "column" }}>
                <text>
                  task start: {props.review.authority.taskStart} · profile:{" "}
                  {props.profileCatalog?.activeProfileId ?? "not configured"} · readiness:{" "}
                  {props.providerReadiness?.state ?? "loading"}
                </text>
                <text>
                  {fitTerminalLine(
                    `context: ${props.review.context.state} · repository: read disabled · write denied`,
                    props.width - 4,
                  )}
                </text>
                {props.review.repository !== undefined && (
                  <box style={{ flexDirection: "column" }}>
                    <text>
                      {props.compact
                        ? `repo: ${props.review.repository.state} · rg ${props.review.repository.ripgrep.state} · Git ${props.review.repository.git.state} · g recheck`
                        : `repository prerequisites: ${props.review.repository.state} · ripgrep ${props.review.repository.ripgrep.state} · Git ${props.review.repository.git.state}`}
                    </text>
                    {props.layoutMode === "wide" &&
                      props.review.repository.ripgrep.state === "blocked" && (
                        <box style={{ flexDirection: "column" }}>
                          <text fg="#ED8796">
                            {fitTerminalLine(
                              `ripgrep block: ${props.review.repository.ripgrep.error.message}`,
                              props.width - 4,
                            )}
                          </text>
                          <text>
                            {fitTerminalLine(
                              `ripgrep recovery: ${props.review.repository.ripgrep.error.suggestedActions[0] ?? ""}`,
                              props.width - 4,
                            )}
                          </text>
                        </box>
                      )}
                    {props.layoutMode === "wide" &&
                      props.review.repository.git.state === "blocked" && (
                        <box style={{ flexDirection: "column" }}>
                          <text fg="#ED8796">
                            {fitTerminalLine(
                              `Git block: ${props.review.repository.git.error.message}`,
                              props.width - 4,
                            )}
                          </text>
                          <text>
                            {fitTerminalLine(
                              `Git recovery: ${props.review.repository.git.error.suggestedActions[0] ?? ""}`,
                              props.width - 4,
                            )}
                          </text>
                        </box>
                      )}
                    {props.layoutMode === "wide" && <text>repository prerequisite recheck: g</text>}
                  </box>
                )}
                {props.review.context.instructions.length > 0 && (
                  <text>
                    {fitTerminalLine(
                      `context sources: ${props.review.context.instructions
                        .map((instruction) => instruction.sourcePath)
                        .join(", ")}`,
                      props.width - 4,
                    )}
                  </text>
                )}
                <text>
                  {props.profileCatalog?.activeProfileId === null
                    ? "execution: fake-only · network denied · sandbox not-configured"
                    : "execution: provider model + semantic tools · repository write denied · sandbox not-configured"}
                </text>
                <text>Trust does not approve actions.</text>
                {props.review.notice !== null && (
                  <box style={{ flexDirection: "column" }}>
                    <text fg="#ED8796">
                      {fitTerminalLine(`notice: ${props.review.notice.message}`, props.width - 4)}
                    </text>
                    <text>
                      {fitTerminalLine(
                        `recovery: ${props.review.notice.suggestedActions[0] ?? ""}`,
                        props.width - 4,
                      )}
                    </text>
                  </box>
                )}
                {props.review.context.state === "blocked" && (
                  <box style={{ flexDirection: "column" }}>
                    <text fg="#ED8796">
                      {fitTerminalLine(
                        `context block: ${props.review.context.blocker.message}`,
                        props.width - 4,
                      )}
                    </text>
                    <text>
                      {fitTerminalLine(
                        `context recovery: ${
                          props.review.context.blocker.suggestedActions[0] ?? ""
                        }`,
                        props.width - 4,
                      )}
                    </text>
                  </box>
                )}
                {props.review.context.state !== "blocked" && (
                  <box style={{ flexDirection: "column" }}>
                    <text>
                      profile: p · connection check: c · repository recheck: g · history: h · trust:
                      t · revoke: r
                    </text>
                    <text>history runs: {props.catalog?.entries.length ?? 0}</text>
                  </box>
                )}
              </box>
            )}
          {props.view === null &&
            props.surface === "workspace" &&
            (props.profileEditorFocused || props.readinessConfirmationFocused) && (
              <box style={{ flexDirection: "column" }}>
                <text>
                  profile: {props.profileCatalog?.activeProfileId ?? "not configured"} · readiness:{" "}
                  {props.providerReadiness?.state ?? "loading"}
                </text>
                <text>context: {props.review.context.state}</text>
                <text>authority: repository read disabled/write denied · network denied</text>
              </box>
            )}
        </box>
      )}
      {props.surface === "history" && (
        <HistoryPanel
          catalog={props.catalog}
          compact={props.compact}
          error={props.historyError}
          height={Math.max(8, props.height - (props.compact ? 6 : 9))}
          selectedIndex={props.selectedIndex}
          width={props.width}
        />
      )}
      {props.surface === "inspection" && props.inspection !== null && (
        <InspectionPanel
          compact={props.compact}
          inspection={props.inspection}
          width={props.width}
        />
      )}
      {props.surface === "workspace" && props.view === null && props.profileEditorFocused && (
        <box style={{ flexDirection: "column", marginTop: 1 }}>
          <text>Provider profiles · values stay in host config.toml</text>
          {props.profileCatalog?.profiles.map((profile) => (
            <text key={profile.id}>
              {profile.id === props.profileCatalog?.activeProfileId ? ">" : "-"} {profile.id} ·
              {profile.model} · credential {profile.credential.presence} · {profile.readiness}
            </text>
          ))}
          <input
            focused
            onKeyDown={props.onProfileKeyDown}
            placeholder="id|base URL|model|billing|context|max output|env:NAME"
            value={props.profileDraft}
            onInput={props.onProfileDraftChange}
            onSubmit={props.onProfileSave}
            style={{ width: "100%" }}
          />
          <text>
            env:NAME or inline:value · Enter saves · Esc exits · outside: s select/x delete/l reload
          </text>
        </box>
      )}
      {props.surface === "workspace" &&
        props.view === null &&
        props.readinessConfirmationFocused && (
          <box style={{ flexDirection: "column", marginTop: 1 }}>
            <text>Provider connection check</text>
            <text>One fixed streamed prompt uses network access and may incur a small charge.</text>
            <text>confirm: y · cancel: n</text>
          </box>
        )}
      {props.surface === "workspace" &&
        props.view === null &&
        !props.profileEditorFocused &&
        !props.readinessConfirmationFocused &&
        props.overlay === null &&
        props.review?.authority.taskStart === "allowed" && (
          <box style={{ flexDirection: "column", marginTop: 1 }}>
            <text>Task</text>
            <input
              focused={props.composerFocused}
              onKeyDown={props.onComposerKeyDown}
              placeholder={
                props.profileCatalog?.activeProfileId === null ||
                props.profileCatalog?.activeProfileId === undefined
                  ? "Describe the fake task"
                  : "Ask a repository question"
              }
              value={props.draft}
              onInput={props.onDraftChange}
              onSubmit={() => props.onStart(props.draft)}
              style={{ width: "100%" }}
            />
            <text fg="#777777">
              {props.composerFocused
                ? "Enter submits · workspace trust does not approve the action"
                : "Enter focuses task · h opens history · r revokes workspace trust"}
            </text>
          </box>
        )}
      {props.surface === "workspace" && props.view !== null && props.overlay === null && (
        <box
          style={{
            flexDirection: "column",
            flexShrink: 0,
            marginTop: tuiDesignTokens.spacing.section,
          }}
        >
          <text>
            {fitTerminalLine(
              props.layoutMode === "narrow"
                ? `view: ${props.runPane} · Ctrl+P switches conversation/context/recovery`
                : props.layoutMode === "medium"
                  ? "composition: conversation + contextual drawer"
                  : "composition: session navigation + conversation + review pane",
              props.width - 4,
            )}
          </text>
          {props.view.approval !== null && (
            <box style={{ flexDirection: "column", flexShrink: 0, width: "100%" }}>
              <text fg={tuiDesignTokens.color.awaiting}>
                approval: pending · focus {props.focusId ?? "none"} · a approve · d deny
              </text>
              <text>{fitTerminalLine(`scope: ${props.view.approval.scope}`, props.width - 4)}</text>
            </box>
          )}
          {props.layoutMode === "narrow" &&
            props.runPane !== "conversation" &&
            outcome?.state === "completed" && (
              <box style={{ flexDirection: "column", flexShrink: 0, width: "100%" }}>
                <text>COMPLETE ANSWER · pinned</text>
                <text>{safeTerminalBlock(outcome.answer)}</text>
              </box>
            )}
          <box
            style={{
              flexDirection: props.layoutMode === "narrow" ? "column" : "row",
              gap: density.gap,
              width: "100%",
            }}
          >
            {props.layoutMode === "wide" && (
              <box
                style={{
                  border: tuiDesignTokens.border.panel,
                  flexDirection: "column",
                  padding: tuiDesignTokens.spacing.panel,
                  width: 22,
                }}
              >
                <text>SESSION</text>
                <text>{props.view.runId}</text>
                <text>phase {props.view.phase}</text>
                <text>turns {props.view.conversation?.length ?? 0}</text>
                <text>tools {props.view.tools?.length ?? 0}</text>
              </box>
            )}
            <box
              style={{
                flexDirection: "column",
                width:
                  props.layoutMode === "wide"
                    ? Math.max(36, props.width - 58)
                    : props.layoutMode === "medium"
                      ? Math.max(36, props.width - 31)
                      : "100%",
              }}
            >
              <text>phase: {props.view.phase}</text>
              <text>
                {props.view.attempts === undefined
                  ? "authority: repository read bounded · write denied · process fake-only · network denied"
                  : "authority: repository read bounded · write denied · trusted-host policy-only · provider network allowed"}
              </text>
              {conversationVisible && (
                <box style={{ flexDirection: "column", width: "100%" }}>
                  <text>CONVERSATION</text>
                  {props.liveModelText !== null && props.view.terminalOutcome === null && (
                    <box
                      style={{
                        border: density.border,
                        flexDirection: "column",
                        padding: density.padding,
                      }}
                    >
                      <text>assistant · live</text>
                      <text>{safeTerminalBlock(props.liveModelText)}</text>
                    </box>
                  )}
                  {props.view.conversation?.map((turn) => (
                    <box
                      key={turn.turnId}
                      style={{
                        border: density.border && turn.role === "assistant",
                        flexDirection: "column",
                        padding: tuiDesignTokens.spacing.none,
                        width: "100%",
                      }}
                    >
                      <text>{turn.role === "user" ? "you" : `assistant · ${turn.status}`}</text>
                      <text>{safeTerminalBlock(turn.content)}</text>
                    </box>
                  ))}
                  {props.view.repositoryCheck !== undefined && (
                    <RepositoryCheckCard
                      repositoryCheck={props.view.repositoryCheck}
                      width={props.width}
                    />
                  )}
                  {outcome !== null && outcome !== undefined && (
                    <box
                      style={{
                        flexDirection: "column",
                        marginTop: tuiDesignTokens.spacing.section,
                      }}
                    >
                      <text>outcome: {outcome.state}</text>
                      {outcome.state === "succeeded" && (
                        <text>
                          {fitTerminalLine(`evidence: ${outcome.evidenceRef}`, props.width - 4)}
                        </text>
                      )}
                      {outcome.state === "completed" &&
                        !props.view.conversation?.some(
                          (turn) =>
                            turn.role === "assistant" &&
                            turn.status === "complete" &&
                            turn.content === outcome.answer,
                        ) && <text>{safeTerminalBlock(outcome.answer)}</text>}
                      {(outcome.state === "blocked" || outcome.state === "failed") && (
                        <text fg={tuiDesignTokens.color.danger}>
                          {fitTerminalLine(`error: ${outcome.error.message}`, props.width - 4)}
                        </text>
                      )}
                      {check !== undefined && <text>check: {check.status}</text>}
                      <text>q exits</text>
                    </box>
                  )}
                </box>
              )}
              {contextVisible && (
                <box style={{ flexDirection: "column", width: "100%" }}>
                  <text>CONTEXT + TOOL EVIDENCE</text>
                  {props.view.attempts?.map((attempt) => (
                    <text key={attempt.attemptId}>
                      model attempt {attempt.step}: {attempt.state} · usage {attempt.usage.state}
                    </text>
                  ))}
                  {props.view.tools?.map((activity) => (
                    <ToolCard
                      activity={activity}
                      compact={props.compact}
                      expanded={props.expandedToolIds.has(activity.call.toolCallId)}
                      key={activity.call.toolCallId}
                    />
                  ))}
                </box>
              )}
              {recoveryVisible && (
                <box style={{ flexDirection: "column", width: "100%" }}>
                  <text>APPROVAL + RECOVERY</text>
                  {props.view.approval !== null && (
                    <scrollbox
                      focused={props.focusId === "run.approve" || props.focusId === "run.deny"}
                      scrollY
                      style={{
                        border: density.border,
                        flexDirection: "column",
                        height: Math.max(8, props.height - 22),
                        padding: density.padding,
                        width: "100%",
                      }}
                    >
                      <text fg={tuiDesignTokens.color.awaiting}>
                        approval: pending · workspace trust is separate
                      </text>
                      <text>action: {props.view.approval.canonicalDisplay}</text>
                      <text>cwd: {props.view.approval.cwd}</text>
                      <text>reason: {props.view.approval.reason}</text>
                      <text>scope: {props.view.approval.scope}</text>
                      <text>digest: {props.view.approval.digest}</text>
                      {props.view.approval.authority !== undefined && (
                        <>
                          <text>
                            policy: {props.view.approval.authority.policyRuleId} ·{" "}
                            {props.view.approval.authority.policyRuleSetRevision}
                          </text>
                          <text>
                            authority: one use at proposal revision{" "}
                            {props.view.approval.authority.proposalRevision}
                          </text>
                          <text>
                            execution: trusted host · isolation{" "}
                            {props.view.approval.authority.isolation} · network{" "}
                            {props.view.approval.authority.network}
                          </text>
                          {props.view.approval.authority.baseSnapshots.map((snapshot) => (
                            <text key={snapshot.path}>
                              base: {snapshot.path} · {snapshot.byteLength} bytes ·{" "}
                              {snapshot.sha256}
                            </text>
                          ))}
                        </>
                      )}
                      <text>approve: a · deny: d</text>
                    </scrollbox>
                  )}
                  {props.view.phase === "awaiting-retry" && (
                    <box
                      style={{
                        border: density.border,
                        flexDirection: "column",
                        padding: density.padding,
                      }}
                    >
                      <text fg={tuiDesignTokens.color.danger}>
                        model attempt: interrupted or unknown
                      </text>
                      <text>
                        {fitTerminalLine(
                          props.view.retry?.reason?.message ?? "Explicit retry is required.",
                          props.width - 4,
                        )}
                      </text>
                      <text>retry from last committed turn: u · cancel: Ctrl+C</text>
                    </box>
                  )}
                  {props.view.approval === null &&
                    props.view.phase !== "awaiting-retry" &&
                    (props.view.review === undefined ? (
                      <text fg={tuiDesignTokens.color.muted}>
                        No approval or recovery is active.
                      </text>
                    ) : (
                      <SafeActuationReview
                        focused={props.focusId === "run.review"}
                        height={Math.max(12, props.height - 24)}
                        review={props.view.review}
                      />
                    ))}
                </box>
              )}
            </box>
            {props.layoutMode !== "narrow" && (
              <box
                style={{
                  border: tuiDesignTokens.border.panel,
                  flexDirection: "column",
                  padding: tuiDesignTokens.spacing.panel,
                  width: props.layoutMode === "medium" ? 28 : 32,
                }}
              >
                <text>{props.layoutMode === "medium" ? "CONTEXT DRAWER" : "REVIEW"}</text>
                <text>context {props.review?.context.state ?? "unavailable"}</text>
                <text>attempts {props.view.attempts?.length ?? 0}</text>
                <text>tools {props.view.tools?.length ?? 0}</text>
                <text>outcome {props.view.terminalOutcome?.state ?? "pending"}</text>
                <text>recovery {props.view.retry?.available === true ? "available" : "none"}</text>
              </box>
            )}
          </box>
        </box>
      )}
    </box>
  );
}

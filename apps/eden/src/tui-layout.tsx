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

import { HistoryPanel, InspectionPanel } from "./tui-history.tsx";
import { fitTerminalLine, safeTerminalBlock } from "./tui-text.ts";

function ToolCard({
  activity,
  compact,
}: {
  readonly activity: NonNullable<ProductView["tools"]>[number];
  readonly compact: boolean;
}) {
  const path = activity.call.name === "git_status" ? "." : activity.call.arguments.path;
  const safePath = fitTerminalLine(path, Number.MAX_SAFE_INTEGER);
  const result = activity.result;
  return (
    <box
      style={{
        border: !compact,
        flexDirection: "column",
        padding: compact ? 0 : 1,
        width: "100%",
      }}
    >
      <text>
        repository tool: {activity.call.name} · {activity.state}
      </text>
      <text>source: {safePath} · authority: bounded read-only</text>
      {result?.status === "failed" && <text fg="#ED8796">tool error: {result.error.message}</text>}
      {result?.status === "succeeded" && result.name === "read_file" && (
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
      {result?.status === "succeeded" && result.name === "list_files" && (
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
      {result?.status === "succeeded" && result.name === "search_repository" && (
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
      {result?.status === "succeeded" && result.name === "git_status" && (
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

export type EdenTuiLayoutProps = {
  readonly catalog: RunCatalog | null;
  readonly compact: boolean;
  readonly composerFocused: boolean;
  readonly draft: string;
  readonly error: string | null;
  readonly height: number;
  readonly historyError: ProductError | null;
  readonly inspection: RunInspection | null;
  readonly liveModelText: string | null;
  readonly onDraftChange: (value: string) => void;
  readonly onProfileDraftChange: (value: string) => void;
  readonly onProfileSave: () => Promise<void>;
  readonly onStart: (task: string) => Promise<void>;
  readonly review: WorkspaceReview | null;
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
  return (
    <box style={{ flexDirection: "column", padding: 1, width: "100%", height: "100%" }}>
      <text fg="#8BD5CA">Eden R2 · no credential required for R1 demo</text>
      {props.surface === "workspace" && props.error !== null && (
        <text fg="#ED8796">{fitTerminalLine(`error: ${props.error}`, props.width - 4)}</text>
      )}
      {!props.compact && (
        <text>
          viewport: {props.width}x{props.height}
        </text>
      )}
      {props.review === null && <text>Loading workspace review…</text>}
      {props.review !== null && displayedWorkspace !== undefined && (
        <box style={{ flexDirection: "column" }}>
          <text>{fitTerminalLine(`workspace: ${displayedWorkspace.root}`, props.width - 4)}</text>
          <text>trust: {displayedWorkspace.trust}</text>
          {props.view === null &&
            props.surface === "workspace" &&
            !props.profileEditorFocused &&
            !props.readinessConfirmationFocused && (
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
                    {!props.compact && props.review.repository.ripgrep.state === "blocked" && (
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
                    {!props.compact && props.review.repository.git.state === "blocked" && (
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
                    {!props.compact && <text>repository prerequisite recheck: g</text>}
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
          height={props.height}
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
        props.review?.authority.taskStart === "allowed" && (
          <box style={{ flexDirection: "column", marginTop: 1 }}>
            <text>Task</text>
            <input
              focused={props.composerFocused}
              placeholder={
                props.profileCatalog?.activeProfileId === null
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
      {props.surface === "workspace" && props.view !== null && (
        <box style={{ flexDirection: "column", marginTop: 1 }}>
          <text>phase: {props.view.phase}</text>
          <text>
            {props.view.attempts === undefined
              ? "authority: repository read bounded · write denied · process fake-only · network denied"
              : "authority: repository read bounded · write denied · trusted-host policy-only · provider network allowed"}
          </text>
          {!props.compact && (
            <text>
              progress: {props.view.progress?.completed ?? 0}/{props.view.progress?.total ?? 3}
            </text>
          )}
          {!props.compact && <text>timeline: {props.timeline.join(" > ")}</text>}
          {props.liveModelText !== null && props.view.terminalOutcome === null && (
            <box
              style={{
                border: !props.compact,
                flexDirection: "column",
                padding: props.compact ? 0 : 1,
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
                border: !props.compact && turn.role === "assistant",
                flexDirection: "column",
                padding: props.compact || turn.role === "user" ? 0 : 1,
                width: "100%",
              }}
            >
              <text>{turn.role === "user" ? "you" : `assistant · ${turn.status}`}</text>
              <text>{safeTerminalBlock(turn.content)}</text>
            </box>
          ))}
          {!props.compact &&
            props.view.attempts?.map((attempt) => (
              <text key={attempt.attemptId}>
                model attempt {attempt.step}: {attempt.state} · usage {attempt.usage.state}
              </text>
            ))}
          {props.view.tools?.map((activity) => (
            <ToolCard activity={activity} compact={props.compact} key={activity.call.toolCallId} />
          ))}
          {props.view.approval !== null && (
            <box
              style={{
                border: !props.compact,
                flexDirection: "column",
                padding: props.compact ? 0 : 1,
                width: "100%",
              }}
            >
              <text>approval: pending · workspace trust is separate</text>
              <text>
                {fitTerminalLine(
                  `action: ${props.view.approval.canonicalDisplay}`,
                  props.width - 4,
                )}
              </text>
              <text>{fitTerminalLine(`cwd: ${props.view.approval.cwd}`, props.width - 4)}</text>
              {!props.compact && (
                <text>
                  {fitTerminalLine(`reason: ${props.view.approval.reason}`, props.width - 4)}
                </text>
              )}
              <text>{fitTerminalLine(`scope: ${props.view.approval.scope}`, props.width - 4)}</text>
              <text>approve: a · deny: d</text>
            </box>
          )}
          {props.view.phase === "awaiting-retry" && (
            <box
              style={{
                border: !props.compact,
                flexDirection: "column",
                padding: props.compact ? 0 : 1,
              }}
            >
              <text fg="#ED8796">model attempt: interrupted or unknown</text>
              <text>
                {fitTerminalLine(
                  props.view.retry?.reason?.message ?? "Explicit retry is required.",
                  props.width - 4,
                )}
              </text>
              <text>retry from last committed turn: u · cancel: Ctrl+C</text>
            </box>
          )}
          {outcome !== null && outcome !== undefined && (
            <box style={{ flexDirection: "column", marginTop: 1 }}>
              <text>outcome: {outcome.state}</text>
              {outcome.state === "succeeded" && (
                <text>{fitTerminalLine(`evidence: ${outcome.evidenceRef}`, props.width - 4)}</text>
              )}
              {outcome.state === "completed" && <text>{safeTerminalBlock(outcome.answer)}</text>}
              {(outcome.state === "blocked" || outcome.state === "failed") && (
                <text>{fitTerminalLine(`error: ${outcome.error.message}`, props.width - 4)}</text>
              )}
              {check !== undefined && <text>check: {check.status}</text>}
              <text>q exits</text>
            </box>
          )}
        </box>
      )}
    </box>
  );
}

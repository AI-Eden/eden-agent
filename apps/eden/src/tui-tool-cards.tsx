import type { RepositoryToolCall, RepositoryToolResult, ToolActivity } from "@eden/contracts";

import { tuiDesignTokens } from "./tui-design.ts";
import { fitTerminalLine, safeTerminalBlock } from "./tui-text.ts";

type ToolPresentation = {
  readonly authority: string;
  readonly label: string;
};

export const toolPresentationRegistry = {
  anchor_edit: {
    authority: "digest-bound approval-gated repository write",
    label: "modify file",
  },
  git_diff: {
    authority: "bounded read-only repository capability",
    label: "diff",
  },
  git_status: {
    authority: "bounded read-only repository capability",
    label: "status",
  },
  list_files: {
    authority: "bounded read-only repository capability",
    label: "list files",
  },
  read_file: {
    authority: "bounded read-only repository capability",
    label: "read file",
  },
  repository_check: {
    authority: "digest-bound approval-gated isolated check",
    label: "repository check",
  },
  run_command: {
    authority: "approved structured host command · digest-bound one-use authority",
    label: "command",
  },
  search_repository: {
    authority: "bounded read-only repository capability",
    label: "search",
  },
  write_file: {
    authority: "digest-bound approval-gated exclusive repository write",
    label: "create file",
  },
} as const satisfies Record<RepositoryToolCall["name"], ToolPresentation>;

function sourceForCall(call: RepositoryToolCall): string {
  switch (call.name) {
    case "git_status":
      return ".";
    case "repository_check":
      return `.eden/checks:${call.arguments.checkName}`;
    case "run_command":
      return call.arguments.cwd;
    case "anchor_edit":
    case "git_diff":
    case "list_files":
    case "read_file":
    case "search_repository":
    case "write_file":
      return call.arguments.path;
  }
}

function SucceededResult({ result }: { readonly result: RepositoryToolResult }) {
  if (result.status !== "succeeded") return null;
  switch (result.name) {
    case "read_file":
      return (
        <box style={{ flexDirection: "column" }}>
          <text>
            bytes: {result.data.offset}+{result.data.bytesRead}/{result.data.totalBytes} · next:{" "}
            {result.data.nextOffset ?? "complete"}
          </text>
          <text>hash: {result.data.contentHash}</text>
          <text>repository result:</text>
          <text>{safeTerminalBlock(result.data.content)}</text>
        </box>
      );
    case "list_files":
      return (
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
      );
    case "search_repository":
      return (
        <box style={{ flexDirection: "column" }}>
          <text>
            matches: {result.data.matches.length} · engine: {result.data.engine.name}{" "}
            {result.data.engine.version} · next: {result.data.continuation ?? "complete"}
          </text>
          <text>hash: {result.data.contentHash}</text>
          {result.data.matches.map((match) => (
            <text key={`${match.path}:${match.lineNumber}:${match.byteColumn}`}>
              {fitTerminalLine(match.path, Number.MAX_SAFE_INTEGER)}:{match.lineNumber}:
              {match.byteColumn}: {safeTerminalBlock(match.preview)}
            </text>
          ))}
        </box>
      );
    case "git_status":
      return (
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
      );
    case "git_diff":
      return (
        <box style={{ flexDirection: "column" }}>
          <text>
            bytes: {result.data.offset}+{result.data.bytesRead}/{result.data.totalBytes} · next:{" "}
            {result.data.continuation?.nextOffset ?? "complete"}
          </text>
          <text>
            HEAD: {result.data.head} · status: {result.data.statusHash}
          </text>
          <text>patch: {result.data.patchHash}</text>
          <text>repository diff:</text>
          <text>{safeTerminalBlock(result.data.content)}</text>
        </box>
      );
  }
}

function CompletedResult({ result }: { readonly result: RepositoryToolResult }) {
  if (result.status !== "completed") return null;
  switch (result.name) {
    case "anchor_edit":
    case "write_file":
      return (
        <box style={{ flexDirection: "column" }}>
          <text>
            action: {result.data.actionId} · review: {result.data.reviewStatus}
          </text>
          <text>
            changed: {result.data.path} · {result.data.byteLength} bytes
          </text>
          <text>content hash: {result.data.contentHash}</text>
        </box>
      );
    case "run_command":
      return (
        <box style={{ flexDirection: "column" }}>
          <text>
            outcome: {result.data.outcome} · exit: {result.data.exitCode ?? "none"} · cleanup:{" "}
            {result.data.cleanupStatus}
          </text>
          <text>action: {result.data.actionId}</text>
          <text>
            executable: {fitTerminalLine(result.data.executablePath, Number.MAX_SAFE_INTEGER)}
          </text>
          <text>
            stdout: {result.data.stdoutBytes} bytes · {result.data.stdoutSha256}
          </text>
          <text>{safeTerminalBlock(result.data.stdout)}</text>
          <text>
            stderr: {result.data.stderrBytes} bytes · {result.data.stderrSha256}
          </text>
          <text>{safeTerminalBlock(result.data.stderr)}</text>
        </box>
      );
    case "repository_check":
      return (
        <box style={{ flexDirection: "column" }}>
          <text>
            action: {result.data.actionId} · check: {result.data.checkName} · outcome:{" "}
            {result.data.outcome}
          </text>
          <text>
            exit: {result.data.exitCode ?? "none"} · cleanup: {result.data.cleanupStatus} · profile:{" "}
            {result.data.profileRevision}
          </text>
          <text>input: {result.data.inputManifestDigest}</text>
          <text>image index: {result.data.imageIndexDigest}</text>
          <text>platform manifest: {result.data.platformManifestDigest}</text>
          <text>
            stdout: {result.data.stdoutSha256} · stderr: {result.data.stderrSha256}
          </text>
        </box>
      );
  }
}

function DeniedResult({ result }: { readonly result: RepositoryToolResult }) {
  if (result.status !== "denied") return null;
  switch (result.name) {
    case "anchor_edit":
      return (
        <box style={{ flexDirection: "column" }}>
          <text fg={tuiDesignTokens.color.awaiting}>
            denied · parent action {result.data.parentActionId}
          </text>
          <text>{result.data.reason}</text>
        </box>
      );
    case "repository_check":
      return (
        <box style={{ flexDirection: "column" }}>
          <text fg={tuiDesignTokens.color.awaiting}>denied · check {result.data.checkName}</text>
          <text>{result.data.reason}</text>
        </box>
      );
  }
}

function ToolResult({ result }: { readonly result: RepositoryToolResult }) {
  switch (result.status) {
    case "failed":
      return (
        <box style={{ flexDirection: "column" }}>
          <text fg={tuiDesignTokens.color.danger}>
            tool error: {result.error.code} · {result.error.message}
          </text>
          <text>recovery: {result.error.suggestedActions[0] ?? "none"}</text>
        </box>
      );
    case "succeeded":
      return <SucceededResult result={result} />;
    case "completed":
      return <CompletedResult result={result} />;
    case "denied":
      return <DeniedResult result={result} />;
  }
}

export function ToolCard({
  activity,
  compact,
  expanded,
}: {
  readonly activity: ToolActivity;
  readonly compact: boolean;
  readonly expanded: boolean;
}) {
  const presentation = toolPresentationRegistry[activity.call.name];
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
        {presentation.label} · {activity.call.name} · {activity.state}
      </text>
      {expanded && (
        <text>
          source: {fitTerminalLine(sourceForCall(activity.call), Number.MAX_SAFE_INTEGER)} ·
          authority: {presentation.authority}
        </text>
      )}
      <text>
        {fitTerminalLine(
          "tool details: " +
            (expanded ? "expanded" : "folded") +
            " · focus tools + Enter/e toggles",
          compact ? 56 : Number.MAX_SAFE_INTEGER,
        )}
      </text>
      {expanded && activity.result !== null && <ToolResult result={activity.result} />}
    </box>
  );
}

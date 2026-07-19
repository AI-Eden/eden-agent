# Product Contracts

## Purpose

Product contracts allow the terminal, headless client, and later desktop client to share one runtime without sharing renderer state or internal kernel details.

## Commands

The initial command families are run lifecycle, steering, approval resolution, and artifact requests. Commands express user intent and include optimistic concurrency or cursor data where stale clients could be harmful.

The pre-run workspace command family resolves trust or restriction for the exact workspace ID and expected
workspace revision. It cannot approve an action or grant another capability.

## Events

The initial event families are session snapshot, phase and progress, approval presentation, change-set update, verification update, artifact publication, and terminal outcome.

Approval events contain the canonical display representation and digest that execution will revalidate. Verification events separate required, optional, skipped, and infrastructure-failed checks.

## Errors

Errors are structured with a stable code, human-readable message, recoverability class, and suggested actions. Recoverability is one of retry, reconfigure, ask-user, or fatal. Stack traces and provider payloads belong in redacted diagnostics, not product copy.

## Versioning

The product protocol and journal schema have separate versions. A client negotiates protocol compatibility; journal migrations happen inside the authoritative runtime. Adding optional fields is preferred, while semantic changes require a versioned event or command.

Pre-release protocol v1 run IDs use `^run-[a-z0-9][a-z0-9-]{0,123}$`. Production generates
`run-<uuid>`. The prefix, lowercase alphabet, and 128-character bound make the public identity safe as one
cross-platform state-path segment; clients never pass a raw path as a run ID.

## AgentClient

All clients use this renderer-independent port:

```ts
interface AgentClient {
  getWorkspaceReview(): Promise<WorkspaceReview>;
  getProviderProfiles(): Promise<ProviderProfileCatalog>;
  getProviderReadiness(): Promise<ProviderReadiness>;
  reloadProviderProfiles(): Promise<ProviderProfileCatalog>;
  saveProviderProfile(command: SaveProviderProfileCommand): Promise<ProviderProfileCatalog>;
  selectProviderProfile(command: SelectProviderProfileCommand): Promise<ProviderProfileCatalog>;
  deleteProviderProfile(command: DeleteProviderProfileCommand): Promise<ProviderProfileCatalog>;
  checkProviderReadiness(
    command: ProviderReadinessCommand,
    options?: { signal?: AbortSignal },
  ): Promise<ProviderReadiness>;
  getRunCatalog(options?: { signal?: AbortSignal }): Promise<RunCatalog>;
  inspectRun(
    runId: RunId,
    options?: { signal?: AbortSignal },
  ): Promise<RunInspection>;
  resolveWorkspaceTrust(
    command: ResolveWorkspaceTrustCommand,
    options?: { signal?: AbortSignal },
  ): Promise<WorkspaceReview>;
  submit(command: ProductCommand, options?: { signal?: AbortSignal }): Promise<ProductView>;
  getSnapshot(runId: RunId): Promise<ProductView>;
  subscribe(
    runId: RunId,
    afterCursor?: EventCursor,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ProductEvent>;
  close(): Promise<void>;
}
```

`WorkspaceReview` is the pre-run projection. During the R1 compatibility path it retains the deterministic
fake/no-credential profile. The R2 host client replaces that profile value with the masked active profile
or an explicit unconfigured state while retaining canonical workspace identity and exact authority truth.
Only the R1 fake task-start capability changes from blocked to allowed when trust is granted; a later R2
repository run also requires current readiness and repository prerequisites.

The R1 implementation is in-process, replay-backed, and then live. It enforces run identity and optimistic
revision freshness before append, exposes only product projections, and keeps `AbortSignal` cancellation
separate from the durable `run.cancel` command. R5 may add local IPC without changing product semantics.

Opening a client does not create a run. Restricted `run.start` returns `workspace_trust_required` and
appends nothing. Once accepted, `run.started` carries the runtime-owned workspace snapshot so later trust
changes cannot alter historical product views.

The first R2 Build slice implements renderer-neutral profile CRUD. `config.toml` is authoritative, catalog
revisions are content-derived, environment credentials expose only named presence, inline values are masked
while entered and never appear in projections, and list/check output remains closed JSON. The remaining
approved R2 extension adds repository/context summaries, explicit retry, and live model-stream updates.
Profile projections expose credential presence and source identity without the value. Durable
`ProductEvent` remains closed journal-derived truth; live deltas are a separate transient client signal and
never become replay or later-context authority. A repository run remains blocked until exact workspace
trust, current profile readiness, compatible Git, and P0 context fit are all current.

The Slice 2 readiness action accepts only a command that confirms the possible charge. Saving or inspecting
a profile never sends a provider request. The adapter uses one fixed prompt with no repository context or
tools, an 8-token streamed completion cap, explicit non-thinking mode, and no SDK retry. A non-empty
reasoning delta fails closed rather than consuming the fixed-answer budget. `completion_ready` persists only
as a salted host fingerprint and timestamp, so changing parsed profile content or the resolved credential
returns the profile to `configured`. Closed recovery values contain fixed copy, status family, bounded
request ID, and profile/model identity; they never contain the credential or raw provider payload.

## Context admission

`WorkspaceReview.context` is a required closed summary with `restricted`, `unconfigured`, `ready`, or
`blocked` state. R2 `ProductView` values may carry the same summary while existing R1 journal projections
remain compatible. The summary contains no instruction text. It exposes complete instruction provenance,
the explicit input/output/safety budget, and one item ledger with source, scope, token estimate, P0/P1/P2
priority, selection reason, and `complete` or `omitted` disposition.

Restricted review has no instruction or item entries. Trusted review requires explicit active-profile
limits before admission. Applicable instruction snapshots identify `sourcePath`, `scopePath`, SHA-256
content hash, root-to-leaf precedence, selection reason, and the context item IDs that activated them.
Missing limits, invalid paths or metadata, unavailable/linked/oversized/conflicting instructions,
aggregate instruction overflow, P0 overflow, or a snapshot change produce a closed blocker before the
provider callback. P1/P2 omission is deterministic and visible; no model-generated compaction exists in
this slice.

## Repository tool activity

Protocol v1 admits one closed `list_files`, `read_file`, `search_repository`, or `git_status` call per
fake-model run. Calls carry a
runtime-correlated tool-call ID and root-relative semantic arguments; they never carry an executable, cwd,
environment, shell, or write request. Results are terminal `succeeded` or `failed` values with the same
tool-call ID and name. Successful list pages include bounded typed rows, visited count, continuation, source
path, and SHA-256 hash. Successful read pages include complete UTF-8 text for the accepted byte range,
exact offset/length/total, continuation, source path, and SHA-256 hash.

Successful search pages include at most 256 parsed path/line/byte-column/preview matches and 24 KiB,
integer continuation, result hash, source path, and the verified ripgrep version/content hash. Successful
Git-status results include at most 256 parsed ordinary/rename/copy/unmerged/untracked rows and 24 KiB,
result hash, source path, and probed Git version. Neither value exposes native stdout/stderr or process
configuration.

`WorkspaceReview.repository` projects the independently ready/blocked ripgrep and Git prerequisites.
Ripgrep requires the target-specific closed `eden-assets.json`, the exact application-local filename,
version 15.0.0, and matching SHA-256. Git requires host version 2.31.0 or newer. Missing, modified, wrong-
target, incompatible, timeout, overflow, and malformed-output states carry fixed recovery without exposing
an executable path. TUI recheck repeats the probes and never installs or mutates a system package.

`ProductView.tools` and `tool.updated` expose the same requested/completed activity without renderer-owned
fields. Journal replay reconstructs the durable result without tool or model I/O. A failed tool result
blocks the run; a successful result permits exactly one fake-model continuation before the existing
runtime-owned approval action. Tool activity does not approve that action and cannot create terminal
success.

## Run catalog and inspection

The pre-release protocol v1 adds closed, non-throwing decoders for these renderer-independent values:

```ts
type AvailableRunSummary = {
  availability: "available";
  runId: RunId;
  task: string;
  startedAt: string;
  updatedAt: string;
  revision: number;
  phase: ProductPhase;
  terminalOutcome: TerminalOutcome | null;
};

type UnavailableRunSummary = {
  availability: "unavailable";
  runId: RunId;
  error: ProductError;
};

type RunCatalog = {
  protocolVersion: 1;
  workspace: WorkspaceSummary;
  entries: readonly (AvailableRunSummary | UnavailableRunSummary)[];
  truncated: boolean;
  notices: readonly ProductError[];
};

type RunInspection = {
  protocolVersion: 1;
  mode: "read-only";
  summary: AvailableRunSummary;
  view: ProductView;
};
```

An available summary derives its task and phase from replay, its revision and outcome from the projected
view, and its timestamps from the first and last validated journal records. The catalog returns at most
100 entries. Capacity is reserved for unavailable entries first in `runId` order, then filled with the
newest available entries within the visited candidate set. Returned available entries sort by `updatedAt`
descending and then `runId`; unavailable entries follow in `runId` order. Reaching the 512-child visit
budget sets `truncated` and does not imply that the returned set is globally newest. `truncated` reports
omitted attributable or invalid state without implying pagination. At most 16 deterministic invalid-state
notices are returned.

`notices` reports partition entries that cannot be represented as a run, such as an invalid name,
symlink, or non-directory. A valid run-ID directory with a missing, malformed, mismatched, or otherwise
unreadable journal remains an unavailable entry. Catalog collection continues after either condition and
never exposes partial journal-derived product truth.

`getRunCatalog` and `inspectRun` operate only on the client's canonical workspace partition and remain
available after trust revocation. `inspectRun` accepts only an available catalog run and verifies that the
summary, replayed view, run ID, and immutable workspace snapshot agree. Neither method appends, repairs,
reconciles, dispatches, or changes trust. An awaiting-approval or executing historical view remains
read-only and cannot be submitted back through the inspection path.

## Headless JSON

`eden exec --json "<task>"` writes one complete `ProductEvent` JSON object per stdout line in cursor order.
It writes no prose, ANSI sequence, kernel event, journal record, or diagnostic payload to stdout. The final
successful line is `run.terminal` with verifier evidence. Diagnostics are structured `ProductError` values
on stderr.

The deterministic fake action requires `--approve-fake-action` in non-interactive use. A fresh workspace
also requires `--trust-workspace`; a stored exact-root decision may be reused. Workspace trust and action
approval are separate commands and neither flag implies the other. Missing trust or approval, empty tasks,
and unknown arguments exit with code 2; runtime failures exit with code 1; verifier-backed success exits
with code 0.

`eden run list --json` writes exactly one `RunCatalog` JSON object and `eden run show --json <run-id>`
writes exactly one `RunInspection` JSON object. Both write no prose or ANSI sequences. An empty catalog is
successful. A partially unavailable catalog is also successful because every failure is explicit in the
closed value. A missing or wrong-workspace run exits `2` with `run_not_found` on stderr and empty stdout;
an attributed but unreadable run exits `1` with `run_history_unavailable` and empty stdout. Invalid command
shapes remain `invalid_arguments` with exit `2`.

## Contract tests

Fixtures must prove that:

- the same journal creates equivalent TUI and headless views;
- stale command versions are rejected safely;
- snapshots plus cursor events reconstruct the current view;
- internal events cannot leak unredacted secrets;
- clients cannot forge approval or terminal facts.
- catalog entries decode as closed values, remain scoped to one canonical workspace, and expose corruption
  without hiding valid runs;
- inspection values preserve exact summary/view identity and cannot become execution commands.

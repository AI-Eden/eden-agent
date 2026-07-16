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

`WorkspaceReview` is the pre-run projection. It exposes canonical workspace identity, restricted/trusted
state, the deterministic fake/no-credential profile, and fixed task-start, repository, process, network,
and sandbox truth. Only task start changes from blocked to allowed when trust is granted.

The R1 implementation is in-process, replay-backed, and then live. It enforces run identity and optimistic
revision freshness before append, exposes only product projections, and keeps `AbortSignal` cancellation
separate from the durable `run.cancel` command. R5 may add local IPC without changing product semantics.

Opening a client does not create a run. Restricted `run.start` returns `workspace_trust_required` and
appends nothing. Once accepted, `run.started` carries the runtime-owned workspace snapshot so later trust
changes cannot alter historical product views.

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

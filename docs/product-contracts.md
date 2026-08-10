# Product Contracts

## Purpose

Product contracts allow the terminal, headless client, and later desktop client to share one runtime without sharing renderer state or internal kernel details.

## Commands

The initial command families are run lifecycle, steering, approval resolution, and artifact requests. Commands express user intent and include optimistic concurrency or cursor data where stale clients could be harmful.

The pre-run workspace command family resolves trust or restriction for the exact workspace ID and expected
workspace revision. It cannot approve an action or grant another capability.

## Events

The target event families are session snapshot, phase and progress, approval presentation, change-set
update, check or verification update, artifact publication, and terminal outcome. The implemented
provider/repository-understanding protocol currently projects snapshots, progress, approval, tool/model
activity, verification placeholders, and outcomes; it does not yet implement a real change-set or artifact
event. A documented target is not evidence that its production schema exists.

Approval events contain the canonical display representation and digest that execution will revalidate. Verification events separate required, optional, skipped, and infrastructure-failed checks.

The accepted safe-actuation extension adds policy evaluation, single-use approval consumption,
action-observation, change-set, and closed-check facts.

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

## Safe-actuation activity

`ActionEnvelopeV1` is renderer-neutral and closed. Runtime code supplies canonical operation bytes,
workspace and cwd, normalized scope, complete base snapshots, policy revision, environment class, network
mode, execution mode, budgets, and proposal-revision lifetime. The model proposes only the typed operation;
the renderer can neither supply nor recompute the digest.

Policy activity exposes `allow`, `ask`, or `deny`, rule identity, rule-set revision, reason, and the
evaluated digest. An approval presentation adds canonical display, digest, single-use lifetime, and exact
authority truth. Approval resolution retains optimistic product revision. Durable approval consumption
must precede effect dispatch.

The first writable operation is one AnchorEdit against an existing tracked regular UTF-8 file. Its product
summary exposes path, complete base and desired hashes and lengths, replacement count, reason, scope, and
recovery state; it does not expose temporary paths, file descriptors, native argv, or raw diagnostics.

One denial is a durable non-terminal result. A child proposal includes `narrowerThanActionId`; runtime
accepts it only when the path/edit/capability and every execution budget are no broader. No product command
can declare itself narrower or consume an earlier approval.

Safe-actuation review contains:

```ts
type ChangeReview = {
  head: string;
  observedAt: string;
  statusHash: string;
  edenPatch: CompletePatch;
  currentTrackedPatch: CompletePatch;
  changedFiles: readonly ChangedFile[];
  baselineCheck: ClosedCheckObservation;
  currentCheck: ClosedCheckObservation;
  newlyObservedDiagnostics: readonly string[];
  executionMode: "trusted_host_policy_only";
  isolation: "none";
};
```

`CompletePatch` is complete within its declared limit or replaced by a structured blocker; it has no
truncated state. Changed-file attribution is `eden`, `pre_existing`, or `both` and derives from runtime
observations. Untracked paths may appear in status but their contents do not enter
`currentTrackedPatch`.

The first `ClosedCheckObservation` is only hardened `git diff --check`. A passing value is not verifier
evidence and cannot create `succeeded`. An edit/check flow reaches non-success `completed` review.

## Docker repository-check activity

The catalog summary exposes fixed path, schema version, current `HEAD`, tracked/dirty state, byte length,
content hash, selected name, and the exact literal container process. It contains no shell, interpolation,
parameter, environment, network, image, mount, resource, or approval field.

The canonical action presentation exposes:

- catalog, process, input-manifest, image-index, requested-platform, resolved-manifest, wrapper, and profile
  identities;
- read-only workspace/root, bounded temporary/result locations, closed environment, `network=none`, and
  omitted host authorities;
- memory, CPU, PID, file, time, stream, staging, and temporary-filesystem limits;
- policy rule/revision, proposal lifetime, digest, and the fact that repository-code execution always
  requires one exact approval.

Repository-check progress is a closed lifecycle value such as preparing, created, running, stopping,
reconciling, or cleaning. It never exports the host Docker executable, raw Docker argv, socket, credential,
or daemon diagnostics as user authority.

The terminal observation distinguishes passed, failed, timed out, cancelled, OOM, output overflow, engine
failure, cleanup failure, and unknown. It binds action/effect, input, image/platform, profile, receipt, and
cleanup identities. Separate stdout and stderr are complete within their fixed bounds and carry byte
counts and SHA-256 values. Overflow cannot decode as a pass.

Raw repository-check output is local product data. It is absent from provider context, private provider
continuity, ordinary diagnostics, and default evidence bundles. The provider may receive the closed
outcome needed to end the current R2 turn but cannot receive raw streams or propose repair/recheck in this
slice.

The TUI may resolve the exact approval and execute the check. Headless NDJSON emits the same durable facts
through `approval.presented`, then exits with structured recovery. No broad repository-check approval
flag, second-invocation continuation, or public general resume command is added.

`eden doctor --json` returns one versioned closed catalog of prerequisite rows. Plain doctor renders that
same value. Default rows are read-only. The explicit probe is a separate canonical diagnostic action with
no repository, provider, credential, or network; non-interactive JSON stops at its approval rather than
inventing a bypass.

The accepted 2026-07-31 amendment defines standalone Docker diagnostic action, approval command,
approval/recovery-required/recovery-resolved values, lifecycle event, result, receipt, cleanup, and
product-view families. They do not join the run-bound product unions. The probe accepts an optional
`--context <safe-name>` before optional `--json`; the name selects one existing context for both Doctor
and execution without changing the default context or accepting a raw host/socket. `eden doctor
--probe-docker --json` emits exactly one closed preview or recovery-required value, exits 2, and creates
no journal, lock, or Docker object. Interactive recovery may append an exact `not_started` closure or
reconcile only the durably identified object.

The image prerequisite exposes exact index, platform manifest, config digest, and evidence-source details.
Descriptor-capable stores must match their local descriptor. Classic stores may report the same frozen
manifest only after the exact platform config digest and fixed image configuration select the
application-owned mapping. Missing, malformed, mutable, or contradictory evidence remains blocked; no
registry or network fallback is part of Doctor or probe authority.

The probe action also binds the exact fixed `HOME`, `LANG`, `PATH`, and immutable-image
`SSL_CERT_FILE` values. Docker inspect may return them in any order, but the unique set must match exactly;
missing, duplicated, changed, inherited, or additional environment values block execution and recovery.

The owner accepted the repository-check and read-only Doctor contracts with ADR 0017 and separately
authorized Build on 2026-07-30. Read-only Doctor, repository-check dispatch, standalone probe contracts,
the runner, and deterministic active recovery are implemented and published. The passing real probe
recovered the same exact container from durable `effect_intent`, consumed no second approval, created no
duplicate object, recorded its receipt before cleanup, and returned the daemon to zero containers.

## Accepted R3 Freeze

The R3 protocol adds only closed renderer-neutral commands, events, and views. Every new action continues to use canonical identity, default-deny policy, exact approval where required, durable effect facts, and action-specific recovery.

### Usable coding activity

Budget product truth distinguishes the immutable `usable_coding_v1` policy maxima, the exact durable grant for this run, and monotonically consumed usage. ProductView shows remaining model, tool, action, time, content, output, record, and journal capacity without implying that the model must exhaust any value.

A read-only multi-call step projects one batch with one to four source-ordered calls and per-call pending, running, completed, failed, or cancelled state. Completion order may differ from display and model-context order; both are derived from durable events. An ineligible batch shows a non-effecting rejection reason. Approval, AnchorEdit, new-file, and command cards are never grouped as concurrently executable batch children.

`git_diff_v1` joins repository tool activity as a read-only semantic call with root-relative scope, continuation, current `HEAD`, source/status hashes, complete page identity, and bounded model/product content. It exposes no executable, argv, raw stdout/stderr, external diff driver, textconv, or environment.

`write_file_v1` is a canonical action whose product presentation shows path, target and parent absence identity, complete content length/hash, fixed mode, scope, reason, policy, one-use lifetime, trusted-host truth, and 32 KiB limit. Its result is created, stale, denied, cancelled, failed, or unknown. Product review can show the complete Eden-created patch while keeping the untracked path distinct from the tracked Git patch.

`run_command_v1` presents the resolved executable identity, literal argv, cwd, reason, scrubbed-environment class and identity, timeout, stdout/stderr and aggregate bounds, process-tree policy, `network=host_unrestricted`, `executionMode=trusted_host_policy_only`, `isolation=none`, policy decision, digest, and one-use lifetime. It has no shell text, stdin, environment values, broad approval flag, or isolation claim.

Tool and action failures carry stable code, recoverability, bounded evidence identity, and suggested next actions. A recoverable result may return to model context within budget. `unknown` process recovery never does; it projects a user decision boundary.

### Plan and Goal activity

New commands create or revise a journal-local `PlanArtifactV1`, approve its exact revision, select execution context policy, approve one `GoalSpecV1`, request pause/cancel/resume, and resolve existing exact action approvals. No command can forge plan approval, goal approval, consumed authority, verifier observations, Evidence Pack identity, or terminal success.

Product events project plan revision and approval, goal identity and budget, phase/checkpoint transitions, completion candidate, verification start/result, repair observation and remaining budget, Evidence Pack publication, and verifier terminal outcome. ProductView reconstructs the same facts from snapshot plus cursor events.

`eden run resume <run-id>` is an interactive execution command distinct from `eden run show --json <run-id>`. `eden run resume --json <run-id>` emits NDJSON from the exact replayed run and stops at approval boundaries rather than accepting a broad preapproval flag. Neither form may continue an unavailable, wrong-workspace, terminal, ambiguous, stale, or policy-incompatible run.

`EvidencePackV1` contains only durable verifier and runtime facts. Its public value includes artifact version, content hash and size, plan/goal identities, diff summary, check and artifact summaries, policy exceptions, budget use, environment/support metadata, and residual risk. Raw provider payloads, secrets, unrestricted command output, internal traces, and model-authored success prose are excluded.

### Optional R3-D activity

R3-D adds no contract until its separate owner activation. If activated under ADR 0019, its public boundary is exactly one read-only child lifecycle/result and two bounded web source activities. Absence of those variants is valid for R3-E and cannot be rendered as a hidden or disabled release requirement.

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
successful line for a verifier-backed run is `run.terminal` with verifier evidence. A real provider answer
or safe-actuation flow may instead stop at non-success `completed`, awaiting approval, denied, or
blocked. Diagnostics are structured `ProductError` values on stderr.

The deterministic fake action requires `--approve-fake-action` in non-interactive use. A fresh workspace
also requires `--trust-workspace`; a stored exact-root decision may be reused. Workspace trust and action
approval are separate commands and neither flag implies the other. Missing trust or approval, empty tasks,
and unknown arguments exit with code 2; runtime failures exit with code 1; verifier-backed success exits
with code 0.

The safe-actuation slice does not generalize `--approve-fake-action`, add a broad
`--approve-writes` flag, or add durable resume. Headless output must project the same action, policy,
denial, review, and check facts, but only an explicit product command carrying the current approval ID,
digest, and expected revision may resolve approval.

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
- plan, goal, checkpoint, repair, Evidence Pack, and verifier fixtures reject renderer- or model-forged authority;
- structured command fixtures reject shell text, environment injection, stale executable identity, broader network claims, and automatic retry after unknown dispatch;
- new-file fixtures reject overwrite, missing-parent creation, link or parent drift, over-budget content, and untracked/attributed-patch conflation;
- catalog entries decode as closed values, remain scoped to one canonical workspace, and expose corruption
  without hiding valid runs;
- inspection values preserve exact summary/view identity and cannot become execution commands.

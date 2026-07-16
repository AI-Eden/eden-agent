# R1 Run History and Read-Only Review Plan

- Status: Accepted by owner; exit-review defects transferred to the R1 exit-closure plan
- Date: 2026-07-16
- Roadmap stage: R1, Installable Walking Skeleton
- Baseline: `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f`
- Prior slice: `docs/plans/2026-07-15-r1-onboarding-workspace-trust.md`, accepted
- Decisions: approved 2026-07-16 as A/A/A/A/A/A
- Plan approval: 2026-07-16
- Accepted: 2026-07-16
- Human checkpoint: complete; the separate R1 exit review remains governed by the exit-closure plan

## Goal and user-visible outcome

Deliver the next bounded R1 vertical slice in which relaunching `eden` from one exact canonical workspace
can discover and inspect that workspace's prior fake-task runs without granting trust, continuing
execution, or reading raw journal files.

The default TUI must expose an explicit current-workspace history view. A selected available run opens a
clearly labeled read-only inspection reconstructed from its journal. A corrupt run remains visible as
unavailable while valid history remains usable. The headless surface must expose the same truth through
`eden run list --json` and `eden run show --json <run-id>`.

The slice also replaces the stale scaffold README and minimal help copy with an evidence-backed R1
Quickstart. It prepares, but does not perform, the R1 exit review. It does not implement resume, a real
provider, repository tools, policy, or sandbox authority.

## Current repository facts

- `InProcessAgentClient.open({ runId })` already rejects unknown runs, opens a known journal, and replays a
  journal-owned workspace snapshot. Tests prove the same historical view remains available after trust
  revocation.
- A caller must already know the run ID. `AgentClient` has no catalog or inspection contract, the TUI has
  no history state, and the CLI accepts only the default TUI, `exec --json`, and `--help`.
- `ProductView` does not expose the original task. The task remains in the validated `run.started` kernel
  event, while journal records already carry schema-validated ISO `recordedAt` timestamps.
- `FileJournal.open` creates parent directories and an append handle. It is correct for execution but
  cannot be used by read-only discovery because an inspection must not create or mutate state.
- New runs currently live at `<stateDirectory>/runs/<runId>/journal.jsonl`, with receipts beside the
  journal. That layout cannot attribute a completely corrupt journal to one exact workspace.
- ADR 0009 already fixes canonical workspace identity, keeps state outside the workspace, and says
  revocation blocks new runs without rewriting historical views.
- The first R1 plan explicitly deferred the session list, Quickstart polish, and R1 exit review. The
  second slice completed welcome/profile truth and workspace trust but kept history and general resume out
  of scope.
- The standalone artifact, headless fake-task path, OpenTUI path, journal replay, crash matrix, package
  smoke, and Ubuntu/Windows/macOS hosted workflow are green at the accepted baseline.
- `README.md` still calls the repository an R0 scaffold and says the CLI prints a scaffold message. The
  packaged `eden --help` omits implemented trust/approval behavior and all history commands.
- Current public tools use resume to mean continued execution. Claude Code documents `--continue` and
  `--resume`, OpenCode exposes session switching/continuation, and Codex uses a resume picker. Eden must
  not use that word for a read-only R1 projection:
  - <https://docs.anthropic.com/en/docs/claude-code/cli-usage>
  - <https://dev.opencode.ai/docs/cli/>
  - <https://github.com/openai/codex/issues/3309>

## Evidence and decision criteria

This slice optimizes for five properties:

1. **Journal authority:** catalog and inspection values come from validated journal bytes, not renderer
   filesystem guesses or a mutable second index.
2. **Exact workspace scope:** a client bound to canonical workspace A cannot enumerate or inspect runs
   from workspace B, including through symlink aliases.
3. **Read-only honesty:** inspection never appends, repairs, reconciles, dispatches, approves, cancels, or
   claims that R1 can resume execution.
4. **Visible recovery:** one corrupt run does not hide itself or block valid runs, and every unavailable
   state has a structured product error.
5. **Surface parity:** TUI and headless outputs decode through the same closed protocol values and the
   standalone artifact proves the behavior outside the checkout.

Evidence that would invalidate this plan is limited to proof that workspace partitioning weakens the
canonical identity boundary, that catalog inspection cannot remain effect-free through existing replay,
or that the required public values cannot fit pre-release protocol v1 without changing accepted command
or event semantics.

## Topology lock

The slice contains six independently verifiable components:

1. **Run catalog contracts:** closed schemas, decoders, fixtures, and `AgentClient` methods for catalog and
   read-only inspection.
2. **Workspace-partitioned state:** versioned run paths and read-only journal loading with no legacy shim.
3. **Runtime catalog projection:** exact-workspace scanning, deterministic summary construction, corrupt
   entry recovery, and inspection identity checks.
4. **Headless history:** strict `run list/show --json` parsing, one-value JSON output, exit classes, and no
   mutation.
5. **OpenTUI history:** explicit history focus, available/unavailable selection, read-only review, compact
   layout, and return to workspace review.
6. **Quickstart and distribution evidence:** truthful README/help, expanded standalone smoke, hosted
   package evidence, and slice closeout.

The kernel reducer, decision function, effect protocol, fake adapters, trust registry schema, journal v1
record schema, and terminal outcome semantics stay unchanged.

## Approved owner decisions

### D1. Slice outcome

**Selected A:** current-workspace run history, read-only historical inspection, Quickstart/help, and R1
closeout evidence.

- B, Quickstart-only closeout, was rejected because it would leave runtime durability inaccessible through
  the product.
- C, general resume, was rejected because continuing execution requires later durable approval and
  recovery semantics.

### D2. Catalog scope and trust behavior

**Selected A:** list only the exact canonical workspace and permit read-only history in both restricted
and trusted states. Revocation blocks new task start but does not hide or rewrite prior evidence.

- B, global history, was rejected because it breaks the current workspace boundary.
- C, trusted-only history, was rejected because workspace trust controls new repository task entry, not
  access to Eden's already-recorded local evidence.

### D3. Public surface

**Selected A:** add one renderer-independent run catalog/inspection contract and expose it through
`eden run list --json`, `eden run show --json <run-id>`, and the default TUI.

- B, session naming, was rejected because R1 has a durable `RunId` but no full session-continuation model.
- C, TUI-only discovery, was rejected because renderer-local history would violate one-runtime/many-surfaces.

### D4. Corrupt run behavior

**Selected A:** keep valid runs usable and represent an attributed damaged run as unavailable with a
structured error. Never silently skip it or treat partial bytes as product truth.

- B, fail the entire catalog, was rejected because one bad run would block unrelated recovery.
- C, silently omit corruption, was rejected because it would make durable evidence disappear.

### D5. Durable workspace attribution

**Selected A:** use the pre-release layout
`runs/v1/<workspaceId>/<runId>/{journal.jsonl,receipts/}` and scan only the current workspace partition.

- B, infer attribution from the first surviving record, could not represent fully corrupt journals while
  preserving D2 and D4.
- C, a sidecar or catalog index, would introduce duplicate durable state and drift policy.

ADR 0010 records D1-D5. These decisions are fixed Build input unless implementation evidence triggers the
architecture-exception rule below.

### D6. Filesystem-safe run identity

**Selected A:** narrow and prefix pre-release `RunIdSchema`. The current public schema accepts any
non-empty string up to 256 characters; `run show` makes the ID user input at a filesystem lookup boundary,
so a raw run ID requires a path-safe public contract.

- **A. Narrow and prefix pre-release `RunIdSchema` (selected):** require `run-` followed by lowercase
  ASCII letters, digits, or hyphens, with total length 5-128 and pattern
  `^run-[a-z0-9][a-z0-9-]{0,123}$`. Existing deterministic IDs remain valid; production changes from a
  bare UUID to `run-<uuid>`. The fixed prefix avoids Windows reserved device names, lowercase avoids
  case-folding collisions, and path-like IDs fail at every public boundary.
- **B. Keep the public schema and add a reversible segmented encoding:** preserves arbitrary Unicode IDs
  but adds encoding, length, canonicalization, and corruption-recovery rules solely for storage.
- **C. Hash run IDs for storage:** gives fixed safe paths but cannot recover the public run ID from a fully
  corrupt journal without the sidecar/index rejected by D5.

ADR 0010 records the selected path-safe identity alongside D1-D5.

## Frozen product contract

### Vocabulary and authority

- A **run** is the journal-authoritative execution record identified by `RunId`.
- A **catalog** is a read-only projection of attributable run state for one canonical workspace.
- An **inspection** is a read-only replay projection. It is never called resume or continue.
- Catalog selection is not a product command and grants no task, action, process, repository, network, or
  sandbox authority.
- Historical awaiting-approval, executing, or blocked states remain inspectable but cannot accept
  approval, cancellation, steering, or retry commands in this slice.

### Versioned run storage

New runs use:

```text
<stateDirectory>/runs/v1/<workspaceId>/<runId>/journal.jsonl
<stateDirectory>/runs/v1/<workspaceId>/<runId>/receipts/
```

- `workspaceId` comes from the runtime-owned canonical identity resolved by ADR 0009.
- `runId` still comes from the injected production/test ID source and remains present in every journal
  record and product view. Production emits `run-<uuid>`; all public decoders require
  `^run-[a-z0-9][a-z0-9-]{0,123}$`.
- The runtime derives every path from the D6-approved run identity representation and the runtime-owned
  workspace ID. It never accepts a raw relative or absolute path from a catalog client.
- Catalog collection uses `lstat` semantics and does not follow symlinked workspace partitions, run
  directories, journals, or receipt paths.
- Missing `runs/v1/<workspaceId>` means an empty catalog and creates no directory.
- The unpartitioned pre-release development layout is ignored. No implementation migrates, copies,
  deletes, or exposes it through a compatibility fallback.
- Execution may create its selected workspace/run path only after the existing workspace-trust start
  gate accepts `run.start`.

### Public catalog values

Add closed TypeBox schemas, types, non-throwing decoders, and fixtures for:

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

- `workspace` is the current `WorkspaceReview.workspace`, so its trust field truthfully reflects current
  restricted/trusted state. Available journal views retain their immutable trusted workspace snapshot.
- An available summary derives `task` from `run.started`, timestamps from the first/last validated
  records, and revision/phase/outcome from replayed product truth.
- A valid run-ID directory with a missing, non-regular, unreadable, malformed, mismatched, gapped,
  duplicated, unterminated, empty, or illegal-transition journal becomes an unavailable entry with
  `run_history_unavailable`.
- An invalid-name, symlinked, or non-directory child of the current workspace partition produces a
  sanitized `run_history_state_invalid` notice and is never opened.
- Catalog construction reserves its 100-entry limit for unavailable entries first, in ascending `runId`
  order, then fills remaining capacity with available entries by `updatedAt` descending and `runId`
  ascending. Returned entries render available entries first, followed by unavailable entries. More than
  100 attributable entries sets `truncated: true`; no R1 pagination contract is implied.
- `notices` contains at most 16 deterministic errors in entry-name order. Further invalid children set
  `truncated: true` without exposing raw file content.
- Closed decoders reject unknown fields, invalid dates, negative revisions, secret canaries, mismatched
  discriminants, and unsupported protocol versions.

### AgentClient behavior

Extend the renderer-independent port with:

```ts
getRunCatalog(options?: { signal?: AbortSignal }): Promise<RunCatalog>;
inspectRun(
  runId: RunId,
  options?: { signal?: AbortSignal },
): Promise<RunInspection>;
```

- Both methods revalidate that the client is open and honor an already-aborted signal with
  `operation_aborted` before filesystem access.
- `getRunCatalog` resolves only the bound canonical workspace partition and returns current trust truth
  without writing a trust record.
- `inspectRun` accepts only an available current-workspace run. It independently performs the same
  read-only validation rather than trusting a caller-supplied summary.
- Inspection verifies partition workspace ID, directory run ID, every record run ID, `run.started`
  workspace ID/root, projected view run ID/workspace, and summary/view revision/outcome agreement.
- A missing or wrong-workspace ID is `run_not_found`, recoverability `reconfigure`. An attributed damaged
  run is `run_history_unavailable`, recoverability `reconfigure`.
- Catalog and inspection call neither `openRunSession` nor `RuntimeEngine.open`, so unresolved effect
  requests never reconcile or dispatch.
- Existing execution clients retain their one-foreground-run behavior. Existing `getSnapshot` and
  `subscribe` semantics do not become global history APIs.

### Headless behavior

The accepted syntax becomes:

```text
eden
eden exec --json [--trust-workspace] [--approve-fake-action] "<task>"
eden run list --json
eden run show --json <run-id>
eden --help
```

- `run list` and `run show` require `--json`; duplicate flags, extra positionals, missing IDs, and unknown
  subcommands are `invalid_arguments`, exit `2`.
- List writes exactly one `RunCatalog` object plus one newline to stdout and no stderr on success. An empty
  or partially unavailable catalog is success, exit `0`.
- Show writes exactly one `RunInspection` object plus one newline and no stderr on success, exit `0`.
- Missing/wrong-workspace show writes empty stdout, one `run_not_found` `ProductError` to stderr, exit `2`.
- Unavailable show writes empty stdout, one `run_history_unavailable` error to stderr, exit `1`.
- History commands never accept trust or fake-action approval flags and never create a run, receipt, or
  trust record.
- Existing `exec --json` remains cursor-ordered `ProductEvent` NDJSON and byte-compatible in behavior.

### TUI behavior

- Workspace review loads the catalog through `AgentClient` and displays the history count without
  automatically opening any run.
- `h` enters history while workspace review owns focus in either restricted or trusted state. When the
  trusted composer owns focus, plain `h` remains task text.
- Up/Down changes selection, Enter inspects an available run or shows an unavailable error, and `b` returns
  to the same workspace review/trust state. Ctrl+C exits through the existing cleanup path.
- Available rows show task, outcome/phase, and `updatedAt`; unavailable rows show run ID and unavailable
  status. Full error recovery text appears only after selection.
- Historical inspection always displays `read-only history`, exact workspace root, run ID, task,
  phase/outcome, check/evidence when present, residual risk, and `b`/Ctrl+C controls.
- An awaiting-approval historical view shows the approval card as recorded evidence but omits `a`, `d`,
  cancel, retry, or resume controls and states that continued execution is unavailable in R1.
- At 60x20, exact workspace, read-only label, selected run, terminal outcome or unavailable error, and
  back/exit actions remain legible. Timeline/progress detail may condense.
- Selecting and returning from history does not change trust, composer text, run count, journal bytes, or
  receipt bytes.

### Quickstart and support truth

- `README.md` must identify the live stage as R1, describe the deterministic fake/no-credential boundary,
  and remove the scaffold-message claim.
- Quickstart covers requirements, frozen install, build/test, standalone packaging, default TUI trust
  flow, separate fake-action approval, headless exec, run list/show, and isolated `EDEN_STATE_DIR` use.
- `eden --help` documents all accepted commands and distinguishes one-object history JSON from execution
  NDJSON.
- No document calls the artifact a released package, claims package-manager installation, promises real
  repository changes, or upgrades hosted smoke into real Windows/macOS PTY support.

## Exact change boundary

Implementation may change only this dependency closure unless the architecture-exception rule fires:

```text
eden-agent/AGENTS.md                                      # read only
eden-agent/CONTEXT.md                                     # Finish truth update
eden-agent/README.md
eden-agent/PRODUCT.md
eden-agent/SPEC.md
eden-agent/docs/adr/0010-workspace-partitioned-read-only-run-history.md
eden-agent/docs/architecture.md
eden-agent/docs/event-model.md
eden-agent/docs/product-contracts.md
eden-agent/docs/threat-model.md
eden-agent/docs/product/user-journey.md
eden-agent/docs/product/ux-state-model.md
eden-agent/docs/plans/2026-07-16-r1-run-history-read-only-review.md
eden-agent/packages/contracts/src/protocol.ts
eden-agent/packages/contracts/src/fixtures.ts
eden-agent/packages/contracts/src/index.ts
eden-agent/packages/contracts/test/protocol.test.ts
eden-agent/packages/contracts/test/scenarios.test.ts
eden-agent/packages/coding-runtime/src/agent-client.ts
eden-agent/packages/coding-runtime/src/client-session.ts
eden-agent/packages/coding-runtime/src/index.ts
eden-agent/packages/coding-runtime/src/journal/file-journal.ts
eden-agent/packages/coding-runtime/src/journal/index.ts
eden-agent/packages/coding-runtime/src/run-catalog.ts              # new
eden-agent/packages/coding-runtime/test/agent-client.test.ts
eden-agent/packages/coding-runtime/test/run-catalog.test.ts        # new
eden-agent/apps/eden/src/args.ts
eden-agent/apps/eden/src/index.ts
eden-agent/apps/eden/src/run-history.ts                             # new
eden-agent/apps/eden/src/tui-history.tsx                            # new renderer-only helper
eden-agent/apps/eden/src/tui-layout.tsx                             # new renderer-only layout helper
eden-agent/apps/eden/src/tui-runner.tsx
eden-agent/apps/eden/src/tui.tsx
eden-agent/apps/eden/test/args.test.ts
eden-agent/apps/eden/test/headless.test.ts
eden-agent/apps/eden/test/run-history.test.ts                       # new
eden-agent/apps/eden/test/tui.test.tsx
eden-agent/scripts/smoke-standalone.mjs
eden-agent/scripts/r1-walking-skeleton-workflow.test.mjs
```

`packages/kernel/**`, journal v1 schemas, fake effect adapters, trust-record files, package manifests,
lockfiles, and workflow YAML are read-only for this slice. Do not add a dependency, package, state index,
alternate renderer, migration utility, compatibility shim, or second plan tree.

## Ordered test-first implementation slices

### Slice 0: freeze the approved history contract

- **Public seam:** accepted ADR 0010, normative/focused docs, and this plan.
- **State:** complete in Freeze after owner approval of D1-D5.
- **Acceptance:** every document uses run/history/inspection consistently, preserves journal authority and
  exact workspace scope, distinguishes inspection from resume, and names no R2/R3 authority.
- **Failure QA:** search normative docs for a claim that catalog implies resume, history requires trust,
  renderer scans state, or old unpartitioned state is migrated.
- **Matching surface:** none; this slice freezes the independent oracles for RED.
- **Permitted fakes/mocks:** none.

### Slice 1: executable catalog and inspection contracts

- **Public seam:** exported TypeBox schemas, non-throwing decoders, fixtures, and `AgentClient` interface in
  `@eden/contracts`.
- **Independent oracle:** exact closed shapes and sorting/cap semantics in this plan, not values generated
  by production catalog code.
- **RED:** contract tests require available/unavailable summaries, empty/mixed/truncated catalogs,
  read-only inspection, ISO timestamps, closed-field rejection, error redaction, and protocol rejection
  before the schemas exist.
- **GREEN:** add the smallest schemas, types, validators, fixtures, exports, and port methods without
  changing existing command/event/view bytes.
- **Acceptance:** every fixture round-trips; unknown fields, invalid dates, more than configured bounds,
  negative revisions, mismatched availability shapes, raw stack/provider/environment fields, and
  unsupported versions fail non-throwingly.
- **Failure QA:** inject a provider key, environment value, journal payload, filesystem path outside the
  workspace, mutable/resume flag, approval command, and terminal claim into each new value; closed decoders
  reject them.
- **Matching surface:** decode the exact list/show JSON later emitted by the standalone artifact.
- **Permitted fakes/mocks:** deterministic contract fixtures only.

### Slice 2: workspace-partitioned paths and read-only catalog projection

- **Public seam:** production run-path helpers and catalog projection over real temporary state/workspace
  directories and real JSONL journals.
- **Independent oracle:** canonical `WorkspaceIdentity.workspaceId`, the ADR 0010 path formula, validated
  journal records, and before/after filesystem byte snapshots.
- **First RED checkpoint:** start a trusted run and assert its journal/receipts appear only under
  `runs/v1/<workspaceId>/<runId>`; then catalog a valid and corrupt run and prove current-workspace
  attribution with zero created/changed paths and zero effect-host calls.
- **GREEN:** route new execution paths through the workspace partition, export a read-only journal loader
  that never calls `mkdir`/append, and implement `run-catalog.ts` scanning/projection.
- **Acceptance:** missing partitions return empty without creation; symlink aliases to one canonical root
  share history; another root sees none; valid summaries use journal timestamps and replay truth; corrupt
  entries/notices follow the frozen cap/order; catalog bytes remain unchanged.
- **Failure QA:** use a symlinked run directory/journal, invalid child name, non-directory, missing journal,
  empty journal, invalid JSON, unknown field/version/event, sequence gap, duplicate ID, run-ID mismatch,
  workspace mismatch, unterminated final record, unreadable file where supported, and an unresolved
  `effect.requested`. No case may dispatch, reconcile, repair, append, or leak another workspace's entry.
- **Matching surface:** inspect the state tree made by the standalone execution path and compare catalog
  JSON with independently decoded journal records and `realpath` identity.
- **Permitted fakes/mocks:** fixed clock/ID sources and a counting effect host only for negative zero-call
  assertions. Use real directories, files, permissions where supported, and symlinks.

Approval of this plan approves the first RED seam and independent oracle. Build must show the intended RED
failure before production state paths or catalog code change.

### Slice 3: AgentClient catalog and read-only inspection

- **Public seam:** `InProcessAgentClient.getRunCatalog` and `inspectRun` over production state, trust,
  journal, replay, and projection code.
- **Independent oracle:** runtime catalog results equal the Slice 2 projection and inspection equals
  `projectJournal(validatedRecords).view`; file hashes, receipt counts, trust bytes, and effect counts stay
  identical.
- **RED:** client tests require empty/mixed catalogs, exact-root filtering, restricted/trusted parity,
  revocation persistence, valid inspection, corrupt/missing/wrong-workspace errors, closed-client errors,
  and aborted operations before methods exist.
- **GREEN:** extend the client with the smallest delegation to the read-only catalog owner. Do not widen
  existing foreground session ownership or reuse execution-session open paths.
- **Acceptance:** catalog trust matches current workspace review; inspection summary/view identities agree;
  awaiting/executing/terminal journals remain views only; submit/getSnapshot/subscribe keep their accepted
  execution semantics; closing releases no new resource.
- **Failure QA:** inspect a run from another partition, replace a journal between list and show, revoke
  trust between calls, abort before each call, and attempt to submit the replayed approval. Errors are
  structured and no state/effect changes.
- **Matching surface:** call the real client in a minimal driver, list two runs, inspect one, revoke trust,
  repeat list/show, and compare hashes/call counts.
- **Permitted fakes/mocks:** deterministic clock/IDs and counting host for evidence only; real catalog and
  journals are required.

### Slice 4: strict headless run list and show

- **Public seam:** standalone process invocation, exact stdout/stderr bytes, exit code, and state tree.
- **Independent oracle:** strict command grammar and output/error table in the frozen headless contract.
- **RED:** argument and process tests require list/show success, empty history, mixed corruption, missing
  run, wrong workspace, unavailable run, duplicate/missing/extra args, trust independence, and one-value
  JSON cleanliness before routing exists.
- **GREEN:** extend parsing/composition and add `run-history.ts` handlers that call only `AgentClient`
  catalog/inspection methods and serialize decoded public values.
- **Acceptance:** list/show output contains one schema-valid object and newline; exit classes match; existing
  exec NDJSON is unchanged; history commands accept no execution grants; no source/ANSI/prose/internal
  record leaks to stdout.
- **Failure QA:** pass `--trust-workspace`, `--approve-fake-action`, duplicate `--json`, extra IDs,
  path-like IDs, unknown verbs, corrupt journal, and another workspace's valid ID. Observe the frozen error,
  empty success channel, and unchanged state hashes.
- **Matching surface:** execute every row against a copied standalone binary from an empty directory using
  two real workspaces and one shared isolated state root.
- **Permitted fakes/mocks:** none beyond the production deterministic fake host used to create fixture runs.

### Slice 5: OpenTUI current-workspace history and inspection

- **Public seam:** `EdenTuiApp` with the real `InProcessAgentClient`, then the packaged executable driven in
  a real PTY.
- **Independent oracle:** catalog/inspection values already accepted through headless and runtime seams;
  renderer state may own only focus, selection, and layout.
- **RED:** OpenTUI tests require restricted/trusted history entry, deterministic selection, available and
  unavailable details, read-only awaiting-approval view, back navigation, composer key isolation,
  structured errors, and 60x20 safety before UI changes.
- **GREEN:** add the smallest history/review states to the existing TUI and load them only through the
  public client. Preserve terminal cleanup and current fake-task flow.
- **Acceptance:** `h` works only when workspace review owns focus; history works after revocation; Enter
  never submits a historical command; `a`/`d`/cancel are absent in inspection; `b` restores the unchanged
  review/composer/trust state; normal exit and Ctrl+C restore the shell.
- **Failure QA:** select corrupt, deleted-after-list, awaiting-approval, executing-with-unresolved-effect,
  blocked, cancelled, and successful runs; resize at each state; type ordinary `h`, `b`, `a`, and `d` into
  the focused composer. No history action may become task text or vice versa.
- **Matching surface:** real PTY at 100x30 and 60x20 for empty history, two-run selection, terminal review,
  unavailable recovery, restricted review, back navigation, task composer, normal exit, and Ctrl+C.
- **Permitted fakes/mocks:** scripted `AgentClient` only for isolated render errors impossible to produce
  deterministically. Product acceptance uses real state/client/replay.

### Slice 6: Quickstart, package evidence, and slice closeout

- **Public seam:** `README.md`, `eden --help`, copied Bun artifact, existing smoke script, and the current
  three-platform R1 GitHub Actions workflow.
- **RED:** help/README/workflow-contract tests freeze every accepted command, no-credential/trust/approval
  truth, run layout, list/show smoke rows, corrupt entry, exact-workspace isolation, and prohibition on
  resume/release claims.
- **GREEN:** update README/help and expand only the existing smoke/workflow-contract dependency closure.
  Workflow YAML remains unchanged unless exact hosted evidence proves its current path or command contract
  cannot run the smoke.
- **Acceptance:** a reader can build/package and complete the documented fake flow; copied artifact list/show
  works outside checkout; Ubuntu/Windows/macOS lanes pass install, peers, full test, typecheck, build,
  Biome, Markdown, package, history smoke, and upload; README names residual platform evidence honestly.
- **Failure QA:** execute every documented command in an isolated temporary workspace, search for stale R0
  scaffold/provider/release/resume claims, and corrupt one packaged run. Documentation and artifact output
  must agree.
- **Matching surface:** repeat M1-M6 below after the final relevant edit and record hosted run URL/commit
  only if publication is separately authorized.
- **Closeout:** add fresh evidence/residual risk to this plan, update `CONTEXT.md` to request the R1 exit
  review without declaring R1 complete, and inspect both repositories.
- **Permitted fakes/mocks:** production deterministic fake only.

## Matching-surface ledger

Run after the final relevant implementation edit against a newly packaged artifact copied outside the
checkout. Use sibling workspace/state directories and record exact paths and hashes.

### M1. Empty restricted history

Launch the TUI from a fresh workspace/state pair at 100x30. Observe restricted trust and zero history.
Press `h`, observe the empty current-workspace history without a `runs/` partition being created, return
with `b`, then exit with Ctrl+C and capture the parent-shell sentinel.

### M2. Two-run ordering and terminal inspection

Trust the workspace and create two successful fake runs with distinct tasks/timestamps. Relaunch, press
`h`, observe newest-first available rows, select the older run, and inspect its exact task, run ID, root,
outcome, check, evidence, residual risk, and read-only label. Return with `b`; prove all journal/trust/
receipt hashes are unchanged.

### M3. Non-terminal and corrupt history

Create one awaiting-approval run and one structurally attributed corrupt run. At 60x20, inspect the
awaiting run and prove no approval/cancel/resume key exists. Select the corrupt entry, observe
`run_history_unavailable` recovery text, and prove the valid entries remain usable and no effect receipt
appears.

### M4. Exact workspace, symlink, and revocation

Open history through two symlinks resolving to workspace A and observe the same catalog. Open workspace B
against the shared state root and observe none of A's runs. Revoke A, relaunch restricted, and prove A's
history remains read-only while new task start stays blocked.

### M5. Headless list/show and failure table

Against the same state, run list and show for available, missing, wrong-workspace, and unavailable IDs.
Decode success stdout as `RunCatalog`/`RunInspection`, stderr as `ProductError`, verify exits `0/2/1`, and
prove every invocation leaves state hashes and effect counts unchanged.

### M6. Quickstart and standalone boundary

From a clean temporary directory, follow the public Quickstart through package, help, restricted TUI,
trust, separate fake-action approval, successful exec, run list, and run show. Confirm the copied artifact
uses no checkout source or `node_modules`, and that the observed commands/copy match README exactly.

## Build and local review evidence

Build completed on 2026-07-16 without triggering an architecture, product, trust, dependency, durable-state,
or public-contract exception. No commit, push, workflow publication, hosted rerun, release, or tutorial
gitlink update was authorized or performed.

### Test-first ledger

The implementation recorded each required failure before its production seam was added or corrected:

1. path-like `RunId` values decoded before the path-safe schema existed;
2. run journals were written outside `runs/v1/<workspaceId>/<runId>`;
3. catalog and inspection methods were absent from the runtime client;
4. `run list/show --json` grammar and handlers were absent;
5. TUI history focus, selection, and read-only inspection states were absent;
6. a symlinked run-state ancestor could expose an external partition;
7. inspection summary/view identity mismatches decoded;
8. invalid summary time ranges and catalog ordering decoded.

Each seam is now covered by the closed contract, real-filesystem runtime, process, or renderer suite. The
final focused counts are contracts 14/14, kernel 8/8, coding runtime 32/32, and CLI/TUI 16/16.

### Automated and standalone gates

- `pnpm install --frozen-lockfile` reported the 11-project workspace already current; `pnpm peers check`
  reported no peer dependency issues.
- The full workspace test command passed its script contracts and all 10 runnable projects, including the
  terminal-framework real-PTY harness. Full typecheck and build passed.
- Biome checked 158 files. Markdownlint checked 39 files with zero errors. `git diff --check` passed.
- The final Bun artifact and both copied artifacts have SHA-256
  `218de7ef0f123368f497da2ce676bb6cab8a24463b47a38b00ca794affee9151`.
- Final standalone smoke passed with 8 product events at
  `/tmp/eden-standalone-K9OZ6k/bin/eden`. It proved help, strict arguments, restricted/trust-only/success
  execution, three available history rows, one visible corrupt row, available/missing/wrong-workspace/
  unavailable show behavior, path-like ID rejection, unchanged trust/journal bytes, and another workspace
  observing zero entries.

### Matching-surface ledger results

- **M1:** `/tmp/eden-history-empty-current-pork2A` at 100x30 showed restricted authority, zero runs, an
  empty read-only history, back navigation, no `runs/` partition, terminal restoration, and
  `EDEN_PTY_SENTINEL exit=130` after Ctrl+C.
- **M2:** `/tmp/eden-standalone-bVmKOu/states/approved-state` showed newest-first available rows and a
  successful inspection containing exact run, task, root, outcome, check, evidence, residual risk, and
  read-only copy. The complete file-tree hash remained
  `ff968442f286c3167705931812903466ca5cb4fc978b431460c6e1cff51aac5b` before and after TUI review.
- **M3:** the 60x20 awaiting inspection exposed recorded approval evidence and said continued execution is
  unavailable in R1, with no approval controls or receipts. Its state hash remained
  `2dcf0d1ed41f33bf60dca9900fa8f1d107571143293c005df5f0d1ace4251f02`. A corrupt selected run remained
  visible with `run_history_unavailable` and recovery copy while available rows stayed usable.
- **M4:** real-filesystem client tests proved canonical symlink aliases share one catalog, another
  workspace cannot inspect it, and revocation preserves read-only history while blocking new runs. The
  standalone smoke independently proved the other-workspace exclusion.
- **M5:** standalone list/show values decoded through the closed public schemas with the frozen success,
  unavailable, missing, wrong-workspace, and invalid-ID exits; history reads left the asserted bytes
  unchanged.
- **M6:** the public Quickstart and help contract tests passed, and the copied artifact completed the
  isolated no-credential fake flow without checkout source or `node_modules`.

Fresh OpenTUI character frames under `/tmp/eden-history-qa-current-20260716c` cover awaiting catalog,
awaiting inspection, unavailable catalog, and unavailable recovery at 60x20. All four width checks report
20 lines, maximum width 60/60, no overflow, no border misalignment, and no wide-character drift. Real PTY
runs also covered the 100x30 successful inspection and 60x20 awaiting/unavailable states.

Residual review limits are explicit: the current uncommitted checkout has no hosted three-platform run;
the existing accepted hosted baseline is not presented as evidence for this diff. This session also lacks
the repository xterm.js screenshot harness, and its governing session rule prohibited spawning the two
independent visual-review subagents required by the optional visual-QA skill. The real PTY, renderer, width,
and cleanup evidence is green, but no independent visual Oracle PASS is claimed. These are review-evidence
limits, not added product authority. The owner accepted this slice, and its later R1 exit review transferred
the remaining defects to the exit-closure plan. R1 remains incomplete pending that closure and explicit
owner exit acceptance.

## Verification commands

```sh
pnpm install --frozen-lockfile
pnpm peers check
pnpm --filter @eden/contracts test
pnpm --filter @eden/kernel test
pnpm --filter @eden/coding-runtime test
pnpm --filter @eden/cli test
pnpm test
pnpm typecheck
pnpm build
pnpm code:check
pnpm markdown:check
pnpm --filter @eden/cli package:bun
node --test scripts/r1-walking-skeleton-workflow.test.mjs
node scripts/smoke-standalone.mjs apps/eden/dist/eden
git diff --check
git status --short
git submodule status --recursive
```

On Windows, pass `apps/eden/dist/eden.exe` to the smoke script. Build must also execute M1-M6 and record
the exact state paths, command lines, exit codes, decoded value counts, before/after hashes, effect/receipt
counts, PTY sizes, and shell sentinels. Renderer-only tests do not satisfy TUI matching-surface evidence.

## Explicit non-goals

- General `eden resume`, continue-latest, re-entering an approval, effect reconciliation from a selected
  historical run, durable approval across process exit, or any execution mutation from inspection.
- Global or cross-workspace history, multi-workspace navigation, session trees, titles/tags, search,
  filtering, pagination, deletion, archive, export/import, sharing, retention, or cleanup policy.
- Migration, copying, deletion, or fallback reads for the old unpartitioned development run layout.
- A sidecar, manifest, SQLite catalog, filesystem watcher, cache, background index, daemon, IPC, or lock.
- Changing journal v1 records, kernel events/state/reducer/decisions, effect identities, terminal outcomes,
  trust records, approval commands, or existing ProductEvent/exec NDJSON shapes.
- A real provider, provider configuration/credentials/connection test, model loop, repository read/search,
  Git inspection, file editing, real process execution, network, policy engine, Docker, or native sandbox.
- Package-manager publication, installer, signing, update channel, telemetry, release support claim, R1 exit
  acceptance, or R1 completion.
- A dependency, package, alternate renderer, tutorial lesson, learning record, interview note, or second
  plan directory.
- Commit, push, merge, release, or tutorial gitlink update without separate authorization.

## Risks and stop rules

| Risk | Mitigation or stop rule |
| --- | --- |
| Catalog becomes a second authority | Derive every available fact from validated journal/replay; store no index |
| Corrupt journal loses workspace attribution | ADR 0010 workspace partition owns attribution, not summary truth |
| Discovery mutates state | Use read-only loader/lstat; hash trees before/after every catalog scenario |
| Inspection dispatches an unresolved effect | Never open RuntimeEngine/session; count host calls and receipts |
| Revocation hides or enables history | Catalog remains read-only; trust only gates new `run.start` |
| Another workspace leaks into the list | Resolve canonical ID once and scan only its opaque partition |
| Renderer owns history semantics | TUI consumes only closed AgentClient values; headless proves parity first |
| `run show` becomes resume | Read-only wrapper, no commands/controls, explicit UI/help copy |
| Corruption blocks all recovery | Per-entry unavailable result; continue validating independent runs |
| Filesystem mtime becomes chronology | Sort only validated journal `recordedAt` values |
| New layout becomes a hidden migration | Ignore old pre-release paths; never delete or copy user state |
| Quickstart overclaims maturity | Execute every line; retain fake/no-key and residual platform truth |
| Slice expands into R2/R3 | Stop at history/inspection/Quickstart and enforce non-goals |

After plan approval, pause only if evidence invalidates ADR 0002, 0006, 0009, or 0010; shows that
workspace partitioning or effect-free inspection is unsafe; requires a new product, trust, public-contract,
dependency, durable-state, or roadmap decision; or forces work outside the exact boundary. Ordinary
helper naming, local component structure, copy edits within frozen semantics, and test refactoring are not
checkpoints.

## Rollback and compatibility boundary

The repository is unreleased. Rollback may remove the catalog/inspection protocol extension and ADR 0010
implementation, then restore new-run writes to the accepted baseline layout. It may delete only isolated
test/evidence state created by this implementation run. It must never delete, rewrite, migrate, or copy a
user-selected state directory.

Existing command/event/view JSON and journal v1 bytes remain valid. The prior unpartitioned development
layout is intentionally outside the new catalog and receives no compatibility shim. Use a fresh isolated
state directory for Build and review evidence. After an external release consumes the partition or new
protocol values, incompatible changes require explicit versioning and a migration plan.

## Human checkpoints and execution authority

1. **Explore decisions, complete:** D1-D4 were approved A/A/A/A on 2026-07-16.
2. **Architecture exception, complete:** D5 was raised when corrupt-journal attribution invalidated the
   no-layout-change assumption and approved as A on 2026-07-16.
3. **Public-contract exception, complete:** D6 was approved as A on 2026-07-16.
4. **Plan approval, complete:** the frozen contract, first RED seam, ordered slices, matching surfaces,
   state-layout break, and non-goals were approved on 2026-07-16.
5. **Architecture exception only after approval:** pause only under the stop rule above; do not pause after
   routine slices.
6. **Final slice review, completed and owner-accepted:** the owner reviewed the diff, RED/GREEN evidence,
   catalog/corruption matrix, M1-M6, local automated results, Quickstart proof, and residual risks. The
   separate R1 exit review may proceed from this accepted checkpoint.

Decision approval does not authorize product implementation, commit, push, merge, release, or tutorial
gitlink changes.

## Completion criteria

This slice is complete when:

- new runs use the exact workspace-partitioned v1 layout and old development state is neither migrated nor
  deleted;
- a missing history partition returns an empty closed catalog without creating files;
- valid catalog summaries derive only from validated journal/replay truth and deterministic journal time;
- current-workspace filtering survives canonical symlink aliases and excludes every other workspace;
- corrupt attributed runs remain unavailable while valid runs remain listable/inspectable;
- catalog and inspection never append, repair, reconcile, dispatch, change trust, or consume approval;
- `AgentClient`, not the renderer or CLI, owns catalog and inspection truth;
- TUI history works restricted/trusted, preserves focus/trust/state, and labels inspection read-only at
  60x20 and 100x30;
- headless list/show emit exactly one schema-valid value with the frozen error/exit behavior;
- existing fake-task TUI/headless, replay, crash, trust, approval, package, and hosted evidence stays green;
- README/help commands execute from the copied standalone artifact and make no real-provider/resume/release
  claim;
- normative docs and `CONTEXT.md` report the boundary without claiming R1 completion;
- no explicit non-goal enters implementation.

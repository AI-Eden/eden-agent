# R1 Exit Closure Plan

- Status: Build approved and in progress
- Date: 2026-07-16
- Roadmap stage: R1, Installable Walking Skeleton
- Baseline: `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f` plus the accepted, uncommitted run-history slice
- Prior slice: `docs/plans/2026-07-16-r1-run-history-read-only-review.md`, accepted by the owner on
  2026-07-16; exit-review defects transfer into this plan
- Owner decisions: A/A/A/A approved on 2026-07-16
- Publication authority: public commit and push plus a local tutorial gitlink commit are authorized only
  after plan approval and the named local/review gates pass
- Plan approval: 2026-07-16
- Review-process amendment: on 2026-07-16 the owner replaced the automatic five-lane subagent gate with
  one evidence-backed single-agent diff, contract, trust, and matching-surface review; subagents require
  explicit owner authorization
- Human checkpoint: accept the R1 exit after exact-SHA hosted evidence and the final review

## Goal and User-Visible Outcome

Close the R1 roadmap stage with one honest, installable walking skeleton. A task must pass through a real
typed deterministic model step, runtime-owned action construction, separate approval, a fake tool,
verifier-owned success, journal replay, default TUI, and headless JSON. Every new run must use fresh exact-
workspace trust at one cross-process start boundary.

Repair the accepted history slice so read-only commands do not create state, malformed or oversized local
state cannot collapse unrelated history or exhaust unbounded work, asynchronous inspection cannot reopen
stale selection, and a many-run catalog remains usable at 60x20. Preserve an explicit R1 threat boundary:
static corruption, bounded work, hardlink rejection, checkpoint identity changes, and cooperating Eden
processes are in scope. Malicious same-user concurrent path substitution remains documented future work.

The final public implementation SHA must pass the complete local, standalone, real-PTY, review, and
Ubuntu/macOS/Windows evidence matrix. R1 completion still requires the final owner checkpoint.

## Current Repository Facts

- The public HEAD is `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f`. The accepted run-history slice is
  still an uncommitted worktree change, so this plan treats that SHA as the immutable comparison point and
  does not create an intermediate commit containing known exit-review defects.
- Contracts, reducer, dispatcher, JSONL journal, replay, fake tool, verifier, TUI/headless surfaces,
  workspace trust, separate action approval, effect crash tests, standalone packaging, and prior hosted
  lanes exist.
- `packages/providers/src/index.ts` defines an `unknown`-typed `FakeModelDriver`, but no production code
  imports it and the provider package has zero tests. The current task constructs its action before any
  provider call.
- `InProcessAgentClient.submit(run.start)` reads cached workspace review state. A second client can revoke
  trust, or the selected symlink can be retargeted, while the first client still creates a run.
- `readRunCatalog` reads every directory name and every complete journal before applying its 100-entry
  output cap. `readJournalRecords` reads an entire file into memory.
- The history CLI opens the normal client, whose state resolver creates the state root. A successful
  `run list --json` therefore writes when `EDEN_STATE_DIR` is missing.
- Catalog construction does not decode each constructed summary before returning it. One schema-valid
  journal with reversed product chronology can invalidate the whole catalog.
- The TUI applies delayed inspection results after back or selection changes and renders every catalog row,
  causing hidden selection and overlapping controls with 25 or more entries at 60x20.
- Raw unexpected filesystem error messages can expose state paths through headless stderr or TUI copy.
- The current R1 workflow omits `packages/providers/**`, README, normative docs, and `docs/**` from its path
  filters. The latest green hosted R1 run predates the current history implementation.
- `SPEC.md` still says `Draft for R0`; `CONTEXT.md` and the history plan still describe the now-accepted
  slice review as pending.

## R1 Exit Matrix

| R1 requirement | Current state | Closure evidence |
| --- | --- | --- |
| Contracts | Implemented | Closed decoder tests and final contract audit |
| Reducer | Implemented | Existing invariants plus model-step state tests |
| Dispatcher | Implemented for tool/verifier | Typed model effect, receipt, reconciliation, and crash matrix |
| JSONL journal | Implemented | New model events round-trip and replay without dispatch |
| Replay | Implemented | Model receipt/observation replay and zero provider calls |
| Fake model and tools | Tool implemented; model missing | One typed model completion causally creates the action proposal |
| Default TUI | Implemented with history defect | 100x30 task flow and 60x20 many-run history PTY evidence |
| Headless JSON | Implemented | Semantic NDJSON plus list/show process matrix |
| Workspace trust | Implemented with stale-start defect | Cross-process revoke/start and symlink-retarget barriers |
| Approval | Implemented | No approval before validated model observation; approval remains separate |
| Crash boundaries | Implemented for tool/verifier | Add every model-effect boundary and lock failure rows |
| Clean installation | Prior baseline only | Exact-SHA three-platform frozen install, package, smoke, and evidence artifacts |

R2/R3 work is not an R1 exit requirement. Real providers, repository tools, AnchorEdit, policy, sandbox,
resume, GoalSpec, repair, Evidence Pack, installer publication, signing, and updates remain later stages.

## Approved Decisions and Frozen Contracts

### D1. One Real Deterministic Fake-Model Step

Keep the roadmap requirement. The model step must be causally necessary: its validated observation creates
the proposal that permits the runtime to present an approval. Calling a provider while retaining a
precomputed action is prohibited.

The provider boundary owns closed internal version-1 values equivalent to:

```ts
type FakeModelRequestV1 = {
  version: 1;
  task: string;
};

type FakeModelResponseV1 = {
  version: 1;
  proposal: {
    kind: "deterministic-fake-action";
    summary: "Run the deterministic fake task";
  };
};
```

`ModelDriver.complete` accepts only the request type and returns only the response type. The fake driver
is deterministic, performs no network I/O, requires no credential, and honors an already-aborted signal.
Unknown fields, variants, or values fail closed.

The internal journal/runtime sequence becomes:

1. Fresh workspace authorization accepts `run.start` and durably appends `run.started` containing task,
   correlation, run identity, and the fresh trusted workspace snapshot. It contains no action.
2. The reducer enters an executing `model-ready` stage. No approval is visible.
3. `decide` emits `fake.model.complete` with stable effect identity `<runId>:fake-model`.
4. The runtime appends `effect.requested` before dispatch.
5. The model-effect host calls the injected typed driver once, validates its response, constructs the full
   `Action` from runtime-owned run ID, canonical cwd, fixed scope, canonical display, digest, and approval
   identity, then persists an idempotent receipt.
6. The runtime appends `fake.model.completed` with the runtime-validated action. The reducer enters
   `awaiting-approval`, and only then may product projection expose the approval.
7. Existing approval, `fake.action.execute`, `fake.verification.run`, and verifier-owned terminal success
   continue unchanged in authority.

The model cannot select cwd or scope, grant trust, resolve approval, execute an effect, produce verifier
evidence, or declare terminal success. An invalid model response becomes a structured blocked outcome
without presenting or executing an action.

`run.started` and the internal kernel/journal event union change while the repository remains unreleased.
Regenerate deterministic fixtures and accept no legacy development-journal migration. ProductEvent
variants and `eden exec --json` framing remain protocol version 1; cursor counts may increase and tests
must assert semantic order rather than a fixed line count.

The model effect uses the existing intent, durable receipt, observation, and reconciliation protocol.
The crash matrix covers before intent, after intent/before dispatch, after receipt/before observation,
after observation/before reduction, replay with completed receipt, and unresolved unknown outcome.

### D2. Fresh Trust and Start Linearization

Trust review caches remain presentation hints. They are never start authority.

Add one per-state-root, per-workspace cross-process critical section at:

```text
<stateDirectory>/workspace-locks/v1/<workspaceId>.lock/owner.json
```

Use exclusive, non-recursive `mkdir` as the portable acquisition primitive. The closed owner record is at
most 4096 bytes and contains version `1`, an opaque random token, process ID, and acquisition timestamp.
Acquisition polls through an injected timer every 25 milliseconds for at most 2000 milliseconds and
honors cancellation. Timeout or a missing, malformed, symlinked, hardlinked, or otherwise invalid owner
record returns sanitized `workspace_state_busy` with recoverability `retry`.

R1 never automatically removes an orphaned lock. Automatic stale-lock reclamation cannot be made race-
safe with the current portable path APIs. The product fails closed and instructs the user to close other
Eden processes and reconfigure local state if contention persists. Normal release removes the owner and
lock only when the opaque token still matches. Malicious same-user lock deletion or forgery belongs to the
future-work record.

`run.start` follows this order:

1. Validate the command and reject a missing/restricted trust record without creating a lock or state.
2. Acquire the workspace lock only when a current record appears trusted.
3. Re-resolve the originally requested cwd and compare it with the client-bound workspace identity.
4. Reload and fully validate the current trust record from disk.
5. Reject retarget, unavailable identity, missing/corrupt/restricted trust, or revision mismatch before
   consuming a run ID or creating a run path.
6. Exclusively allocate a path-safe run ID, open the new journal, and durably append `run.started` with the
   fresh identity snapshot while still holding the lock.
7. Release the lock, then drive the model effect.

Grant and revoke use the same lock. After acquisition they reload the current record, compare the command's
expected revision, write one complete replacement through the existing atomic same-directory rename,
refresh the local review cache, and release.

The linearization rule is explicit:

- start wins when its trusted `run.started` newline is durable before revoke acquires the lock; later
  revoke blocks subsequent starts and preserves that run snapshot;
- revoke wins when its restricted trust record is durable before start reloads under the lock; start then
  creates no run directory, journal, receipt, model call, or consumed ID;
- two competing state-changing commands with one expected trust revision produce one durable change and
  one `stale_revision`; an idempotent no-op does not consume that revision;
- a run-ID collision produces one complete journal and one structured failure, never mixed bytes.

History reads do not acquire or create this lock. They remain available after revocation.

### D3. Bounded R1 State Reads and Deferred Adversarial Races

R1 adopts these ingestion budgets:

| Budget | Limit | Exceeded behavior |
| --- | ---: | --- |
| Partition children visited per catalog | 512 | Stop, set `truncated`, add one sanitized budget notice |
| Journal bytes per run | 1 MiB | Mark that run unavailable |
| Journal record bytes | 64 KiB | Mark that run unavailable |
| Journal records per run | 4096 | Mark that run unavailable |
| Cumulative journal bytes per catalog | 16 MiB | Stop further journals, set `truncated`, add budget notice |
| Cumulative records per catalog | 16384 | Stop further journals, set `truncated`, add budget notice |
| Trust or lock record bytes | 4 KiB | Fail closed with a sanitized state error |
| Workspace lock wait | 2000 ms | `workspace_state_busy`, recoverability `retry` |

Use streaming `opendir` and bounded `FileHandle.read`; do not materialize a whole partition or journal
before enforcing its limit. Check `AbortSignal` before and after every filesystem operation and between
chunks/records.

The first 512 host-enumerated children form the R1 candidate set. Within that set, available and
unavailable ordering keeps the accepted contract. Once the visit limit is reached, R1 no longer promises
that the returned set contains the globally newest runs; `truncated: true` and one
`run_history_budget_exceeded` notice make the limitation explicit. No pagination, index, migration, or
retention policy is introduced.

Each constructed available summary and inspection must decode through its closed product schema before it
can become public truth. One invalid run becomes unavailable; valid siblings and the top-level catalog
remain usable.

Trust records and journals must be regular files with `nlink === 1`. Compare file type, device, inode,
link count, and size at the existing pre-open, opened-handle, post-read, and final-path checkpoints. Reject
an observed replacement. These checkpoints detect static and benign concurrent replacement; they do not
claim to defeat a malicious same-user race between every check.

`eden run list/show --json` must use an explicit read-only client/state resolver:

- missing state: list returns an empty catalog and show returns `run_not_found` without creating an inode;
- existing state: no `mkdir`, rename, append handle, receipt reconciliation, trust write, lock write,
  effect dispatch, approval, or repair;
- unexpected filesystem failures map to fixed `ProductError` copy. Raw paths, entry names, journal bytes,
  errno messages, stacks, environment values, and canaries never enter stdout, stderr, or TUI copy.

Remove raw catalog helpers and structural path-bearing workspace options from the package root export.
`AgentClient.getRunCatalog/inspectRun` remain the supported renderer-independent seam.

The stronger same-user attacker, descriptor-relative traversal, reparse/junction races, mount changes,
lock sabotage, separate security principal, and native filesystem boundary are recorded in
`docs/future-works/adversarial-local-state-filesystem-hardening.md`. R1 must not claim them.

### D4. Exact-SHA Publication and Evidence

Publication uses three named commits:

- `BASELINE_SHA`: `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f`, the immutable comparison base;
- `IMPLEMENTATION_SHA`: the first clean public commit containing the accepted history slice and all R1
  exit repairs, after local gates and fresh review pass;
- `CLOSEOUT_SHA`: an optional docs-only public commit recording hosted evidence and final owner acceptance.

Push `IMPLEMENTATION_SHA` to the public repository's configured `origin/main` and `github/main`, prove both
remote tips, and require the hosted run's `headSha` to equal it. A docs-only closeout may cite that run when
`git diff --name-only IMPLEMENTATION_SHA..CLOSEOUT_SHA` contains only authorized Markdown. The R1 workflow
also runs on the closeout docs paths; its later run is observed but does not require a self-referential
follow-up commit.

After exact-SHA hosted evidence and the fresh R1 exit review pass, stop for the owner's R1 exit acceptance.
Only then mark R1 complete, create/push an authorized public closeout commit if needed, and commit the
tutorial gitlink to `CLOSEOUT_SHA` locally. This authorization does not include pushing the tutorial
repository.

Ordinary fixes within these frozen contracts may continue through new implementation SHAs and hosted
reruns. Pause for evidence that changes product behavior, trust semantics, public contracts, dependencies,
durable state, roadmap scope, or an accepted ADR.

## History and Product Corrections

The exit closure also freezes these ordinary repairs:

- Decode constructed summaries and inspections per run before catalog publication.
- Use a generation token plus `AbortController` for inspection. Invalidate on back, selection change,
  catalog reload, another inspection, unmount, and client close. Ignore every stale completion locally.
- Pass viewport height to the history renderer. Render a selection-following window that reserves fixed
  rows for title, range/count, notices or selected recovery, and back/exit controls. At 60x20 the selected
  row and controls stay visible with 100 entries.
- Show `Showing <first>-<last> of <count>` whenever the rendered window does not contain all returned
  entries.
- Map catalog-load and inspection failures into the active history surface and clear them after a
  successful retry.
- Replace protocol-significant `localeCompare` use with explicit ASCII/code-unit ordering.
- Update the accepted history plan to record owner acceptance and transfer its disproved narrow-layout,
  hardlink, no-write, bounded-work, and current-hosted evidence claims to this plan.

## Exact Change Boundary

Build may change only this dependency closure unless the stop rule fires:

```text
CONTEXT.md
README.md
PRODUCT.md
SPEC.md
docs/adr/0011-r1-deterministic-fake-model-step.md              # new
docs/adr/0012-linearize-workspace-trust-and-run-start.md        # new
docs/architecture.md
docs/event-model.md
docs/product-contracts.md
docs/threat-model.md
docs/product/release-support-matrix.md
docs/product/user-journey.md
docs/product/ux-state-model.md
docs/future-works/README.md
docs/future-works/adversarial-local-state-filesystem-hardening.md
docs/plans/2026-07-15-r1-fake-task-vertical-slice.md
docs/plans/2026-07-15-r1-onboarding-workspace-trust.md
docs/plans/2026-07-16-r1-run-history-read-only-review.md
docs/plans/2026-07-16-r1-exit-closure.md
.github/workflows/r1-walking-skeleton.yml
package.json
pnpm-lock.yaml
packages/providers/**
packages/kernel/**
packages/contracts/**
packages/coding-runtime/**
apps/eden/**
scripts/r1-walking-skeleton-workflow.test.mjs
scripts/r1-production-pty.mjs                                  # new when the existing harness cannot own it
scripts/smoke-standalone.mjs
```

`spikes/**`, lab behavior, real providers, repository tools, sandbox code, desktop/service packages, native
crates, tutorial lessons, learning records, and interview material remain read-only.

No external dependency may be added. `@eden/coding-runtime` may add the existing workspace package
`@eden/providers`; `@eden/providers` may use the already-locked TypeBox version. Any lockfile change must
contain only workspace-edge metadata.

## Verification Strategy

Use TDD for every reproduced defect and new invariant. Record RED and GREEN commands under
`.omo/evidence/r1-exit-closure/<attempt>/`. A passing unit test is insufficient when a process, filesystem,
PTY, crash, or hosted boundary exists.

- **Pure seam:** kernel table tests with fixed events/effects and no filesystem/provider mock.
- **Provider seam:** real `FakeModelDriver` with closed request/response decoding and an injected aborted
  signal.
- **Runtime seam:** real temporary filesystem, real journal, real fake model/tool/verifier host, fixed
  clock/IDs, and deterministic barriers for concurrency.
- **Filesystem seam:** real files, hardlinks, symlinks, oversized streams, identity replacement barriers,
  byte/tree hashes, and host-call counters.
- **Process seam:** copied standalone executable with exact stdout/stderr/exit decoding and nonexistent
  state roots.
- **Renderer seam:** OpenTUI test renderer for delayed requests and large catalogs, followed by a real
  production executable in a PTY.
- **Hosted seam:** frozen install, full gates, package, production PTY, standalone smoke, evidence manifest,
  and artifact upload on Ubuntu, macOS, and Windows.

Permitted fakes are fixed clocks/IDs, deterministic scheduling barriers, an injected timer, and scripted
provider failure values at their real boundary. Product acceptance uses the production deterministic fake
driver and real state/journal/client surfaces.

## Ordered Test-First Slices

### Slice 1. Freeze ADRs and Correct Status Truth

- **RED:** workflow/document tests assert the R1 exit matrix, accepted history review, fake-model causal
  requirement, fresh-start semantics, current threat boundary, future-work link, and absence of R1/v0.1
  overclaims.
- **GREEN:** add ADR 0011 and ADR 0012; amend focused docs and prior plans; update `SPEC.md` status to R1
  exit work without declaring completion.
- **Acceptance:** source-of-truth order is consistent; every R1 roadmap noun maps to one evidence row; the
  future work remains unassigned and non-authorizing.
- **Failure QA:** search for statements that cached trust is authoritative, the model is unused, R1 is
  tamper-proof, history is globally newest after truncation, or R1 equals v0.1.
- **Matching surface:** render README/help contract expectations from public docs and compare them with the
  current executable before implementation changes.

### Slice 2. Cross-Process Trust and Start Gate

- **RED:** deterministic child-process/barrier tests reproduce revoke-before-start, start-before-revoke,
  same-revision competing trust commands, symlink-retarget-before-start, run-ID collision, lock timeout,
  malformed/orphan lock, and aborted wait.
- **GREEN:** implement the bounded workspace lock and fresh authorization operation; move ID consumption,
  run allocation, and durable `run.started` inside the critical section.
- **Acceptance:** every denied path creates no run/journal/receipt, consumes no ID, and calls no provider or
  host; successful snapshots use only the freshly resolved identity; one concurrent command wins each
  revision.
- **Failure QA:** kill a child while it holds the lock and observe fail-closed `workspace_state_busy` with
  no automatic deletion; retarget a symlink and replace every trust-record shape before start.
- **Matching surface:** real headless processes prove both revoke-wins and start-wins order; the TUI refreshes
  current trust after another process revokes it.

### Slice 3. Typed Fake Model and Model-Generated Approval

- **RED:** provider tests require closed values, deterministic result, and abort; kernel/runtime tests require
  no approval before model observation, exactly one model call, runtime-owned action authority, invalid
  response blocking, and replay with zero calls.
- **GREEN:** add typed provider schemas/driver, model-ready kernel state/effect/event, composed fake effect
  host, durable receipt/reconciliation, and runtime-driven transition to approval.
- **Acceptance:** the model proposal is causally necessary; action authority remains runtime-owned;
  approval/tool/verifier order is preserved; success remains verifier-only.
- **Failure QA:** unknown response fields/variants, thrown provider error, abort before call, and every model
  crash boundary yield structured non-success with no duplicate call or forged approval.
- **Matching surface:** copied `eden exec --json` shows model progress before approval, separate approval,
  one fake action, verifier evidence, and terminal success; trust-only stops at approval.

### Slice 4. Bounded and Truly Read-Only State Inspection

- **RED:** boundary and limit-plus-one tests cover every numeric budget, missing-state no-write, hardlinked
  trust/journal, symlinked ancestor/run/journal, deterministic replacement checkpoints, mid-scan abort,
  raw-path canaries, and valid siblings beside every unavailable case.
- **GREEN:** add streaming bounded readers, read-only state resolution, link/identity checks, cancellation,
  sanitized errors, per-run contract decoding, explicit ASCII ordering, and internal-only catalog helpers.
- **Acceptance:** work and memory are bounded by the frozen values; budget exhaustion is visible; no history
  operation creates or changes an inode; one bad run never collapses valid siblings.
- **Failure QA:** use 513 children, 1 MiB plus one byte, 4097 records, a 64 KiB plus one-byte line, cumulative
  limits, a hardlink, a replaced leaf, and a secret-canary state path. Assert exact sanitized output.
- **Matching surface:** copied list/show against missing, mixed, oversized, wrong-workspace, unavailable,
  and aborted states with before/after tree hashes and effect/provider call counts.

### Slice 5. Stable and Responsive History TUI

- **RED:** renderer tests use 100 entries at 60x20, move beyond the first window, inspect the selected run,
  resize, and resolve delayed A inspection after back or selection B.
- **GREEN:** add the height-aware selection window, fixed controls/range, active-surface errors, and request
  generation/abort handling.
- **Acceptance:** selected row, outcome or recovery, range, back, and exit remain legible at 60x20; stale
  completions never change the current surface; composer/focus/trust remain unchanged.
- **Failure QA:** delete or corrupt a selected run after list, return before inspection resolves, issue two
  out-of-order inspections, resize at each state, and exercise unavailable recovery.
- **Matching surface:** real production PTY with 32 valid plus one corrupt run at 60x20 and 100x30; move
  across windows, inspect exact selection, back, resize, Ctrl+C, and verify shell sentinel/terminal restore.

### Slice 6. Production PTY, Standalone, and Workflow Evidence

- **RED:** workflow-contract tests require provider/docs/README paths, `workflow_dispatch`, production PTY,
  evidence manifest, and evidence upload; smoke requires the new model/trust/budget/no-write rows.
- **GREEN:** extend the existing workflow and smoke; add the smallest reusable production PTY driver outside
  the R0 spike when necessary.
- **Acceptance:** provider-only and normative-doc changes trigger all three hosted lanes; each lane produces
  an executable plus machine-readable evidence containing SHA, versions, artifact hash, decoded counts,
  exit table, PTY sizes, terminal restoration, shell sentinel, and explicit not-run support rows.
- **Failure QA:** run workflow parser with LF/CRLF, execute copied artifact outside checkout, inject corrupt
  state and invalid model output, and prove evidence cannot report success when a required row did not run.
- **Matching surface:** execute the public Quickstart from a clean temporary directory and run the production
  PTY driver at 100x30 and 60x20.

### Slice 7. Local Exit Candidate and Fresh Review

- Run frozen install, peers, focused suites, full tests, typecheck, build, Biome, Markdown, workflow
  contract, package, standalone smoke, production PTY, `git diff --check`, and both repository statuses
  after the final relevant edit.
- Run five fresh read-only exit-review lanes against the same worktree: goal, QA, code quality, security,
  and context/docs. Every lane must pass; a lane that reviewed earlier bytes cannot be reused.
- Inspect the complete diff from `BASELINE_SHA`. Reject scope drift, raw secret/path output, fake hosted
  evidence, a native/dependency addition, or a claim stronger than the recorded threat boundary.
- Record `IMPLEMENTATION_SHA` only after all local and review gates pass.

### Slice 8. Public Exact-SHA Evidence and Exit Checkpoint

- Commit the public repository, push `IMPLEMENTATION_SHA` to `origin/main` and `github/main`, prove both
  tips with `git ls-remote` and local `rev-parse`, and watch the exact GitHub run to terminal state.
- Require all Ubuntu/macOS/Windows jobs and evidence artifacts to pass. Ordinary in-scope failures return
  to the owning RED/GREEN slice, create a new implementation SHA, and repeat the complete affected gates.
- Conduct the final same-SHA R1 exit audit and present its evidence to the owner. Stop for explicit R1 exit
  acceptance.
- After acceptance, create any docs-only `CLOSEOUT_SHA`, push the public repository if needed, observe its
  docs-triggered workflow without another self-referential evidence commit, then commit the tutorial
  gitlink locally. Do not push the tutorial repository without new authority.

## Matching-Surface Ledger

### M1. Fresh Trust and Model Causality

Use two real processes and one state root. Prove revoke-wins/start-wins ordering, then run a trusted task.
Decode model progress, approval, action, verification, and terminal events. Inspect the journal and receipt
sequence and prove the action appears only after the model observation.

### M2. Model Crash and Replay

Stop at every model intent/receipt/observation boundary, discard the engine, reopen the journal, and count
driver calls. Replay never dispatches; completed receipt recovers without a duplicate call; unknown
outcome blocks visibly.

### M3. Read-Only and Bounded History

Run list/show with a missing state root and prove `lstat` remains `ENOENT`. Repeat with valid, corrupt,
hardlinked, replaced, oversized, and 513-child state. Decode product values, confirm bounded/truncated
truth, compare hashes, and count zero provider/tool/verifier calls.

### M4. Production TUI

At 100x30 complete trust, task, model, approval, action, verifier, and review. At 60x20 navigate 33 history
entries across multiple windows, inspect a terminal and corrupt run, exercise delayed selection/back,
resize, exit, and Ctrl+C. Capture frames, terminal modes, and shell sentinels.

### M5. Standalone Boundary

Copy the packaged artifact outside the checkout and rename the source tree away. Exercise help, invalid
arguments, restricted start, both grants, persisted trust, list/show, corruption, budgets, another
workspace, no-write missing state, and clean success.

### M6. Hosted Matrix

For the exact implementation SHA, require frozen install, peer checks, all tests, typecheck, build, Biome,
Markdown, package, standalone smoke, production PTY, evidence manifest, and uploaded executable/evidence on
Ubuntu, macOS, and Windows. Hosted PTY proves the process boundary; it does not claim real Terminal.app,
Windows Terminal, PowerShell IME, signing, installer, or release support.

## Verification Commands

```sh
pnpm install --frozen-lockfile
pnpm peers check
pnpm --filter @eden/providers test
pnpm --filter @eden/contracts test
pnpm --filter @eden/kernel test
pnpm --filter @eden/coding-runtime test
pnpm --filter @eden/cli test
node --test scripts/r1-walking-skeleton-workflow.test.mjs
pnpm test
pnpm typecheck
pnpm build
pnpm code:check
pnpm markdown:check
pnpm --filter @eden/cli package:bun
node scripts/smoke-standalone.mjs apps/eden/dist/eden
node scripts/r1-production-pty.mjs apps/eden/dist/eden
git diff --check
git status --short
git submodule status --recursive
```

Use `apps/eden/dist/eden.exe` for Windows process commands. The final evidence records exact commands,
exit codes, test counts, state paths, input sizes, hashes, effect/provider call counts, PTY sizes, shell
sentinels, artifact SHA-256, Git commit, hosted run URL, job conclusions, and every not-run support row.

## Explicit Non-Goals

- Real provider SDK, credentials, streaming, network, retry policy, context assembly, token accounting, or
  multi-turn model loop.
- Repository reads/search, Git inspection, file editing, shell/process execution, AnchorEdit, policy,
  trusted-host/Docker/native sandbox, or prompt-injection handling.
- Resume, continued historical execution, durable approval re-entry, GoalSpec, plan approval product flow,
  repair, checkpoints, worktrees, Evidence Pack, or R3 release artifacts.
- Global history, pagination, mutable catalog index, migration, deletion, retention, import/export, daemon,
  watcher, IPC, desktop, installer, signing, package-manager publication, update channel, or telemetry.
- Native filesystem helper, Rust crate, new external dependency, malicious same-user race-resistance claim,
  cryptographic state authenticity, or audit-grade journal integrity.
- Tutorial lesson, learning record, interview note, or tutorial-repository push.

## Risks and Stop Rules

| Risk | Mitigation or stop rule |
| --- | --- |
| Fake provider becomes decorative | Approval is impossible until a validated model observation creates the runtime action |
| Model output gains authority | Runtime fixes cwd, scope, digest, approval identity, and success authority |
| Trust revocation remains stale | Shared lock plus fresh identity/record reload before ID or journal creation |
| Lock crash blocks progress | Fail closed; no unsafe automatic reclamation; document recovery and future work |
| Catalog limit hides a newer run | `truncated` and budget notice; no global-newest claim beyond candidate budget |
| Static hardlink/replacement becomes truth | Link-count and repeated identity checks reject it |
| Same-user race is overclaimed | Future-work boundary and documentation negative tests |
| History path writes or dispatches | Explicit read-only resolver, tree hashes, call counters, missing-root proof |
| Async TUI reopens stale run | Generation plus abort and delayed-client regressions |
| Narrow TUI evidence is too small | 33-entry real PTY plus 100-entry renderer scenario |
| Hosted evidence proves stale bytes | Named implementation SHA, remote proof, exact headSha, machine-readable artifacts |
| Closeout commit changes executable closure | Docs-only diff proof or hosted rerun |
| Work expands into R2/R3 | Enforce non-goals and pause on new authority or public-contract decisions |

Pause only when evidence invalidates ADR 0001, 0002, 0004, 0006, 0007, 0009, or 0010; requires a new
external dependency or native boundary; changes product/trust/public protocol beyond this plan; cannot
implement the numeric budgets or lock semantics cross-platform; or requires work outside the exact
boundary. Ordinary bug repair, helper naming, internal refactoring, CI portability fixes, and repeated
exact-SHA publication are not checkpoints.

## Rollback and Compatibility

The repository is unreleased. Rollback may remove the new fake-model event/effect and restore the accepted
fake-action start path, remove the workspace lock, and remove the exit-only history hardening. It may
delete only isolated test/evidence state created by Build. It must never delete, rewrite, migrate, or copy
a user-selected state directory.

No compatibility shim reads old unpartitioned state or pre-model development journals. Product protocol
version 1 command framing remains. Any external release consuming the new journal events, provider values,
lock layout, or catalog budget semantics creates a future migration/versioning requirement.

## Human Checkpoints and Authority

1. **Exit decisions, complete:** A/A/A/A approved on 2026-07-16.
2. **Explore/Freeze plan review, complete:** the owner approved this exact model lifecycle, trust lock,
   numeric budgets, threat boundary, ordered slices, non-goals, and evidence/publication protocol.
3. **Build, in progress:** proceed continuously through ordinary RED/GREEN/REFACTOR, local review,
   public commit/push, and hosted repair. Pause only under the stop rule.
4. **R1 exit acceptance, pending:** after exact-SHA hosted evidence and the amended single-agent exit
   review pass, the owner accepts or rejects R1 completion.
5. **Tutorial publication:** public closeout and a local tutorial gitlink commit are authorized after R1
   acceptance. Tutorial push requires separate authority.

Decision approval and publication authority do not approve this plan or authorize product implementation
before checkpoint 2.

## Completion Criteria

R1 is ready for owner exit acceptance only when:

- a typed deterministic model response causally produces the only approval proposal;
- model, action, and verification effects all follow journaled intent, receipt, observation, replay, and
  crash-reconciliation rules;
- model output cannot grant trust/approval/capability or declare success;
- every run start re-resolves identity, reloads trust, and linearizes with grant/revoke before creating
  durable run state;
- denied starts consume no ID and create/call nothing;
- state reads obey every numeric budget, reject hardlinks/static replacement, honor cancellation, and leak
  no raw diagnostics;
- missing-state history creates no inode and all history inspection remains effect-free;
- invalid runs stay independently unavailable and all returned public values decode;
- 60x20 many-run selection, recovery, back/exit, resize, delayed completion, and terminal cleanup pass;
- public helper exports preserve runtime-owned path authority;
- README, help, SPEC, CONTEXT, ADRs, threat model, prior plans, workflow filters, and future-work records
  agree without R2/R3, release, or adversarial-filesystem overclaims;
- full local gates, copied standalone smoke, production PTY, and five fresh review lanes pass after the
  final relevant edit;
- `IMPLEMENTATION_SHA` matches both public remotes and the successful three-platform hosted run;
- the owner accepts the R1 exit before any document marks R1 complete;
- the tutorial gitlink is committed locally to the authorized public closeout SHA, with tutorial push
  still unperformed unless separately authorized.

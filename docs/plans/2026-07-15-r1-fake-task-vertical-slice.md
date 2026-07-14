# R1 Fake-Task Vertical Slice Plan

- Status: Local implementation and evidence complete; slice review and hosted evidence pending
- Date: 2026-07-15
- Roadmap stage: R1, Installable Walking Skeleton
- Baseline: `03c5c0c2ef6b8551392dfe5bbf2823bf70f73718`
- Approved: 2026-07-15, options A/A/A
- Human checkpoint: review the completed slice evidence before selecting the next R1 slice

## Goal and R1 slice outcome

Deliver the first production vertical slice in which one user-entered fake task passes through the
versioned product contracts, deterministic kernel reducer and decision function, effect dispatcher,
durable JSONL journal, replay, an in-process `AgentClient`, headless JSON output, and the Bun/OpenTUI
terminal product.

The slice is complete only when a standalone `eden` artifact can run the same fake task through both
surfaces without a provider key, rebuild the same `RunState` and `ProductView` from its journal, and
demonstrate the declared effect crash boundaries. This is the first R1 slice, not the R1 exit.

## Current repository facts

- R0 is complete at `03c5c0c`. `@eden/contracts` exports protocol version 1 schemas, non-throwing
  decoders, and deterministic awaiting-approval, executing, and review fixtures.
- `@eden/kernel` contains only three placeholder transitions. `@eden/coding-runtime`, `@eden/lab`, and
  `apps/eden` are skeletons; the current CLI prints R0 placeholder text.
- ADR 0002 fixes the event-sourced shape: validated events, pure reduction and decisions, port-based
  dispatch, an append-only journal, and product projections.
- ADR 0004 fixes verifier-owned completion. No product command, renderer action, model result, or ordinary
  tool observation may cause `succeeded` without a verifier-produced event and evidence identity.
- ADRs 0005 and 0006 require the terminal product in the first slice and require TUI and headless clients
  to consume one runtime through `AgentClient`.
- ADR 0008 selects Bun 1.3.14, OpenTUI 0.4.3, its React binding and managed keymap for `apps/eden`. pnpm,
  Node 24, TypeScript 7, and Node's test runner remain the non-renderer development baseline.
- `docs/event-model.md` reserves a versioned journal envelope but intentionally leaves its initial shape
  open for R1. `CONTEXT.md` lists that envelope as the only known open architecture question.
- The OpenTUI spike proves renderer, keymap, PTY cleanup, and standalone packaging techniques. ADR 0008
  prohibits copying the spike's renderer-owned fake state machine into production.

## Topology lock

The slice has six independently verifiable components:

1. **Kernel truth:** known events reduce to one deterministic `RunState`; `decide` emits stable effects;
   illegal transitions fail visibly and terminal state is immutable.
2. **Durability and effects:** a versioned JSONL journal commits events before reduction, records effect
   intent before dispatch, records observations after dispatch, and replays without real I/O.
3. **Product boundary:** one projection produces `ProductView` and `ProductEvent` values, while an
   in-process `AgentClient` enforces command freshness and trusted emission.
4. **Headless product:** `eden exec --json` submits the fake task and serializes only decoded product
   events from the client.
5. **Terminal product:** default `eden` uses OpenTUI to submit, display, approve, follow, and review that
   same task through the same client.
6. **Distribution evidence:** a Bun standalone artifact passes isolated install/smoke checks and the real
   headless and TUI matching surfaces.

Failure in any component fails the slice. Renderer snapshots, direct reducer tests, or a green package
build cannot substitute for the end-to-end matching surfaces.

## One-time owner decision review

The project owner approved the recommended option in each decision below on 2026-07-15. These decisions
are fixed Build input unless implementation evidence invalidates the accepted architecture.

### D1. Initial journal envelope

**Recommendation: Option A, a complete v1 causal envelope.** Persist every kernel event as one closed,
newline-terminated record with exactly these fields:

```ts
type JournalRecordV1 = {
  journalVersion: 1;
  eventId: string;
  runId: string;
  sequence: number;
  recordedAt: string;
  causationId: string | null;
  correlationId: string;
  type: KernelEvent["type"];
  payload: unknown;
  redaction: {
    status: "not-required" | "redacted";
    fields: readonly string[];
  };
};
```

- **A. Complete causal envelope (recommended):** pays a small amount of schema and fixture cost now;
  makes ordering, command/effect attribution, diagnostics, redaction, and future migrations explicit before
  any real provider or tool data exists.
- **B. Minimal envelope:** keep only version, run ID, sequence, type, and payload. It is quicker to write,
  but the first real effect would require a migration to add attribution and redaction semantics.
- **C. Checksummed envelope:** add per-record or chain checksums now. It improves tamper/corruption evidence,
  but introduces canonical-byte and recovery policy before R1 has a demonstrated integrity requirement.

The product protocol remains independently versioned at `1`. Sequence starts at `0`, is contiguous within
one run, and is the journal commit order. `recordedAt` is an ISO-8601 UTC value supplied by the clock port;
it never participates in reduction. The initial migration registry accepts v1, has no down-migration, and
rejects unknown versions, unknown event variants, duplicate event IDs, run-ID mismatch, or sequence gaps.

### D2. Effect crash and reconciliation boundary

**Recommendation: Option A, intent-before-effect with explicit reconciliation.** The committed JSONL
newline is the state transition boundary. The engine follows this order:

1. validate and append the event;
2. flush the record to the journal;
3. reduce it into state;
4. derive the next effect;
5. append and reduce an `effect.requested` event containing the stable `effectId`;
6. dispatch through a registered port;
7. persist the adapter's idempotent receipt outside the journal when the adapter needs one;
8. append and reduce the observed result event.

Pure replay performs no I/O and returns any unresolved `effect.requested` as reconstructed state. In the
following recovery step, the dispatcher never blindly repeats it: the dispatcher asks the owning adapter
to reconcile the same `effectId`. `completed` re-emits the recorded observation, `not-started` permits one
execution with that identity, and `unknown` produces a visible blocked outcome. The R1 fake tool host
implements this seam with a receipt under the run state directory, so the after-effect /
before-observation crash is testable without touching the user's workspace.

- **A. Explicit reconciliation (recommended):** establishes the trustworthy boundary needed by later real
  tools and proves both safe retry and uncertain-outcome behavior. It costs one receipt and reconciliation
  seam in the fake adapter.
- **B. Always retry unresolved effects:** simpler, but encodes an unsafe default before non-idempotent tools
  arrive and can duplicate an action after a crash.
- **C. Always block unresolved effects:** safest and smallest, but the walking skeleton cannot demonstrate
  recoverable progress even for a known idempotent fake effect.

R1 does not claim byte-level power-loss repair. An unterminated, malformed, or out-of-sequence JSONL record
blocks replay with structured diagnostics; the runtime does not silently truncate or rewrite it.

### D3. `eden exec --json` output contract

**Recommendation: Option A, newline-delimited `ProductEvent` values.** `--json` writes one complete JSON
object per line to stdout, ordered by product cursor, with no prose, ANSI control sequence, kernel event,
or diagnostic payload. The final line is `run.terminal`; diagnostics and usage errors go to stderr.

- **A. NDJSON event stream (recommended):** exposes progress and approval/terminal facts through the same
  subscription consumed by the TUI, remains pipe-friendly, and avoids inventing a later streaming mode.
- **B. One final `ProductView` document:** easiest for a one-shot script, but hides progress and makes the
  first long-running headless use add another public output mode.
- **C. Both in this slice:** accommodates more consumers but doubles compatibility and negative-test scope
  before there is one external user.

For this slice, the invocation is `eden exec --json "<task>"`. R1 has no real provider, so there is no
runtime-selection `--fake` flag. Non-interactive approval requires the explicit
`--approve-fake-action` option. Empty task text, unknown options, and approval without that option exit `2`
with one JSON-encoded `ProductError` line on stderr and no terminal success event. Argument errors use
`invalid_arguments`; the pending approval uses `approval_required`. Journal/runtime failures exit `1` with
their stable `ProductError`; successful completion exits `0`.

## Frozen journal, kernel, and projection contract

### Fake task flow

The worked task is arbitrary non-empty user text. It performs no repository edit and uses no provider.
The stable lifecycle is:

1. validated `run.start` becomes `run.started`, preserving the task and command correlation identity;
2. the reducer enters `awaiting-approval` with one canonical fake action;
3. an approved `approval.resolve` enters `executing`; denial produces a blocked outcome and no effect;
4. `decide` emits `fake.action.execute` with a deterministic effect identity;
5. the fake host writes an idempotent receipt and returns `fake.action.completed`;
6. `decide` emits `fake.verification.run`;
7. the fake verifier returns `verification.completed` with the current run identity and evidence reference;
8. only a passing `verification.completed` transitions the run to `succeeded` and review.

The canonical fake action is visible as `Run the deterministic fake task`, uses the selected workspace as
`cwd`, explains that no workspace file will change, and scopes authority to the R1 demo state directory.
The fake host may write only beneath the injected state directory. `changedFiles` therefore remains empty.

### Kernel state and effects

`RunState` owns run identity, revision, phase, task, approval, progress, pending/in-flight/completed effect
identity, check result, evidence reference, terminal outcome, and the correlation identity. It owns no
clock, filesystem path, renderer focus, React value, or transport object.

`reduce` is total over every known valid state/event pair. Invalid pairs return a typed transition failure
without changing state. `decide` is pure and emits at most one effect for this slice. Effect IDs are derived
from run identity and effect role, so replay produces the same intent instead of a fresh duplicate.

### Product projection and cursors

Projection is a pure runtime-owned mapping from journal records plus resulting state to contract values.
It never lives in a renderer and never exposes raw `KernelEvent` values.

- `revision` increments once per accepted state-changing kernel event.
- Product cursors form a separate contiguous sequence because one kernel event may project zero, one, or
  multiple product events.
- Product event IDs are deterministically derived from the source journal event ID and projection index.
- Replaying the same journal produces deep-equal `RunState`, `ProductView`, and `ProductEvent` sequences,
  including IDs, revisions, and cursors.
- A fresh subscription begins with `session.snapshot`; an `afterCursor` subscription emits only later
  events. A stale command revision returns `stale_revision` and appends nothing.

The existing product protocol schemas are extended only when the slice proves a missing field or variant.
Renderer-local state remains prohibited. Product events are derived output and are not copied into the
authoritative kernel journal.

### In-process `AgentClient`

Export the renderer-independent port from `@eden/contracts` and its implementation from
`@eden/coding-runtime`:

```ts
interface AgentClient {
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

`submit` validates revision and authority before append. `subscribe` is replay-backed and then live; it
does not expose journal records. `close` releases process resources but does not alter run state. Product
cancellation remains the existing `run.cancel` command; `AbortSignal` cancels only client waiting.

## Test strategy and accepted seams

Use test-first development for every behavior slice. Approval of this plan approves the exact first RED
reducer expectation that success is impossible before current verifier evidence. The implementation run
must capture that failing test before GREEN, but it does not create another human pause.

- **Pure seam:** call `reduce`, `decide`, and projection functions with fixed events and independent expected
  objects. No filesystem, clock, random ID, client, or renderer mock is permitted.
- **Journal seam:** use the real file journal in a fresh temporary directory with a fixed clock and ID
  source. An in-memory journal may support narrow unit tests but cannot satisfy replay or crash acceptance.
- **Effect seam:** fake only the real external adapter boundary. The production fake host uses a real
  temporary state-directory receipt keyed by `effectId`; tests may inject its three reconciliation results.
- **Crash seam:** stop the step-driven runtime at named boundaries, discard the engine instance, reopen the
  same journal and receipt directory, and observe replay. Do not add a production `crashForTest` branch.
- **Client seam:** use `InProcessAgentClient` over the real reducer, dispatcher, projection, file journal,
  replay, and fake host. Do not bypass the client with fixture injection.
- **Renderer seam:** use OpenTUI's native test renderer for deterministic frames and a real PTY for final
  matching-surface evidence. Renderer tests consume an `AgentClient`; they may not own fake lifecycle state.
- **Expected results:** derive assertions from `SPEC.md`, accepted ADRs, `docs/event-model.md`,
  `docs/product-contracts.md`, and the worked flow above, not by serializing implementation output as the
  oracle.

## Planned files

```text
packages/kernel/
  package.json
  src/index.ts
  src/index.test.ts
packages/contracts/
  src/protocol.ts
  src/index.ts
  test/protocol.test.ts
packages/coding-runtime/
  package.json
  src/index.ts
  src/agent-client.ts
  src/dispatcher.ts
  src/projection.ts
  src/runtime.ts
  src/fake-tool-host.ts
  src/journal/index.ts
  src/journal/file-journal.ts
  src/journal/schema.ts
  test/agent-client.test.ts
  test/crash-boundaries.test.ts
  test/file-journal.test.ts
  test/replay.test.ts
apps/eden/
  package.json
  tsconfig.json
  src/index.tsx
  src/args.ts
  src/headless.ts
  src/tui.tsx
  test/args.test.ts
  test/headless.test.ts
  test/tui.test.tsx
.github/workflows/r1-walking-skeleton.yml
scripts/r1-walking-skeleton-workflow.test.mjs
docs/event-model.md
docs/product-contracts.md
docs/plans/2026-07-15-r1-fake-task-vertical-slice.md
CONTEXT.md
package.json
pnpm-lock.yaml
```

Keep the kernel in its existing module until a demonstrated cohesion problem requires a split. Keep
journal schema and filesystem mechanics inside `journal/`. Keep Bun, OpenTUI, React, keymap, JSX, terminal
dimensions, keyboard bindings, and renderer test types inside `apps/eden`.

## Ordered test-first slices

### Slice 1: journal and kernel schema foundation

- **Public seam:** import kernel schemas/types plus the v1 journal decoder through package entrypoints.
- **RED:** fixed records fail because the full envelope, kernel variants, and stable decode failures do not
  exist.
- **GREEN:** add TypeBox-derived internal kernel schemas, the closed v1 journal schema, non-throwing decode,
  and the identity-only v1 migration registry.
- **Acceptance:** valid records round-trip; unknown versions, types, fields, malformed redaction data,
  duplicate IDs, sequence gaps, and run mismatches fail visibly without mutation.
- **Failure QA:** feed a v2 record and a partial final line to the real file reader; observe a structured
  journal error and zero dispatch.
- **Permitted fakes:** fixed clock and opaque identifiers only.

### Slice 2: deterministic fake-task reducer and decisions

- **Public seam:** `reduce(initialRunState, event)` and `decide(state)` from `@eden/kernel`.
- **RED:** table-driven tests describe start, approval, effect intent, action result, verification result,
  denial, stale/illegal transition, and terminal immutability before those transitions exist.
- **GREEN:** replace the three placeholder transitions with only the state, event, effect, transition-error,
  reducer, and decision behavior frozen above.
- **Acceptance:** the happy sequence ends only after passing verifier evidence; denial emits no effect;
  repeated reduction is rejected; terminal events cannot be followed by state changes; `decide` is stable
  and emits at most one deterministic effect.
- **Failure QA:** attempt to submit action completion before intent and attempt direct success; both return
  typed failures and leave the prior state deep-equal.
- **Permitted fakes:** none.

The first RED test for verifier-owned success must fail for the expected missing transition behavior and be
recorded before GREEN. Its seam and oracle are approved in this plan review, so the agent continues without
another checkpoint unless the architecture-exception rule fires.

### Slice 3: file journal, replay, and projection

- **Public seam:** create a real run journal, append validated events, close it, reopen it, and replay it to
  `RunState`, `ProductView`, and product events.
- **RED:** integration tests assert append/flush order, replay equality, migration rejection, cursor rules,
  and no-I/O replay before implementations exist.
- **GREEN:** implement the file journal, replay fold, pure projection, deterministic product IDs/cursors,
  and current snapshot construction.
- **Acceptance:** the same JSONL bytes rebuild deep-equal truth and product values across two engine
  instances; replay never calls an effect port; invalid records do not partially mutate reconstructed state.
- **Failure QA:** introduce an unknown version, sequence gap, duplicate ID, and unterminated last record;
  each blocks with the expected stable error and no journal rewrite.
- **Permitted fakes:** fixed clock and ID source; real temporary filesystem only.

### Slice 4: dispatcher and crash reconciliation

- **Public seam:** drive one step at a time through the real file journal and production fake host.
- **RED:** the crash matrix fails at each named boundary before intent journaling, receipt reconciliation,
  and observation recovery exist.
- **GREEN:** implement commit-before-reduce orchestration, `effect.requested`, the dispatcher, fake action
  and fake verification receipts, and explicit reconciliation.
- **Acceptance:** exercise these restart points independently:
  1. before a domain event commit: restart sees the prior state;
  2. after domain event commit and before reduction: replay applies it exactly once;
  3. after effect intent and before dispatch: `not-started` executes once with the same effect ID;
  4. after adapter receipt and before observation append: `completed` appends the missing observation
     without executing again;
  5. after observation commit and before reduction: replay applies the observation exactly once;
  6. unresolved `unknown`: the run becomes visibly blocked and no effect executes.
- **Failure QA:** count host executions and receipts for every row; any duplicate or missing effect fails.
- **Permitted fakes:** only the adapter reconciliation result in the `unknown` negative case.

### Slice 5: in-process client and semantic authority

- **Public seam:** submit product commands and consume snapshots/subscriptions through `AgentClient` only.
- **RED:** integration tests freeze start, approval, cursor replay, stale revision, cancellation of waiting,
  trusted event emission, and close behavior.
- **GREEN:** add the contract port and `InProcessAgentClient` over the real runtime stack.
- **Acceptance:** one client completes the fake task; another client reconstructs the same snapshot from the
  journal; `afterCursor` does not duplicate events; stale commands append nothing; a client cannot submit a
  product event or forge success.
- **Failure QA:** submit a stale approval and abort a subscription wait; observe `stale_revision` and clean
  cancellation without altering run truth.
- **Permitted fakes:** fixed clock/IDs and the production fake host only.

### Slice 6: headless JSON matching surface

- **Public seam:** run the built app as `eden exec --json "Index the fake workspace"` with and without
  `--approve-fake-action`.
- **RED:** process tests require strict argument parsing, NDJSON-only stdout, product-schema-valid lines,
  explicit non-interactive approval, stable exit codes, and final verifier-backed success.
- **GREEN:** implement argument parsing, composition, subscription, and headless serialization through
  `InProcessAgentClient`.
- **Acceptance:** approved execution exits `0`, every line decodes as `ProductEvent`, cursors are monotonic,
  the terminal event references evidence, and replay reconstructs its final view. Without explicit fake
  approval, the process exits `2` at approval with no dispatched effect or success.
- **Failure QA:** run empty task and unknown option cases; stdout stays empty, stderr is structured, and
  exit code is `2`.
- **Permitted fakes:** the production fake host only.

### Slice 7: OpenTUI matching surface

- **Public seam:** launch default `eden`, enter a task, inspect the canonical action, approve it, observe
  progress and verifier-backed completion, then exit to the parent shell.
- **RED:** OpenTUI test-renderer cases require task composition, approval attribution, progress, terminal
  evidence, failure recovery, 60x20 safety, and client-only state before production components exist.
- **GREEN:** implement the smallest OpenTUI component tree using the pinned React binding and managed
  keymap. Renderer state is limited to draft, focus, selection, and layout.
- **Acceptance:** all task facts come from `AgentClient`; the displayed approval text matches the submitted
  command; a narrow terminal preserves the selected action; Ctrl+C cancels or exits through the client and
  renderer cleanup restores the shell.
- **Failure QA:** deny the action and observe a blocked product outcome with no fake-host receipt; no local
  renderer transition may display executing or succeeded.
- **Permitted fakes:** a scripted `AgentClient` is allowed only in isolated renderer unit tests. The final
  renderer integration and PTY scenarios use `InProcessAgentClient` and the real journal.

### Slice 8: standalone artifact and clean-machine CI

- **Public seam:** use a Bun-compiled executable copied into an empty directory with isolated HOME and
  state paths.
- **RED:** a workflow-contract test freezes matrix lanes, frozen pnpm install, pinned Bun/OpenTUI versions,
  package step, isolated help/headless smoke, artifact upload, and no spike-package dependency.
- **GREEN:** add production app dependencies/scripts, the standalone build, and the R1 workflow on Ubuntu,
  Windows, and macOS using each platform's native OpenTUI package.
- **Acceptance:** each lane installs from the lockfile, builds/tests/typechecks, packages one artifact,
  copies it outside the checkout, runs `--help`, rejects an invalid option, and completes the approved
  headless fake task without a key. The artifact must not resolve source files or `node_modules` at runtime.
- **Failure QA:** run the artifact with an unwritable state directory; observe a structured startup error,
  non-zero exit, and no false terminal event.
- **Permitted fakes:** the production fake host only; a hosted TTY is not claimed as real-terminal evidence.

### Slice 9: close the first R1 slice

- Update `docs/event-model.md` with the approved v1 envelope and reconciliation rule.
- Update `docs/product-contracts.md` with the exact `AgentClient` and NDJSON semantics.
- Record fresh automated, crash-matrix, headless, PTY, packaging, and hosted evidence in this plan.
- Update `CONTEXT.md` to identify the first R1 slice as complete and name the next R1 slice without claiming
  that R1 itself is complete.
- Inspect both repositories. Commit public implementation first only if separately authorized, then update
  the tutorial gitlink only if separately authorized. Approval of this plan does not authorize commits or
  pushes.

## Matching-surface scenarios

Run these after the final relevant implementation edit, not from fixtures or a renderer-only harness.

### Headless happy path

```sh
EDEN_STATE_DIR="$(mktemp -d)" ./dist/eden exec --json \
  --approve-fake-action "Index the fake workspace"
```

Capture stdout as NDJSON, validate every line with `decodeProductEvent`, and prove that approval,
execution, verification, and terminal success share one run and end with evidence.

### Headless failure path

```sh
EDEN_STATE_DIR="$(mktemp -d)" ./dist/eden exec --json "Index the fake workspace"
```

Observe exit `2`, a structured approval-required error on stderr, no effect receipt, and no success event.

### Real TUI path

Launch `./dist/eden` in a 100x30 PTY with an isolated state directory. Enter `Index the fake workspace`,
submit, inspect the exact action/cwd/reason/scope, approve, observe progress and verifier evidence, then
quit. Repeat at 60x20 for action safety. Run a denial once and prove no executing/succeeded frame appears.
After normal quit and Ctrl+C, enter a shell sentinel to prove terminal-mode restoration.

### Replay and crash path

For every crash-matrix row, reopen the same on-disk journal and fake-host receipt directory in a fresh
runtime instance. Compare state, view, product event sequence, effect execution count, and receipt count to
the independent expected row. A source-level call count or in-memory snapshot is not sufficient evidence.

## Verification commands

```sh
pnpm install --frozen-lockfile
pnpm peers check
pnpm --filter @eden/kernel test
pnpm --filter @eden/coding-runtime test
pnpm --filter @eden/contracts test
pnpm --filter @eden/cli test
pnpm test
pnpm typecheck
pnpm build
pnpm code:check
pnpm markdown:check
pnpm --filter @eden/cli package:bun
node --test scripts/r1-walking-skeleton-workflow.test.mjs
git diff --check
git status --short
git submodule status --recursive
```

The implementation run must also execute every matching-surface scenario above against the final
standalone artifact and record the hosted workflow URL and commit. A green local source run does not
satisfy clean-machine distribution evidence.

## Local implementation evidence

Evidence captured on 2026-07-15 against baseline `03c5c0c2ef6b8551392dfe5bbf2823bf70f73718`:

- Kernel tests: eight transitions pass, including the recorded verifier-owned-success RED/GREEN boundary,
  denial, illegal ordering, deterministic effects, and terminal immutability.
- Runtime tests: fifteen integration tests pass across real JSONL files, replay, projections, the
  in-process client, the six named crash/reconciliation boundaries, and journal rejection of v2, unknown
  fields, duplicate event IDs, run mismatch, sequence gaps, and an unterminated tail.
- Product surfaces: six Bun tests pass. Headless output decodes as cursor-ordered `ProductEvent` NDJSON and
  ends in verifier evidence; approval-required execution creates no receipt. The OpenTUI test renderer
  completes the real-client happy path and a 60x20 denial path.
- Full workspace: `pnpm peers check`, `pnpm test`, and `pnpm typecheck` pass. The hook fixture tests require
  permission to run isolated `git init` operations under `/tmp`; they pass when run with that permission.
- Standalone: `pnpm --filter @eden/cli package:bun` produced a 114,911,360-byte Linux executable with
  SHA-256 `6b4a5c92ebb14ef6b00201881349c7dfc01052c424d818dfd2bb293598f6b16e`. A copy under an empty temporary
  directory passed help, invalid-input, approved headless, approval-required, and unwritable-state cases;
  the approved run emitted eight schema-valid events and the unwritable state exited 1 with no success.
- Real PTY: the standalone artifact displayed the complete attributable approval and verifier-backed
  success at 80x24. At 60x20, denial displayed `blocked`, created only `journal.jsonl`, and created no
  receipt. Normal `q` exit returned to a parent shell that printed `EDEN_TUI_RESTORED`; Ctrl+C returned to
  a parent shell that printed `EDEN_TUI_CTRL_C_RESTORED`.
- Workflow: `scripts/r1-walking-skeleton-workflow.test.mjs` passes and freezes Ubuntu, Windows, and macOS
  install/build/test/package/smoke/upload lanes without a spike dependency.

Hosted workflow evidence is intentionally pending. This plan did not authorize a commit or push, so no
honest hosted workflow URL or immutable source commit exists yet. The first R1 slice must remain short of
final completion until publication is separately authorized and all three hosted lanes pass.

## Explicit non-goals

- Completing all of R1. Welcome, provider placeholder/onboarding, workspace-trust selection, session list,
  Quickstart polish, and the final R1 exit review belong to later R1 slices.
- A real model provider, model loop, context assembly, real shell/file tools, workspace edits, Git diff,
  policy engine, sandbox, network access, credential storage, or provider key.
- Durable user approval across process exit, general `eden resume`, repair budgets, Evidence Packs, or the
  R3 goal/verifier product. This slice proves replay and effect reconciliation only at named boundaries.
- IPC, daemon, socket, desktop, web, IDE, remote client, or protocol negotiation beyond in-process v1.
- Journal compaction, snapshots as authority, checksums, encryption, automatic torn-line repair, concurrent
  writers, cross-run transactions, journal downgrade, or migration from a pre-v1 persisted format.
- Multiple concurrent runs, background sessions, subagents, plugins, skills, or a second fake/real tool.
- Copying the spike's renderer-owned task state, keeping Ink as a second implementation, changing the Bun /
  OpenTUI decision, switching to Bun workspaces/tests, or leaking renderer/native types inward.
- Release signing, updater, package-manager installers, public release publication, telemetry, or a support
  claim for terminals not exercised by matching-surface evidence.
- Commit, push, merge, tutorial lesson, learning record, or interview-note work without separate authority
  and demonstrated understanding.

## Risks and stop rules

| Risk | Mitigation or stop rule |
| --- | --- |
| Journal v1 accidentally becomes product protocol v2 | Keep versions and decoders separate; no journal record crosses `AgentClient` |
| Replay calls an adapter | Fail replay tests on any port invocation; only reconciliation may consult the owning adapter |
| Crash recovery duplicates an effect | Require stable effect IDs, receipts, execution counts, and all six crash rows |
| Renderer becomes a second state machine | TUI owns only ephemeral UI state; lifecycle assertions must pass through `AgentClient` |
| Headless and TUI semantics diverge | Both compose the same client/runtime and consume the same product projections |
| Fake verifier weakens ADR 0004 | Only `verification.completed` with current evidence may produce success |
| Standalone artifact hides source/runtime coupling | Smoke from an empty directory with isolated HOME/state and no checkout imports |
| R1 scope expands into a usable coding agent | Stop at one fake action and the explicit non-goals |
| An unapproved public/trust decision appears | Pause, amend this plan, and request one human decision |
| Ordinary implementation preference appears | Choose the smallest approach consistent with this plan and continue |

Evidence that changes ADR 0002, 0004, 0006, or 0008, changes a product/trust/public contract, or proves
one of D1-D3 unsafe is the only reason to pause after the first RED test checkpoint. A package-layout or
naming preference is not a checkpoint.

## Rollback and migration boundary

Before an external release consumes journal v1, rollback may remove the R1 app/runtime implementation and
restore the R0 skeleton. Preserve any created journal as evidence; do not teach an older binary to ignore
v1 records. After a released artifact writes journal v1, incompatible semantic change requires an explicit
v2 migration and cannot be handled by editing v1 in place.

## Human checkpoints

1. **Plan review, complete:** D1 complete causal envelope, D2 explicit reconciliation, D3 NDJSON output,
   the test strategy, matching surfaces, and non-goals were approved on 2026-07-15. This approval does not
   authorize a commit or push.
2. **Architecture exception only:** pause only if evidence invalidates the accepted architecture or
   creates a new product, trust, or public-contract decision.
3. **Slice review:** review final diff, crash ledger, standalone headless/TUI evidence, hosted install result,
   and residual risk before selecting the next R1 slice.

## Completion criteria

This first R1 slice is complete when:

- journal v1 records validate the approved envelope and replay rejects corruption/version/order failures;
- the same committed journal rebuilds deep-equal `RunState`, `ProductView`, and product event sequences;
- all six crash/reconciliation rows prove no duplicate effect and visible uncertain outcomes;
- only verifier-produced current evidence can create `succeeded`;
- both surfaces use one `InProcessAgentClient` and cannot submit or render forged runtime truth;
- the headless artifact emits schema-valid NDJSON and exercises happy, approval-required, and invalid-input
  paths with exact exit behavior;
- the real OpenTUI artifact exercises task entry, attributable approval, progress, completion, denial,
  narrow layout, cancellation, and shell cleanup;
- the standalone artifact runs outside the checkout without Node, source files, `node_modules`, or a key;
- focused and full verification pass after the final edit, and hosted install/package smoke is green on the
  declared matrix;
- docs and `CONTEXT.md` report the first slice truthfully without claiming the rest of R1;
- no explicit non-goal entered the implementation.

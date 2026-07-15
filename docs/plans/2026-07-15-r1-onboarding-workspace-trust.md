# R1 Onboarding and Explicit Workspace Trust Plan

- Status: Implementation and local/hosted evidence complete; slice review pending
- Date: 2026-07-15
- Roadmap stage: R1, Installable Walking Skeleton
- Baseline: `a971faaf1b525a617a48cba424050a97c46fb8b9`
- Prior slice: `docs/plans/2026-07-15-r1-fake-task-vertical-slice.md`, accepted
- Approved: 2026-07-15, options A/A/A/A
- Human checkpoint: final slice review after Build, automated Review, and matching-surface QA

## Goal and user-visible outcome

Deliver the next R1 vertical slice in which a fresh standalone `eden` launch is useful without a provider
key, identifies the exact workspace, begins in an explicit restricted state, and cannot start even the fake
task until the user trusts that workspace.

The same in-process `AgentClient` must expose workspace-review truth to the TUI and enforce it for
headless execution. Trusting a workspace authorizes task entry for that exact workspace identity; it does
not approve the fake action, enable network access, claim a sandbox, load project executable code, or
grant future tools authority. The existing action approval remains a separate mandatory boundary.

The slice is complete only when the standalone TUI proves the first-run, trust, persistence, revocation,
and separate-action-approval journey, while headless execution proves trust-required and explicitly
trusted paths with stable structured errors. This is the second R1 slice, not the R1 exit.

## Current repository facts

- The accepted first slice at `a971faa` already drives one fake task through contracts, the deterministic
  kernel, JSONL journal, replay, `InProcessAgentClient`, headless NDJSON, and Bun/OpenTUI.
- `apps/eden/src/headless.ts` and `apps/eden/src/tui-runner.tsx` currently create a new random workspace ID
  per run and hard-code `trust: "trusted"`. This is the exact unsafe placeholder this slice removes.
- `InProcessAgentClient.open` currently opens a run journal immediately. A trust gate added only in the
  renderer would therefore be too late and would create durable run state before the workspace decision.
- `ProductView.workspace` already distinguishes `trusted` and `restricted`, but protocol version 1 has no
  pre-run workspace-review view or versioned trust command.
- `ProjectionContext` injects workspace data from the client instead of replaying the workspace snapshot
  stored at run start. Historical run views can therefore depend on caller-supplied context.
- `packages/coding-runtime/src/workspace/index.ts` contains only the earlier `WorkspaceSnapshot` type; no
  workspace identity or trust store exists.
- `PRODUCT.md`, `SPEC.md`, `docs/product/user-journey.md`, `docs/product/ux-state-model.md`, and
  `docs/threat-model.md` already require onboarding, explicit workspace trust, visible network/sandbox
  truth, and a separation between workspace trust and scoped action approval.
- ADR 0006 requires both surfaces to send versioned commands and consume runtime projections through one
  `AgentClient`; renderer-local trust state is prohibited.
- R1 has a deterministic fake provider and no real provider key, policy engine, sandbox, project tool,
  context assembly, or network capability. The onboarding screen must report those limitations rather
  than simulate later R2 features.
- The public repository is version `0.0.0` and has no external release. Product protocol v1 and journal v1
  may receive this pre-release extension, but existing run command/event shapes remain valid and the plan
  must not claim compatibility with arbitrary development-state files.

## Evidence and decision criteria

The plan follows these repository-owned criteria:

1. **Trust before autonomy:** an untrusted workspace cannot create a run or dispatch an effect.
2. **One runtime, many surfaces:** TUI keys and headless flags reach the same versioned trust command and
   the same trust store.
3. **Exact and legible scope:** the product displays the canonical root that receives trust and never
   inherits trust from an unshown parent.
4. **Fail closed:** missing, stale, malformed, or mismatched trust state resolves to restricted.
5. **Separate control planes:** workspace trust, action approval, network policy, and sandbox guarantees
   remain distinct.
6. **Replay truth:** a run records the workspace identity and trust snapshot used at start; later trust
   changes cannot rewrite historical run views.
7. **Smallest honest R1 slice:** onboarding explains the deterministic fake profile and current authority,
   but does not implement provider configuration, Git inspection, project instructions, or R2 policy.

Current VS Code Workspace Trust documentation is supporting product evidence, not a dependency. It
confirms the value of restricted browsing, explicit trust, and disabled execution in untrusted folders.
Eden deliberately omits parent-folder trust in this slice because current VS Code guidance also treats
broad parent trust as easy to grant accidentally:
<https://code.visualstudio.com/docs/editing/workspaces/workspace-trust>.

## Topology lock

The slice has four independently verifiable components:

1. **Onboarding projection:** a useful pre-run view identifies the deterministic fake profile, exact
   workspace, restricted/trusted state, current capability limits, and available next actions.
2. **Workspace identity and persistence:** one runtime-owned store binds a durable decision to an exact
   canonical root, defaults safely, survives restart, supports revocation, and rejects corrupt or stale
   records.
3. **Trust enforcement and run audit:** `AgentClient` rejects `run.start` before trust without opening a
   run journal, and an accepted run snapshots workspace truth into the journal-backed kernel state.
4. **Matching surfaces:** OpenTUI and headless CLI exercise the same commands and store while preserving a
   separate fake-action approval.

Failure in any component fails the slice. A renderer snapshot, a persisted JSON file, or a green trusted
happy path cannot substitute for the negative proof that restricted mode creates no run and dispatches no
effect.

## One-time owner decision review

D1-D4 are the complete owner decision set found during Explore. The project owner approved Option A for
all four decisions on 2026-07-15. They are fixed Build input unless implementation evidence triggers the
architecture-exception rule.

### D1. Workspace identity and trust lifetime

**Recommendation: Option A, exact canonical-root trust persisted until explicit revocation.** Resolve the
selected directory with the operating system's real-path semantics, derive a stable opaque workspace ID
from a domain-separated SHA-256 digest of that canonical root, and persist the decision outside the
workspace. A symlink to the same target shares the decision; a retargeted symlink or different canonical
root starts restricted. Do not trust a parent, Git remote, repository name, or path prefix implicitly.

- **A. Exact canonical root, persistent (recommended):** stable across runs, visible, low-fatigue, and
  narrow. Moving or replacing the root at another canonical path requires a new decision.
- **B. Session-only trust:** minimizes durable state but forces repeated approval and makes onboarding
  noisy without improving per-action control.
- **C. Parent or source inheritance:** reduces prompts but silently broadens authority to repositories the
  user did not inspect.

This choice defines what the user is trusting and when Eden may reuse that decision.

### D2. Restricted-mode behavior

**Recommendation: Option A, review-only with a hard task-start gate.** Restricted mode may resolve and
display the canonical root, basename, trust status, deterministic fake-profile availability, and fixed R1
capability statements. It may not create a run directory, append a journal record, read repository
instructions or content, inspect Git state, execute a process, dispatch an effect, or access the network.

- **A. Review-only; all task starts blocked (recommended):** gives workspace trust one stable meaning and
  prevents future real tools from inheriting a permissive fake-task precedent.
- **B. Permit the deterministic fake task while restricted:** creates a smoother demo, but teaches that an
  agent task may start before workspace trust and makes the boundary mode-dependent.
- **C. Permit read-only exploration while restricted:** closer to a future coding product, but requires
  context, tool, instruction, and prompt-injection policy that R1 has not built.

This choice defines the negative security claim the implementation must prove.

### D3. Headless trust contract

**Recommendation: Option A, a distinct `--trust-workspace` grant on `eden exec --json`.** A fresh headless
run without existing trust exits `2` with `workspace_trust_required`, empty stdout, and no run directory.
`--trust-workspace` submits the same versioned persistent trust command as the TUI before `run.start`.
`--approve-fake-action` remains separate; neither flag implies the other. A later run may reuse the stored
trust without repeating `--trust-workspace`.

- **A. Explicit persistent grant flag on `exec` (recommended):** keeps the clean-machine path one command
  while making trust and action approval independently visible and testable.
- **B. Dedicated `eden workspace trust` command:** makes lifecycle management explicit but adds another
  CLI surface and output contract before R1 needs it.
- **C. TUI-only grant:** avoids a headless mutation flag but makes automation unable to bootstrap the same
  product state.

TUI revocation is in scope. A dedicated headless revocation command is deferred until a workspace/session
management slice; deleting or replacing trust state is not presented as the product recovery path.

### D4. Durable ownership and protocol evolution

**Recommendation: Option A, a separate trust registry plus an immutable run-start snapshot.** The trust
registry is user configuration/policy state and is not appended to an individual run journal. When
`run.start` passes the gate, the trusted workspace summary is copied into the kernel `run.started` event
and reconstructed from journal v1 thereafter. This removes caller-supplied `ProjectionContext.workspace`.

Add the workspace command/view schemas and `AgentClient` methods to pre-release product protocol v1;
keep all accepted run commands/events byte-compatible. Extend the pre-release `run.started` journal
payload and regenerate deterministic fixtures rather than adding a migration for unreleased development
journals. Document this boundary in ADR 0009 and the focused contracts/event documents.

- **A. Separate registry plus run snapshot, pre-release v1 extension (recommended):** preserves correct
  ownership, historical auditability, and one protocol while the product is still unreleased.
- **B. Put trust changes in each run journal:** cannot represent trust before a run and duplicates one
  workspace decision across unrelated runs.
- **C. Read current trust only from projection context:** smallest diff, but replayed historical views can
  change after revocation and the journal is no longer sufficient product evidence.

This choice changes a trust boundary, kernel event payload, and public `AgentClient`, so it requires the
explicit checkpoint above.

## Frozen product contract after approval

### Workspace identity

`WorkspaceIdentity` is runtime-owned and contains:

```ts
type WorkspaceIdentity = {
  workspaceId: string;
  canonicalRoot: string;
  name: string;
};
```

- `canonicalRoot` is `realpath(cwd)` and must be an existing directory.
- `workspaceId` is the lowercase hexadecimal SHA-256 of
  `"eden-workspace-v1\0" + canonicalRoot` encoded as UTF-8; raw paths are not used as filenames.
- Path comparison follows the canonical string returned by the host. This slice does not invent
  cross-machine identity or Git-origin identity.
- Failure to resolve an existing directory is `workspace_unavailable`, recoverability `reconfigure`.

### Workspace review projection

Add a closed `WorkspaceReviewSchema` and non-throwing decoder to `@eden/contracts`:

```ts
type WorkspaceReview = {
  protocolVersion: 1;
  revision: number;
  workspace: {
    workspaceId: string;
    name: string;
    root: string;
    trust: "restricted" | "trusted";
  };
  profile: {
    provider: "deterministic-fake";
    credentials: "not-required";
  };
  authority: {
    taskStart: "blocked" | "allowed";
    repositoryRead: "disabled";
    repositoryWrite: "denied";
    processExecution: "fake-only";
    network: "denied";
    sandbox: "not-configured";
  };
  notice: ProductError | null;
  nextActions: readonly string[];
};
```

The `fake-only` process value describes the deterministic adapter already present. It does not claim shell
execution. Trusted review changes only `taskStart` from `blocked` to `allowed`; trust alone changes no
other authority field.

Add `root` to the existing `WorkspaceSummarySchema` so a running `ProductView` preserves the same visible
identity. Existing run event types and NDJSON envelopes remain unchanged.

### Workspace trust command

Add a closed, versioned command:

```ts
type ResolveWorkspaceTrustCommand = {
  protocolVersion: 1;
  commandId: string;
  type: "workspace.trust.resolve";
  workspaceId: string;
  expectedRevision: number;
  decision: "trust" | "restrict";
};
```

The runtime re-resolves the canonical workspace identity immediately before persisting the command. A
workspace mismatch produces `workspace_identity_changed`; a stale revision produces `stale_revision`;
neither changes the trust store.

### AgentClient lifecycle

Keep one renderer-independent port and extend it with the pre-run boundary:

```ts
interface AgentClient {
  getWorkspaceReview(): Promise<WorkspaceReview>;
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

`InProcessAgentClient.open` binds to `cwd` and the trust store but creates no run directory. Its options
accept an optional `runId` only for opening an existing journal; a supplied ID whose journal does not
exist is `run_not_found` and is never created. Without a supplied run ID, the first accepted `run.start`
obtains the run ID from the injected ID source, opens the journal/runtime stack, and returns the
awaiting-approval `ProductView`. Tests may inject deterministic identities; production uses
cryptographically opaque IDs. An existing run remains reviewable after workspace revocation, while a new
run remains blocked.

`run.start` while restricted throws `AgentClientError` with:

```json
{
  "code": "workspace_trust_required",
  "message": "Trust this exact workspace before starting a task.",
  "recoverability": "ask-user",
  "suggestedActions": ["Review the workspace and explicitly grant trust."]
}
```

The negative path creates no `runs/` entry and calls no `EffectHost` method.

### Trust registry

Store one closed record per workspace under
`<stateDirectory>/workspace-trust/v1/<workspaceId>.json`:

```ts
type WorkspaceTrustRecordV1 = {
  version: 1;
  workspaceId: string;
  canonicalRoot: string;
  decision: "trusted" | "restricted";
  revision: number;
  decidedAt: string;
};
```

- Missing record means restricted revision `0`; absence is not an error.
- A transition between restricted and trusted increments the revision, including explicit revocation.
  Repeating the already-current decision with the current revision is an idempotent no-op.
- Write a complete temporary file in the same directory, flush it, rename it over the target, and avoid
  exposing partial JSON as a valid decision.
- Record fields are validated before use. Unknown version, unknown fields, ID/root mismatch, malformed
  JSON, or a non-regular file fails closed to restricted and returns a visible `trust_state_invalid` notice.
- The registry stores no secret, repository content, approval, provider key, or capability grant.
- A trust command may replace an invalid record only after the user explicitly selects trust or restrict
  for the currently re-resolved workspace.
- POSIX files use owner-only permissions where supported. Windows uses the current user's normal state
  directory ACL; the product makes no encryption or cross-platform ACL-equivalence claim.
- The canonical state directory must be outside the canonical workspace root. A state directory equal to
  or nested beneath the workspace produces `unsafe_state_directory`, because repository-controlled files
  cannot be authoritative trust configuration. Tests and standalone smoke use sibling temporary
  workspace/state directories rather than placing `EDEN_STATE_DIR` under `cwd`.

### Run-start audit snapshot

Extend `KernelEvent` `run.started` and non-idle `RunState` with a kernel-owned `RunWorkspace` value
containing `workspaceId`, `name`, `root`, and the literal `trusted`. The kernel package must not import
`@eden/contracts`; projection maps this internal immutable value to `WorkspaceSummary`. The runtime, not
the product command or renderer, supplies it. `projectView` reads that state and no longer accepts
workspace projection context.

Revoking trust after a run finishes changes the next workspace review and blocks the next start. It does
not rewrite the earlier journal or its `ProductView`. Concurrent active runs and revocation during an
active run remain out of scope because R1 supports one foreground run.

### TUI onboarding flow

On launch, the TUI first renders `WorkspaceReview`:

- product title and an honest `R1 deterministic fake · no credential required` statement;
- exact canonical workspace root and stable restricted/trusted label;
- task-start, repository read/write, fake-only execution, network, and sandbox statements;
- a reminder that workspace trust does not approve actions;
- `t` to trust the exact workspace, `r` to remain/revert restricted, and `Ctrl+C` to exit;
- the task composer only when `taskStart` is `allowed`.

Choosing restricted keeps the review usable and creates no run. Choosing trust updates the view through
`AgentClient`, then reveals the existing composer. Starting the task still reaches the attributable fake
action card and requires `a` or `d`. At 60x20 the exact root, trust label, separate approval, and selected
action remain legible; layout may condense capability copy without omitting its meaning.

The workspace review owns keyboard focus before task editing. In trusted pre-run state, `r` revokes trust
and Enter focuses the composer. While the composer owns focus, ordinary `t` and `r` characters are task
text and Enter submits. This focus boundary prevents task text from becoming an implicit trust command.

A second launch with the same state directory and canonical root shows persisted trusted state. Selecting
`r` before starting a new task persists revocation and removes the composer. A retargeted symlink launches
restricted for its new canonical identity.

### Headless behavior

The accepted syntax becomes:

```text
eden exec --json [--trust-workspace] [--approve-fake-action] "<task>"
```

- Fresh state without `--trust-workspace`: exit `2`, stdout empty, one
  `workspace_trust_required` `ProductError` on stderr, and no run directory.
- `--trust-workspace` without `--approve-fake-action`: persist exact-root trust, start the run, emit the
  existing two awaiting-approval `ProductEvent` lines, then exit `2` with `approval_required` and no effect
  receipt.
- Both flags: persist/reuse trust, run the existing fake task, emit only cursor-ordered `ProductEvent`
  NDJSON, and end with verifier-backed success.
- Persisted trust plus only `--approve-fake-action`: the same successful behavior without a repeated grant.
- `--approve-fake-action` never bypasses trust; `--trust-workspace` never bypasses action approval.
- Repeating `--trust-workspace` for an already trusted exact root is an explicit idempotent no-op that
  does not change the trust revision, identity, or authority.

Argument parsing remains strict. Duplicate flags, unknown options, missing JSON mode, and empty task text
remain `invalid_arguments` with exit `2`.

## Exact change boundary

The implementation may change only this dependency closure unless evidence triggers the architecture
exception rule:

```text
eden-agent/AGENTS.md                         # read only
eden-agent/CONTEXT.md                        # Finish truth update
eden-agent/PRODUCT.md                        # only if approved wording needs precision
eden-agent/SPEC.md
eden-agent/docs/adr/0009-explicit-workspace-trust.md
eden-agent/docs/architecture.md
eden-agent/docs/event-model.md
eden-agent/docs/product-contracts.md
eden-agent/docs/threat-model.md
eden-agent/docs/product/user-journey.md
eden-agent/docs/product/ux-state-model.md
eden-agent/docs/plans/2026-07-15-r1-onboarding-workspace-trust.md
eden-agent/packages/contracts/src/protocol.ts
eden-agent/packages/contracts/src/fixtures.ts
eden-agent/packages/contracts/test/protocol.test.ts
eden-agent/packages/contracts/test/scenarios.test.ts
eden-agent/packages/kernel/src/model.ts
eden-agent/packages/kernel/src/index.ts
eden-agent/packages/kernel/src/schema.ts
eden-agent/packages/kernel/src/reducer.ts
eden-agent/packages/kernel/src/index.test.ts
eden-agent/packages/coding-runtime/src/agent-client.ts
eden-agent/packages/coding-runtime/src/client-session.ts
eden-agent/packages/coding-runtime/src/index.ts
eden-agent/packages/coding-runtime/src/projection.ts
eden-agent/packages/coding-runtime/src/view-projection.ts
eden-agent/packages/coding-runtime/src/workspace/index.ts
eden-agent/packages/coding-runtime/src/workspace/trust-store.ts
eden-agent/packages/coding-runtime/src/workspace/trust-record.ts
eden-agent/packages/coding-runtime/test/agent-client.test.ts
eden-agent/packages/coding-runtime/test/projection.test.ts
eden-agent/packages/coding-runtime/test/records.ts
eden-agent/packages/coding-runtime/test/workspace-trust.test.ts
eden-agent/apps/eden/src/args.ts
eden-agent/apps/eden/src/headless.ts
eden-agent/apps/eden/src/tui-runner.tsx
eden-agent/apps/eden/src/tui.tsx
eden-agent/apps/eden/test/args.test.ts
eden-agent/apps/eden/test/headless.test.ts
eden-agent/apps/eden/test/tui.test.tsx
eden-agent/scripts/smoke-standalone.mjs
eden-agent/scripts/r1-walking-skeleton-workflow.test.mjs
```

Do not add a package, external dependency, generic configuration framework, alternate renderer, or second
plan tree. If atomic store implementation requires a small private helper, keep it within
`packages/coding-runtime/src/workspace/` and add the exact path to this plan before editing it.

## Ordered test-first implementation slices

### Slice 0: freeze the approved trust contract

- **Public seam:** normative English docs and accepted ADR 0009.
- **Action after approval:** change this plan to `Approved`, record D1-D4 selections, add ADR 0009, and
  align `SPEC.md`, architecture, event, product-contract, threat, user-journey, and UX-state documents.
- **Acceptance:** every normative document distinguishes workspace trust, action approval, network, and
  sandbox; restricted mode and the exact root are defined consistently; no doc claims provider
  configuration, Git inspection, or real tool authority.
- **Failure QA:** search for the prior hard-coded implication that every selected workspace is trusted or
  that trust grants action approval; any conflicting normative statement blocks Build.
- **Matching surface:** none; this slice freezes contracts for the following RED tests.
- **Permitted fakes/mocks:** none.

### Slice 1: executable workspace command and review contracts

- **Public seam:** `decodeWorkspaceReview`, `decodeResolveWorkspaceTrustCommand`, existing
  `decodeProductView`, and the exported `AgentClient` interface from `@eden/contracts`.
- **Independent oracle:** the closed shapes and exact authority table in this approved plan, not the
  implementation's generated values.
- **RED:** contract tests require restricted and trusted review fixtures, closed-schema rejection,
  protocol-version rejection, exact trust decisions, stable errors, and `root` on running views before the
  schemas exist.
- **GREEN:** add the smallest TypeBox schemas, types, decoders, fixtures, and interface extension.
- **Acceptance:** both fixtures round-trip; unknown authority fields, secret canaries, renderer focus,
  invalid decisions, negative revisions, and unsupported versions fail non-throwingly; existing run
  command/event fixtures remain valid.
- **Failure QA:** inject a provider key, environment value, stack, raw diagnostic, parent-trust flag, and
  action-approval flag into the review; every value is rejected at the contract boundary.
- **Matching surface:** decode the exact JSON value later printed by the standalone failure/happy paths.
- **Permitted fakes/mocks:** deterministic fixture values only.

### Slice 2: canonical identity and fail-closed trust store

- **Public seam:** open the production workspace service against a real temporary filesystem, resolve a
  real directory/symlink, read its `WorkspaceReview`, submit trust/restrict commands, close, and reopen.
- **Independent oracle:** `realpath`, the domain-separated SHA-256 formula, and the frozen registry schema.
- **RED:** table-driven tests require default restriction, stable identity, same-target symlink reuse,
  retargeted-symlink restriction, persistence, revision freshness, revocation, atomic replacement, and all
  corrupt-record cases before the store exists.
- **GREEN:** implement identity resolution, schema validation, atomic same-directory replacement, and the
  workspace service behind a narrow runtime port.
- **Acceptance:** no record is written by inspection alone; trust and revocation survive fresh service
  instances; stale/mismatched commands do not change bytes; corrupt/unknown records never produce trusted;
  record filenames disclose no raw root.
- **Failure QA:** truncate JSON, add an unknown field, change version, mismatch ID/root, replace the record
  with a directory, remove workspace access, and retarget a symlink. Observe restricted or the documented
  structured error without a run directory or effect call.
- **Matching surface:** launch the same standalone artifact twice and through a same-target symlink using
  one isolated state directory; capture displayed IDs/roots/trust states.
- **Permitted fakes/mocks:** fixed clock only. Use the real filesystem, real SHA-256 implementation, and
  real symlinks where supported; skip only an unsupported-platform symlink case with explicit evidence.

### Slice 3: AgentClient trust gate and journal-owned workspace snapshot

- **Public seam:** `InProcessAgentClient.open`, `getWorkspaceReview`, `resolveWorkspaceTrust`, `submit`,
  `getSnapshot`, and `subscribe` over real temporary state directories.
- **Independent oracle:** no `runs/` entry before trust; trusted `run.started` bytes contain the exact
  runtime-owned workspace snapshot; replay after revocation remains deep-equal to the original run view.
- **RED:** the first core-invariant test attempts `run.start` from restricted state and proves
  `workspace_trust_required`, no journal, and zero host calls. Further tests freeze trust/start ordering,
  stale commands, stable run ID creation, run snapshot schema, replay without `ProjectionContext`, and
  revocation behavior.
- **GREEN:** make run creation lazy, gate `run.start` on current trust, supply the workspace snapshot from
  runtime state, extend the kernel event/state schema, and remove caller-injected workspace projection.
- **Acceptance:** a product command cannot forge workspace identity/trust; only an accepted trust command
  permits start; all existing fake-task/replay/crash tests pass with the journal-owned snapshot; historical
  views do not change after revocation.
- **Failure QA:** submit action approval before trust, mutate the trust record between review and resolve,
  and revoke after a completed run. The first two append nothing; the last blocks the next start while the
  completed run replays unchanged.
- **Matching surface:** inspect the standalone-created journal after the trusted headless path and compare
  its workspace snapshot with decoded product events and the trust record.
- **Permitted fakes/mocks:** fixed clock/ID source and a counting effect host for the zero-call negative
  assertion; use the production fake host for end-to-end completion.

The first RED test above is the new trust invariant checkpoint. Approval of this plan approves its seam,
oracle, and expected failure, so Build continues through the remaining slices without another routine
checkpoint.

### Slice 4: OpenTUI onboarding and trust interaction

- **Public seam:** `EdenTuiApp` driven with the real `InProcessAgentClient`, followed by the standalone
  executable in a real PTY.
- **Independent oracle:** the approved TUI flow and the runtime `WorkspaceReview`; no renderer-owned trust
  boolean may be used as truth.
- **RED:** OpenTUI tests require fresh restricted welcome, fake/no-key copy, exact root, capability limits,
  trust, remain restricted, persisted trusted relaunch, revocation, separate action approval, error
  recovery, and 60x20 safety before production rendering changes.
- **GREEN:** reshape the smallest existing component tree so pre-run view, trust commands, task composer,
  subscription, and terminal cleanup all use `AgentClient` truth. Keep only draft, focus, selection, and
  layout local.
- **Acceptance:** restricted launch creates no run; `t` reveals the composer only after the accepted view;
  `r` persists restricted; fake action still requires `a`/`d`; denied action produces no receipt; normal
  quit and Ctrl+C restore the parent shell.
- **Failure QA:** inject an invalid trust-record notice and a stale trust command. The TUI stays restricted,
  shows an actionable recovery message, and never displays executing or succeeded.
- **Matching surface:** real standalone PTY at 100x30 and 60x20 for fresh trust, persisted relaunch,
  revocation, action denial, success, normal quit, and Ctrl+C shell sentinels.
- **Permitted fakes/mocks:** a scripted `AgentClient` only for isolated render-error states. All trust and
  task interaction acceptance uses the real client/store/journal.

### Slice 5: headless bootstrap with separate trust and action approval

- **Public seam:** the standalone `eden exec --json` process and its exact stdout, stderr, exit code, state
  tree, trust record, journal, and receipt.
- **Independent oracle:** the four-row headless behavior table in the frozen contract above.
- **RED:** argument/process tests require the new flag, fresh trust failure, trust-only approval failure,
  both-flags success, stored-trust reuse, flag independence, and duplicate/unknown argument rejection.
- **GREEN:** parse `--trust-workspace`, submit the trust command before `run.start`, preserve NDJSON
  cleanliness, and map structured client errors to existing exit classes.
- **Acceptance:** restricted failure has empty stdout and no run; trust-only has awaiting-approval events
  but no receipt; both flags and stored trust finish with verifier evidence; all output decodes through the
  appropriate product schema.
- **Failure QA:** pass only `--approve-fake-action`, duplicate either flag, use an unwritable trust-store
  directory, and retarget a previously trusted symlink. None may produce success or broaden trust.
- **Matching surface:** run all four rows against a copied standalone binary in an empty directory with an
  isolated state directory and decode every stdout/stderr line.
- **Permitted fakes/mocks:** none beyond the production deterministic fake host.

### Slice 6: distribution evidence and slice closeout

- **Public seam:** the Bun standalone artifact and existing three-platform R1 GitHub Actions workflow.
- **RED:** update the workflow-contract/smoke test so every hosted lane must exercise trust-required,
  explicit-trust, stored-trust, separate-action-approval, invalid-input, and unwritable-state cases.
- **GREEN:** update only the existing smoke script/workflow dependency closure required by those cases.
- **Acceptance:** Linux, Windows, and macOS build/test/typecheck/package smoke stays green; the artifact
  runs outside the checkout; no source or `node_modules` is required; the trust registry and run journal
  contain only the approved schemas.
- **Failure QA:** run with an unwritable state directory and a malformed trust record. Both fail closed with
  no terminal success; hosted smoke must not label renderer-only testing as real-terminal evidence.
- **Matching surface:** repeat the final local PTY/headless ledger after the last relevant edit, then record
  the hosted workflow URL and commit only if publication is separately authorized.
- **Closeout:** update this plan with fresh evidence and residual risk, update `CONTEXT.md` to name the next
  R1 decision without claiming R1 complete, and inspect both repositories.
- **Permitted fakes/mocks:** the production deterministic fake host only.

## Matching-surface ledger

Run these after the final relevant implementation edit against a newly packaged standalone artifact.

### M1. Fresh TUI restricted state

With a fresh state directory, launch the copied artifact in a 100x30 PTY from a real temporary workspace.
Observe the deterministic fake/no-key welcome, exact canonical root, restricted state, task start blocked,
repository read/write disabled, network denied, sandbox not configured, and separate-approval reminder.
Press Enter and type text; no task may start and no `runs/` entry may exist.

### M2. TUI trust, action denial, and persistence

Press `t`, enter `Index the fake workspace`, submit, inspect the fake action, and press `d`. Observe a
blocked outcome and no receipt. Exit, relaunch with the same state, and observe trusted state without a
second grant. Repeat at 60x20 and prove root, trust, action, and approval keys remain legible.

### M3. TUI revocation and shell cleanup

Relaunch before starting a task, press `r`, and observe restricted state and no composer. Exit normally and
with Ctrl+C in separate runs; a parent shell prints sentinels after both exits. Relaunch again and prove the
restriction persisted.

### M4. Headless trust-required failure

```sh
EDEN_STATE_DIR="$(mktemp -d)" ./dist/eden exec --json \
  --approve-fake-action "Index the fake workspace"
```

Observe exit `2`, empty stdout, `workspace_trust_required` on stderr, no run directory, and no receipt.

### M5. Headless separate approvals

Using a fresh shared state directory, first run:

```sh
./dist/eden exec --json --trust-workspace "Index the fake workspace"
```

Observe trust persistence followed by exit `2` at fake-action approval, two schema-valid product events,
and no receipt. Then run with only `--approve-fake-action`; observe verifier-backed success without a
repeated trust grant. Decode every stdout line as `ProductEvent` and stderr as `ProductError`.

### M6. Identity change and corrupt state

Trust a workspace through a symlink, relaunch through another symlink to the same target, then retarget the
original symlink to a different directory. The same target reuses trust; the new target is restricted. In
a separate state directory, corrupt the trust record and relaunch. Observe `trust_state_invalid`,
restricted mode, and no run/effect.

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

On Windows, pass `apps/eden/dist/eden.exe` to the smoke script. The implementation run must also execute
M1-M6 and record exact state paths, exit codes, decoded event/error counts, journal/receipt observations,
and PTY shell sentinels. A source-level test renderer is not sufficient matching-surface evidence.

## Implementation and local evidence

Implementation began from the approved baseline `a971faa`. Separate commit and push authorization was
granted on 2026-07-15 after the local evidence completed. The slice implementation was published in
`8282a27`; two evidence-oracle fixes followed in `3ec0881` and `c962245`. No release was authorized. The
final local verification after the last product edit is green:

- `pnpm test`: green, including 10 contract, 8 kernel, 25 coding-runtime, and 10 production CLI tests;
- `pnpm typecheck`, `pnpm build`, `pnpm code:check`, and `pnpm markdown:check`: green;
- `pnpm --filter @eden/cli package:bun`: produced the Linux standalone artifact;
- `node scripts/smoke-standalone.mjs apps/eden/dist/eden`: green with 8 schema-valid events on the
  both-flags success row; the copied artifact was
  `/tmp/eden-standalone-FwSWiV/bin/eden`;
- `node --test scripts/r1-walking-skeleton-workflow.test.mjs`: green and freezes the expanded standalone
  onboarding evidence contract for every existing hosted lane.

The final matching-surface root was `/tmp/eden-onboarding-final-pwtVS4`; its executable, workspaces, trust
registries, journals, and receipts were outside the checkout.

- **M1:** at 100x30, fresh `m1-state` showed the no-credential deterministic profile, exact canonical
  root, restricted trust, blocked task start, disabled repository read/write, denied network, and no
  sandbox claim. Enter plus non-command text created no `runs/` entry. Ctrl+C restored the parent shell,
  which printed `__M1_CTRL_C_RESTORED__`.
- **M2:** at 60x20, `m2-fixed-state` required `t`, then Enter to focus the composer. Typing
  `Index the fake workspace` did not interpret its ordinary `t` or `r` characters as trust commands; the
  record remained trusted at revision 1 before and after task start. The approval view kept exact root,
  trust, action, scope, and separate `a`/`d` keys legible. Denial produced `blocked`, no receipt, and no
  trust transition. A persisted relaunch showed trusted state without another grant. Normal exit restored
  the shell and printed `__M2_NORMAL_RESTORED__`.
- **M3:** a trusted relaunch exposed `r` only while the review owned focus. Revocation removed the
  composer and persisted restricted revision 2. Ctrl+C restored the parent shell and printed
  `__M3_REVOKE_CTRL_C_RESTORED__`. A separate exact-task TUI run completed with verifier evidence
  `ed7e5392-97f0-4b45-a385-dd137be71287:fake-evidence` and two effect receipts.
- **M4-M5:** the final standalone smoke proved exit 2 with empty stdout and no run before trust; trust-only
  emitted two awaiting-approval events and no receipt; both flags and persisted trust ended in verified
  success; duplicate/unknown arguments returned `invalid_arguments`; an unavailable state path failed
  without terminal success. Trust bytes remained unchanged across repeated trust.
- **M6:** two symlinks resolving to the same canonical root reused one trust record and both completed.
  Retargeting the first link to `other-workspace` returned exit 2 with `workspace_trust_required`; the run
  count remained 2 and no second trust record appeared. A separate corrupt record relaunched at restricted
  state with a visible `trust_state_invalid` notice and recovery action; its pre-existing run count stayed
  1 and no effect started.

Local visual review found and closed two defects that source rendering alone did not expose: compact
approval content initially displaced the trust label, and ordinary `t`/`r` task characters initially
reached global trust shortcuts. The final two-stage review/composer focus preserves both plain-key trust
controls and literal task editing.

After the final contract-only rebuild, `/tmp/eden-standalone-FwSWiV/bin/eden` repeated the complete
60x20 restricted, trust, focus, exact-task, separate-approval, and success journey with evidence
`e80f7d0b-1824-44e5-b9ff-ef7e700aeae2:fake-evidence`; its trust record remained trusted revision 1.

Hosted run 29431313699 at `c962245` is green on Ubuntu, Windows, and macOS. Every lane passed install,
peer checks, the full workspace test suite, typecheck, build, Biome, Markdown, Bun packaging, the expanded
standalone trust smoke, and artifact upload. The final job durations were 2m04s on Ubuntu, 4m27s on
Windows, and 2m05s on macOS.

The hosted trajectory exposed and closed one evidence-oracle class without changing product behavior.
Run 29430351687 showed that the TUI test compared macOS lexical `/var` against runtime canonical
`/private/var`; run 29430847781 proved that fix, then exposed the same mistake in macOS standalone trust
record validation and Windows short-path/long-path TUI validation. The final tests and smoke now derive
their independent expected root through host `realpath()` and run 29431313699 proves the RED-to-green
transition on all three platforms. A one-off Windows PowerShell helper timeout in the first run did not
recur in the next two runs.

Residual evidence risk is now limited to what this slice never claimed: the workflow does not drive the
standalone TUI through a real Windows or macOS PTY, and it makes no cross-platform ACL-equivalence claim.
The hosted action dependencies also emit Node.js 20 deprecation annotations while GitHub forces them onto
Node.js 24; this is maintenance work, not a failed slice gate. Concurrent active-run revocation remains an
explicit non-goal.

## Explicit non-goals

- A real provider, provider selection, credential entry/storage, connection check, model loop, or API key.
- Loading or interpreting `AGENTS.md`, repository files, workspace settings, package metadata, project
  plugins, MCP configuration, skills, or remote content during restricted onboarding.
- Git repository discovery, dirty-worktree inspection, available-check discovery, diff, or file editing.
- A real shell/process tool, policy engine, trusted-host runner, Docker runner, native sandbox, network
  access, environment forwarding, or protected-path enforcement.
- Treating workspace trust as action approval, a capability grant, sandbox evidence, source authenticity,
  malware scanning, or trust in a Git organization/parent directory.
- Multiple workspaces in one process, parent-folder trust, trust import/export, trust expiry, organization
  policy, headless trust listing/revocation, or a settings UI.
- Multiple concurrent runs, session navigation/history, general resume, durable action approval, plan
  review, repair, Evidence Pack, Quickstart polish, or R1 exit review.
- Product protocol negotiation, local IPC, daemon, desktop, web, IDE, remote client, or telemetry.
- A journal v2, migration for unreleased development journals, or rewriting historical run trust after
  revocation.
- A new dependency, package, renderer, plan directory, tutorial lesson, learning record, or interview note.
- Commit, push, merge, release, or tutorial gitlink update without separate authorization.

## Risks and stop rules

| Risk | Mitigation or stop rule |
| --- | --- |
| Trust remains renderer-local | All state and transitions pass through `AgentClient`; real-client tests reject local truth |
| Run state appears before trust | Lazy run creation; negative tests inspect the filesystem and effect-host call count |
| Stable ID is actually per run | Domain-separated canonical-root digest and restart/symlink tests |
| Trust silently broadens | No parent/prefix/origin inheritance; display the exact canonical root |
| Trust becomes action approval | Separate command, UI copy, flags, journal records, and denial/success scenarios |
| Trust implies sandbox/network | Frozen authority table remains unchanged by trust except `taskStart` |
| Corrupt state fails open | Closed schema, root/ID validation, restricted fallback, visible recovery notice |
| Revocation rewrites history | Immutable workspace snapshot in `run.started`; replay after revocation is deep-equal |
| Product protocol v1 drifts invisibly | ADR 0009 and contract tests record the pre-release extension; run event shapes stay stable |
| Onboarding expands into R2 | Exact non-goals forbid provider, Git, instructions, tools, policy, and sandbox work |
| Renderer tests replace product proof | M1-M6 use the packaged artifact, real PTY/process, real store, and real journal |
| Ordinary naming/layout preference blocks progress | Choose the smallest repository-consistent implementation and continue |

After approval, pause only if evidence invalidates ADR 0002, 0005, 0006, or 0008; shows canonical-path
identity or the separate registry unsafe; requires a new product, trust, public-contract, dependency, or
roadmap decision; or forces work outside the exact change boundary. Package layout, helper naming, copy
wording within the frozen semantics, and ordinary test refactoring are not checkpoints.

## Rollback and compatibility boundary

Before an external release, rollback may remove ADR 0009 implementation and delete only trust records and
run artifacts created by this development slice in isolated test/evidence directories. Never delete a
user-selected state directory or rewrite an earlier journal automatically.

Existing accepted run command/event JSON remains valid. The implementation may reject unreleased
development journals whose `run.started` payload lacks the approved workspace snapshot; document the
error and use a fresh isolated state directory for R1 evidence. After an external release consumes this
shape, incompatible trust-record, product-contract, or journal changes require explicit versioning and a
migration plan.

## Human checkpoints and execution authority

1. **Plan approval, complete:** D1-D4, test seams, matching surfaces, and non-goals were approved as
   A/A/A/A on 2026-07-15. Approval authorizes continuous Freeze/Build/Review/Finish work through this plan.
2. **Architecture exception only:** after approval, pause only under the stop rule above. Do not pause for
   routine implementation choices or after each slice.
3. **Final slice review:** present the final diff, RED/GREEN evidence, M1-M6 ledger, automated checks,
   hosted evidence if authorized, and residual risk for human review.

Plan approval does not authorize commit, push, merge, release publication, or tutorial gitlink changes.

## Completion criteria

This slice is complete when:

- a fresh standalone launch is useful without a key and truthfully shows the exact restricted workspace
  and fixed R1 authority;
- workspace identity is stable for one canonical root, narrow, path-scoped, and persisted outside the
  workspace with fail-closed validation and explicit revocation;
- restricted `run.start` returns `workspace_trust_required`, creates no run journal, and invokes no host;
- `AgentClient`, not the renderer or CLI, owns trust review, resolution, and task-start enforcement;
- an accepted run snapshots trusted workspace truth into journal-backed kernel state, and replay is
  independent of caller-supplied workspace context and later revocation;
- TUI trust and headless `--trust-workspace` reach the same versioned command and store;
- workspace trust and fake-action approval remain observably separate in success and denial paths;
- corrupt, stale, mismatched, missing, and retargeted workspace state never becomes trusted implicitly;
- contracts, kernel, runtime, TUI, headless, standalone smoke, full workspace checks, and M1-M6 pass after
  the final edit;
- normative docs and `CONTEXT.md` report the new boundary without claiming provider onboarding, sandbox,
  real coding tools, R1 completion, or release support not backed by evidence;
- no explicit non-goal enters the implementation.

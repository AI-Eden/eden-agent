# R2 Safe Actuation and Review Plan

- Status: Accepted; local Build implementation and Linux packaged acceptance complete; hosted closure
  pending publication
- Date: 2026-07-28
- Roadmap stage: R2, Usable Minimal Coding Product
- Baseline: `1f580babc29ad8e818ac8547a52cd7d25425a358`
- Decision brief: `docs/research/2026-07-28-r2-safe-actuation-freeze-decision-brief.md`
- Required architecture approvals: ADR 0015 and ADR 0016
- Approved: 2026-07-28
- Human checkpoint: complete; the owner accepted the complete Freeze packet and separately authorized Build
- Approval coverage after acceptance: all test seams and ordered slices below, unless a stop condition is
  triggered

## Local Build checkpoint

Slices 0-7 and the local portion of Slice 8 are implemented and locally verified in the publication
candidate. The
focused safe-actuation gate passes 26 runtime tests and 13 TUI/focus tests. The complete workspace test,
typecheck, code check, build, Bun package, and native archive gates also pass.

The copied Linux archive passes six real Git/filesystem/PTY scenarios: approval, denial followed by one
narrower proposal and terminal second denial, concurrent stale bytes, pre-existing dirty work, a new
diff-check failure, and `60x20` review scrolling. The fixture model and readiness provider are deterministic
and non-networked; the archive, Git, filesystem, journal, production read-only inspection, and PTY are real.
The run claims trusted-host policy only, isolation `none`, network `not_requested`, and non-success
`completed` review.

At authoring time this candidate has no hosted workflow evidence. Ubuntu, macOS, and Windows packaged rows
therefore remain `not-run` until the published exact SHA passes them; the local evidence file stays
temporary rather than being misattributed to the unchanged baseline commit. Docker, repository-code checks,
provider network, general shell, and verifier success also remain explicitly outside the claim.

## Goal and user-visible outcome

Deliver the smallest real R2 actuation path without claiming a general coding loop. A trusted-workspace user
can let the configured model propose one AnchorEdit to an existing tracked UTF-8 file, review one canonical
action and policy decision, approve its exact digest once, and reach a non-success `completed` review.

Review separates Eden's approved base-to-desired delta from the complete current tracked Git patch against
`HEAD`. It also separates pre-existing `git diff --check` diagnostics from the post-edit result. Denial,
stale files, ambiguous anchors, policy mismatch, cancellation, crash boundaries, over-budget output, and
unknown process completion all fail closed and remain replayable.

The TUI is the matching execution surface. `AgentClient`, product fixtures, replay, and headless projection
must expose the same durable action, policy, review, and check facts. This plan does not add a headless
preapproval bypass or durable run-resume command.

## Current repository facts

- `packages/contracts/src/protocol.ts` has action summaries, approval presentations, `CheckResult`,
  `verification.updated`, and `ProductView.changedFiles`, but no canonical action envelope, policy
  observation, change-set event, or review artifact contract.
- `packages/kernel/src/model.ts` and `fake-action.ts` model a deterministic fake action whose digest is not
  derived from real execution semantics. `decide.ts` emits fake execution and verification effects with
  only fake identity.
- `packages/coding-runtime/src/policy/index.ts` is a placeholder. It has no closed rule schema, evaluator,
  default-deny behavior, revision, or durable decision.
- `packages/coding-runtime/src/native-process.ts` already provides `shell: false`, explicit executable,
  argv, cwd, environment, timeout, output caps, cancellation, and process-tree cleanup. Existing repository
  adapters freeze argv and scrub the environment.
- `packages/coding-runtime/src/fake-tool-host.ts` writes a receipt after fake observation and can interpret
  a missing receipt as not started. Real edit and process recovery require different proofs.
- `packages/coding-runtime/src/tools/index.ts` already validates path containment, regular-file identity,
  links, UTF-8, bounded reads, pinned ripgrep, compatible host Git, and fixed Git status. It has no
  full-file mutable snapshot, trackedness query, AnchorEdit, Git patch, or Git diff-check adapter.
- `packages/coding-runtime/src/profiles/index.ts` demonstrates same-directory temporary replacement and
  flush for host configuration. Workspace edits additionally need trackedness, mode preservation,
  full-snapshot preconditions, mutation locking, attribution, and content-derived recovery.
- `packages/coding-runtime/src/view-projection.ts` currently hardcodes `changedFiles: []`.
- `packages/coding-runtime/src/verification/index.ts`, `goals/index.ts`, and `planning/index.ts` remain
  placeholders. They are not implementation seams for this plan.
- The current real provider loop accepts four read-only semantic tools and ends a complete answer in
  non-success `completed`. It already supports durable attempt identity and one explicit retry after
  ambiguous model work.
- The TUI approval card shows display, cwd, reason, and scope. It must add digest, policy rule, one-use
  lifetime, execution mode, network truth, and base snapshot without exposing raw internal data.

## Frozen product contract after approval

### Action envelope and canonical digest

`ActionEnvelopeV1` is a closed renderer-neutral value. Its semantic fields are:

```ts
type ActionEnvelopeV1 = {
  actionVersion: 1;
  actionId: string;
  runId: RunId;
  proposalRevision: number;
  kind: "anchor_edit" | "git_tracked_query" | "git_diff" | "git_diff_check";
  operation: ClosedOperation;
  workspace: {
    workspaceId: string;
    canonicalRootHash: string;
  };
  cwd: ".";
  scope: {
    capability: string;
    paths: readonly string[];
  };
  baseSnapshots: readonly {
    path: string;
    byteLength: number;
    sha256: string;
  }[];
  authority: {
    policyVersion: 1;
    ruleSetRevision: string;
    environmentClass: "none" | "scrubbed_git";
    network: "not_requested";
    executionMode: "trusted_host_policy_only";
  };
  budgets: {
    timeoutMs: number | null;
    outputBytes: number | null;
  };
  lifetime: {
    kind: "single_use_proposal_revision";
    revision: number;
  };
};
```

`actionId` is correlation identity, not authority. The digest is SHA-256 over the domain-separated
canonical bytes of every execution-semantic field except `actionId`; approval identity is created after
the digest and is not hashed into it. The encoder:

1. decodes the closed schema and materializes every required field;
2. rejects non-canonical paths and numbers outside their integer bounds;
3. keeps array order and recursively sorts object keys by Unicode code point;
4. serializes with JSON string escaping and no insignificant whitespace;
5. prefixes UTF-8 bytes with `eden.action.v1` followed by one zero byte;
6. returns lowercase 64-character SHA-256.

The plan freezes exact canonical-byte fixtures independent of the production encoder. A display formatter
renders from the decoded envelope but is not itself hashed or executable.

### Policy, approval, and denial

The first `PolicyRuleSetV1` is ordered and default-deny:

| Rule | Exact match | Decision |
| --- | --- | --- |
| `r2.anchor-edit.tracked-utf8` | one modify-only AnchorEdit inside the captured root | `ask` |
| `r2.git.tracked-query` | fixed trackedness query for the proposed path | `allow` |
| `r2.git.review-diff` | fixed complete tracked patch against captured `HEAD` | `allow` |
| `r2.git.diff-check` | fixed hardened `git diff --check` template | `allow` |

Policy output includes decision, rule ID, rule-set revision, action digest, reason, and evaluation time.
Unknown actions, different argv, different cwd, wider paths, environment changes, network-capable shapes,
or missing budgets are denied before an effect exists.

An `ask` action enters awaiting approval with canonical display and digest. Approval is bound to run,
approval ID, expected product revision, action digest, and proposal revision. The durable
`approval.consumed` fact precedes `effect.requested`. Consumption, denial, replacement, cancellation,
terminal outcome, digest drift, policy-revision drift, workspace drift, or base drift invalidates it.

Denial appends one non-terminal observation. The provider may receive one closed denial result and propose
one child action. Runtime accepts the child only when it:

- retains the same action kind and trusted workspace;
- adds no path and uses no more anchors;
- retains the same base snapshot for every retained path;
- adds no capability or broader environment, network, execution, timeout, or output budget;
- names the denied action as its parent.

One denial lineage permits at most one child proposal. No denial or child proposal consumes write
authority without a fresh `ask` decision and approval.

### AnchorEdit v1

The first slice permits one target file and at most 16 replacements. The target must:

- be an existing Git-tracked regular file beneath the captured root;
- have no symbolic-link or hardlink state at every checked boundary;
- be valid UTF-8 and at most 1 MiB;
- exactly match the proposal's complete base byte length and SHA-256.

Each replacement contains non-empty `oldText`, exact `newText`, and `expectedOccurrences: 1`. Total encoded
old and new text is at most 16 KiB. All old-text spans resolve once and without overlap against the same
base bytes. The runtime sorts resolved spans by original byte offset and applies them without rematching
mutated text. The result must differ, remain valid UTF-8, stay at or below 1 MiB, and have its desired
length and SHA-256 included before policy and approval.

An already-dirty target is allowed when its current bytes equal the base snapshot. No operation may reset,
checkout, stage, create, delete, rename, chmod, or modify another file.

Execution uses the existing per-workspace cooperating-Eden lock or a mutation-specific lock with the same
cross-process guarantees. It writes a same-directory temporary regular file, preserves the original mode,
flushes it, reopens and verifies the original target identity and base bytes, atomically replaces, verifies
the desired bytes, and flushes the directory where supported. Temporary cleanup is bounded and never
deletes a path not created under the stable effect identity.

### Effect records and reconciliation

The journal must distinguish:

- policy evaluated;
- approval resolved and consumed;
- effect requested;
- dispatch not started or dispatch started;
- terminal observation;
- reconciliation observation.

For AnchorEdit:

| Live content | Recovery decision |
| --- | --- |
| desired length and SHA-256 | completed |
| base length and SHA-256 | not started |
| anything else | unknown or stale; block |

For Git trackedness, diff, and check processes, only an effect whose dispatch-start record is absent may be
not started. Once dispatch started, a missing terminal receipt is unknown and requires a visible user
retry decision in a later plan; this slice does not retry it automatically.

Pure replay reads no repository path, invokes no Git process, evaluates no live policy, consumes no
approval, and dispatches no effect.

### Review, diff, and check

The runtime captures one pre-edit `HEAD`, status hash, complete current tracked patch, and
`git diff --check` baseline before presenting approval. Immediately after a completed or reconciled edit,
it captures those values again.

The fixed tracked patch uses
`git --no-pager diff --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ HEAD --`.
The fixed check uses
`git --no-pager diff --check --no-color --no-ext-diff --no-textconv HEAD --`. Untracked paths are listed
from the existing status projection but their contents are not read for review. The Eden delta is generated
independently from the approved base and desired snapshots.

Review budgets are:

- canonical action envelope: at most 24 KiB encoded;
- Eden patch: at most 24 KiB UTF-8;
- current tracked Git patch: at most 24 KiB UTF-8;
- each closed check diagnostic value: at most 24 KiB UTF-8;
- native Git capture: existing 2 MiB ceiling;
- Git timeout: existing five seconds.

Every persisted journal record must still pass the existing 64 KiB encoded-record limit and the run must
stay within 1 MiB/4096 records. A semantic value that exceeds its limit is a closed
`review_budget_exceeded` blocker; it is never truncated or converted into an unplanned attachment.

The check adapter uses compatible probed host Git, exact workspace cwd, `shell: false`, closed stdin,
scrubbed non-interactive environment, and fixed arguments that disable color, external diff, and text
conversion. It executes no repository hook, package script, build tool, test runner, or other binary.

Review projects:

- captured `HEAD`, observed time, patch hash, and status hash;
- complete Eden patch and complete current tracked patch;
- changed-file rows with `eden`, `pre_existing`, or `both` attribution;
- baseline and current `git diff --check` results;
- newly observed diagnostic identities;
- policy, approval, execution-mode, network, and residual-risk truth.

A completed edit enters non-success `completed` review whether the check passes or fails. No code in this
plan may emit verifier-owned `succeeded`.

## Baseline and budget ledger

Slice 0 records the following before production behavior changes:

| Item | Frozen source or oracle |
| --- | --- |
| Public baseline | exact accepted commit and clean status |
| R1/R2 regression | current full workspace test, typecheck, build, package, and PTY commands |
| Canonical bytes | hand-written UTF-8 fixture bytes plus independent SHA-256 tool |
| File cap | 1 MiB complete-file fixtures |
| Operation cap | 16 anchors and 16 KiB encoded replacement text |
| Review caps | complete 24 KiB semantic fixtures plus one-byte overflow fixtures |
| Journal caps | existing 64 KiB record and 1 MiB/4096-record run decoders |
| Git process | existing five-second and 2 MiB native capture limits |
| Matching layouts | existing `60x20`, `80x24`, and `100x30` PTY rows |

If any required complete contract cannot fit these limits, Slice 0 stops. Build may not add attachment
storage, pagination, truncation, a larger journal, or a second write grammar without an amended Freeze.

## Ordered test-first implementation slices

Each slice follows RED, minimal GREEN, REFACTOR, then VERIFY. Tests must fail for the intended missing
behavior before production changes. A passing test caused only by fixture or assertion changes is not RED
evidence.

### Slice 0: Baseline, fixture ledger, and no-authority guard

**Public seam:** existing package scripts, journal decoder, application archive, and PTY drivers.

**RED:** add the first closed safe-actuation fixture and prove the current decoder rejects it while the
accepted R2 regression baseline remains green. Record exact baseline commands, artifact hashes, Git
version, platform, and budget fixture sizes.

**Independent oracle:** exact baseline SHA, `git status`, archive manifest hashes, byte counts from fixture
files, and existing journal decoder limits.

**Permitted fakes:** none for repository or Git facts. Existing deterministic provider fixtures remain
permitted for their current regression scope.

**Matching surface:** unchanged R2 onboarding/repository flow at the three frozen PTY sizes.

**Stop condition:** baseline regression, dirty Build start, changed public baseline, or any frozen value
that cannot fit the current journal.

### Slice 1: Closed action, policy, review, and check contracts

**Likely files:**

- `packages/contracts/src/protocol.ts`
- `packages/contracts/src/fixtures.ts`
- `packages/contracts/test/protocol.test.ts`
- `packages/contracts/test/scenarios.test.ts`
- new focused contract tests when one file would otherwise mix unrelated behavior

**Public seam:** non-throwing protocol decoders, `ProductCommand`, `ProductEvent`, `ProductView`, and
fixture projections.

**RED:** reject unknown envelope fields, malformed digests, non-canonical paths, missing policy revision,
stale approval lifetime, truncated patches, invalid changed-file attribution, and check values that confuse
`completed` with `succeeded`. Prove old fixtures still decode intentionally or receive one explicit
pre-release migration.

**Independent oracle:** literal closed JSON fixtures and exact accepted/rejected decoder tables, not
production constructors.

**Permitted fakes:** fixed IDs and timestamps only.

**Matching surface:** one static review fixture rendered by TUI component tests and emitted as headless
NDJSON without ANSI, kernel fields, paths outside the workspace, or secret canaries.

### Slice 2: Canonical digest, policy, single-use approval, and denial lineage

**Likely files:**

- `packages/kernel/src/model.ts`
- `packages/kernel/src/schema.ts`
- `packages/kernel/src/reducer.ts`
- `packages/kernel/src/decide.ts`
- `packages/kernel/src/index.test.ts`
- `packages/coding-runtime/src/policy/index.ts`
- new focused runtime policy/canonical-action tests

**Public seam:** submit a typed proposal and approval through `AgentClient`; observe policy and approval
product events.

**RED:** byte-order drift, changed operation with reused display, changed snapshot, changed policy revision,
stale revision, reused approval, approval after denial, broad child proposal, second child proposal,
unknown action, and renderer-supplied digest.

**Independent oracle:** checked-in canonical byte strings hashed through a separate test-only SHA-256 call;
literal policy tables; reducer event sequences with no runtime constructor reuse.

**Permitted fakes:** deterministic clock and ID ports. Policy evaluation itself, canonical encoding, reducer,
and approval consumption may not be mocked.

**Matching surface:** TUI shows canonical display, digest, rule/reason, scope, one-use lifetime,
trusted-host/no-isolation truth, and approve/deny actions. Headless projection shows the same closed facts
but gains no preapproval bypass.

### Slice 3: Full snapshots and modify-only AnchorEdit adapter

**Likely files:**

- `packages/coding-runtime/src/tools/index.ts` or one focused `anchor-edit.ts` module
- `packages/coding-runtime/src/workspace/`
- `packages/coding-runtime/test/repository-tools.test.ts`
- `packages/coding-runtime/test/native-repository-tools.test.ts`
- new AnchorEdit fixture helpers and process-race fixtures

**Public seam:** invoke the typed adapter through the runtime-owned port against a temporary real Git
repository.

**RED:** clean tracked file, already-dirty exact base, untracked file, missing file, symlink, hardlink,
invalid UTF-8, stale hash, identity replacement, zero/multiple/overlapping anchors, line-ending
preservation, mode preservation, 1 MiB boundary, 16-anchor boundary, one-byte overflow, cancellation before
replacement, and temporary-file cleanup.

**Independent oracle:** real filesystem bytes and SHA-256 before/after, real `git ls-files`, `stat`
identity/mode, directory listings, and exact expected desired bytes. The test must not call the production
patch constructor to compute expected output.

**Permitted fakes:** barrier hooks only at named adapter checkpoints to make races deterministic. No
in-memory filesystem, mocked Git trackedness, or mocked final file bytes for the integration lane.

**Matching surface:** component fixture shows a stale or ambiguous proposal as blocked with inspect and
re-propose recovery; no approve control remains active.

### Slice 4: Journaled edit dispatch and content-derived recovery

**Likely files:**

- `packages/coding-runtime/src/runtime.ts`
- `packages/coding-runtime/src/client-session.ts`
- `packages/coding-runtime/src/journal/`
- `packages/coding-runtime/src/replay.ts`
- `packages/coding-runtime/test/crash-boundaries.test.ts`
- new safe-actuation round-trip and recovery tests

**Public seam:** `AgentClient.submit`, crash/reopen through the real file journal, and pure replay.

**RED:** crash before effect request, before approval consumption, after consumption/before dispatch,
after dispatch-start/before replacement, after replacement/before receipt, after receipt/before
observation, replay with unresolved effect, and cancellation at every safe boundary.

**Independent oracle:** exact journal records and file hashes inspected separately. Reopen counters prove
zero repository or Git I/O during pure replay. Barrier-controlled child processes prove which checkpoint
was durable.

**Permitted fakes:** deterministic clock/ID and named crash barriers. The file journal, target filesystem,
content reconciliation, and one success path use real adapters.

**Matching surface:** relaunch reconstructs consumed approval, current file truth, recovery decision, and
next safe action without a duplicate edit.

### Slice 5: Attributed Eden delta, current Git patch, and changed files

**Likely files:**

- `packages/coding-runtime/src/tools/index.ts` or a focused Git review adapter
- `packages/coding-runtime/src/projection.ts`
- `packages/coding-runtime/src/view-projection.ts`
- `packages/coding-runtime/test/projection.test.ts`
- new Git review and attribution tests
- `apps/eden/src/tui.tsx`
- `apps/eden/src/headless.ts`

**Public seam:** review observations projected through `AgentClient`, TUI, and headless NDJSON.

**RED:** clean base, pre-existing dirty target, unrelated dirty tracked file, staged plus unstaged changes,
rename/unmerged/untracked status rows, binary tracked change, external diff/textconv configuration,
24 KiB exact boundary, one-byte overflow, post-edit concurrent change, control characters, and CJK paths.

**Independent oracle:** real fixed Git CLI output from temporary repositories, literal expected Eden patch,
`git rev-parse HEAD`, file hashes, and a separate changed-path set. Renderer tests cannot manufacture
attribution.

**Permitted fakes:** native-process fake only for malformed/overflow parser fixtures. Real Git is required
for happy paths and configuration-hardening cases.

**Matching surface:** TUI labels `Eden`, `pre-existing`, or `both`, keeps the two patches separate, and
shows untracked names without contents. Headless events contain equivalent hashes, rows, and complete
bounded patches.

### Slice 6: Hardened Git diff check and completed review

**Likely files:**

- the focused Git review/check adapter
- `packages/coding-runtime/src/runtime.ts`
- `packages/coding-runtime/src/view-projection.ts`
- `packages/kernel/src/reducer.ts`
- runtime and contract check tests
- TUI review components and tests

**Public seam:** execute one approved edit and observe baseline/current check results followed by
non-success `completed`.

**RED:** clean pass, pre-existing whitespace error, Eden-introduced whitespace error, conflict marker,
external diff command configuration, textconv configuration, timeout, cancellation, malformed UTF-8,
overflow, missing Git, process crash after dispatch, and an attempted `succeeded` event without verifier
evidence.

**Independent oracle:** real hardened `git diff --check` exit code and diagnostics from controlled
repositories, plus literal expected baseline/current/new diagnostic identities. A sentinel external
program proves it was not invoked.

**Permitted fakes:** fake native-process results only for impossible-to-portably-force malformed capture
and post-dispatch unknown cases. At least one pass and every user-visible diagnostic family use real Git.

**Matching surface:** TUI review answers what changed, what was checked, what failed, what risk remains, and
what the user can do next. Headless projection ends at `completed`, never `run.terminal` success.

### Slice 7: Denial, cancellation, retry, and surface parity

**Likely files:**

- `packages/coding-runtime/src/agent-client.ts`
- `packages/coding-runtime/src/client-session.ts`
- `apps/eden/src/tui-focus.ts`
- `apps/eden/src/tui.tsx`
- `apps/eden/test/tui-r2-conversation.test.tsx`
- `apps/eden/test/headless.test.ts`
- new focused safe-actuation TUI and parity tests

**Public seam:** real TUI commands plus replayed headless product events from the same journal.

**RED:** denial then valid narrower proposal, denial then broad proposal, second denial, stale approval
after resize or delayed input, cancellation before and after dispatch, crash-derived edit completion,
unknown check completion, read-only historical inspection, and renderer attempts to forge approval or
review facts.

**Independent oracle:** journal sequence, file hash, effect dispatch counter, and identical decoded
product fields across TUI fixture and headless output.

**Permitted fakes:** scripted model proposals and terminal input. The policy, reducer, journal, filesystem,
Git adapters, and projections remain real in the matching flow.

**Matching surface:** keyboard-only `60x20`, `80x24`, and `100x30` flows cover approve, deny, narrower
reproposal, stale action, review switching, long patch scrolling, CJK paste, resize, and terminal restore.

### Slice 8: Packaged and hosted closure

**Likely files:**

- `scripts/r2-safe-actuation-acceptance.mjs`
- focused PTY/evidence driver and tests
- package scripts and hosted workflow only where required for the accepted evidence
- `CONTEXT.md` and this plan for exact closeout facts

**Public seam:** copied Bun archive in a temporary real Git repository on Ubuntu, macOS, and Windows.

**RED:** the acceptance driver must first reject missing action/policy/recovery/review/check rows, stale
artifact hashes, source-tree dependency, unsupported Git, secret canaries, and any success or isolation
claim.

**Independent oracle:** archive manifest, executable and pinned-ripgrep hashes, host Git version, real
fixture repository hashes/status/diff, journal replay, PTY transcript assertions, and exact workflow SHA.

**Permitted fakes:** deterministic provider/tool proposal fixture for hosted lanes. No provider credential
or network request is required. Filesystem, Git, package archive, process, journal, and terminal are real
on every claimed platform.

**Matching surface:** copied-archive approve, deny, stale edit, pre-existing dirty work, check failure,
crash recovery, narrow review, and terminal restoration rows. Docker and repository-code checks remain
explicitly `not-run`, not failed and not implied.

## Likely files and boundaries

The smallest expected production change set is:

- `packages/contracts`: closed action, policy, approval lifetime, change-set, check, and review values;
- `packages/kernel`: pure proposal, policy/approval facts, effect identities, completed-review transition,
  and rejection of forged success;
- `packages/coding-runtime`: canonical encoding, policy evaluator, full-file snapshots, AnchorEdit, fixed
  Git review/check adapters, action-specific receipts/reconciliation, journal integration, and projections;
- `packages/providers`: only the closed `anchor_edit` proposal tool schema if the current normalized
  tool-call representation cannot express it without provider-specific changes;
- `apps/eden`: approval and review presentation, focus/actions, and equivalent headless projection;
- `scripts`: deterministic acceptance and PTY evidence;
- focused docs and plan closeout facts after implementation evidence exists.

Do not implement safe actuation in `goals`, `planning`, or `verification` merely because those placeholders
exist. Do not introduce a generic shared command runner, shell grammar, artifact store, or abstraction for
future write kinds.

## Verification commands

Run focused RED/GREEN commands per slice, then the complete gate:

```sh
pnpm --filter @eden/contracts test
pnpm --filter @eden/kernel test
pnpm --filter @eden/coding-runtime test
pnpm --filter @eden/cli test
pnpm test:r2-process
pnpm test:r2-provider-fixtures
pnpm test:r2-secret-canaries
pnpm test
pnpm typecheck
pnpm code:check
pnpm build
pnpm --filter @eden/cli package:bun
node scripts/smoke-standalone.mjs apps/eden/dist/eden
pnpm test:r2-native-archive
pnpm test:r2-tui-pty
pnpm markdown:check
git diff --check
```

The accepted Build may add focused `test:r2-actuation` and `test:r2-actuation-pty` commands. Their
drivers must have unit tests that reject missing rows, stale hashes, `not-run` presented as pass, and
unsupported security or release claims.

## Acceptance ledger

| Area | Required evidence |
| --- | --- |
| Canonical action | exact independent bytes/digest; field/order/path drift; closed decoder |
| Policy | ordered default deny; allow/ask/deny; rule revision; no renderer/model authority |
| Approval | exact digest/revision; durable consume-before-dispatch; stale/replay/change rejection |
| Denial | durable observation; one valid narrower child; broad/second child rejection |
| AnchorEdit | tracked regular UTF-8 only; dirty exact base; unique anchors; no unrelated bytes |
| Filesystem | link/identity/stale/race barriers; mode/line ending; flush/replace; bounded cleanup |
| Recovery | base/desired/other edit matrix; process post-dispatch unknown; zero replay I/O |
| Review | complete Eden delta; complete current tracked patch; status-only untracked paths |
| Attribution | Eden/pre-existing/both rows from runtime facts, not renderer inference |
| Check | hardened baseline/current `git diff --check`; new diagnostics; no external/repository code |
| Terminal | completed review only; forged/unverified success rejected |
| Surfaces | TUI execution plus equivalent AgentClient/headless durable projections |
| Packaging | copied archive and real Git/FS/PTY rows on each claimed hosted platform |
| Claims | trusted-host policy only; Docker/general shell/verifier/release remain unclaimed |

## Risks and mitigations

| Risk | Mitigation or stop condition |
| --- | --- |
| Canonical encoder and display drift | Independent byte fixtures; execution redecodes envelope; display is non-authoritative |
| Existing fake reconciliation leaks into real actions | Separate effect kinds and explicit recovery matrix; never infer real not-started from a missing receipt |
| External editor changes the file | Full base hash, identity checks, cooperating lock, final pre-replace validation, desired verification; residual race stated |
| Dirty work is misattributed | Preserve it; show Eden delta and current Git patch separately |
| Git config executes external code | Fixed built-in command, scrubbed environment, no external diff/textconv, sentinel tests |
| Complete patch exceeds journal budget | Complete-or-blocked 24 KiB contract; stop for storage amendment rather than truncate |
| Check is mistaken for verification | Separate check observation; hard reducer assertion that only verifier may emit success |
| Headless approval invites bypass | No new preapproval flag; prove projection parity without inventing resume |
| Cross-platform atomicity differs | Platform fixtures and truthful directory-flush residual; no portable CAS claim |
| Docker is pulled into the runner refactor | Trusted-host execution mode stays explicit; Docker requires a later accepted packet |

## Rollback and amendment policy

Before release, rollback is a normal commit that removes the safe-actuation product path while preserving
journals and user files. Never roll back a user file automatically. A journal containing the proposed new
events must fail visibly under older code or use an explicit pre-release compatibility rule; it must not
silently replay as an R1/R2 read-only run.

Stop and amend this plan if implementation needs:

- create/delete/rename, multi-file atomicity, binary edits, or files larger than the frozen limits;
- a journal-size change, patch pagination, attachment/artifact storage, or truncated review;
- arbitrary argv, shell, repository code, package scripts, hooks, network access, or new environment class;
- Docker or a native-sandbox claim;
- time-based approval expiry instead of proposal-revision single use;
- durable resume or a new headless approval protocol;
- GoalSpec, repair, Evidence Pack, verifier implementation, or `succeeded`;
- a public support, release, provider, or terminal-state claim outside this packet.

Routine file placement, internal type names, smaller measured ceilings, parser implementation, and test
mechanics do not reopen owner decisions when they preserve the frozen public seam and evidence.

## Explicit non-goals

- general shell, arbitrary command execution, repository task catalogs, or model-selected argv;
- repository test/build/lint/package commands or any execution of repository-authored code;
- create, delete, rename, chmod, stage, commit, rollback, binary edit, or multi-file transaction;
- Docker, native OS sandbox, network isolation, malicious-same-user resistance, or release security claim;
- GoalSpec, planning implementation, verifier implementation, repair loop, Evidence Pack, or success;
- headless preapproval, run resume, desktop/local service, provider expansion, or context-budget changes;
- unbounded/large diff storage, pagination, attachments, untracked-file contents, or binary patches;
- release, signing, installers, updates, package-manager publication, or broad platform support.

## Human approval

The owner approved the Explore recommendations, confirmed shared understanding, and accepted:

- `docs/research/2026-07-28-r2-safe-actuation-freeze-decision-brief.md`;
- ADR 0015;
- ADR 0016;
- the focused `SPEC.md`, architecture, event, threat, product-contract, UX, and future-work updates;
- this complete test-first plan.

The owner separately authorized Build on 2026-07-28. Approval covers continuous execution through Slice 8
and its single evidence-backed review. It does not authorize commit, push, release, credentials, network
use, Docker, or other external publication unless separately granted.

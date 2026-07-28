# R2 Safe Actuation Freeze Decision Brief

- Status: Approved
- Date: 2026-07-28
- Roadmap stage: R2, Usable Minimal Coding Product
- Baseline: `1f580babc29ad8e818ac8547a52cd7d25425a358`
- Decision source: owner-approved Explore recommendations and confirmed shared understanding
- Required architecture approvals: ADR 0015 and ADR 0016
- Proposed plan: `docs/plans/2026-07-28-r2-safe-actuation-and-review.md`
- Approved: 2026-07-28
- Build status: authorized after separate owner checkpoint on 2026-07-28

## Decision requested

Approve the next bounded R2 vertical slice: one real, trusted-host, policy-contained AnchorEdit of existing
tracked UTF-8 content, followed by attributed change review and the fixed `git diff --check` diagnostic.

Approval covers the public contract, architecture decisions, test seams, budgets, and ordered plan in this
packet. It does not authorize implementation until the owner explicitly accepts the complete packet and
authorizes Build. It does not approve Docker execution, general shell, repository test commands,
create/delete/rename, repair, GoalSpec, Evidence Packs, verifier success, release, commit, or publication.

## User-visible outcome

A user with a trusted repository can review an exact proposed edit, see why policy asks, approve one
digest-bound action, and watch the edit either apply once or fail closed. The review surface separately
shows what Eden changed and the complete tracked Git patch currently present against `HEAD`.

The product also shows the baseline and post-edit result of one fixed Git whitespace/conflict-marker
diagnostic. The run ends in non-success `completed` review. A denial remains visible and may produce one
strictly narrower proposal; a crash never causes a blind edit or process retry.

## Current repository evidence

- `packages/kernel/src/model.ts` has an `Action` with action, approval, display, cwd, digest, reason, and
  scope fields, but `packages/kernel/src/fake-action.ts` supplies a deterministic fake digest rather than
  canonical operation bytes.
- The reducer validates that fake action and optimistic revision checks reject a stale client approval,
  but the later `fake.action.execute` effect carries only fake identity. Real execution is not yet bound to
  an operation, workspace snapshot, environment, policy revision, or lifetime.
- `packages/coding-runtime/src/policy/index.ts` contains only the `allow | ask | deny` vocabulary and has no
  rule schema, evaluator, revision, or product observation.
- `packages/coding-runtime/src/native-process.ts` already owns explicit executable, argv, cwd, environment,
  output caps, timeout, cancellation, and process-tree cleanup with `shell: false`. It is a useful runner
  port, not policy or isolation.
- `packages/coding-runtime/src/fake-tool-host.ts` can interpret a missing receipt as not started only for
  its deterministic fake effect. That assumption is unsafe for real edits and processes.
- `read_file` already proves regular-file identity, rejects linked inputs, requires UTF-8, and returns
  bounded hashes. Its page hash is not a complete mutable-file base snapshot.
- Profile storage demonstrates temporary-file, flush, and rename mechanics. It does not establish a
  workspace edit protocol, mode preservation, Git trackedness, action attribution, or edit recovery.
- `git_status` uses fixed Git arguments, but there is no production Git diff/check contract or change-set
  event. `ProductView.changedFiles` is currently projected as an empty array.
- `CheckResult` and `verification.updated` exist as contract shapes, while the verification runtime is
  still a placeholder. A fake path can reach verifier-backed success; a real model answer currently stops
  at non-success `completed`.
- The TUI shows display, cwd, reason, and scope for approval but does not make the action digest or
  single-use lifetime prominent. Its authority copy truthfully says trusted host, no isolation, and write
  denied.

## Accepted Explore decision tree

The owner approved every currently consequential branch and confirmed the resulting shared understanding:

```text
Safe actuation
├── Completion authority
│   └── completed review; verifier-owned succeeded remains untouched
├── Execution mode
│   ├── now: trusted-host policy containment
│   └── later R2 exit slice: Docker isolation
├── Write grammar
│   └── AnchorEdit v1, modify existing tracked UTF-8 only
├── Authority
│   ├── structured allow / ask / deny policy
│   └── single-use approval bound to a canonical action digest
├── Denial
│   └── durable non-terminal observation; one narrower reproposal
├── Review truth
│   ├── Eden-attributed base-to-desired delta
│   └── complete current tracked Git patch against HEAD
├── First check
│   └── hardened git diff --check; no repository code or general shell
└── Crash recovery
    ├── edit: reconcile base / desired / other snapshots
    └── process/check: post-dispatch missing receipt is unknown
```

The owner decision frontier is empty. The remaining checkpoint is approval of whether this Freeze packet
faithfully records those decisions and supplies an executable plan.

## Frozen authority boundary

The action pipeline is:

```text
typed proposal
  -> canonical ActionEnvelopeV1
  -> versioned allow / ask / deny policy
  -> single-use digest approval when required
  -> journaled effect intent
  -> action-kind-specific runner and reconciliation
  -> attributed delta + current Git patch + check observation
  -> non-success completed review
```

The canonical digest covers the operation schema and bytes, normalized paths and cwd, run/workspace
identity, scope, complete base snapshots, policy revision, environment class, network mode, execution mode,
timeout/output budgets, and proposal-revision lifetime. The model, provider, and renderer cannot choose or
rewrite those facts.

Workspace trust answers whether Eden may start repository work. Policy answers whether this typed action
is allowed, requires approval, or is denied. Approval records user authority for one digest. The trusted
host runner performs the typed operation without claiming containment from the operating system. Docker
later supplies a different isolation mode. None of these controls substitutes for another.

## Frozen edit boundary

AnchorEdit v1:

- targets an existing Git-tracked regular UTF-8 file beneath the captured root;
- carries a complete base length and SHA-256;
- resolves every non-empty old-text anchor exactly once against that same base;
- rejects overlapping anchors and computes the desired full snapshot before approval;
- preserves unrelated bytes and the existing file mode;
- rejects create, delete, rename, chmod, links, invalid UTF-8, stale identity, stale content, and
  over-budget review;
- never resets, checks out, stages, or requires a clean worktree.

An already-dirty target is allowed when current bytes exactly equal the approved base. This preserves user
work while making Eden's additional delta independently attributable.

The adapter uses a cooperating-Eden mutation lock, checked handles, same-directory temporary output,
flush, pre-replacement identity and hash validation, atomic replacement, post-write desired verification,
and directory flush where supported. This does not claim malicious-same-user resistance or portable
filesystem compare-and-swap.

## Frozen review and check boundary

Review contains:

| Value | Meaning | Source of truth |
| --- | --- | --- |
| Eden-attributed delta | Exact approved base-to-desired patch | AnchorEdit base and desired snapshots |
| Current Git patch | Complete tracked-content patch against captured `HEAD` | Fixed hardened host-Git diff |
| Changed files | Paths and attribution derived from both observations | Runtime projection |
| Baseline check | Pre-edit `git diff --check` diagnostics | Fixed hardened host-Git check |
| Current check | Post-edit `git diff --check` diagnostics | Fixed hardened host-Git check |
| Newly observed diagnostics | Current diagnostics absent from the baseline | Runtime comparison |

Untracked paths remain listed by Git status but their contents do not silently enter the current patch.
Patches and diagnostics are complete within the plan's closed budgets or become visible blockers; they are
never silently truncated.

The Git adapters use compatible probed host Git, fixed cwd and argv, a scrubbed non-interactive
environment, `--no-ext-diff`, `--no-textconv`, no shell, bounded output, timeout, and complete process-tree
cleanup. They run no package script, test runner, build tool, hook, arbitrary executable, or
repository-authored command.

## Frozen recovery boundary

The journal records policy decision, approval consumption when applicable, effect intent, dispatch
checkpoint, and terminal observation with stable identities. Replay only folds those facts.

Edit reconciliation compares the live target:

- desired snapshot: completed;
- base snapshot: not started and eligible for one dispatch with the same effect ID;
- anything else: stale or unknown, block without overwrite.

For Git diff or check, a durable pre-dispatch state may be not started. Once process dispatch begins,
missing terminal evidence is unknown. The runtime never repeats the process merely because a receipt or
observation is missing.

## Plan-derived values, not new owner decisions

The Build plan may derive exact byte ceilings, action counts, timeout values, output capture limits,
fixture paths, latency gates, and file placement from the existing 64 KiB journal record, 1 MiB run,
native-process, packaged-Git, and terminal constraints.

Those values must preserve complete-or-blocked review, one action lineage, one fixed check, no repository
code, and the existing public support caveats. If measurement cannot fit a complete review inside the
current persistence contract, Build must stop for an amended storage decision rather than truncate or
silently add an artifact store.

## Explicit non-goals

- create, delete, rename, chmod, staging, committing, rollback, or multi-file transactional edits;
- arbitrary executable, argv, shell text, repository task catalog, package scripts, test runners, builds,
  hooks, or repair commands;
- Docker execution, native OS sandboxing, network-isolation claims, or malicious-same-user hardening;
- GoalSpec, required-check selection, verifier implementation, Evidence Packs, repair budgets, or
  `succeeded`;
- provider expansion, model-protocol changes, extra tool calls, or autonomous planning changes;
- large-diff attachment storage, diff pagination, binary patch publication, or untracked-file contents;
- desktop/local-service work, release packaging changes, installers, signing, or release-support claims.

## Approval and stop conditions

The owner approved the decision branches, accepted this brief, ADR 0015, ADR 0016, the focused contract
changes, and the test-first plan as one Freeze packet, then separately authorized Build on 2026-07-28.

After Build authorization, implementation may proceed continuously through the accepted slices. Stop and
return to Explore/Freeze if evidence requires broader write grammar, an attachment store, repository code
execution, different approval lifetime, general shell, Docker in this plan, changed terminal semantics, or
verifier-owned success.

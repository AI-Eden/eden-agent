# ADR 0016: Use Modify-Only AnchorEdit and Attributed Review in R2

- Status: Accepted
- Date: 2026-07-28

## Context

R2 can read bounded file ranges and report Git status, but it has no production AnchorEdit, change-set
event, diff adapter, or verifier. `ProductView.changedFiles` is currently an empty projection even though
the product documents promise changed-file and diff review.

A first write slice must coexist with a dirty worktree. Requiring a clean repository or resetting files
would destroy or hide user work. Showing only the whole Git diff would incorrectly attribute pre-existing
changes to Eden, while showing only Eden's edit would hide the real state the user will commit. Running a
repository test command would also broaden the trusted-host authority before Docker or a closed command
catalog exists.

## Decision

AnchorEdit v1 modifies existing Git-tracked regular UTF-8 files only. It cannot create, delete, rename,
chmod, stage, commit, follow symlinks, accept hardlinks, or touch paths outside the captured trusted root.
Trackedness is established through one runtime-owned fixed Git query; the model cannot supply Git
arguments.

One proposed file operation carries:

- a normalized root-relative path;
- the complete base byte length and SHA-256;
- one or more non-empty `oldText` to `newText` replacements;
- an exact expected occurrence count of one for every `oldText`.

All anchors resolve uniquely and without overlap against the same full base snapshot. Replacement output
is deterministic from that snapshot rather than from sequentially mutated text. The desired full-file
length and SHA-256 join the canonical action before approval. Invalid UTF-8, duplicate or overlapping
anchors, unchanged output, line-ending ambiguity, stale bytes, changed file identity, symlink or hardlink
state, missing trackedness, or an over-budget result blocks before replacement.

Dirty worktrees are supported. Eden accepts an already-dirty file only when its current bytes exactly
match the proposal's base snapshot. It never resets, checks out, stages, or rewrites unrelated bytes.

The adapter holds the cooperating-Eden workspace mutation lock, reads and validates the target through a
checked handle, writes the complete desired bytes to a same-directory temporary regular file, preserves
the existing mode, flushes the file, revalidates target identity and base bytes immediately before atomic
replacement, then verifies the desired snapshot. It flushes the parent directory where the platform
supports that operation. This narrows ordinary editor races but is not a malicious-same-user or
platform-native compare-and-swap guarantee.

Recovery is snapshot-derived:

| Current target | Reconciliation |
| --- | --- |
| Exact desired length and SHA-256 | `completed`; derive the terminal observation from the approved envelope and live snapshot |
| Exact base length and SHA-256 | `not_started`; the same stable effect may dispatch once |
| Missing, different, invalid, linked, or unreadable | `unknown` or `stale`; block without overwrite |

Review exposes two deliberately separate values:

1. **Eden-attributed delta:** the complete patch from every approved base snapshot to its desired snapshot.
2. **Current Git patch:** the complete observed tracked-content patch against `HEAD`, captured after the
   action with commit identity, status hash, timestamp, and content hash.

Untracked paths remain visible in Git status but their contents are not silently added to the patch. Both
patches are complete within a frozen byte budget or unavailable as a closed blocker; neither is silently
truncated. `changedFiles` derives from the same review observations rather than renderer inference.

The first closed check is a runtime-owned hardened `git diff --check` operation. It uses the compatible
host Git with a scrubbed non-interactive environment, fixed cwd, fixed arguments, no shell, no external
diff driver, and no text conversion. The runtime captures it before the edit and after the edit, so review
can distinguish baseline diagnostics from newly observed diagnostics. It does not execute repository
tests, package scripts, hooks, or arbitrary repository code.

An edit that reaches review produces non-success `completed`, regardless of whether the closed check
passes. Check results are evidence for human review, not verifier authority. ADR 0004 continues to reserve
`succeeded` for later GoalSpec and verifier work.

## Rejected alternatives

- **Require a clean worktree:** this rejects normal local development and tempts destructive cleanup.
- **Blind whole-file overwrite:** it can erase user edits made after the proposal.
- **Offset-only edits:** byte offsets become stale without proving the complete base snapshot.
- **Sequential anchor matching:** earlier replacements can manufacture or remove later anchors.
- **Create/delete/rename in v1:** each adds different recovery, review, and path-authority semantics.
- **Show only the whole Git diff:** it misattributes pre-existing user changes to Eden.
- **Show only Eden's delta:** it hides the actual repository state under review.
- **Run repository tests on the trusted host:** package scripts and build tools are executable repository
  code, not a safe extension of a fixed Git diagnostic.
- **Treat a passing check as success:** this bypasses GoalSpec and the verifier boundary.

## Consequences

The first writable slice is intentionally narrow but proves the action, policy, approval, journal,
filesystem, review, check, TUI, and headless seams end to end. It needs fixtures for dirty files, stale
snapshots, anchor ambiguity, identity swaps, crash checkpoints, pre-existing diff-check failures, review
attribution, and complete-or-blocked budgets.

Docker remains a later R2 exit slice. Create/delete/rename, arbitrary commands, repository-code checks,
repair loops, Evidence Packs, and verifier success require later Explore and Freeze decisions.

The owner accepted this ADR with the complete 2026-07-28 Freeze packet and separately authorized Build.

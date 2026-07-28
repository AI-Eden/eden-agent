# ADR 0015: Bind R2 Safe Actuation to Canonical Actions

- Status: Accepted
- Date: 2026-07-28

## Context

R1 has a useful approval shape and deterministic fake action, but its digest is not a canonical digest of
an executable repository operation. The current policy module exposes only the words `allow`, `ask`, and
`deny`, while the native-process port owns low-level process mechanics rather than authority. The fake
tool host can treat a missing receipt as not started only because its effect has fake semantics.

Those seams cannot safely authorize a real file edit. Approval presentation, policy, execution, and crash
recovery would otherwise disagree about what was permitted or whether an unresolved effect may run again.
Workspace trust also cannot fill this gap: ADR 0009 permits task entry, not action authority.

The first real actuation slice needs one truthful trusted-host path without importing a general shell,
repository code execution, Docker claims, or verifier-owned success.

## Decision

Every executable proposal becomes a closed `ActionEnvelopeV1` before policy evaluation. The envelope owns:

- action kind and canonical operation bytes;
- immutable run, workspace, and proposal-revision identity;
- normalized root-relative paths and cwd;
- exact capability scope and base snapshots;
- policy schema and rule-set revision;
- environment class, network mode, and execution mode;
- timeout and output budgets where the action can produce output;
- a single-use lifetime bound to the current proposal revision.

The runtime decodes a closed value, normalizes path separators to `/`, rejects absolute or non-canonical
paths, projects every execution-semantic field except the correlation-only action ID, emits recursively
key-sorted canonical JSON with ordered arrays, prefixes the bytes with the domain `eden.action.v1`, and
hashes the result with SHA-256. Strings preserve their decoded Unicode values; no renderer, provider, or
model supplies the digest or canonical bytes. Contract fixtures retain the exact canonical byte sequence
so an independent oracle can detect encoder drift.

Policy is a versioned, ordered, default-deny rule set. Evaluation returns exactly:

- `allow`: the exact envelope may dispatch without a user approval;
- `ask`: the exact canonical display and digest require one user decision;
- `deny`: no effect may be requested.

Each decision records rule identity, rule-set revision, reason, and evaluated digest. In this slice,
AnchorEdit v1 is `ask`. Runtime-owned Git trackedness, status, diff, and the hardened
`git diff --check` template may be `allow` only in their exact closed shapes. Unknown kinds, unmatched
paths, changed rule revisions, broader capabilities, or malformed envelopes are denied.

An approval binds approval identity, action identity, run identity, expected product revision, action
digest, and single-use proposal lifetime. Runtime code consumes it durably before dispatch and immediately
revalidates the envelope, policy decision, workspace identity, cwd, base snapshots, and digest. A stale,
replayed, already-consumed, replaced, cancelled, or digest-mismatched approval cannot dispatch.

Denial is a durable non-terminal observation, not a synthetic failure and not permission to retry the same
action. One later proposal may name the denied action as its parent. Runtime accepts it as narrower only
when it has no more paths or replacements and adds no capability, environment, network, isolation,
timeout, or output authority. A second denial closes the lineage without automatic reproposal.

Effect intent is journaled before dispatch, but recovery is owned by the action kind:

- an edit reconciles current content against its approved base and desired snapshots;
- a process or check that has durably started but lacks a terminal receipt is `unknown`;
- only a kind-specific proof of `not_started` permits dispatch with the same stable effect identity.

The runtime never applies the fake host's missing-receipt assumption to real edit or process effects.
Replay folds durable facts and performs no policy evaluation, approval, reconciliation, or dispatch.

Approval, policy, trusted-host containment, network configuration, and Docker isolation remain distinct
control planes. The product must name the current mode as trusted host with policy containment and must
not describe it as a sandbox.

## Rejected alternatives

- **Reuse the fake digest:** it identifies a test action, not canonical execution semantics.
- **Hash only display text:** presentation can omit environment, snapshot, lifetime, or policy facts that
  change execution.
- **Let policy generate argv:** policy decides authority; a typed adapter owns execution mechanics.
- **Treat approval as isolation:** a user decision does not constrain filesystem, process, or network
  effects.
- **Retry every missing receipt:** process dispatch may already have executed even when no terminal record
  exists.
- **Make every closed Git probe ask:** repeated approval adds ceremony without broader authority when the
  executable and complete operation shape are runtime-owned and default-denied.
- **Make denial terminal:** a user should be able to permit a genuinely narrower proposal without losing
  the run.

## Consequences

Contracts, kernel state, journal records, runtime dispatch, TUI, and headless projections must share one
action identity and one policy observation. Tests need independent canonical-byte fixtures, stale and
single-use approval cases, narrower-proposal checks, and kind-specific crash matrices.

Adding another writable action, check template, environment class, network mode, or runner requires an
explicit policy rule and action schema. A general shell remains deferred in
`docs/future-works/model-generated-general-shell.md`.

The owner accepted this ADR with the complete 2026-07-28 Freeze packet and separately authorized Build.

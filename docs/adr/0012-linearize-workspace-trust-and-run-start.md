# ADR 0012: Linearize Workspace Trust Changes and Run Start

- Status: Accepted
- Date: 2026-07-16

## Context

The in-process client caches `WorkspaceReview` for presentation. Another client can revoke trust, or the
original workspace path can retarget, after that review while the first client still starts a run. A
renderer cache therefore cannot be start authority, and atomic trust-file replacement alone does not order
trust mutation against run creation across processes.

## Decision

Trust review caches are presentation hints. Every start re-resolves the originally requested workspace and
reloads the current trust record inside one per-state-root, per-workspace cross-process critical section.
Grant and revoke use the same section and reload the current revision after acquisition.

The portable lock is an exclusively created directory at
`workspace-locks/v1/<workspaceId>.lock`, containing one closed `owner.json` record no larger than 4096
bytes. Acquisition polls an injected timer every 25 milliseconds for at most 2000 milliseconds and honors
cancellation. Missing, malformed, symlinked, hardlinked, timed-out, or otherwise invalid ownership fails
closed as sanitized `workspace_state_busy` with retry recovery. R1 never automatically reclaims an orphaned
lock.

A start first rejects missing or restricted trust without creating a lock or state. Under the lock it
re-resolves identity, reloads and validates the trusted record and expected revision, allocates the run ID,
creates the run journal, and keeps the lock until the `run.started` newline is durable. The model effect runs
only after release. Every denied start consumes no run ID, creates no run path, and calls no provider or
effect host.

Start wins when its trusted `run.started` record is durable before revoke acquires the lock. Revoke wins
when its restricted record is durable before start reloads under the lock. Competing state-changing
commands with the same expected revision produce one durable change and one `stale_revision`. Repeating
the current decision remains a byte-stable idempotent no-op: it does not consume a revision, so a no-op and
a later state change using that revision may both succeed in their serialized order. Normal release removes
only an owner record and lock whose opaque token still matches.

## Consequences

Cooperating Eden processes share one explicit linearization boundary for current workspace authority. A
crashed owner may leave state busy and require the user to close Eden processes and reconfigure local state;
unsafe automatic stale-lock deletion is rejected for R1.

This decision does not claim resistance to malicious same-user lock deletion, forgery, or path substitution.
Those stronger filesystem guarantees remain deferred in
`docs/future-works/adversarial-local-state-filesystem-hardening.md`.

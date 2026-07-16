# ADR 0010: Partition Run History by Workspace and Keep R1 Inspection Read-Only

- Status: Accepted
- Date: 2026-07-16

## Context

R1 already persists journal-authoritative runs and can reopen a known run ID without replay I/O. The
product still has no way to discover those runs, so a relaunch cannot expose the durability that the
runtime already proves. The public README and help surface also remain behind the implemented product.

The next slice must not call historical inspection `resume`. In Eden, resume means continuing durable
execution from a defined checkpoint, including approval and effect-reconciliation semantics. That remains
a later roadmap gate. R1 needs a current-workspace catalog and read-only inspection only.

The existing `<stateDirectory>/runs/<runId>/journal.jsonl` layout cannot satisfy two accepted requirements
together. A catalog must show only the current canonical workspace, while a corrupt journal must remain a
visible unavailable entry. If the journal is the only place that records workspace identity, corruption
can make the run impossible to attribute without either leaking another workspace's history or silently
hiding damaged state.

## Decision

Store new pre-release R1 runs under:

```text
<stateDirectory>/runs/v1/<workspaceId>/<runId>/journal.jsonl
<stateDirectory>/runs/v1/<workspaceId>/<runId>/receipts/
```

The workspace ID is the canonical, domain-separated identity accepted by ADR 0009. The runtime scans only
the current workspace partition and derives available catalog entries from validated journal records. It
does not create a mutable catalog index, trust filesystem modification times as product chronology, or
follow symlinked run entries.

Expose a closed, versioned run-catalog contract through `AgentClient`. Available entries summarize the
journal-derived task, phase, outcome, revision, and first/last recorded timestamps. A structurally valid
run directory whose journal cannot be validated appears as an unavailable entry with a structured error;
other valid runs remain inspectable. Historical inspection returns a closed wrapper containing the
summary and replayed `ProductView` and is always marked read-only.

Both restricted and trusted workspace-review states may list and inspect that exact workspace's history.
Revocation blocks new task start but does not rewrite or hide historical run evidence. Catalog and
inspection never append a journal record, create a run, reconcile or dispatch an effect, resolve an
approval, or change current trust.

The headless surface uses `eden run list --json` and `eden run show --json <run-id>`. The TUI uses the same
contract and requires an explicit selection; it never automatically opens or continues the latest run.

Narrow pre-release `RunIdSchema` to `^run-[a-z0-9][a-z0-9-]{0,123}$` and generate production IDs as
`run-<uuid>`. The fixed prefix avoids Windows reserved device names, lowercase avoids cross-platform
case-folding collisions, and the 128-character bound fits one filesystem segment. Existing accepted
deterministic IDs remain valid; path-like user input is rejected at the public boundary.

## Rejected alternatives

- **Quickstart-only closeout:** would leave journal durability inaccessible through the product and make
  the R1 exit claim weaker than the implemented runtime.
- **General resume:** would imply continued execution, durable approval, and broader recovery semantics
  intentionally deferred beyond this slice.
- **Global history:** would break the exact canonical-workspace boundary selected for R1.
- **TUI-local discovery:** would let renderer filesystem state become product truth and would diverge from
  the headless surface.
- **A sidecar or mutable catalog index:** would duplicate journal-derived facts and require drift and
  recovery policy before the product needs indexed history.
- **Keep the unpartitioned layout:** cannot attribute a fully corrupt journal to the current workspace
  while also preserving visible failure and exact-workspace filtering.

## Consequences

The runtime gains one workspace-scoped read-only projection boundary and the public product protocol gains
run catalog and inspection schemas plus a narrower pre-release run-ID contract. Existing accepted
deterministic run IDs and journal v1 event shapes remain valid. The kernel and effect adapters do not
participate in discovery.

The repository is unreleased, so the old unpartitioned development layout is not migrated or read through
a compatibility shim. Implementation and evidence use a fresh isolated state directory. No code deletes
an existing state directory or old run artifacts.

This decision does not add session continuation, cross-workspace navigation, deletion, export, search,
pagination, provider onboarding, real tools, policy, sandbox authority, or an R1 completion claim.

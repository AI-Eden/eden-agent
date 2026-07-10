# Event Model

## Why events

Long-running coding tasks cross process exits, approvals, model retries, tool failures, and user steering. An append-only event journal makes these boundaries inspectable and supports replay, recovery, evaluation, and multiple product surfaces.

## Three representations

- `KernelEvent`: internal fact used to reconstruct execution state.
- `KernelEffect`: requested interaction with the outside world.
- `ProductEvent`: stable projection designed for users and clients.

The internal union may evolve faster than public contracts. Product events are projections, not a direct export of every implementation fact.

## Event envelope

Every persisted event will eventually include schema version, run ID, monotonic sequence, timestamp supplied by a clock port, causation ID, correlation ID, event type, validated payload, and redaction metadata.

## Transition rules

- Commands do not mutate state directly.
- Observations become events before the reducer sees them.
- The reducer is deterministic and total over known state-event pairs.
- Illegal transitions are rejected and observable.
- Terminal states are immutable.
- Success requires a verifier-produced event referencing current goal and workspace evidence.

## Effects

Effects include context assembly, model calls, policy evaluation, action execution, verification, and checkpoint persistence. Each effect needs an idempotency key or a documented reconciliation procedure before crash-resume support can claim reliability.

## Replay

Replay consumes only the journal and pure migrations. It must rebuild both `RunState` and product projections without calling providers or tools. Unknown future events fail visibly unless an explicit compatibility rule allows them to be ignored.

## Compaction

Conversation compaction may reduce model context but never deletes execution facts. It must preserve current goal, accepted plan, tool state invariants, unresolved approvals, workspace snapshot identity, budgets, verifier status, and source provenance.

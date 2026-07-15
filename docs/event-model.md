# Event Model

## Why events

Long-running coding tasks cross process exits, approvals, model retries, tool failures, and user steering. An append-only event journal makes these boundaries inspectable and supports replay, recovery, evaluation, and multiple product surfaces.

## Three representations

- `KernelEvent`: internal fact used to reconstruct execution state.
- `KernelEffect`: requested interaction with the outside world.
- `ProductEvent`: stable projection designed for users and clients.

The internal union may evolve faster than public contracts. Product events are projections, not a direct export of every implementation fact.

## Event envelope

Journal version 1 persists every kernel event as one closed, newline-terminated JSON object:

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

Sequence starts at zero and is contiguous within one run. The timestamp comes from the runtime clock port
and does not participate in reduction. The v1 decoder rejects unknown versions, event variants, envelope
fields, duplicate event IDs, run-ID mismatches, sequence gaps, and unterminated records. Product protocol
versioning remains independent from journal versioning.

## Transition rules

- Commands do not mutate state directly.
- Observations become events before the reducer sees them.
- The reducer is deterministic and total over known state-event pairs.
- Illegal transitions are rejected and observable.
- Terminal states are immutable.
- Success requires a verifier-produced event referencing current goal and workspace evidence.
- `run.started` contains the runtime-owned trusted workspace snapshot used by the start gate. The snapshot
  is immutable run evidence; it is not supplied by a renderer or re-read from current trust configuration
  during replay.

## Effects

The committed JSONL newline is the state-transition boundary. The runtime appends and flushes the domain
event before reduction, derives at most one deterministic effect, and appends an `effect.requested` event
before dispatch. The adapter may then persist an idempotent receipt before the runtime appends the
observation event.

Pure replay never dispatches. Recovery reconciles an unresolved stable effect identity with its owning
adapter. `completed` reuses the recorded observation, `not-started` permits one execution with the same
identity, and `unknown` appends a visible blocked outcome. The runtime never blindly repeats an unresolved
effect. Journal v1 does not claim byte-level power-loss repair; malformed or partial records block replay
without silent truncation.

## Replay

Replay consumes only the journal and pure migrations. It must rebuild both `RunState` and product projections without calling providers or tools. Unknown future events fail visibly unless an explicit compatibility rule allows them to be ignored.

## Compaction

Conversation compaction may reduce model context but never deletes execution facts. It must preserve current goal, accepted plan, tool state invariants, unresolved approvals, workspace snapshot identity, budgets, verifier status, and source provenance.

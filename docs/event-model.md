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
- `run.started` contains no action; a validated `fake.model.completed` observation carries the
  runtime-owned action that makes approval visible.

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

The R1 fake-model effect is causally necessary and uses the same intent, receipt, observation, and
reconciliation rules as action and verification effects. Model output cannot resolve approval or terminal
success.

The approved R2 first slice extends this pattern with distinct model-step requests, attempt starts,
terminal model observations, tool requests, terminal tool observations, explicit retry, cancellation, and
blocked facts. Coalesced provider text is live-only until protocol-complete validation. A controlled stop
may commit one bounded incomplete visible snapshot; an ambiguous attempt cannot silently redispatch. Tool
arguments and results become durable only as complete closed values. Private provider continuity is
journal-owned but excluded from ordinary product copy.

Slice 4 implements the bounded prefix of that lifecycle with `fake.model.tool-requested` and
`repository.tool.completed`. One successful terminal tool observation returns the run to a distinct model
continuation effect carrying the closed result. A failed observation blocks without continuation. Effect,
call, and result identities must match exactly, a second tool request is rejected, and replay folds the
committed observations without opening the repository.

Slice 5 adds search and Git-status variants to the same lifecycle; it does not add a new event owner or
raw native-process event. The committed terminal observation contains only the closed semantic result or
structured failure. Executable paths, argv, environment, stdout, stderr, process IDs, and archive paths
remain adapter diagnostics and are never journal or product facts.

Slice 6 implements the complete lifecycle with stable `provider.model.step` effects, durable attempt-started,
attempt-completed, retry, context-commit, and model-observation events. A protocol-complete answer commits
one ordered assistant turn and produces non-success `completed`; a closed tool call commits only after name
and arguments validate, then its terminal result becomes the next ordered context item. A post-delta stop may
commit a bounded interrupted snapshot for review but contributes no partial turn, usage, tool call, or private
continuity. Replay folds these records with zero provider or tool calls, while unresolved crash work becomes
visible `unknown` and requires explicit retry.

The accepted safe-actuation lifecycle adds closed facts for action proposal, policy evaluation, approval
resolution and consumption, effect request, dispatch start, terminal action observation, reconciliation,
change-set capture, and check capture. The proposal carries one canonical digest; every later fact
references that digest and stable action/effect identity. A renderer or provider cannot supply an
approval-consumed, effect, change-set, check, or terminal fact.

An `ask` decision must be followed by a matching approval and durable consumption before the effect request.
An `allow` decision may request only its exact envelope. A `deny` decision requests no effect and may admit
one separately proposed, runtime-proven narrower child. A second denial closes the lineage.

Recovery is effect-specific:

- AnchorEdit compares the target with its approved complete base and desired snapshots. Desired is
  completed, base is not started, and anything else is stale or unknown.
- A Git process whose dispatch-start fact exists but whose terminal receipt is missing is unknown. It does
  not become not started merely because no output was journaled.

Review capture is an observation, not execution authority. The Eden-attributed delta, current tracked Git
patch, baseline check, current check, and changed-file attribution retain their source identity, capture
time, and content hashes. Exceeding a complete-value budget appends a visible blocker instead of a partial
patch. A passing check may lead to non-success `completed` but cannot emit `succeeded`.

## Replay

Replay consumes only the journal and pure migrations. It must rebuild both `RunState` and product projections without calling providers or tools. Unknown future events fail visibly unless an explicit compatibility rule allows them to be ignored.

Run catalog summaries and historical inspections are read-only replay projections. Available summaries
derive `startedAt` and `updatedAt` from the first and last validated journal records. Filesystem mtime is
not product chronology. A catalog scan never appends, truncates, repairs, reconciles, or dispatches; a
damaged journal becomes an unavailable catalog entry rather than partial product truth.

## Compaction

Conversation compaction may reduce model context but never deletes execution facts. It must preserve current goal, accepted plan, tool state invariants, unresolved approvals, workspace snapshot identity, budgets, verifier status, and source provenance.

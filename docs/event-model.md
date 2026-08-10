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

The accepted Docker repository-check lifecycle adds closed facts for catalog resolution, complete input
manifest, image/platform/backend resolution, policy and approval, staging readiness, container creation,
dispatch start, lifecycle observation, wrapper result, terminal receipt, and cleanup. One stable
repository-check effect owns every Docker object and staging identity.

Create is not dispatch. A matching created container can prove repository code did not start. Dispatch
start is durable before `docker start`; after that boundary, recovery may observe the same running
container or reconstruct an exited result but may not create another container. Missing, mismatched, or
ambiguous post-dispatch state becomes unknown.

Result facts retain separate complete bounded stdout and stderr bytes and hashes. Overflow is its own
terminal observation, not a truncated pass. Cleanup is a later explicit fact and cannot rewrite the check
outcome. Replay folds all of these facts without Docker inspection, wait, stop, or removal.

Doctor inspection rows are not journal events because the default command is read-only current-host
diagnosis. An explicit probe creates its own canonical diagnostic action, dispatch and receipt facts, and
exact cleanup; it has no repository or provider facts.

The accepted 2026-07-31 amendment stores those facts in one bounded standalone diagnostic JSONL journal,
not a synthetic run journal. Its execution order is action prepared, approval consumed, effect intent,
container created, dispatch started, receipt recorded with a durable terminal draft, cleanup recorded, and
terminal. A proven pre-create absence closes through `docker.probe.recovery.closed`; the public standalone
`docker.probe.recovery.resolved` value reports `not_started`. One unresolved effect may reconcile only the
same exact created/running/exited object; pure projection and JSON recovery perform no Docker I/O.

The owner accepted the repository-check event families with ADR 0017 and separately authorized Build on
2026-07-30. Their decoders, runtime reduction and dispatch, journal projection, and product projection are
implemented and published. The standalone probe event family, deterministic runner, and exact active
recovery are also complete. The passing real probe reopened the same durable transaction, recovered the
same exact container, recorded `container.created`, `dispatch.started`, receipt-before-cleanup, cleanup,
and terminal facts in order, and performed no duplicate create or second approval.

## Accepted R3 Freeze

R3-A keeps one generic lifecycle rule but adds typed facts for run-budget initialization and consumption, semantic Git-diff requests/results, new-file proposal/policy/approval/effect/observation/reconciliation, structured-command proposal/policy/approval/dispatch/observation/reconciliation, and recoverable tool observations. The generic names do not erase action-kind payload validation.

New-file recovery is content and parent-identity derived. Exact approved bytes at the target are completed; proven absence under the same parent identity is not started; any other target or parent state is stale or unknown. Command recovery follows process semantics: after dispatch starts, missing terminal evidence is unknown and cannot create a new dispatch.

Budget consumption is a durable fact before the corresponding model, tool, or action dispatch. A reducer cannot request an effect whose declared observation would exceed model-step, tool, action, time, content, output, record, or journal limits. Replay reconstructs identical remaining budgets without metering external work again.

R3-C adds closed facts for plan created/revised/approved, execution context selected, goal proposed/approved, checkpoint committed, completion candidate proposed, verification started, check observed, repair requested/exhausted, Evidence Pack persisted, resume requested/revalidated/blocked, and verifier terminal outcome. Plan or goal revision invalidates approvals through ordinary reduction rather than renderer convention.

A checkpoint is a safe-boundary observation, not repository mutation. Resume first replays to the checkpoint, then appends reconciliation and current-workspace observations before any new effect. A stale or unknown result becomes blocked; it never rewrites old facts or dispatches optimistically.

The verifier may emit `run.succeeded` only after the current GoalSpec identity, required checks, scope, artifacts, unresolved effects, policy facts, budgets, and persisted Evidence Pack all match. A completion candidate or model answer has no transition to `succeeded`.

If separately activated, R3-D uses one parent-requested child identity and distinct child journal. Parent events project assigned, started, cancelled, completed, blocked, or failed lifecycle and one structured result reference; they do not inline child internal events or expand parent capability. Web observations retain source and network-policy identity and remain untrusted evidence.

## Replay

Replay consumes only the journal and pure migrations. It must rebuild both `RunState` and product projections without calling providers or tools. Unknown future events fail visibly unless an explicit compatibility rule allows them to be ignored.

Run catalog summaries and historical inspections are read-only replay projections. Available summaries
derive `startedAt` and `updatedAt` from the first and last validated journal records. Filesystem mtime is
not product chronology. A catalog scan never appends, truncates, repairs, reconciles, or dispatches; a
damaged journal becomes an unavailable catalog entry rather than partial product truth.

## Compaction

Conversation compaction may reduce model context but never deletes execution facts. It must preserve current goal, accepted plan, tool state invariants, unresolved approvals, workspace snapshot identity, budgets, verifier status, and source provenance.

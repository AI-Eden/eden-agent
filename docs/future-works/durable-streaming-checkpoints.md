# Durable Streaming Checkpoints

## Status

Deferred beyond the accepted R2 streaming-durability direction. This record does not approve periodic
checkpoints, a journal schema, a migration, or an implementation stage.

## Current R2 boundary

The R2 direction keeps raw provider chunks inside the provider adapter and exposes typed, coalesced deltas
only through an explicitly live surface. Normal completion atomically records one closed model-step
observation containing the complete answer or refusal, complete validated tool calls, finish state, usage
completeness, and private continuation data.

A controlled cancellation or transport interruption may record one bounded, visibly incomplete text
snapshot when the adapter reaches a closed terminal state. That snapshot is never a final answer, tool-call
authority, reasoning-continuity payload, or input to a later provider request. A hard process failure may
lose live text that has not reached this terminal boundary.

The public R2 plan must still freeze the exact event shapes, limits, projections, and negative tests before
implementation begins. This future-work record does not provide that authority.

## Deferred product problem

A user can read model text that exists only in the live renderer and then lose the newest portion if the
process or host terminates before the adapter closes the model step. Periodic, coalesced visible-text
checkpoints could preserve most of that presentation across replay.

Those checkpoints cannot resume the provider stream or prove that the remote model call completed. They
also introduce partial revisions, replacement rules, write amplification, record budgets, compaction, and
migration behavior for content that must remain excluded from future model context and tool dispatch.

## Current guarantees and non-claims

The R2 direction guarantees that:

- normal completion produces one durable, complete model-step observation;
- controlled interruption can preserve one explicitly incomplete, bounded visible-text snapshot;
- fragmented tool arguments do not become executable before closed assembly and validation;
- private reasoning or continuation payloads do not enter visible-text snapshots;
- replay never promotes interrupted text into a final answer or later provider context.

R2 does not claim that:

- every character rendered during generation survives a process, operating-system, or power failure;
- a partial checkpoint can resume or deduplicate a provider request;
- text shown before a terminal observation is canonical product history;
- checkpoint frequency can be selected without journal-size and latency evidence.

## Cost of deferral

After a hard failure, replay can show an unresolved or unknown provider attempt while omitting the newest
text that was visible before the failure. A user may need to issue an explicit new request and accept the
possibility of duplicated provider cost. Controlled cancellation and ordinary transport cleanup remain
covered by the R2 terminal partial snapshot.

Deferral avoids adding a second partial-message protocol until product evidence shows that hard-failure
text preservation matters more than the extra journal, migration, and projection complexity.

## Decision triggers

Re-enter Explore only when at least one product trigger is supported by recorded evidence:

- forced-termination and host-failure QA shows that loss of already visible text materially breaks a named
  recovery or resume story;
- user studies or support evidence identify hard-failure partial-text loss as a recurring, high-impact
  failure that controlled cancellation does not cover;
- a later roadmap stage makes survival of already rendered partial output an explicit product guarantee;
- measured model-step duration and output size make the uncheckpointed loss window unacceptable for a
  named workload.

Before selecting periodic checkpoints, all of these engineering prerequisites must also be demonstrable:

- the append, replay, catalog, and compaction budgets can absorb the measured write amplification on every
  supported operating system;
- revision, offset, deduplication, terminal replacement, and crash-between-records semantics are closed and
  migration-safe;
- visible checkpoints cannot contain tool arguments, private reasoning, continuation data, credentials, or
  unbounded provider payloads;
- interrupted and checkpointed text is excluded from subsequent provider context, tool dispatch, success
  authority, and complete-answer claims;
- TUI and headless projections distinguish live, checkpointed, interrupted, unknown, and completed states.

## Viable architecture families

1. **Keep the terminal-snapshot boundary:** retain the R2 direction if controlled interruption covers the
   meaningful user story and hard-failure loss remains rare or low impact.
2. **Cumulative visible-text revisions:** append bounded cumulative snapshots with a monotonic revision and
   replace them with the terminal observation during projection.
3. **Offset-addressed text segments:** append bounded non-overlapping segments and reconstruct a partial
   view from verified offsets before terminal replacement.
4. **Separate recovery spool:** keep high-frequency partial text outside the canonical journal and import
   only a validated recovery snapshot after restart. This requires its own durability and cleanup contract
   and must not be described as canonical event history.

These families trade replay simplicity against write volume and recovery complexity. A future Explore
phase must compare them with recorded workloads rather than selecting an arbitrary time or byte interval.

## Required evidence before changing claims

- crash injection before the first delta, between deltas, during checkpoint append, after checkpoint fsync,
  during terminal replacement, and during replay or compaction;
- deterministic replay from zero, one, many, duplicate, truncated, stale, and future-version checkpoints;
- measured latency, write count, journal growth, startup replay, catalog scan, and compaction cost for short,
  long, fast, and slow model outputs on Windows, macOS, and Linux;
- controlled cancel, network interruption, renderer disconnect, runtime crash, forced termination, and power-
  loss approximations with exact visible and durable outcomes;
- negative canaries proving no credential, tool argument fragment, private reasoning, continuation payload,
  raw provider error, or later-context authority enters a visible checkpoint;
- matching TUI and headless fixtures proving that a checkpoint never appears as a complete final answer and
  that the terminal observation replaces it without duplication or truncation.

# ADR 0011: Require a Causal Deterministic Fake-Model Step in R1

- Status: Accepted
- Date: 2026-07-16

## Context

The accepted fake-task runtime constructs its action before it calls any provider. The providers package
contains only an unused unknown-typed skeleton. That proves the tool, journal, replay, approval, and
verifier boundaries, but it does not satisfy the R1 roadmap requirement that one fake model participate in
the owned loop.

A decorative provider call would preserve the same defect. R1 needs a small deterministic model boundary
whose validated observation is causally necessary, without granting model output authority over paths,
capabilities, approval, execution, or success.

## Decision

Add one closed version-1 fake-model request and response contract. The request contains only the task. The
response contains only the fixed deterministic fake-action proposal kind and summary. The production fake
driver performs no network I/O, requires no credential, is deterministic, and honors cancellation.

`run.started` records the task and freshly authorized workspace snapshot but no action. The reducer first
enters a model-ready stage and the decision function emits one stable fake-model effect. The runtime journals
the effect intent, validates the provider observation, constructs the complete runtime-owned action, writes
an idempotent receipt, and journals the observation before presenting approval.

Approval cannot become visible before the validated model observation creates the proposal. The model
cannot choose the working directory, scope, digest, approval identity, trust, capability, verifier evidence,
or terminal outcome. Invalid provider output blocks the run without exposing or executing an action. Only
the verifier may produce success.

The model effect follows the same intent, receipt, observation, replay, and reconciliation protocol as the
existing fake action and verifier effects. Product protocol framing remains version 1; internal kernel and
journal event variants change while the repository is unreleased.

## Consequences

R1 gains a real typed provider boundary and evidence that model output participates in the loop without
becoming execution authority. Deterministic fixtures gain model progress and may contain more events and
journal records. Tests must assert semantic order rather than fixed cursor or line counts.

This decision does not authorize a real provider, credentials, streaming, retries, context assembly,
repository access, tool selection, token accounting, or a multi-turn model loop.

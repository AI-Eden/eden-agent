# ADR 0002: Use an Event-Sourced Kernel

- Status: Accepted
- Date: 2026-07-10

## Context

A single mutable loop is easy to prototype but hard to replay, resume, evaluate, or project into multiple interfaces.

## Decision

Represent execution as validated events, pure state reduction, pure effect decisions, effect dispatch through ports, and an append-only journal. Product views are projections from runtime truth.

## Consequences

Every effect needs reconciliation semantics and schemas need migrations. The architecture gains deterministic tests, crash-boundary reasoning, replay, trace-to-eval conversion, and one runtime for many surfaces.

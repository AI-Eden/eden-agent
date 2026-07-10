# ADR 0001: Own the Coding Loop

- Status: Accepted
- Date: 2026-07-10

## Context

Frameworks such as Eve can provide durable sessions, filesystems, human-in-the-loop primitives, and evaluation infrastructure. Using one as Eden's core would accelerate orchestration but transfer the most important portfolio claim—loop ownership—to the framework.

## Decision

Eden owns its kernel, task-convergence loop, tool routing, policy transitions, journal, verification, and product projections. External agent frameworks may be optional remote runners, adapters, evaluation baselines, or references.

## Consequences

The initial build is slower and must prove durability itself. In return, the project can explain, test, and evolve its central behavior without framework semantics becoming hidden dependencies.

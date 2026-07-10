# ADR 0004: The Verifier Owns Completion

- Status: Accepted
- Date: 2026-07-10

## Context

Models routinely state that work is complete when tests fail, scope drifted, or evidence is stale. Prompting alone cannot make the terminal state trustworthy.

## Decision

Only verifier code may produce the event that transitions a run to `succeeded`. The verifier evaluates current GoalSpec identity, workspace state, required checks, scope, artifacts, and policy evidence. The model may request verification or propose repair.

## Consequences

Goal mode requires explicit checks and bounded repair. Completion becomes explainable and testable, while tasks with underspecified acceptance conditions may block instead of receiving optimistic success.

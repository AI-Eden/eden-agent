# ADR 0005: Deliver a Terminal Product from the First Slice

- Status: Accepted
- Date: 2026-07-10

## Context

A technically strong harness without onboarding, approval, recovery, diff, and check review would read as infrastructure rather than an independent product.

## Decision

R0 includes a real terminal-interface spike, R1 runs fake tasks through the actual terminal product, and R3 is an installable TUI release. Eden may adopt an existing renderer but will not build a renderer from scratch.

## Consequences

Product state and runtime contracts must mature together. UI work cannot invent mock-only truth, and harness work is tested against real user journeys from the beginning.

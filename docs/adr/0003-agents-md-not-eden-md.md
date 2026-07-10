# ADR 0003: Use AGENTS.md Instead of EDEN.md

- Status: Accepted
- Date: 2026-07-10

## Context

Repository instruction files already exist across coding-agent ecosystems. Adding an Eden-specific default file would fragment user configuration and enlarge context without creating a differentiated capability.

## Decision

Discover `AGENTS.md` hierarchically, record provenance, and support explainability. Do not introduce `EDEN.md`. Compatibility adapters may support other established instruction names later.

## Consequences

Eden must handle precedence, size budgets, nested scope, and untrusted instructions carefully. Users can adopt the product without maintaining another repository manual.

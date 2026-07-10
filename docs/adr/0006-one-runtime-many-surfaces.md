# ADR 0006: One Runtime, Many Surfaces

- Status: Accepted
- Date: 2026-07-10

## Context

TUI, automation, desktop, and IDE integrations need different information density but cannot safely maintain separate task state machines.

## Decision

All surfaces send versioned product commands and consume product projections through an `AgentClient` port. The journal remains authoritative. In-process transport comes first; local IPC is added only at the desktop architecture gate.

## Consequences

Clients remain thin and reconnectable. Public contracts require deliberate versioning, but future surfaces do not require a harness rewrite.

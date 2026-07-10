# Product Contracts

## Purpose

Product contracts allow the terminal, headless client, and later desktop client to share one runtime without sharing renderer state or internal kernel details.

## Commands

The initial command families are run lifecycle, steering, approval resolution, and artifact requests. Commands express user intent and include optimistic concurrency or cursor data where stale clients could be harmful.

## Events

The initial event families are session snapshot, phase and progress, approval presentation, change-set update, verification update, artifact publication, and terminal outcome.

Approval events contain the canonical display representation and digest that execution will revalidate. Verification events separate required, optional, skipped, and infrastructure-failed checks.

## Errors

Errors are structured with a stable code, human-readable message, recoverability class, and suggested actions. Recoverability is one of retry, reconfigure, ask-user, or fatal. Stack traces and provider payloads belong in redacted diagnostics, not product copy.

## Versioning

The product protocol and journal schema have separate versions. A client negotiates protocol compatibility; journal migrations happen inside the authoritative runtime. Adding optional fields is preferred, while semantic changes require a versioned event or command.

## AgentClient

All clients use an `AgentClient` port with command submission, current snapshot, event subscription from a cursor, and cancellation. R0-R4 use an in-process implementation. R5 may add local IPC without changing product semantics.

## Contract tests

Fixtures must prove that:

- the same journal creates equivalent TUI and headless views;
- stale command versions are rejected safely;
- snapshots plus cursor events reconstruct the current view;
- internal events cannot leak unredacted secrets;
- clients cannot forge approval or terminal facts.

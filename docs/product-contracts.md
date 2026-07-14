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

All clients use this renderer-independent port:

```ts
interface AgentClient {
  submit(command: ProductCommand, options?: { signal?: AbortSignal }): Promise<ProductView>;
  getSnapshot(runId: RunId): Promise<ProductView>;
  subscribe(
    runId: RunId,
    afterCursor?: EventCursor,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<ProductEvent>;
  close(): Promise<void>;
}
```

The R1 implementation is in-process, replay-backed, and then live. It enforces run identity and optimistic
revision freshness before append, exposes only product projections, and keeps `AbortSignal` cancellation
separate from the durable `run.cancel` command. R5 may add local IPC without changing product semantics.

## Headless JSON

`eden exec --json "<task>"` writes one complete `ProductEvent` JSON object per stdout line in cursor order.
It writes no prose, ANSI sequence, kernel event, journal record, or diagnostic payload to stdout. The final
successful line is `run.terminal` with verifier evidence. Diagnostics are structured `ProductError` values
on stderr.

The deterministic fake action requires `--approve-fake-action` in non-interactive use. Missing approval,
empty tasks, and unknown arguments exit with code 2; runtime failures exit with code 1; verifier-backed
success exits with code 0.

## Contract tests

Fixtures must prove that:

- the same journal creates equivalent TUI and headless views;
- stale command versions are rejected safely;
- snapshots plus cursor events reconstruct the current view;
- internal events cannot leak unredacted secrets;
- clients cannot forge approval or terminal facts.

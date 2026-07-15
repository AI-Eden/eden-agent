# v0.1 Specification

## Status

Draft for R0. Changes to trust, terminal states, public product contracts, or non-goals require an ADR and human approval.

## User story

As a developer in a local Git repository, I can give Eden a coding task and acceptance checks, review its grounded plan, approve only scoped risky actions, interrupt or resume safely, and accept the result only after seeing the diff and verifier-produced evidence.

## Runtime invariants

- The journal is authoritative; UI state is reconstructible.
- The kernel reducer and decision function perform no real I/O.
- Product commands can request transitions but cannot forge events.
- Product events are a compatibility boundary distinct from kernel events.
- Capabilities only narrow across policy, parent-child, and sandbox boundaries.
- An approval is bound to an action digest, working directory, scope, and lifetime.
- Editing detects stale snapshots before writing.
- Only the verifier can emit a successful terminal transition.

## Terminal states

- `succeeded`: every required verifier passed and an Evidence Pack was emitted.
- `failed`: a non-recoverable failure or exhausted repair budget ended the run.
- `blocked`: progress requires user input, reconfiguration, or unavailable capability.
- `cancelled`: the user cancelled and cleanup reached a safe boundary.

Paused and awaiting-approval are durable non-terminal states.

## v0.1 tools

- file listing and bounded reads;
- repository search;
- Git status and diff;
- policy-controlled command execution;
- AnchorEdit v1 with snapshot preconditions;
- verifier execution and artifact publication.

Tool results carry model-facing content, product-facing structured data, and trace-facing diagnostics.

## Goal contract

A goal defines scope, required checks, optional checks, allowed capabilities, budgets, stop conditions, and expected artifacts. Model output may propose progress or repair but may not weaken the goal or mark it complete.

## Surfaces

- TUI: interactive task, approval, progress, diff, checks, and recovery flows.
- Headless: stable JSON or NDJSON commands and events for CI and Eden Lab.

Both use an `AgentClient` port. R0-R4 may use an in-process transport; a local IPC transport is introduced only at the desktop architecture gate.

## Trust model

The default workspace state is restricted. Eden displays the exact canonical root and requires an explicit,
path-scoped trust decision before creating a run. Trust persists outside the workspace until explicit
revocation and is never inherited from a parent directory, path prefix, Git remote, or repository name.

Restricted mode may show canonical workspace metadata and fixed product capability truth. It may not load
repository content or instructions, inspect Git state, create a run journal, execute an effect, or access
the network. Trust permits task entry only; it does not approve an action or grant a tool capability.

The default is local execution with explicit network visibility. R2 targets trusted-host and Docker
runners. Native OS sandbox claims require per-platform evidence and are not implied by a shared interface.

Provider keys never enter prompts, tool environments, UI events, journals, or diagnostics. The UI displays the exact approved action representation bound to execution.

## Persistence and recovery

Append-only JSONL is the initial journal format. Every effect has an idempotency or reconciliation strategy. Resume reconstructs state, checks workspace drift, and continues only from a defined checkpoint.

## Evidence Pack

The completion artifact includes goal identity, scoped diff summary, required and optional check results, produced artifacts, policy exceptions, budget usage, environment metadata, and known residual risk.

## Evaluation targets

- deterministic transition and replay scenarios;
- stale-edit and approval-digest security cases;
- false-completion and verifier-repair scenarios;
- clean install and first-run fixture;
- crash-at-effect-boundary and resume scenarios;
- terminal interaction cases for narrow/wide layout, Chinese input, resize, large output, and large diff;
- redaction and diagnostic-bundle tests.

## Initial support target

Node.js 24+ and pnpm 10+ remain the development baseline. ADR 0008 selects Bun and OpenTUI for the
release TUI. Windows Terminal/PowerShell/WSL, current macOS terminals, and common Linux terminals remain
separate evidence targets; the framework decision does not imply support without matching-surface proof.

## Release threshold

R3 is v0.1 only when an unfamiliar tester can install the artifact, complete a verified patch in a fixture repository, recover from at least one interruption, and review the result without reading source code.

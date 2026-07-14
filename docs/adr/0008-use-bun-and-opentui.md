# ADR 0008: Use Bun and OpenTUI for the Terminal Product

- Status: Accepted
- Date: 2026-07-14

## Context

ADR 0005 requires Eden to deliver a real terminal product without building a renderer from scratch.
ADR 0006 requires that product to remain a client of shared runtime contracts rather than owning a
second execution state machine.

The R0 terminal spike compared Ink on Node, the same Ink implementation on Bun, and OpenTUI on Bun
through one fixture, black-box oracle, process harness, packaging matrix, measurement method, and
human-operated Windows Terminal WSL checklist. Ink/Bun passed the runtime gates and scored 71 against
Ink/Node's 68. The declared standalone-distribution preference therefore selected Bun. OpenTUI/Bun
passed the exercised renderer gates and scored 78 against Ink/Bun's 71, exceeding the plan's five-point
material-advantage threshold.

OpenTUI's managed textarea supplied vertical multiline cursor behavior that the bounded Ink prototype
did not implement. Its native test renderer and keymap also matched Eden's application-like terminal
surface. The trade is a larger artifact, native platform packages, Bun FFI, and a younger framework.
Real macOS terminals, a common Linux desktop terminal, Windows Terminal PowerShell, and current-baseline
hosted packaging remain incomplete evidence. The project owner accepts those residual R0 risks for this
selection without treating them as release-support claims.

## Decision

Use Bun as the release runtime and OpenTUI as the renderer for the first `eden` terminal product.

The first production terminal plan will use the evaluated OpenTUI React binding and managed keymap. It
must keep Bun, OpenTUI, React, keymap, and native renderer types inside `apps/eden` and its terminal
adapter boundary. Product contracts, the kernel, and the coding runtime must not depend on renderer
types or terminal-local state.

Node.js and pnpm remain the workspace development and dependency-management baseline. This decision
does not switch the repository to Bun workspaces, `bun install`, or Bun's test runner. OpenTUI and Bun
versions remain pinned until an upgrade passes the renderer, process, packaging, and real-terminal
verification required by the release support matrix.

Do not copy the spike prototype into production. The next R0 plan must freeze executable product
contracts and fake `ProductView` fixtures before a later vertical slice integrates the selected terminal
stack.

## Rejected alternatives

- **Ink on Bun:** retained the standalone runtime and had the smaller renderer-specific native surface,
  but required more application-owned composer behavior and trailed OpenTUI/Bun by seven weighted
  points.
- **Ink on Node:** kept the most conservative runtime and renderer path, but lost the declared Bun
  distribution preference after Ink/Bun passed every exercised runtime gate.
- **Extend or defer the spike:** additional real-terminal evidence would reduce platform uncertainty,
  but the controlled comparisons crossed their declared thresholds and the project owner explicitly
  accepted the named residual risks.

## Consequences

Eden gains framework-owned editing, keymaps, deterministic native frame tests, and a renderer that fits
the planned approval, progress, review, diff, and recovery surface. Eden also accepts a larger standalone
artifact and an external native dependency whose upgrades require cross-platform evidence.

The Ink implementation remains reproducible fallback evidence until the selected renderer reaches its
first production acceptance checkpoint. It is not a second production implementation. A future change
of runtime or renderer requires new comparative evidence and an ADR that supersedes this decision.

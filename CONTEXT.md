# Project Context

## Current stage

R0 is complete and its exit review is accepted. All three bounded R1 slices are accepted. The separate R1
exit review failed and exposed a missing fake-model path, stale workspace-trust start authority, and
history/read-only defects. The owner selected A/A/A/A for exit closure and approved the executable plan.
Build is approved and in progress; R1 exit acceptance remains pending.

## Current truth

- The public product is English-only.
- The terminal product is part of the first vertical slice, not post-harness decoration.
- The runtime is TypeScript-first and event-sourced.
- The first provider is fake; the first real provider arrives after deterministic foundations.
- Eden owns its loop. External frameworks may be adapters or comparison baselines.
- The desktop goal is explicit but gated behind R4 evidence and an R5 local-service spike.
- The terminal spike is complete. ADR 0008 selects Bun and OpenTUI for the first terminal product, with the named residual platform-evidence risks accepted for R0.
- Node.js and pnpm remain the development baseline; Bun, OpenTUI, React, keymap, and native renderer types stay inside the terminal application boundary.
- TypeBox 1.x is the runtime-schema library for product contracts on TypeScript 7. Node's built-in test runner remains the initial runner; add property testing only when a concrete invariant requires it.
- The version 1 product boundary now has executable schemas, non-throwing decoders, and deterministic awaiting-approval, executing, and review fixtures. Renderer and runtime authority remain outside the contracts package.
- One fake task now traverses the deterministic kernel, JSONL journal, replay, explicit effect
  reconciliation, in-process `AgentClient`, headless NDJSON, and Bun/OpenTUI surfaces.
- A fresh exact canonical workspace now starts restricted. Runtime-owned trust is stored outside the
  workspace, can be explicitly granted or revoked, gates run creation, and never substitutes for action
  approval, network authority, or sandbox evidence.
- `run.started` owns an immutable trusted workspace snapshot, so later revocation cannot rewrite replayed
  product history. TUI and headless trust operations use the same versioned `AgentClient` boundary.
- ADR 0010 freezes exact-workspace run history, read-only historical inspection, the
  `eden run list/show --json` surface, visible corrupt-run recovery, and the pre-release
  workspace-partitioned state layout. Public run IDs use a path-safe `run-` prefix. It does not authorize
  resume.
- The approved history slice now has closed catalog/inspection contracts, workspace-partitioned run state,
  read-only journal discovery, strict headless list/show, restricted/trusted TUI history, corrupt-run
  recovery, and an R1 Quickstart. Inspection cannot approve, resume, dispatch, or change trust.
- The accepted history implementation passed its original local suites, package smoke, 100x30 product
  flow, and small-catalog 60x20 review. The R1 exit review then reproduced a blocking many-row 60x20
  viewport failure and additional contract, async, bounded-work, no-write, and redaction defects. Those
  claims now belong to the exit-closure plan; the earlier evidence is not treated as final R1 proof.
- Current local crash, renderer, standalone artifact, trust-failure, and full-workspace evidence is green.
  Hosted Ubuntu, Windows, and macOS test, build, package, and standalone smoke evidence is green in R1 run
  29431313699 at `c962245`.
- The shared terminal packaging workflow is green on macOS 15, Ubuntu 24.04, and Windows 2025 in run
  29372727708 at `594e9f7`; historical R0 measurement versions remain frozen independently.

## Current execution

Execute `docs/plans/2026-07-16-r1-exit-closure.md` through its local, review, publication, and hosted
evidence gates without broadening the frozen R1 boundary.

## Next implementation slice

Continue the R1 exit closure through authorized public exact-SHA hosted evidence. Pause only for a new
architecture, product, trust, public-contract, dependency, durable-state, or roadmap decision. Stop for
the final owner R1 exit acceptance before marking R1 complete.

## Known open questions

- Hosted action dependencies emit Node.js 20 deprecation annotations while GitHub forces them onto Node.js
  24; the current lanes are green, but the action-version migration remains maintenance work.
- R1 exit acceptance remains pending until exact-SHA hosted evidence and the fresh exit review pass.
- Malicious same-user concurrent local-state substitution remains outside the R1 guarantee and is tracked
  in `docs/future-works/adversarial-local-state-filesystem-hardening.md`.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

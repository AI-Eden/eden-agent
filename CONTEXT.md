# Project Context

## Current stage

R0 is complete and its exit review is accepted. The first R1 fake-task vertical slice implementation and
clean-machine evidence are complete; its slice review remains open.

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
- Local crash, renderer, standalone artifact, and full-workspace evidence is green. Hosted Ubuntu,
  Windows, and macOS standalone evidence is green in R1 run 29372282206 at `959cc7c`.
- The shared terminal packaging workflow is green on macOS 15, Ubuntu 24.04, and Windows 2025 in run
  29372727708 at `594e9f7`; historical R0 measurement versions remain frozen independently.

## Next decision

Review the completed local and hosted evidence for
`docs/plans/2026-07-15-r1-fake-task-vertical-slice.md` and decide whether to accept the first R1 slice.

## Next implementation slice

After the first-slice review, plan the next R1 slice around onboarding and explicit workspace-trust
selection. Do not add a real provider or claim R1 completion in that slice without a separate plan.

## Known open questions

- None for the first fake-task slice. The next slice requires its own Explore and Freeze work.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

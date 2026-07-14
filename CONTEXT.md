# Project Context

## Current stage

R0 is complete. R1, Installable Walking Skeleton, is the next stage pending the R0 exit review.

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

## Next decision

Complete the R0 exit review and confirm entry into R1. No unresolved R0 architecture choice remains.

## Next implementation slice

After the exit review, freeze the first R1 vertical slice for the installable walking skeleton. Fake data must travel through the executable product contracts; do not add a real provider before the deterministic reducer, journal, replay, client, and terminal path exist.

## Known open questions

- Initial journal migration envelope, to be frozen with the R1 journal-and-replay work rather than blocking R0.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

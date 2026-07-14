# Project Context

## Current stage

R0: Product Contract and Architecture Spikes.

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

## Next decision

Review the completed executable product contracts and three deterministic `ProductView` scenarios at the R0 exit checkpoint. No further R0 architecture choice is expected unless implementation evidence invalidates an accepted boundary.

## Next implementation slice

Implement the accepted plan's smallest versioned command, event, error, and `ProductView` schema surface plus deterministic fake views and scenarios. Completing their acceptance checks closes R0 and moves the project to the R1 installable walking skeleton; do not integrate the production TUI, real provider, or autonomous loop into the R0 slice.

## Known open questions

- Initial journal migration envelope, to be frozen with the R1 journal-and-replay work rather than blocking R0.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

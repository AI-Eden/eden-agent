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

## Next decision

Approve the second R0 plan for executable product-contract schemas and fake `ProductView` fixtures. The plan must choose the runtime schema library and freeze observable fixtures before implementation begins.

## Next implementation slice

After that plan is approved, implement the smallest versioned command, event, error, and `ProductView` schema surface plus deterministic fake views. Do not integrate the production TUI, real provider, or autonomous loop in the same slice.

## Known open questions

- Runtime schema library: Zod, ArkType, or TypeBox.
- Initial test runner and property-testing library.
- Initial journal migration envelope.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

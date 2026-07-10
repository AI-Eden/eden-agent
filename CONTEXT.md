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

## Next decision

Run the terminal-framework spike and record comparative evidence for OpenTUI/Bun and Ink/Node. No framework has been selected yet.

## Next implementation slice

Define executable contract schemas and three fake ProductView fixtures, then implement the pure reducer against deterministic transition tests.

## Known open questions

- Runtime schema library: Zod, ArkType, or TypeBox.
- Initial test runner and property-testing library.
- TUI runtime and renderer after the R0 spike.
- Initial journal migration envelope.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

# Project Context

## Current stage

R0 and R1 are complete, and both exit reviews are accepted. The owner accepted the R1 exit on 2026-07-17
after the final exact-SHA local, hosted, artifact, and single-agent review evidence passed. The R2 Explore
decision frontier is empty. The owner approved its public decision brief, ADR 0013, ADR 0014, and first
executable plan on 2026-07-19. R2 Build started on 2026-07-19, and Slice 0 is complete.

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
- Final local crash, renderer, standalone artifact, trust-failure, and full-workspace evidence is green.
  Hosted Ubuntu, Windows, and macOS frozen install, test, build, package, copied-artifact, and production
  PTY evidence is green in R1 run 29513232236 at
  `c95596ed231a3493e72674cb61229f2aa9089907`. All three machine-readable evidence artifacts passed their
  required rows and retained the explicit not-run support rows.
- The shared terminal packaging workflow is green on macOS 15, Ubuntu 24.04, and Windows 2025 in run
  29372727708 at `594e9f7`; historical R0 measurement versions remain frozen independently.

## Current execution

Execute `docs/plans/2026-07-19-r2-provider-onboarding-repository-understanding.md`. Slice 0 reproduced the
unchanged R1 package and PTY surfaces, recorded the first Linux/WSL performance baseline, closed the R2
fixture budgets under the existing journal limits, and repaired the stale Freeze-status contract test.

## Next implementation slice

Implement Slice 1: host-side provider-profile CRUD and its renderer-neutral onboarding flow. The approved
plan then continues through readiness, scoped instructions/context, bounded repository tools, the real
multi-step provider loop, product-quality TUI integration, and final evidence. It explicitly excludes
AnchorEdit, writes, general shell, Docker execution, changed-file review, checks, success, and later R2
slices.

## Known open questions

- Hosted action dependencies emit Node.js 20 deprecation annotations while GitHub forces them onto Node.js
  24; the current lanes are green, but the action-version migration remains maintenance work.
- The first R2 decision set is publicly frozen and accepted. Slice 0 evidence is local Linux/WSL only;
  hosted and real-provider rows remain later plan work.
- Malicious same-user concurrent local-state substitution remains outside the R1 guarantee and is tracked
  in `docs/future-works/adversarial-local-state-filesystem-hardening.md`.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

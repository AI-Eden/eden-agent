# Project Context

## Current stage

R0 and R1 are complete, and both exit reviews are accepted. The owner accepted the R1 exit on 2026-07-17
after the final exact-SHA local, hosted, artifact, and single-agent review evidence passed. The R2 Explore
decision frontier is empty. The owner approved its public decision brief, ADR 0013, ADR 0014, and first
executable plan on 2026-07-19. R2 Build started on 2026-07-19. Slices 0-7 are complete; Slice 8 code,
automated, packaged, hosted, terminal, and single-agent review evidence is green, while the exact-candidate
DeepSeek row is stopped on a missing owner-provided host credential.

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
unchanged R1 package and PTY surfaces, recorded the first Linux/WSL performance baseline, and closed the R2
fixture budgets under the existing journal limits. Slice 1 adds strict host-side provider profiles, masked
renderer-neutral CRUD, direct-file reload and recovery, headless inspection, and onboarding at the three
frozen viewports without making a provider request.
Slice 2 is complete. The pinned official SDK, closed readiness/error projections, salted host fingerprint,
explicit possible-charge confirmation, local SSE fixtures, and TUI recovery are implemented. The real
DeepSeek V4 Pro row reached `completion_ready` after the adapter explicitly selected non-thinking mode; real
invalid-key authentication and local network-reset recovery remained closed and redacted. Kimi is
`not-run` because the owner has no subscription credential, so no Kimi support claim is made.
Slice 3 adds complete root-to-leaf `AGENTS.md` snapshots, exact scope/hash/precedence/activation
provenance, deterministic P0/P1/P2 admission, and closed pre-network blocks. Restricted workspaces do not
read instructions. Trusted workspace review and TUI projections expose the context state and exact used
sources without exposing instruction content.
Slice 4 adds closed `list_files` and `read_file` calls, real bounded filesystem adapters, one fake-model
tool round trip, durable tool observations, replay-only reconstruction, and requested/completed product
activity. Paths remain inside the captured workspace identity; links, binary data, invalid UTF-8 offsets,
limit overflow, cancellation, and stale workspace identity fail closed. The TUI shows complete bounded
results, source/hash/continuation provenance, and read-only authority while preserving zero write or process
authority.
Slice 5 adds closed `search_repository` and `git_status` calls behind one bounded native-process port.
Search verifies the application-local ripgrep 15.0.0 asset by SHA-256 and never falls back to `PATH`; Git
status probes host Git 2.31.0 or newer and uses fixed porcelain-v2/NUL arguments with a scrubbed,
non-interactive environment. The complete Bun archive now contains `eden`, `rg`,
`THIRD_PARTY_NOTICES.txt`, and `eden-assets.json`. Local Node, Bun, copied-archive, missing-prerequisite,
pagination, zero-write, cancellation, process-tree, TUI, and full-workspace evidence is green.
Slice 6 connects the real OpenAI-compatible streamed model step to the same four closed repository tools.
The runtime owns the ordered conversation, stable attempt identities, four-step/four-tool budgets, exact or
unknown usage, one automatic retry only for proven `not_started`, explicit retry after ambiguous attempts,
and replay without provider or tool dispatch. Live deltas remain ephemeral; only closed terminal model
observations and bounded context are durable. A model answer reaches `completed` review, never verifier-
owned `succeeded`. The authorized local DeepSeek V4 Pro matching run completed one pinned-ripgrep tool round
trip and returned a sourced answer; Kimi remains `not-run`.
Slice 7 completes the conversation-centered responsive TUI integration. One focus graph owns keyboard
navigation, command palette/help, disabled and awaiting actions, and focus reconciliation across narrow,
medium, and wide layouts. The full answer remains primary; context, tool, attempt, interruption, approval,
and recovery evidence stay structured. Real Linux x64 WSL2 PTY evidence at exact public commit `8c679fd`
passed `60x20`, `80x24`, and `100x30`, rapid resize, CJK bracketed paste, missing-Git recovery, terminal
restoration, and the frozen latency gates. Earlier samples exposed cold-start scheduling variance, so the
passing record is not a cross-platform or variance-free performance claim.

- Slice 8 candidate `0c83048` passes the full local gate and hosted Ubuntu/macOS/Windows R1 plus R2
  matrices. Complete archives passed native ripgrep/Git checks, copied-archive smoke, production PTY, and
  artifact upload. Linux functional PTY and controlled timing are green. The single-agent diff/spec review
  has no unresolved code or contract finding.

## Next implementation slice

Resume only the remaining Slice 8 external row: load an owner-provided DeepSeek credential from private
host state, then rerun exact-candidate readiness and repository matching without exposing or persisting the
secret. Do not substitute the earlier Slice 6 run for this row. The approved scope still excludes
AnchorEdit, writes, general shell, Docker execution, changed-file review, checks, success, and later R2
scope.

## Known open questions

- Hosted action dependencies emit Node.js 20 deprecation annotations while GitHub forces them onto Node.js
  24; the current lanes are green, but the action-version migration remains maintenance work.
- The first R2 decision set is publicly frozen and accepted. Slice 0 evidence is local Linux/WSL only;
  hosted and real-provider rows remain later plan work.
- Kimi remains `not-run` because no subscription credential is available; this is not evidence about Kimi
  compatibility and does not support a Kimi subscription claim.
- The exact-candidate DeepSeek rerun is blocked because its temporary host credential state is no longer
  available. The earlier matching evidence remains valid only for its earlier code candidate.
- The local DeepSeek matching environment required disabled TLS certificate verification because of the
  host proxy setup. It proves the provider/product protocol path, not production TLS verification or release
  support; final evidence must preserve this residual risk unless a verified environment replaces the row.
- Malicious same-user concurrent local-state substitution remains outside the R1 guarantee and is tracked
  in `docs/future-works/adversarial-local-state-filesystem-hardening.md`.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

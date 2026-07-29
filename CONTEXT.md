# Project Context

## Current stage

R0 and R1 are complete, and both exit reviews are accepted. The owner accepted the R1 exit on 2026-07-17
after the final exact-SHA local, hosted, artifact, and single-agent review evidence passed. The owner
approved the first R2 provider/repository-understanding Freeze packet on 2026-07-19; Slices 0-8 and that
accepted plan are complete. This is not R2 release support.

The next R2 safe-actuation Explore frontier became empty on 2026-07-28 after the owner approved the
recommended branches and confirmed shared understanding. The owner then accepted the complete Freeze
packet, ADR 0015, ADR 0016, and the test-first plan and separately authorized Build on 2026-07-28.
The accepted safe-actuation Build and its hosted implementation-candidate closure are complete. Exact
public candidate `3c23446db471eead735a0ac971551c43ecb55759` passed the Ubuntu, macOS, and Windows R2
matrix in run 30382567704. This closes the accepted safe-actuation packet, not all of R2 and not release
support.

On 2026-07-29 the owner accepted all 17 Docker repository-check Explore decisions and confirmed shared
understanding. The decision frontier is empty. The owner then accepted ADR 0017, the focused public
contracts, decision brief, and `docs/plans/2026-07-29-r2-docker-repository-check.md` as one Freeze packet.
Build, Docker execution, image publication, real provider use, commit, and push remain unauthorized.

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

- Slice 8 code candidate `0c83048`, provider-evidence head `abf5f01`, and final hosted-closure head `c9cf7d9`
  pass the complete local gate and hosted Ubuntu/macOS/Windows R1 plus R2 matrices. The reproduced copied
  archive retained the exact hosted hashes, reached DeepSeek readiness under normal TLS, completed one
  pinned-ripgrep tool round trip, and returned a sourced `completed` answer at budget 3/16. The final closure
  also retained and repaired two Windows history-driver timeouts without changing product bytes. The
  single-agent diff/spec review has no unresolved code or contract finding; the retained first provider
  failure remains visible evidence.

## Current implementation slice

The accepted `docs/plans/2026-07-28-r2-safe-actuation-and-review.md` is implemented through its bounded
Slice 8 closure. One trusted-host, policy-contained, digest-approved, modify-only AnchorEdit path now
reaches attributed review and the fixed `git diff --check` template. Durable approval consumption,
dispatch ordering, base/desired/other recovery, denial narrowing, complete-or-blocked patches, HEAD drift,
and equivalent AgentClient/TUI/headless projections are covered by focused and full tests.

R2 run 30382567704 at `3c23446db471eead735a0ac971551c43ecb55759` passed frozen install, peers,
full and focused tests, typecheck, build, code and Markdown checks, Bun packaging, native archive checks,
copied-archive safe-actuation evidence, production PTY evidence, and artifact upload on Ubuntu, macOS, and
Windows. The copied archive covers approval, denial/narrower reproposal, stale concurrent bytes,
pre-existing dirty work, check failure, and narrow review in temporary real Git repositories without
provider network access. The three artifacts are `r2-acceptance-Linux-X64` (ID 8697700721, digest
`sha256:978eab5e2652fd80776dceea68fc5fbaa0acb30a64b7c20925eb3a5849254e61`),
`r2-acceptance-macOS-ARM64` (ID 8697708591, digest
`sha256:3bfaa17d9740efb28b3ab478ed7deae1c593c1be5719e8f68458c36fced55f13`), and
`r2-acceptance-Windows-X64` (ID 8697805419, digest
`sha256:fb90c1d4c864203f87d4dc61e952887376c93060172f3c6a2b458f1ce460782d`).

The slice ends in non-success `completed` review. Packaged crash-restart remains explicitly
`covered-by-real-runtime-test-not-run-in-packaged-pty`; Docker and repository-code checks remain
`not-run`. General shell, repository code execution, Docker execution, create/delete/rename, repair loops,
verifier-owned success, release support, signing, and installers remain outside this Freeze packet.

## Current Build checkpoint

The accepted Docker repository-check packet includes ADR 0017, the 2026-07-29 decision brief, focused
PRODUCT/SPEC/architecture/event/product-contract/threat/UX/support changes, and the ordered test-first plan.
It freezes one tracked catalog, one exact always-ask check action, one immutable tracked-file snapshot, one
Eden Node 24 image, a fixed network-none/container profile, stable Docker reconciliation, bounded local
output, read-only doctor plus explicit probe, and layered platform/external-user evidence.

The next human checkpoint is separate Build authorization. Missing real macOS Docker Desktop, Windows
Docker Desktop WSL2, or independent external-user evidence remains `not-run`, keeps whole R2 incomplete,
and never becomes release-support evidence.

## Known open questions

- Hosted action dependencies emit Node.js 20 deprecation annotations while GitHub forces them onto Node.js
  24; the current lanes are green, but the action-version migration remains maintenance work.
- Kimi remains `not-run` because no subscription credential is available; this is not evidence about Kimi
  compatibility and does not support a Kimi subscription claim.
- The first exact-head matching prompt failed closed as `protocol_incompatibility` and remained
  `awaiting-retry`; a second bounded run with the complete closed search argument shape passed. This retained
  variance does not support a universal provider-output reliability claim.
- The exact-head readiness and matching row passed normal TLS verification. The disabled-TLS proxy limit
  belongs only to earlier historical matching evidence and is not a release-support claim.
- Malicious same-user concurrent local-state substitution remains outside the R1 guarantee and is tracked
  in `docs/future-works/adversarial-local-state-filesystem-hardening.md`.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

# v0.1 Specification

## Status

R1 completed with owner acceptance on 2026-07-17 after its exact-SHA evidence matrix and fresh exit review
passed. The owner approved the R2 first-slice decision brief, ADR 0013, ADR 0014, and executable plan on
2026-07-19. The contract below is frozen. R2 Build started on 2026-07-19; Slice 0 closed its fixture budgets
and unchanged-R1 baseline, Slice 1 added host-side profile onboarding without provider traffic, and Slice 2
closed the explicit readiness boundary with a real DeepSeek V4 Pro matching row, and Slice 3 implemented
scoped instruction snapshots plus deterministic context admission. Slice 4 added durable bounded
`list_files`/`read_file` activity through one fake-model tool round trip, Slice 5 completed the closed
search/Git-status surface, and Slice 6 connected the real multi-step provider/tool loop with durable attempt
recovery. Changes to trust, terminal states, public product contracts, or non-goals require an ADR and human
approval. Kimi remains `not-run` without an owner-provided subscription credential, so the product makes no
Kimi support claim.

## User story

As a developer in a local Git repository, I can give Eden a coding task and acceptance checks, review its grounded plan, approve only scoped risky actions, interrupt or resume safely, and accept the result only after seeing the diff and verifier-produced evidence.

## Runtime invariants

- The journal is authoritative; UI state is reconstructible.
- The kernel reducer and decision function perform no real I/O.
- Product commands can request transitions but cannot forge events.
- Product events are a compatibility boundary distinct from kernel events.
- Capabilities only narrow across policy, parent-child, and sandbox boundaries.
- An approval is bound to an action digest, working directory, scope, and lifetime.
- Editing detects stale snapshots before writing.
- Only the verifier can emit a successful terminal transition.
- A complete model answer is a non-success `completed` review outcome; it cannot forge `succeeded`.
- Attempt identity is durable before provider dispatch. Only proven `not_started` may retry automatically,
  at most once; post-delta, unresolved, or unknown work requires explicit retry.

## Terminal states

- `succeeded`: every required verifier passed and an Evidence Pack was emitted.
- `failed`: a non-recoverable failure or exhausted repair budget ended the run.
- `blocked`: progress requires user input, reconfiguration, or unavailable capability.
- `cancelled`: the user cancelled and cleanup reached a safe boundary.

Paused and awaiting-approval are durable non-terminal states.

## v0.1 tools

- file listing and bounded reads;
- repository search;
- Git status and diff;
- policy-controlled command execution;
- AnchorEdit v1 with snapshot preconditions;
- verifier execution and artifact publication.

Tool results carry model-facing content, product-facing structured data, and trace-facing diagnostics.

## Goal contract

A goal defines scope, required checks, optional checks, allowed capabilities, budgets, stop conditions, and expected artifacts. Model output may propose progress or repair but may not weaken the goal or mark it complete.

## Surfaces

- TUI: interactive task, approval, progress, diff, checks, and recovery flows.
- Headless: stable JSON or NDJSON commands and events for CI and Eden Lab.

Both use an `AgentClient` port. R0-R4 may use an in-process transport; a local IPC transport is introduced only at the desktop architecture gate.

The current-workspace run catalog and historical inspection are product projections, not renderer-owned
filesystem discovery. `eden run list --json` returns one closed catalog value and
`eden run show --json <run-id>` returns one closed read-only inspection value. Neither command continues
execution or mutates a journal.

## Trust model

The default workspace state is restricted. Eden displays the exact canonical root and requires an explicit,
path-scoped trust decision before creating a run. Trust persists outside the workspace until explicit
revocation and is never inherited from a parent directory, path prefix, Git remote, or repository name.

Restricted mode may show canonical workspace metadata and fixed product capability truth. It may not load
repository content or instructions, inspect Git state, create a run journal, execute an effect, or access
the network. Trust permits task entry only; it does not approve an action or grant a tool capability.

The default is local execution with explicit network visibility. R2 targets trusted-host and Docker
runners. Native OS sandbox claims require per-platform evidence and are not implied by a shared interface.

Provider keys never enter prompts, tool environments, UI events, journals, or diagnostics. The UI displays the exact approved action representation bound to execution.

## R2 first-slice contract

- Provider profiles use one versioned host-side `config.toml` outside the workspace. The file is the only
  profile authority and supports local create, masked read, update, selection, and delete. Each profile
  selects one explicit inline-secret or named-environment credential source; ambient discovery is disabled.
- The first provider adapter uses the official OpenAI JavaScript SDK inside `packages/providers` and an
  explicit Chat Completions-compatible protocol. Eden owns conversation, attempts, tools, journal, and
  completion authority. OpenAI Responses is a later, separate R2 protocol slice.
- `configured`, `catalog_reachable`, and `completion_ready` are distinct evidence states. Only an explicit,
  fixed-content, minimally billable streamed completion check establishes `completion_ready` for one
  profile revision and selected model. The readiness request explicitly disables provider thinking and
  rejects non-empty reasoning output so the eight-token cap remains a fixed-answer check.
- SDK retries are disabled. Live text deltas are ephemeral; one complete, closed model observation becomes
  durable after protocol-complete termination. Ambiguous attempts do not silently replay, missing usage is
  `unknown`, and raw provider errors never leave the adapter boundary.
- One run permits at most four model steps and four tool calls. A provider response is bounded to 32 KiB,
  private continuity to 8 KiB, and an ordered conversation item is appended only from a closed model or tool
  observation. Provider-private continuity is rehydrated only inside the adapter and never projected.
- The first repository surface is exactly `list_files`, `read_file`, `search_repository`, and `git_status`.
  The model cannot choose an executable, argv, cwd, environment, or shell. Search uses pinned application-
  local ripgrep; Git status uses a compatible, explicitly probed host Git.
- `list_files` and `read_file` accept only closed root-relative calls. Listing visits at most 4096 entries,
  returns at most 256 rows and 24 KiB of semantic content per page, and uses an explicit continuation.
  Reads return at most 24 KiB at an exact UTF-8 byte offset with SHA-256 provenance and a next offset.
  Absolute/traversal/linked paths, binary or malformed UTF-8, stale workspace identity, cancellation, and
  limit overflow fail closed. Neither tool grants process execution or repository writes.
- `search_repository` accepts one bounded pattern, root-relative path, and integer continuation. Runtime
  resolves only the verified archive-local ripgrep 15.0.0 asset, executes fixed JSON arguments with no
  inherited `PATH`, and returns at most 256 parsed matches and 24 KiB per page. `git_status` probes host Git
  2.31.0 or newer and executes one fixed porcelain-v2/NUL status shape with prompts, pagers, editors, and
  optional locks disabled. Both adapters have a five-second timeout, 2 MiB capture ceiling, complete
  process-tree cancellation, closed recovery, and no raw stdout/stderr projection.
- Repository instructions load as complete scoped `AGENTS.md` snapshots with path, scope, hash, precedence,
  and activation provenance. Nested instructions activate before governed repository content enters model
  context. Applicable instructions that do not fit block before provider network access.
- Known presets provide sourced model limits. Custom endpoints require explicit context-window and maximum-
  output values. Context reserves output and safety headroom before non-evictable current invariants, recent
  working context, and older supporting evidence. The public context ledger records source, scope, estimate,
  priority, selection reason, and complete-or-omitted disposition; estimates never become billing usage.
- The TUI uses a conversation-centered main flow with complete final answers, structured runtime blocks, a
  persistent authority strip, contextual review, responsive layouts, and complete keyboard navigation.
  Tool activity and supported reasoning summaries may fold; final answers may not be summarized away.
- The slice runs closed read-only tools on the trusted host and makes no sandbox or isolation claim. It does
  not add shell, writes, AnchorEdit, Docker execution, verification, or success.

## Persistence and recovery

Append-only JSONL is the initial journal format. Every effect has an idempotency or reconciliation
strategy. New R1 runs are partitioned by canonical workspace ID under the runtime state directory so a
damaged journal remains attributable without a second mutable index. Catalog chronology comes from
validated journal timestamps, never filesystem modification time.

Run IDs are opaque protocol identities with a `run-` prefix and a lowercase ASCII letter, digit, or
hyphen suffix. They are bounded to 128 characters and validated before any state-path lookup.

Read-only inspection reconstructs product truth without dispatching or reconciliation. Resume
reconstructs state, checks workspace drift, and continues only from a defined checkpoint; read-only
inspection is not resume.

## Evidence Pack

The completion artifact includes goal identity, scoped diff summary, required and optional check results, produced artifacts, policy exceptions, budget usage, environment metadata, and known residual risk.

## Evaluation targets

- deterministic transition and replay scenarios;
- stale-edit and approval-digest security cases;
- false-completion and verifier-repair scenarios;
- clean install and first-run fixture;
- crash-at-effect-boundary and resume scenarios;
- terminal interaction cases for narrow/wide layout, Chinese input, resize, large output, and large diff;
- redaction and diagnostic-bundle tests.

## Initial support target

Node.js 24+ and pnpm 10+ remain the development baseline. ADR 0008 selects Bun and OpenTUI for the
release TUI. Windows Terminal/PowerShell/WSL, current macOS terminals, and common Linux terminals remain
separate evidence targets; the framework decision does not imply support without matching-surface proof.

## Release threshold

R3 is v0.1 only when an unfamiliar tester can install the artifact, complete a verified patch in a fixture repository, recover from at least one interruption, and review the result without reading source code.

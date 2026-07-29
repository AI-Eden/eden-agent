# v0.1 Specification

## Status

R1 completed with owner acceptance on 2026-07-17. The owner approved the first R2
provider/repository-understanding packet on 2026-07-19, and its Slices 0-8 are complete. Kimi remains
`not-run` without an owner-provided subscription credential, so the product makes no Kimi support claim.

On 2026-07-28 the owner confirmed the safe-actuation Explore decisions, accepted the complete Freeze
packet, ADR 0015, ADR 0016, and `docs/plans/2026-07-28-r2-safe-actuation-and-review.md`, then separately
authorized Build. Changes to trust, terminal states, public product contracts, or non-goals require an ADR
and human approval.

On 2026-07-29 the owner confirmed shared understanding for the next Docker-isolated repository-check
direction and accepted ADR 0017, the focused contract changes, and
`docs/plans/2026-07-29-r2-docker-repository-check.md` as one Freeze packet. They are accepted implementation
input, not current implementation truth, and Build is not authorized.

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

## R2 safe-actuation contract

- The slice adds exactly one write operation: AnchorEdit v1 may modify an existing Git-tracked regular
  UTF-8 file beneath the captured trusted root. It cannot create, delete, rename, chmod, follow a symlink,
  accept a hardlink, or write outside the workspace.
- An AnchorEdit proposal carries a full-file base SHA-256 and one or more unique, non-overlapping text
  anchors. Every anchor is resolved against the same base snapshot. A changed snapshot, ambiguous anchor,
  invalid UTF-8 value, changed file identity, or unrepresentable review blocks before replacement.
- Existing dirty work is normal. Eden never resets, checks out, stages, or requires a clean worktree. An
  already-dirty tracked file is eligible only when its current bytes exactly match the proposal's base
  snapshot.
- Every executable proposal becomes a versioned canonical action envelope before policy evaluation. Its
  SHA-256 digest covers operation bytes, normalized relative paths and cwd, workspace identity, base
  snapshots, scope, policy revision, environment class, network mode, isolation mode, timeout/output
  budgets, and single-use proposal lifetime.
- Policy returns one closed `allow`, `ask`, or `deny` decision under a versioned rule. The AnchorEdit
  template is `ask`; the exact Git metadata, diff, and `git diff --check` templates may be `allow`. Default
  is deny. An approval is valid only for one action digest and proposal revision and is consumed before
  dispatch.
- Denial is a durable non-terminal observation. One later proposal may declare the denied action as its
  parent only when runtime validation proves that it adds no path, capability, environment, network,
  isolation, timeout, or output authority. A second denial ends that lineage without automatic
  reproposal.
- Effect intent is durable before dispatch. Edit recovery is content-derived: desired snapshot means
  completed, base snapshot means not started, and any other snapshot means stale or unknown and blocks.
  Process/check recovery is different: after dispatch begins, a missing terminal receipt is unknown and
  never authorizes automatic retry.
- Review shows two separate truths: the Eden-attributed delta from the approved base to desired snapshots,
  and the complete observed Git patch for tracked content against `HEAD` at review capture. Untracked paths
  remain visible through status but their contents are not incorporated into the patch.
- The first closed check is only hardened `git diff --check`, captured both before and after the edit so
  existing and newly observed diagnostics remain distinguishable. It cannot execute repository code,
  a shell, an external diff driver, or text-conversion command.
- A completed edit and check enter non-success `completed` review even when the closed check passes. Only
  later verifier work under ADR 0004 may emit `succeeded`.
- The runner is trusted-host policy containment, not isolation. Docker remains a separate later R2 exit
  slice with its own Freeze evidence. No native sandbox, network isolation, or general-shell claim follows
  from this contract.

## R2 Docker repository-check contract

- A trusted repository may declare named checks only in one closed version 1 catalog at
  `.eden/checks/catalog.json`. Trust permits discovery, not execution. The catalog must be a Git-tracked
  regular UTF-8 file; dirty current bytes are eligible only when their complete hash, dirty truth, `HEAD`,
  selected entry, and resolved literal process join the action.
- The model selects one catalog name and cannot supply shell text, executable or argument overrides,
  interpolation, parameters, environment, network, image, mounts, resources, or approval. The first
  catalog has no includes, nested scope, persistent grants, or automatic execution.
- Each selection becomes one exact, single-use, always-ask canonical repository-check action. It binds the
  catalog and process, complete tracked-current-byte input manifest, Eden toolchain and immutable image
  manifests, requested Linux platform, mounts, closed environment, `network=none`, containment profile,
  budgets, policy revisions, and proposal lifetime. Any revalidation drift makes it stale.
- The first toolchain is one Eden-owned Node 24 Linux-container image. Check dispatch never builds, pulls,
  imports, logs in, or installs. A missing or mismatched exact local platform image is a blocked
  prerequisite.
- Eden stages a bounded snapshot containing current bytes of Git-tracked regular files only. `.git`,
  untracked and ignored files, links, hardlinks, gitlinks, special files, host/provider/Docker state, and
  over-budget inputs do not enter the container. The staged workspace and container root are read-only.
- Repository code runs as a numeric non-root user with all capabilities dropped, no new privileges,
  built-in seccomp, no privileged mode, devices, Docker/agent sockets, host namespaces, ports, or restart,
  and fixed memory, CPU, PID, file, time, output, staging, and temporary-filesystem budgets. This is
  container containment, not Docker-daemon or native-sandbox isolation.
- A stable named and labelled container separates create from start. Dispatch start is durable before
  repository code runs. Recovery reconciles the exact created, running, or exited object and never creates
  a duplicate after possible dispatch. Terminal receipt precedes exact cleanup; mismatched or ambiguous
  state is unknown.
- Separate complete bounded stdout and stderr, byte counts, hashes, outcome, image/input identity, receipt,
  and cleanup truth are durable local product evidence. Overflow terminates the check. Raw output does not
  automatically enter provider context or repair.
- The TUI owns interactive approval and execution. Headless NDJSON projects equivalent facts and stops at
  approval; this contract adds no broad approval flag or public general resume command.
- `eden doctor` is read-only by default. An explicit separately confirmed probe may run one no-repository,
  no-provider, no-network diagnostic container under smaller fixed limits. Neither mode remediates,
  installs, pulls, configures a daemon, changes context, or deletes objects automatically.
- A check remains a basic observation in non-success `completed` review. It cannot emit `succeeded`,
  start a repair loop, or produce an Evidence Pack.
- Hosted Ubuntu x64 may establish an implementation candidate. Whole R2 still requires real macOS Docker
  Desktop and Windows Docker Desktop WSL2/Linux-container automated rows plus one independent external-user
  failing-test journey. Missing rows remain `not-run`; release support remains separate.

The owner accepted this contract with the complete 2026-07-29 Freeze packet. Docker and repository-check
behavior remain unavailable until a separately authorized Build and matching evidence.

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

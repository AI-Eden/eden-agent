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
input. Build was separately authorized on 2026-07-30, and the accepted plan is complete through its hosted
Ubuntu implementation candidate. A completion audit repaired dispatch/recovery and cancellation gaps;
exact reviewed code commit `8c37f7939e384eaada13582a8f0ac71668eb9a98` passed the authoritative Docker
lane and all hosted non-Docker regression lanes.

On 2026-08-01 the owner accepted ADR 0018's portfolio-first amendment. R2 is complete for the declared
Linux/WSL2 reference platform. Real macOS Docker Desktop, real Windows Docker Desktop WSL2, and independent
external-user evidence remain optional `not-run` rows and do not establish or block this roadmap
milestone. Release support remains outside R2.

On 2026-08-10 the owner accepted the accelerated R3 delivery direction with R3-D changed to a separately activated, non-blocking milestone, then accepted ADR 0019, the focused contract changes below, and `docs/plans/2026-08-10-r3-resume-ready-verified-goal.md` as the complete Freeze packet. After Slice 0 invalidated the one-call and 1 MiB assumptions, the owner accepted the bounded amendment on 2026-08-11, approved the amended Freeze, freshly authorized Build, authorized public-first commits and pushes, accepted the deterministic candidate, and authorized copied packaged TUI evidence. The first matching `deepseek-v4-pro` journey failed without an automatic retry, and offline diagnosis later proved that its old driver had forwarded `NODE_TLS_REJECT_UNAUTHORIZED=0`, so that historical row cannot establish normal TLS. The repaired driver removes that variable and persists sanitized failures. One later, freshly authorized fixture at exact candidate `468c4ba0f726715c2f190b3c2842f798992e8543` passed the complete copied-package journey against `https://api.deepseek.com` and `deepseek-v4-pro` under normal TLS, with exact usage, terminal restoration, an independent repository oracle, and no credential-canary exposure. The owner accepted and closed R3-A, selected the R3-B design direction, and accepted ADR 0020 with `docs/plans/2026-08-11-r3-b-terminal-product-shell.md` as the focused Freeze packet. R3-B Build is not authorized and `succeeded` remains unavailable.

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
  installs, pulls, configures a daemon, changes the default context, or deletes objects automatically. A
  probe may select one existing safe named context, which must bind both Doctor and execution calls.
- A check remains a basic observation in non-success `completed` review. It cannot emit `succeeded`,
  start a repair loop, or produce an Evidence Pack.
- Hosted Ubuntu x64 plus the owner-controlled fresh Linux/WSL2 backend establish the R2 reference-platform
  milestone. Hosted macOS and Windows establish non-Docker portability regression only. Real macOS Docker
  Desktop, real Windows Docker Desktop WSL2, and independent external-user journeys are optional and remain
  `not-run` until exercised; release support remains separate.

The owner accepted this contract with the complete 2026-07-29 Freeze packet and separately authorized
Build on 2026-07-30. The read-only Doctor, deterministic explicit-probe path, safe named-context binding,
and repository-check dispatch are implemented and published. The owner-controlled real probe and the
exact-SHA hosted Ubuntu repository-check journey passed on the declared Linux/WSL2 reference platform.

### Accepted diagnostic-probe amendment

The accepted 2026-07-31 amendment makes the explicit probe a standalone
`docker_diagnostic_probe_v1` transaction rather than a synthetic repository run. It uses no workspace,
catalog, snapshot, staging tree, provider, model, credential, or repository mount. One exact action binds
the current Docker backend, published image/platform manifest, application-owned fixed Node diagnostic
program, exact fixed `HOME`, `LANG`, `PATH`, and `SSL_CERT_FILE` values, closed profile, and every budget
under a dedicated always-ask rule. Docker inspect ordering is non-semantic, but missing, duplicate,
changed, inherited, or additional environment values fail closed.

The transaction owns a bounded private diagnostic journal, stable container identity, consumed approval,
dispatch fact, receipt-before-cleanup ordering, durable terminal draft, exact active recovery, and
standalone product command/event/view contracts. Default Doctor and probe JSON preview remain
zero-mutation. Deterministic Build is authorized and implemented; Docker execution, image preparation,
credentials, and publication require separate authority.

Image readiness always requires the exact index RepoDigest, platform config digest, Linux OS/architecture,
entrypoint, nonroot user, and working directory. A local descriptor, when present, must match the frozen
platform manifest. Only when it is absent may the exact config digest select that same manifest from the
application-owned immutable platform mapping. Malformed, missing, or contradictory evidence blocks; this
fallback performs no registry lookup or network request.

## Accepted R3 Freeze

### Delivery graph

The blocking path is `R3-A -> R3-B -> R3-C -> R3-E`. R3-D becomes eligible after R3-C but requires a separate owner activation and may be skipped or delivered after R3-E without weakening the release gate. Every milestone that enters Build must close through a runnable vertical journey and matching-surface evidence.

### R3-A usable coding-loop contract

- `usable_coding_v1` defines hard policy maxima of 12 model steps, 16 tool calls, 8 executable action proposals, 30 minutes wall time, 512 KiB aggregate model-visible tool content, and 256 KiB aggregate command output. A closed per-run grant selects values no greater than those maxima and is durable before the first provider, tool, or action dispatch; the model may stop early or use no tools but cannot raise the grant. The per-record and record-count limits remain 64 KiB and 4096, while this profile's run-journal ceiling is 2 MiB. Runtime accounts every budget durably and blocks before dispatch when the declared maximum observation cannot fit.
- A completed model step contains zero to four tool calls. Step 12 is final-answer-only with tools disabled. A multi-call batch is eligible only when every call is a read-only repository tool, requires no approval, and cannot mutate workspace or external state. Runtime preflights the complete batch in source order, durably consumes each call budget, executes with concurrency at most four, records actual lifecycle order, and appends closed results to model context in original call order. Partial failure preserves sibling results; cancellation closes every started call.
- AnchorEdit, `write_file_v1`, `run_command_v1`, and every approval-bearing or effectful tool are singleton model steps. Mixed, dependent, oversized, unsupported-provider, or otherwise ineligible batches produce one closed non-effecting rejection and require model re-planning. Matching-provider evidence is required before that provider receives a multi-call capability claim.
- `git_diff_v1` is read-only and model-visible. The model supplies only closed semantic scope and continuation. Runtime owns Git, fixed hardened arguments, cwd, scrubbed environment, parsing, paging, current `HEAD`, status/content identity, and complete page hashes. Each page is at most 24 KiB; at most four pages may be admitted to one run.
- `write_file_v1` creates one new regular UTF-8 file of at most 32 KiB beneath the captured trusted root in an already existing regular directory. The canonical action binds path, parent and target absence, content bytes/length/hash, mode `0644`, workspace/scope/policy identities, and lifetime. Execution uses exclusive creation and parent/target revalidation. It cannot overwrite, append, create a directory, follow a link, accept a hardlink, stage, chmod, delete, or rename.
- `run_command_v1` is a shell-free structured request. It contains one bounded program name, at most 64 literal argv values and 8 KiB total argv, one normalized root-relative cwd, reason, timeout no greater than 10 minutes, and a declared network need. It contains no shell text, redirection, interpolation, stdin, environment value, approval, or background-control field.
- Runtime resolves the exact executable before policy and binds the resolved identity, argv, cwd, closed scrubbed environment identity, timeout, stream and aggregate output limits, process-tree ownership, network truth, execution mode, policy revision, and single-use lifetime into `ActionEnvelopeV1`. Both `write_file_v1` and `run_command_v1` are default-denied and evaluate to `ask` only in their exact closed shapes.
- Trusted-host command execution reports `executionMode=trusted_host_policy_only`, `isolation=none`, and `network=host_unrestricted`. Approval and environment scrubbing do not constrain repository scripts, interpreters, descendants, filesystem access, or network behavior. A contained or network-denied command profile requires a separate accepted contract and evidence.
- Each command stores at most 64 KiB stdout and 64 KiB stderr; aggregate command output across the run is at most 256 KiB. Overflow, timeout, cancellation, non-zero exit, resolution failure, policy denial, stale action, and unknown recovery are distinct closed observations.
- A closed failure may return to the model when its recoverability and remaining budget permit. A process with durable dispatch and no terminal receipt is `unknown`, blocks for explicit user resolution, and never retries automatically.
- New-file review uses an Eden-attributed empty-to-created patch plus current repository status; it does not pretend that an untracked file belongs to Git's tracked patch. The combined review remains complete-or-blocked within its declared limits.
- R3-A ends in non-success `completed`. Model output, commands, named checks, and diff inspection cannot emit `succeeded`.

### R3-B terminal product-shell contract

- Bun and OpenTUI remain the release runtime and renderer. AgentClient, ProductView, journal truth, protocol versioning, and PTY evidence seams remain the only product-state authority.
- The primary reading flow is a conversation spine containing complete user input, complete model answers, and compact typed activity. The TUI separates app shell, session navigation, transcript, persistent multiline composer, status/authority bar, contextual evidence lens, overlays, and typed tool-card registry. Renderer state is limited to layout, focus, selection, draft, cursor/editor history, expansion, and scroll.
- The registry shares a presentation envelope but preserves typed tool/action/check details. It cannot create a generic execution schema or mock-only Plan, Goal, child, web, verification, or Evidence Pack state.
- Narrow layout uses one primary column with explicit Chat, Action, Review, and History switching plus an always-visible urgent-action rail. Medium uses conversation plus evidence and moves sessions to an overlay. Wide uses session navigation, conversation, and evidence. Resize preserves focus identity, active approval identity, evidence and pending-input selection, draft, expansion, and scroll anchor.
- Complete user input and model answers remain the main reading flow. Tool activity is compact by default. Diff, command, approval, recovery, verification, and evidence expand progressively without renderer-owned summaries becoming execution facts.
- `conversation.steer` and `conversation.queue` are distinct closed ProductCommands. Each accepted message is non-empty well-formed Unicode of at most 4 KiB when UTF-8 encoded, uses the current run/revision envelope, receives a runtime-owned message identity correlated with its command, and reserves one remaining model step before append. A run accepts at most eight such messages, 16 KiB aggregate input, one pending steer, and three pending queued messages. Invalid, stale, over-budget, over-capacity, or unreservable input is rejected without journal mutation. Ordinary provider dispatch cannot consume pending reservations; the last unreserved current-turn step has tools disabled so queued capacity is not silently spent.
- Steering is delivered after the current in-flight effect or accepted read-only batch closes and before the next provider request. It never cancels dispatched work, resolves approval, or triggers retry. Queue remains FIFO until a complete model `stop`; runtime persists the assistant answer, delivers the oldest queued user turn, and continues through its reserved provider step instead of emitting `completed`. Terminal cancellation/blocking/failure closes undelivered input with a structured reason.
- `conversation.input.updated` and `ProductView.conversationInput` expose accepted, delivered, and closed input lifecycle, availability, message identity/content/mode, counts, byte budget, reservation, and recovery truth. Delivered input becomes a typed durable user conversation turn. Drafts remain renderer-local until command acceptance. Default keys are Enter steer, Alt+Enter queue, and Shift+Enter newline, with equivalent palette actions; paste never submits.
- R3-B evolves protocol v1 additively: the commands and event are new closed union variants, `ProductView.conversationInput` is optional for pre-R3-B snapshots/journals and required on active R3-B runs, and existing required shapes and durable conversation meanings remain unchanged. Any incompatible requirement stops for an explicit protocol amendment.
- The real executable must cover provider onboarding, a repository task, streamed tools, exact approval, steering, queued follow-up, changed files and diff, structured failure recovery, final answer, narrow/medium/wide resize, CJK/multiline paste, representative output/diff volume, and terminal restoration.

### R3-C Plan and verified-Goal contract

- `PlanArtifactV1` is journal-local product state, not a workspace file. It contains identity, revision, objective, ordered steps, acceptance checks, required capabilities, assumptions, risks, and non-goals and is closed within 24 KiB. Plan mode may read repository evidence and revise this artifact but has no workspace-write, command, approval, or success authority.
- Only a human command may approve the current PlanArtifact revision. Any revision supersedes the prior approval. Execute requires one explicit context policy: `fresh`, `compact`, or `keep_context`; the choice changes provider context only.
- `GoalSpecV1` binds one approved plan revision and contains a canonical digest, objective, canonical workspace and path scope, one to eight required checks, up to eight optional checks, up to sixteen expected artifacts, allowed capabilities, model/tool/action/time/repair budgets, stop conditions, workspace-drift policy, and `checkpoint_only_no_automatic_rollback` strategy.
- Goal approval is human-owned and digest-bound. A model cannot approve or weaken the goal, remove a required check, widen scope or capability, raise a budget, replace the plan revision, or emit terminal success.
- R3 uses the current trusted worktree. A checkpoint durably records plan/goal identity, `HEAD`, scoped status and content identities, completed effects, approval state, budgets, and verifier state at a safe boundary. It is not a Git commit, stash, copied worktree, filesystem snapshot, or rollback promise. Eden does not automatically create worktrees, reset user changes, or roll back files.
- Required checks are exact goal-approved named checks or closed `run_command_v1` actions. Verifier code revalidates workspace and GoalSpec identity, unresolved effects, diff scope, required checks, expected artifacts, policy evidence, and budgets against current observations.
- A completion candidate starts verification but does not change terminal state. `succeeded` requires every required check to pass, scope to remain valid, required artifacts to exist, no unresolved effect or policy violation, a current Evidence Pack, and one verifier-produced terminal event.
- Failed required checks produce a minimum structured repair observation containing check identity, outcome, bounded diagnostics, hashes, and suggested next action without secret or unrestricted raw-output promotion. The default repair budget is one cycle and the hard maximum is two. Exhausted repair becomes `failed`; missing authority, unavailable capability, ambiguous effect, or required human input becomes `blocked`.
- `eden run resume <run-id>` opens one exact run interactively. `eden run resume --json <run-id>` emits the same durable product stream and stops at interactive approval boundaries. Resume is distinct from read-only inspection, replays before I/O, reconciles only the owning effect kind, revalidates workspace/plan/goal/policy/provider facts, and dispatches only from a declared resumable safe boundary.
- `EvidencePackV1` is a versioned runtime-state artifact of at most 256 KiB. Its journal event binds its SHA-256, byte length, GoalSpec and plan identities, scoped diff summary, required and optional checks, produced artifacts, policy exceptions, budget use, environment and support metadata, and residual risk. The artifact is persisted before the verifier emits `succeeded`.

### R3-D optional exploration contract

R3-D is not release-blocking and receives no Build authority from approval of the blocking plan. If separately activated after R3-C, it is limited to exactly one read-only ExploreAgent plus `web_search_v1` and `web_fetch_v1` under the boundaries in ADR 0019. Until its implementation and matching evidence pass, ProductView, README, demo, and resume claims omit child-agent and web capability.

### R3-E release contract

- The blocking capability gate includes the real-provider path; bounded list/read/search/status/diff; AnchorEdit; exclusive new-file creation; shell-free controlled command; named checks; Plan review/revise/approve/execute; Goal verification; bounded repair; durable resume; Evidence Pack; coherent TUI and headless paths; and installation and diagnosis documentation. It does not include R3-D.
- The owner must complete one first verified patch from public instructions and the packaged artifact in a fresh isolated environment on the declared Linux/WSL2 reference platform. Source-tree execution does not satisfy this gate.
- Three reproducible journeys cover happy path, approval/recovery, and failed-required-check/repair. Each records exact commands, application and artifact hashes, fixture identity, visible product evidence, terminal outcome, cleanup, and known limitations.
- Release evidence covers package smoke, provider onboarding, workspace trust, Plan, edit or create, command or named check, failed verification, repair, verifier success, diff, Evidence Pack, interruption/resume, doctor, troubleshooting, upgrade compatibility, and uninstall or clean removal instructions.
- Real TUI evidence covers narrow, medium, and wide viewports, resize, CJK paste, representative output and diff volume, focus safety, terminal restoration, and the 60-90 second demo path.
- The allowed claim is a resume-ready v0.1 on the declared reference platform with the exact hosted regression and optional rows named by the release evidence. It does not imply signing, package-manager publication, update-channel support, equal Docker/Desktop support, native sandbox parity, or any unexecuted R3-D capability.

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

R3 is v0.1 only when the owner can use public instructions and the packaged artifact in a fresh isolated environment on the declared reference platform to complete a verified patch in a fixture repository, recover from at least one interruption, and review the result without reading source code. Independent external-user evidence remains desirable but optional under ADR 0018 and cannot substitute for verifier completion.

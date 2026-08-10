# Architecture

## System shape

eden-agent separates execution truth from product presentation.

```text
TUI / headless CLI / later desktop
              |
       product contracts
              |
       AgentClient port
              |
 kernel + coding runtime + policy + journal
              |
 provider / tool / workspace / sandbox adapters
```

The journal is the durable authority. Every surface sends product commands and consumes projections. A surface may own ephemeral selection, layout, and draft state; it may not own run phase, approval, changed-file truth, verification, or terminal state.

Workspace trust exists before a run, so a runtime-owned registry stores its current path-scoped decision
outside the workspace. It is configuration and policy input, not a substitute run journal. An accepted
`run.start` snapshots the trusted workspace identity into the first kernel event; replay then reconstructs
historical workspace truth without consulting the current registry or renderer context.

Trust review caches are presentation hints. Start, grant, and revoke share a per-workspace cross-process
critical section; start re-resolves the original path and reloads trust before it consumes a run ID or
creates durable run state.

New pre-release runs are stored beneath a versioned canonical-workspace partition. Runtime-owned catalog
code scans only that partition and projects validated journals into closed product summaries. A corrupt
journal remains visible as unavailable because the partition supplies attribution without becoming a
second source of run truth. Catalog and inspection paths are read-only: they never open an append handle,
reconcile an effect, or make the renderer a filesystem authority.

## Package responsibilities

### contracts

Defines versioned external commands, product events, view models, and recoverable errors. It is intentionally thin and must not become a generic shared-types package.

### kernel

Contains pure state transitions and pure effect decisions. It knows event meaning but does not read files, call models, execute commands, persist bytes, or render UI.

### coding-runtime

Executes effects through ports. Internal modules cover context, tools, policy, workspace, journal, profiles, planning, goals, verification, skills, and later subagents. These remain modules until a real independent release boundary appears.

### providers

Normalizes one model step: request serialization, streaming, tool-call representation, usage, cancellation, and provider errors. It never owns the multi-step loop.

### lab

Owns fixtures, scenarios, replay, graders, multi-trial reports, and baseline comparisons. A product or harness claim should have a corresponding scenario or measurement here.

### apps/eden

Composes ports and manages terminal lifecycle. It renders product state and serializes headless output. It cannot bypass runtime policy to execute actions.

## Execution sequence

1. A product command is validated and translated into a kernel event.
2. For `run.start`, runtime code revalidates exact workspace identity and current trust before creating the
   journal.
3. The event is appended to the journal.
4. The reducer produces a model-ready state with no approval.
5. The decision function emits the typed fake-model effect.
6. A validated fake-model observation creates the action proposal; runtime-owned code supplies its cwd,
   scope, digest, and approval identity.
7. The dispatcher executes later approved action and verification effects through ports.
8. Observed results become new validated events before reduction.
9. Product projections publish stable user-facing state.
10. A verifier, not the model, produces success evidence.

## Dependency rule

Dependencies point inward: apps depend on contracts and runtime surfaces; runtime depends on kernel; kernel
has no dependency on adapters. ADR 0011 permits the R1 runtime to compose the existing typed deterministic
provider port and fake adapter from `packages/providers`; provider SDKs and provider-specific values still
cannot enter the kernel. TUI, Bun, Docker, Tauri, and Electron also cannot leak into the kernel.

## Approved R2 first-slice extension

Host-side profile storage and readiness live in `coding-runtime` behind renderer-neutral ports. The
official OpenAI SDK is contained in `packages/providers`, where it normalizes one
Chat-Completions-compatible model step into live-only deltas and one closed terminal observation. The
runtime owns the conversation, attempt ledger, retry decision, context, tools, journal, and completion
authority.

Slice 2 implements the first part of this boundary: the SDK performs the fixed connection-readiness stream
with zero SDK retries and returns only a closed success or redacted failure. Provider-specific readiness
request details, including DeepSeek V4 non-thinking selection and nullable reasoning deltas, remain inside
the adapter; non-empty readiness reasoning fails closed. The credential, readiness salt, and profile
fingerprint remain in host runtime state; they do not cross into contracts, kernel events, or renderer
state.

Repository understanding remains a semantic runtime boundary. The model can request only list, bounded
read, search, or Git status. Runtime code supplies the trusted root and fixed native-process details.
Application-local ripgrep and compatible host Git remain adapters; neither executable, argv, cwd,
environment, nor raw output enters the model or kernel contract. Applicable complete `AGENTS.md` snapshots
are admitted before governed repository content or provider network access.

Slice 3 implements that admission boundary in `coding-runtime`. Realpath containment discovers only
`AGENTS.md` from the trusted root through each activated path, reads every applicable file through a checked
handle, and records complete content internally with a public hash/scope/precedence/activation summary.
The runtime reserves output and estimator safety headroom, admits all P0 items or blocks, then selects P1
and P2 deterministically with an explicit omission ledger. A final snapshot verification runs immediately
before the provider callback. Contracts expose only the closed summary; the kernel, provider adapter, and
renderer never own discovery or selection.

Slice 4 implements the first semantic repository adapters. The kernel owns one closed tool-call/result
exchange and deterministic effect identity; `coding-runtime` owns canonical-root validation, checked file
handles, byte/row/visit limits, receipts, journal events, replay, and product projection. The fake model
can request one list or read call and receives only the terminal closed result on its continuation. Replayed
journals do not reopen the repository or redispatch the model. TUI cards render only product data and
sanitize terminal controls without changing the durable result. No executable, argv, shell, write, or
renderer authority enters this boundary.

Slice 5 completes the four-tool repository surface without adding a shell. One native-process port owns
exact executable, argv, cwd, environment, output, timeout, cancellation, and POSIX process-group cleanup.
Search accepts only the hash-verified ripgrep 15.0.0 file named by the closed application archive manifest;
runtime never searches for another `rg`. Git remains a compatible host prerequisite and is probed before
fixed porcelain-v2/NUL status parsing. Only bounded semantic matches/status rows and public prerequisite
facts cross into contracts, kernel state, receipts, journal records, or renderers.

Slice 6 completes the first real model/tool loop. `packages/providers` normalizes streamed content and
split tool-call fields into one closed model-step observation; `coding-runtime` records attempt identity
before dispatch, builds ordered context from durable state, verifies instruction snapshots at the final
pre-network boundary, and dispatches only the four semantic tools. The kernel enforces four model steps,
four tool calls, a single automatic retry for proven `not_started`, and explicit retry for ambiguous work.
Provider-private continuity is bounded and adapter-only. Live deltas reach clients through a transient
subscription but never become replay authority; a complete answer enters `completed` review, not success.

Slice 7 keeps presentation authority inside `apps/eden`. One deterministic focus graph maps keyboard input
to product commands and reconciles focus across responsive layouts; shared tokens own semantic status,
density, borders, and disabled/awaiting presentation. The runner installs its OpenTUI key handler before
publishing input readiness, initializes renderer and client work concurrently, and restores the terminal
before closing the client. Provider implementations and non-selected CLI modes are deferred until needed;
the existing `AgentClient`, contract, kernel, persistence, and authority boundaries remain unchanged.

## Approved R2 safe-actuation extension

The accepted 2026-07-28 Freeze packet adds one end-to-end write path without moving authority into the model,
renderer, native-process port, or fake tool host:

```text
model proposes typed AnchorEdit
  -> runtime closes ActionEnvelopeV1 and canonical digest
  -> versioned policy returns allow / ask / deny
  -> AgentClient resolves one digest-bound approval when asked
  -> kernel journals approval consumption and stable effect intent
  -> coding-runtime executes the action-kind adapter
  -> adapter-specific reconciliation records the observation
  -> runtime captures Eden delta, current Git patch, and diff-check evidence
  -> product enters non-success completed review
```

`contracts` owns the external envelope, policy, approval lifetime, change-set, check, and review shapes.
`kernel` owns pure proposal, policy/approval facts, stable effect identity, denial lineage, and the
completed-review transition. `coding-runtime` owns canonical encoding, policy evaluation, full-file
snapshots, AnchorEdit, fixed Git operations, receipts, reconciliation, and projection. `apps/eden` presents
those facts and cannot create a digest, widen a decision, or infer a changed file.

The native-process port remains a mechanism. Policy selects authority before the port is called. The
trusted-host runner exposes only exact runtime-owned Git templates with scrubbed environment and
`shell: false`; it is not a generic command service and makes no isolation claim.

AnchorEdit and process/check effects have separate receipt and recovery protocols. The edit adapter can
derive completed or not-started from exact desired or base content. A Git process that durably started but
lacks a terminal observation is unknown and cannot retry automatically. Pure replay dispatches neither.

The first writable action targets one existing tracked UTF-8 file. Its full base and desired hashes remain
bound to the action. Review derives Eden attribution from those snapshots and current repository truth
from a separate hardened Git observation. No clean-worktree precondition or reset enters the architecture.

The owner accepted this extension with its decision brief, ADR 0015, ADR 0016, focused contracts, and
test-first plan. Docker stays a later independent R2 exit slice.

## Approved R2 Docker repository-check extension

The accepted 2026-07-29 Freeze packet extends the same authority path rather than introducing a second
runner protocol:

```text
model selects tracked catalog name
  -> runtime resolves literal process and tracked-current-byte manifest
  -> runtime resolves exact local image/platform/backend
  -> canonical repository-check action and default-deny policy
  -> AgentClient presents and consumes one approval
  -> private staging plus stable Docker create/start effect
  -> wrapper result and action-specific reconciliation
  -> local check/output/receipt/cleanup projection
  -> non-success completed review
```

`contracts` owns the closed catalog, manifest, image, profile, doctor, action, result, receipt, cleanup, and
product shapes. `kernel` owns pure proposal, approval, effect/lifecycle, observation, and review facts.
`coding-runtime` owns Git-backed discovery, immutable staging, Docker CLI and doctor ports, canonical
encoding, policy, receipts, reconciliation, cleanup, and projection. `apps/eden` owns CLI/TUI presentation
only. The Eden image wrapper owns one container-local process lifecycle and result protocol; it does not
own product completion.

The existing native-process port remains below the Docker adapter and receives only runtime-owned Docker
CLI requests. Neither the model, catalog, renderer, nor provider receives Docker executable, host argv,
environment, socket, or cleanup authority.

The full canonical input manifest is durable, while staged repository bytes are private ephemeral state.
Stable container and staging identities derive from the journaled effect. Pure replay performs no Docker
I/O; execution reopen invokes only repository-check-specific reconciliation. This internal reopen seam
does not add the public general resume command deferred to R3.

Default doctor inspection is a read-only prerequisite projection outside a run. The explicit probe crosses
into mutation only through its own canonical diagnostic action, approval, receipt, and exact cleanup. It
cannot become an image, package, daemon, context, or orphan-remediation service.

The accepted 2026-07-31 amendment makes that boundary concrete without inventing a repository run. A
standalone diagnostic action reuses the `eden.action.v1` canonical domain, while a dedicated private
diagnostic journal and product protocol own approval, dispatch, receipt, cleanup, and recovery. The action
has no run/workspace/catalog/snapshot/provider facts and cannot enter the run-bound `ProductCommand`,
`ProductEvent`, or `ProductView` unions. Slice 4 exercised this boundary through one passing real probe.

The owner accepted this extension with ADR 0017 and separately authorized Build on 2026-07-30. The
repository-check dispatch, standalone probe implementation, exact recovery path, and Linux/WSL2
real-backend checkpoint are complete and published.

## Accepted R3 Freeze

The accepted R3 extension preserves the dependency direction and adds usable coding, planning, verification, and release behavior through existing package boundaries:

```text
typed model proposal
  -> coding-runtime closes semantic tool or canonical action
  -> policy and optional exact approval
  -> effect-specific adapter and durable observation
  -> PlanArtifact / GoalSpec / verifier state in kernel truth
  -> ProductView / ProductEvent projection
  -> OpenTUI or headless client
```

R3-A extends `contracts`, `kernel`, and `coding-runtime` with `git_diff_v1`, exclusive `write_file_v1`, shell-free `run_command_v1`, policy/grant/usage budgets, bounded multi-call batches, and recoverable tool observations. Provider adapters normalize zero to four closed calls but declare and prove their multi-call capability separately. The pure kernel validates eligibility, budget, final-answer reserve, and source order; `coding-runtime` preflights and schedules eligible read-only calls with concurrency at most four, journals actual lifecycle, and restores source-ordered results. Effectful or approval-bearing calls remain singleton and never enter the parallel scheduler. The native-process port remains a mechanism: runtime code resolves the executable, closes the environment and action, and obtains policy authority before calling it. The model and renderer never receive raw process authority, and trusted-host execution retains explicit `isolation=none` and `network=host_unrestricted` truth.

New-file recovery differs from AnchorEdit. Exact created bytes prove completed, proven target absence with the same parent identity proves not started, and any other file or parent state is stale or unknown. Command recovery retains ADR 0015's process rule: durable dispatch without a terminal receipt is unknown and cannot retry automatically.

R3-B changes only `apps/eden` composition and renderer-facing fixtures. OpenTUI, Bun, AgentClient, ProductView, journal truth, and protocol ownership do not move. A typed card registry maps closed product activity to presentation components; it is not a new runtime tool registry.

R3-C activates the existing planning, goals, and verification modules as internal `coding-runtime` modules rather than new packages. PlanArtifact and GoalSpec contracts live in `packages/contracts`; pure lifecycle, budget, completion-candidate, repair, checkpoint, and terminal transitions live in `packages/kernel`; journal persistence, workspace revalidation, check dispatch, Evidence Pack storage, and resume orchestration live in `packages/coding-runtime`; TUI and headless clients only submit commands and project results.

The v0.1 checkpoint is journal and workspace evidence, not a Git commit, stash, copied worktree, or rollback service. A resume opens one exact journal, replays before I/O, reconciles only an unresolved owning effect, revalidates goal and workspace state, and continues only from a declared safe boundary. An Evidence Pack is persisted under runtime-owned state and content-addressed before the verifier emits success.

R3-D is an optional internal extension after R3-C. If separately activated, one read-only child run owns its own context, journal, budgets, and cancellation while inheriting narrower authority. Web search and fetch remain explicit adapters behind separate network policy. R3-A's bounded repository-tool batch scheduler is not a child-agent or general task scheduler; R3-D creates no new package, write worker, nested fan-out, or generic subagent framework.

## Deferred boundaries

`apps/agentd`, `apps/desktop`, and `crates/eden-native` are not empty scaffolds. They are created only after the R5 service gate or a native-port benchmark. This keeps architecture options visible without pretending they have already been paid for.

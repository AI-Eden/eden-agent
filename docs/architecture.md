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

## Deferred boundaries

`apps/agentd`, `apps/desktop`, and `crates/eden-native` are not empty scaffolds. They are created only after the R5 service gate or a native-port benchmark. This keeps architecture options visible without pretending they have already been paid for.

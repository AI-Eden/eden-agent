# R2 Provider Onboarding and Repository Understanding Plan

- Status: Accepted; Build in progress; Slices 0-6 complete
- Date: 2026-07-19
- Roadmap stage: R2, Usable Minimal Coding Product
- Baseline: `326e1c3ca8674b44710089cb8f6c6a64e5154716`
- Decision brief: `docs/research/2026-07-19-r2-freeze-decision-brief.md`
- Required architecture approvals: ADR 0013 and ADR 0014
- Approved: 2026-07-19
- Human checkpoint: complete; the owner approved the complete Freeze packet
- Approval coverage: all test seams and ordered slices below; no extra per-slice approval unless a stop
  condition is triggered

## Goal and user-visible outcome

Deliver the first bounded R2 vertical slice: a user can configure one Chat Completions-compatible provider
profile, prove the selected model is ready through an explicit minimally billable stream check, trust a
repository, ask a repository-understanding question, watch the model use one or more bounded read-only
semantic tools, and receive a complete source-grounded final answer through the real TUI.

The same runtime truth must be observable through closed contracts and headless evidence. The TUI remains
conversation-centered but not chat-authoritative: model steps, tool activity, context sources, incomplete
attempts, errors, and recovery are structured product state, while a persistent authority strip shows the
exact workspace, trust, profile, model, network, tool, and budget boundary.

The slice is complete only when DeepSeek passes the pay-as-you-go row, Kimi Code passes the subscription-key
row when an owner-provided matching-surface credential is available, the complete packaged archive runs
with its pinned ripgrep asset on all hosted targets, and the real terminal proves one happy path plus
connection, instruction-budget, missing-Git, provider-interruption, and narrow-layout recovery paths.

## Current repository facts

- R1 already supplies the pure kernel, append-only JSONL journal, explicit effect reconciliation, replay,
  `InProcessAgentClient`, workspace trust, read-only run history, headless NDJSON, and Bun/OpenTUI lifecycle.
- `packages/providers/src/index.ts` contains only closed fake request/response schemas and one deterministic
  driver. It has no production dependency other than TypeBox.
- `packages/coding-runtime/src/context/index.ts`, `profiles/index.ts`, and `tools/index.ts` contain only
  placeholder interfaces. No existing profile store, context selector, repository adapter, or migration
  must be preserved.
- `packages/kernel` currently models one deterministic fake-model effect and proposal. The real slice must
  extend the closed event/effect union without importing SDK, filesystem, terminal, or native-process types.
- `WorkspaceReview` reports a deterministic fake profile and fixed disabled repository/network truth. It
  is the accepted pre-run projection and must become the provider/repository prerequisite surface rather
  than being bypassed by renderer state.
- `apps/eden/src/tui.tsx` uses direct key branches and a small walking-skeleton layout. The R2 information
  architecture requires a focus graph, complete final-answer surface, structured blocks, persistent
  authority, responsive composition, palette/help, and recovery actions.
- The standalone workflow currently packages one `eden`/`eden.exe`. ADR 0014 changes the product artifact
  to a platform archive containing the executable, pinned `rg`, and notices.
- Journal v1 currently rejects records larger than 64 KiB and runs larger than 1 MiB/4096 records. The
  first real-provider envelope must fit those existing hard limits or stop for a plan amendment.

## Frozen product contract after approval

### Host profile configuration

The default file is `<EDEN_STATE_DIR>/config.toml`; without the existing test/support override it is
`~/.eden-agent/config.toml`. It is outside the workspace and has one versioned closed shape:

```toml
version = 1
active_profile = "deepseek-v4"

[profiles.deepseek-v4]
protocol = "openai_chat_completions"
base_url = "https://api.deepseek.com"
model = "deepseek-v4-pro"
billing_source = "pay_as_you_go"
context_window_tokens = 1000000
max_output_tokens = 393216
reasoning_display = "off"

[profiles.deepseek-v4.credential]
source = "environment"
name = "EDEN_DEEPSEEK_KEY"
```

An inline credential uses `source = "inline"` and `value = "..."`. A credential object has exactly one
source and matching field. Profile IDs are bounded lowercase path-safe identities and never contain a
secret. The parser rejects unknown versions, fields, protocols, invalid URLs, non-positive limits,
duplicate identities, missing active profiles, and invalid credential shapes.

`config.toml` is the only authority. Eden resolves only the explicitly named environment variable and does
not inspect provider defaults, workspace `.env` files, or command-line secrets. Known Eden presets may fill
sourced model limits when the user selects the preset. A custom base URL must retain explicit values and
does not inherit limits by model-name coincidence.

Runtime-owned CRUD uses private state-path validation, bounded file size, no symlink or hardlink target,
atomic replacement, and no secret echo. On POSIX, the state root remains `0700` and the file is created or
normalized to `0600`; group/world-readable state fails closed. Windows evidence reports the exact local
state checks Eden can perform and does not claim malicious-same-user or cryptographic protection. Delete
removes the Eden profile value from the replacement file but does not claim secure erasure from filesystem,
backup, swap, or synchronization history.

Provider readiness persists outside run journals and is bound to a profile fingerprint that covers the
canonical parsed profile and resolved credential. The fingerprint and any local salt remain inside the
host profile boundary and never enter product events, diagnostics, or model context. Any profile or
credential change invalidates prior readiness.

### Provider and attempt contract

`packages/providers` defines closed, protocol-neutral model-step input and output types. The input contains
the selected non-secret profile identity, ordered local conversation/context items, enabled closed tool
schemas, output cap, and one attempt identity. Provider SDK values never cross the package boundary.

The adapter emits coalesced live-only visible text with ordered offsets and finally one of:

- `completed`: complete answer and/or complete validated tool calls, finish status, exact-if-received usage,
  bounded sanitized request identity, and optional private continuation;
- `not_started`: adapter evidence proves the request did not begin;
- `interrupted`: a controlled stop produced one bounded visible partial snapshot;
- `unknown`: execution or billing may have occurred but no safe terminal observation exists.

The SDK uses `maxRetries: 0`. Every retry receives a new attempt ID under one stable effect identity.
Automatic retry is allowed only for a closed retryable `not_started` outcome within the plan-derived
attempt budget. Once any application delta is observed, retry requires an explicit product action.

The normal first-slice output request cap is the smaller of the configured model maximum and the frozen R2
output reserve. The adapter aborts and produces a visible incomplete/block if the byte envelope would exceed
the journal record budget; it never truncates content and labels it final. Parallel tool calls, malformed
arguments, unsupported tools, and provider content beyond the accepted first-slice shape fail closed.

### Connection evidence and errors

Profile states are:

- `unconfigured`: no valid active profile;
- `configured`: profile and credential resolve locally;
- `catalog_reachable`: optional catalog request succeeded;
- `completion_ready`: the explicit selected-model stream check passed for the current profile fingerprint.

The stream check sends a versioned fixed prompt, no repository/task/instruction context, no tools, and a
very small output limit. The user must activate the action after seeing its network and possible-charge
copy. Saving a profile never sends the check implicitly. A repository run is blocked until the current
profile is `completion_ready`.

Product errors use only closed categories: invalid configuration, authentication, billing/quota, unavailable
model, rate limit, network, timeout, overload, provider internal, protocol incompatibility, cancellation,
and unknown. The adapter may return only bounded retry guidance, sanitized request ID, status family,
profile/model identity, and timestamps. Secret-canary tests cover prompt, tool environment, journal,
ProductEvent, ProductView, headless stdout/stderr, diagnostics, TUI frames, and packaged evidence.

### Repository tools and native assets

The first-slice model tool union is closed to:

```text
list_files(root-relative path, optional depth/cursor)
read_file(root-relative path, optional byte offset/length)
search_repository(pattern, optional root-relative scope/cursor)
git_status()
```

The runtime supplies canonical trusted root and all executable details. Every tool result separates bounded
model content, closed product structure, and internal sanitized diagnostics. Every path is re-resolved inside
the exact trusted root immediately before use; traversal, absolute paths, symlink escape, unsupported file
types, mutation, and result-budget overflow fail closed or return explicit continuation.

Search invokes the application-relative pinned `rg` with fixed JSON output and no configuration-file or
environment fallback. Git status invokes compatible host Git with fixed porcelain-v2/NUL output, disabled
pagers/editors/credential prompting, scrubbed environment, timeout, process-tree cancellation, and no
hooks. Missing or incompatible Git blocks repository runs with official installation guidance and recheck;
Eden does not install it.

Initial hard ceilings are constrained by current persistence and become exact constants in Slice 0:

- at most 4 model steps and 4 tool calls in the first-slice run;
- one tool call per model step; parallel calls are rejected visibly;
- at most 4096 visited entries and 256 returned rows for list;
- at most 256 search matches;
- at most 256 Git-status entries;
- at most 24 KiB model-facing content per tool result;
- at most 32 KiB complete visible assistant output per terminal observation;
- at most 32 KiB per instruction file and 128 KiB per applicable chain before context selection;
- a 5-second native-tool timeout before cancellation and blocked recovery.

Slice 0 may lower a ceiling to preserve the 64 KiB record and 1 MiB run invariants after measuring encoded
closed fixtures. It may not raise persistence budgets, truncate final answers or instructions, add storage,
or broaden authority without a plan amendment.

### Instructions and context

After trust, context discovery loads complete `AGENTS.md` files from trusted root to selected cwd. Before
repository content enters model context, runtime loads the applicable root-to-leaf chain for that path.
Repository-wide results group content by scope. Sibling rules never become global by load order.

Each used instruction snapshot records relative source path, scope directory, content hash, precedence,
selection reason, and activated context-item IDs. R2 recognizes no instruction filename other than
`AGENTS.md` and never crosses the trusted root. Unreadable, conflicting, individually oversized, or
aggregate-over-budget applicable instructions produce a structured pre-network block; no middle truncation
or silent omission is allowed.

Context calculation is deterministic:

```text
usable_input = context_window_tokens - output_reserve - safety_reserve
```

P0 must fit: system/provider contract, current task, workspace/trust identity, enabled tool schemas,
applicable complete instructions, and current-attempt continuity. P1 contains recent turns and current tool
observations. P2 contains older conversation and supporting evidence. P1/P2 share the remaining pool and
may be deterministically omitted or summarized only when their item types explicitly permit it. Every item
records source, scope, estimate, priority, selection reason, and omission/truncation fact. Token estimates
never become billing usage.

### Runtime, journal, and product events

The kernel receives only Eden-owned closed facts. At minimum the event/effect model must distinguish model
step requested, attempt started, terminal model observation, tool requested, terminal tool observation,
run blocked, explicit retry, and cancellation. Effect reconciliation never dispatches during pure replay.
Private provider continuity is durable but excluded from ordinary ProductEvent and renderer copy.

`AgentClient` exposes renderer-neutral profile review/CRUD/check actions, transient model stream updates,
repository/context summaries, explicit retry, and current `ProductView`. Durable ProductEvents remain closed
NDJSON facts. If transient headless streaming is exposed, it uses a separately versioned opt-in mode and is
not required by this first slice; default headless stdout remains durable ProductEvent only.

The verifier still owns success. This repository-understanding slice ends in a non-success review/complete-
answer state appropriate to the bounded user story; model text cannot emit `succeeded`.

### TUI contract

The main reading surface is a conversation, with complete final answers as primary durable content.
Provider check, context selection, model generation, tool activity, interruption, error, and recovery appear
as structured blocks between turns rather than prose pretending to be runtime state.

Always-visible authority includes exact workspace/trust, profile/model, credential presence without value,
network purpose, repository tool class, trusted-host/no-isolation truth, context usage, and current phase.
The composer cannot start a run until trust, current `completion_ready`, Git prerequisite, and P0 context fit
are true.

Responsive composition is:

- narrow (`60x20` evidence): one primary column with explicit context/profile/history/recovery switching;
- medium (`80x24` evidence): conversation plus contextual drawer;
- wide (`100x30` evidence): session navigation, conversation, and contextual review pane.

Resize preserves focus identity, selection, expanded state, scroll anchor, and action safety. A focus graph,
not scattered key-condition branches, owns navigation. `Tab`/`Shift+Tab` advance focus, arrows move within a
collection, `Enter` activates the focused action, `Esc` returns/collapses without changing authority,
`Ctrl+P` opens the command palette, `?` opens shortcut help outside text entry, and `Ctrl+C` retains its
durable-cancel/exit boundary. Existing direct mnemonic keys may remain only when surfaced in shortcut help
and disabled during text entry.

Design tokens cover spacing, border hierarchy, semantic color plus text/icon, emphasis, density, focus,
disabled/awaiting state, and narrow fallbacks. Tool details, progress, long evidence, and supported reasoning
summaries may fold independently. Complete final answers remain available without summary replacement.

## Baseline and derived budget ledger

Before the first production change, Slice 0 runs the current R1 exact baseline through the existing renderer,
process, package, and PTY fixtures, then records the command, machine metadata, repetitions, raw results, and
derived R2 thresholds in this section or `docs/benchmark-results/`.

Threshold derivation is fixed by plan approval:

- use at least one warm-up and five measured runs for latency metrics;
- record median and p95 without dropping failures;
- an R2 regression threshold is the larger of 25% above R1 p95 or R1 p95 plus the timer-resolution/error
  allowance documented by the harness;
- input-to-render and scroll-to-render also have a 100 ms absolute ceiling on the controlled fixture;
- cold standalone start has a 2-second absolute ceiling on the controlled hosted fixture;
- a threshold that cannot be measured on a surface is `not-run`, never inferred from another platform;
- no production optimization claim is accepted without the reproducible input and raw measurement artifact.

The exact provider, tool, byte, and context constants above are checked against encoded contract fixtures
before implementation. If a fixture crosses 80% of an existing journal hard limit, lower the slice ceiling
and record the independent calculation. Crossing the hard limit or requiring a new persistence shape is a
stop condition, not permission to redesign silently.

### Slice 0 evidence and frozen values

Slice 0 ran against the unchanged R1 executable built from public commit
`978bb78f6b67f8410ad3dbbc688dfe0622f4a987`; the plan's original R1 decision baseline
`326e1c3ca8674b44710089cb8f6c6a64e5154716` remains its ancestor. The standalone smoke and production PTY
fixtures passed, including the `100x30` task flow and the `60x20`/`100x30` history flow. The renderer suite
passed 30 tests. The full suite also exposed and Slice 0 repaired a stale documentation assertion that
still described R2 as unfrozen after the accepted Freeze packet.

The frozen R2 implementation constants are:

| Boundary | Value |
| --- | ---: |
| Model steps / tool calls | 4 / 4 |
| List visited / returned | 4096 / 256 |
| Search matches / Git-status entries | 256 / 256 |
| Tool model content | 24 KiB |
| Complete visible assistant output | 32 KiB |
| Private continuity | 8 KiB |
| Instruction file / applicable chain | 32 KiB / 128 KiB |
| Output / estimator safety reserve | 8192 / 2048 tokens |
| Native tool timeout | 5000 ms |

`scripts/r2-contract-budgets.test.mjs` measures newline-inclusive JSON envelopes independently. The maximum
instruction, model-observation, and tool-result fixtures encode to 33,263, 41,330, and 24,956 bytes. Each
is below the 52,428-byte 80% record threshold. Four instruction records, four model observations, and four
tool results total 398,196 bytes, below the 838,860-byte 80% run threshold. Deliberately oversized variants
of all three record families exceed 65,536 bytes. Later closed schemas must stay within these ceilings; the
fixture is a guardrail, not permission to persist arbitrary fields until the headroom is consumed.

The reproducible Linux x64 WSL2 record is
`docs/benchmark-results/2026-07-19-r2-r1-baseline-linux-x64.json`. One warm-up and five measured PTY runs
retained zero failures. Cold input-ready startup had a 191.65 ms median and 195.19 ms p95, freezing a 244 ms
regression threshold plus the independent 2-second absolute ceiling. Exact-workspace trust input-to-render
had a 285.00 ms median and 285.01 ms p95, freezing a 357 ms regression threshold; it does not meet the
independent R2 100 ms target, so Slice 7 must improve and remeasure it. Scroll-to-render and non-Linux
surfaces are `not-run`, not inferred.

Fresh Slice 0 commands:

```bash
corepack pnpm@11.13.0 --filter @eden/cli package:bun
node scripts/smoke-standalone.mjs apps/eden/dist/eden /tmp/eden-r2-slice0-baseline/standalone.json
node scripts/r1-production-pty.mjs apps/eden/dist/eden /tmp/eden-r2-slice0-baseline
corepack pnpm@11.13.0 --filter @eden/cli test
node --test scripts/r2-contract-budgets.test.mjs
node scripts/r2-r1-baseline.mjs apps/eden/dist/eden \
  docs/benchmark-results/2026-07-19-r2-r1-baseline-linux-x64.json \
  978bb78f6b67f8410ad3dbbc688dfe0622f4a987
```

## Ordered test-first implementation slices

Each slice is RED, GREEN, REFACTOR, VERIFY. The approved seam, independent expected result, permitted
boundary fake, and real matching surface are fixed below.

### Slice 0: Freeze record, baseline, and closed fixture budgets

**Outcome:** accept the ADRs/plan, update focused public docs, reproduce the R1 baseline, and freeze the exact
R2 budget/threshold ledger before production behavior changes.

- **Public seam:** Markdown contracts, current R1 package/process/renderer scripts, encoded TypeBox fixture
  sizes, and benchmark artifacts.
- **RED:** add deterministic budget checks that demonstrate an intentionally oversized model/instruction/tool
  fixture would cross the current record ceiling; confirm the new check fails before choosing exact limits.
- **Independent oracle:** documented journal byte limits, `Buffer.byteLength(JSON.stringify(value))`, and
  repeated wall-clock measurements of the unchanged R1 executable.
- **Permitted fake:** deterministic oversized fixture only; no timing mock for claimed latency.
- **GREEN:** record exact constants and thresholds; mark ADRs/plan Accepted only after owner approval; update
  `CONTEXT.md`, `SPEC.md`, product/contracts/event/threat/TUI/support documents without adding behavior.
- **Matching surface:** unchanged R1 `60x20` and `100x30` packaged flows remain green at baseline.

### Slice 1: Provider profile CRUD as one product flow

**Outcome:** a fresh launch without a profile explains the missing prerequisite; the TUI can create, mask,
inspect, update, select, and delete local profiles without emitting a secret.

- **Public seam:** closed profile schemas and non-throwing decoders, renderer-neutral profile methods on
  `AgentClient`, `WorkspaceReview`, TUI onboarding, and read-only headless profile-list/check inspection.
- **RED:** malformed/oversized TOML, unknown fields, invalid URL/limits, missing explicit env reference,
  symlink/hardlink config, unsafe POSIX mode, interrupted replacement, secret-canary projection, stale CRUD
  revision, delete-active-profile, and direct-file-reload tests.
- **Independent oracle:** the accepted TOML schema, filesystem metadata, exact replacement bytes, and zero
  canary matches across returned values and captured frames.
- **Permitted fake:** temporary state root, injected filesystem failure points, and fixed environment map;
  do not fake the parser or actual file replacement.
- **GREEN:** implement the smallest host profile store and closed product projection. Keep all profile I/O in
  runtime/host boundaries, not kernel or renderer.
- **Matching surface:** fresh TUI create/edit/delete/recovery at `60x20`, `80x24`, and `100x30`; direct
  `config.toml` edit followed by reload; no provider request occurs.

#### Slice 1 evidence

Slice 1 adds the closed profile schemas and `AgentClient` methods, one strict `smol-toml` host store,
masked `WorkspaceReview` and headless projections, and the local onboarding surface. The TUI test exercises
create, masked inline entry, inspect, update, select, delete, direct-file reload, malformed-file recovery,
and secret-canary absence at `60x20`, `80x24`, and `100x30`. The runtime suite independently covers the
64 KiB file ceiling, closed fields and versions, URL and limit validation, missing environment presence,
linked and permissive files, stale revisions, competing-store linearization, active-profile deletion, and
interrupted replacement. No
provider dependency or request exists yet. POSIX permission evidence is local Linux/WSL only; Windows
permission claims remain `not-run` for the hosted evidence slice.

Fresh Slice 1 commands:

```bash
corepack pnpm@11.13.0 --filter @eden/contracts test
corepack pnpm@11.13.0 --filter @eden/coding-runtime test
corepack pnpm@11.13.0 --filter @eden/cli test
corepack pnpm@11.13.0 typecheck
corepack pnpm@11.13.0 code:check
```

### Slice 2: Explicit connection readiness and redacted provider boundary

**Outcome:** the selected profile advances through configured/catalog/ready evidence or a precise recovery
state without exposing provider text or credentials.

- **Public seam:** protocol-neutral provider adapter, profile readiness commands/projections, closed
  `ProductError`, and provider-check TUI block.
- **RED:** credential-only false positive, catalog-success/completion-failure, auth, balance/quota, missing
  model, rate limit, timeout, overload, malformed stream, unknown body, cancellation, request-ID bounds,
  SDK retry disabled, profile-change invalidation, and secret canaries.
- **Independent oracle:** scripted local HTTP/SSE fixtures with fixed status/body sequences and captured
  request count; official provider error/status contracts; exact zero-match canary scan.
- **Permitted fake:** local provider transport server is the accepted network boundary fake. Do not mock the
  adapter parser, stream aggregation, abort signal, SDK retry configuration, or product projection.
- **GREEN:** add the pinned official SDK, closed Chat Completions adapter, readiness store, explicit check
  action, and recovery UI. The fixed prompt has no workspace content or tools.
- **Matching surface:** real DeepSeek fixed-content check after explicit possible-charge confirmation; one
  invalid-key and one network-unavailable recovery; Kimi row when its matching-surface key is available.

#### Slice 2 deterministic and matching-surface evidence

The deterministic/local implementation pins the official `openai` SDK at `6.48.0` with `maxRetries: 0` and
SDK logging disabled. Actual SDK requests against local HTTP/SSE fixtures prove the fixed prompt, 8-token
stream cap, zero tools and repository context, exact-answer requirement, catalog/completion distinction,
single-request behavior, bounded request IDs, auth, billing/quota, model, rate, timeout, overload, internal,
malformed-stream, cancellation, network, and unknown recovery categories without raw payload output.

The first real DeepSeek V4 Pro attempt on 2026-07-20 correctly stopped as `protocol_incompatibility` without
persisting readiness. Official DeepSeek V4 documentation identifies thinking as enabled by default and
`reasoning_content` as a valid stream delta. A RED matching fixture now requires the adapter to send
`thinking = disabled`; readiness accepts only absent, null, or empty reasoning deltas and still requires the
exact fixed answer. This provider-specific wire detail remains inside `packages/providers` and does not
change Eden's protocol-neutral boundary or conversation ownership.

Host readiness persists only a private salt, profile-and-resolved-credential fingerprint, and timestamp.
Focused runtime evidence proves restart recovery, `0600` state on POSIX, profile and environment credential
invalidation, stale post-network rejection, invalid local-state recovery, and zero credential canary output.
The TUI requires a separate possible-charge confirmation, makes no request on save, and recovers from one
local network failure before reaching `completion_ready`; headless profile inspection remains read-only.

After that correction, the real `deepseek-v4-pro` TUI path displayed the possible-charge copy, required an
explicit `y`, and reached `completion_ready`. A fresh headless read reconstructed that state without a
provider call. The `0600` readiness record contained neither the credential nor model identity. A real
DeepSeek request with a public invalid credential produced the fixed authentication recovery, while an
actual SDK request through a local connection-reset fixture produced the fixed network recovery; neither
frame exposed its canary. Kimi remains `not-run` because the owner has no subscription credential, so this
slice closes without a Kimi subscription-support claim.

Official matching references:

- [DeepSeek models and pricing](https://api-docs.deepseek.com/quick_start/pricing)
- [DeepSeek Chat Completions request and stream schema](https://api-docs.deepseek.com/api/create-chat-completion)

Fresh deterministic Slice 2 commands:

```bash
corepack pnpm@11.13.0 --filter @eden/contracts test
corepack pnpm@11.13.0 --filter @eden/providers test
corepack pnpm@11.13.0 --filter @eden/coding-runtime test
corepack pnpm@11.13.0 --filter @eden/cli test
corepack pnpm@11.13.0 typecheck
corepack pnpm@11.13.0 code:check
```

### Slice 3: Scoped instructions and invariant-first context admission

**Outcome:** trusted root instructions and path-scoped nested instructions become complete, explainable P0
context before any repository content or provider request.

- **Public seam:** instruction manifest/snapshot schema, deterministic context selector, context summary in
  `WorkspaceReview`/`ProductView`, and pre-network blocked errors.
- **RED:** root-to-leaf ordering, nested activation on content admission, sibling isolation, duplicate
  suppression, root escape, unsupported filename, unreadable/oversized/conflicting instruction, changed
  snapshot hash, custom-model missing limits, P0 overflow, P1/P2 omission order, and zero provider calls on
  failure.
- **Independent oracle:** fixture directory tree with worked instruction chains, exact hashes, explicitly
  calculated token estimates, and captured provider call count zero.
- **Permitted fake:** deterministic token estimator at the estimator port and a request-counting fake
  provider. Use real filesystem resolution for scope/path claims.
- **GREEN:** implement scope-aware discovery, complete snapshots, custom metadata validation, priority
  selector, and visible provenance/omission ledger. Do not add model-generated compaction.
- **Matching surface:** a nested-package repository question shows the exact applicable sources; an
  oversized applicable instruction blocks with inspect/reconfigure actions before network.

#### Slice 3 evidence

Slice 3 implements closed instruction and context summaries in `@eden/contracts`, scope-aware discovery and
admission in `@eden/coding-runtime`, and visible context state/source/recovery blocks in the TUI. Real
filesystem fixtures prove root-to-leaf order, nested activation, sibling isolation, duplicate suppression,
exact SHA-256 hashes, unsupported-name isolation, unavailable and aggregate/individual oversize failures,
conflict and pre-dispatch change detection, root containment, explicit profile limits, P0 must-fit, and
deterministic P1/P2 selection. The request-counting provider remains at zero for every pre-network failure.

The matching TUI projects `context: ready` with the exact `AGENTS.md` source and projects the fixed blocker
and recovery for an individually oversized applicable instruction. Secret canaries remain absent. The
cross-process trust suite and local-loopback TUI suite require the unsandboxed test lane because the hosted
agent sandbox suppresses child-process pipes and local port binding; both passed on the same working tree.
No repository read tool, real model turn, journal schema, or write authority is added in this slice.

Fresh deterministic Slice 3 commands:

```bash
corepack pnpm@11.13.0 --filter @eden/contracts test
corepack pnpm@11.13.0 --filter @eden/coding-runtime test
corepack pnpm@11.13.0 --filter @eden/cli test
corepack pnpm@11.13.0 typecheck
corepack pnpm@11.13.0 code:check
```

### Slice 4: Bounded list and read tools through one fake model turn

**Outcome:** the runtime can accept one validated list/read tool call, persist its bounded semantic result,
and present the activity/result/provenance without granting process or write authority.

- **Public seam:** closed tool-call/result schemas, kernel effect/observation transitions, journal/replay,
  `AgentClient` live/durable projections, tool card, and context continuation.
- **RED:** absolute/traversal/symlink paths, binary/encoding behavior, visit/row/byte limit, continuation,
  cancel, stale workspace identity, replay without I/O, malformed/parallel call, half-complete arguments,
  and renderer-forged result.
- **Independent oracle:** fixed filesystem fixture with known byte offsets, canonical paths, hashes, rows,
  and zero-write snapshots before/after.
- **Permitted fake:** deterministic model driver may request the exact closed tool call; filesystem behavior
  itself is real inside the fixture.
- **GREEN:** implement list/read adapters, effect identities, durable terminal results, bounded product
  structures, live activity, and complete TUI tool blocks.
- **Matching surface:** TUI question triggers one list/read round trip and preserves full answer area,
  authority strip, source summary, keyboard navigation, and `Ctrl+C` cleanup.

#### Slice 4 evidence

Slice 4 implements closed `list_files`/`read_file` contracts, one-tool kernel effects and observations,
durable journal/replay projection, and real checked filesystem adapters in `@eden/coding-runtime`. Fixtures
prove exact hashes and UTF-8 byte offsets, 256-row and 24 KiB pagination, the exact 4096-visit ceiling,
absolute/traversal/link/binary/encoding/offset/cancel/stale-identity failures, and zero repository writes.
Provider fixtures reject parallel and half-complete calls. Runtime integration persists requested and
completed activity, passes only the closed result into one fake-model continuation, and replays after the
source is removed with zero model or tool calls.

The matching TUI shows the complete bounded CJK result, source/hash/offset provenance, and the explicit
bounded-read/write-denied/process-fake-only/network-denied authority strip. Terminal controls are sanitized
at rendering without changing durable content. A real `Ctrl+C` input aborts an in-flight model operation
before repository tool dispatch. This slice adds no native process, search, Git, write, shell, sandbox,
verification, or success authority.

Fresh deterministic Slice 4 commands:

```bash
corepack pnpm@11.13.0 --filter @eden/contracts test
corepack pnpm@11.13.0 --filter @eden/kernel test
corepack pnpm@11.13.0 --filter @eden/providers test
corepack pnpm@11.13.0 --filter @eden/coding-runtime test
corepack pnpm@11.13.0 --filter @eden/cli test
corepack pnpm@11.13.0 typecheck
corepack pnpm@11.13.0 code:check
```

### Slice 5: Pinned ripgrep and compatible host Git semantic tools

**Outcome:** search and Git status use mature native engines behind the same closed model contract, with no
fallback and precise prerequisite recovery.

- **Public seam:** semantic search/status ports, fixed native process runner, parsed closed results,
  capability review, archive manifest, and TUI tool/prerequisite blocks.
- **RED:** missing/wrong/modified application `rg`, malformed JSON, result/timeout/cancel, search pattern
  bounds, Git missing/old, pager/editor/prompt/hook environment, porcelain rename/untracked/dirty fixtures,
  NUL parsing, output overflow, process-tree cleanup, and zero raw stdout/stderr leakage.
- **Independent oracle:** repository fixture plus direct invocation of the pinned `rg` and host Git with
  frozen argv; expected paths/statuses are checked independently from the Eden parser.
- **Permitted fake:** injected native-process launcher only for exact timeout/malformed-output cases; happy
  path and matching surfaces use real bundled `rg` and real host Git.
- **GREEN:** package pinned platform assets and notices, resolve only application-relative `rg`, probe host
  Git, execute fixed argv/env, parse results, and expose structured recovery.
- **Matching surface:** copied archive in an empty directory completes search/status; removing `rg` or Git
  produces distinct blocked prerequisites and recheck; no system package mutation occurs.

#### Slice 5 evidence

Slice 5 pins `@vscode/ripgrep` 1.18.0 as the build-time platform asset source and verifies the copied
ripgrep 15.0.0 binary by application-relative filename, executable shape, single-link identity, version,
and SHA-256 before search. The fixed native runner supplies exact argv/cwd/environment, five-second timeout,
2 MiB capture bounds, cancellation, and POSIX process-group cleanup. Search parses only ripgrep JSON into
bounded semantic pages. Git 2.31.0 or newer is probed separately and fixed porcelain-v2/NUL status is parsed
into closed ordinary/rename/copy/unmerged/untracked rows. No executable, raw stdout/stderr, prompt, pager,
editor, credential, shell, or write authority crosses the tool result boundary.

Real temporary repositories independently exercised the bundled `rg` and host Git with frozen argv,
exact match/status expectations, 256-row continuation, dirty/rename/untracked paths, and before/after
zero-write digests. Node and project-pinned Bun both passed the seven native adapter cases. Launcher fakes
were limited to missing/old, malformed, timeout, cancel, and overflow failures. The native runner separately
proved exact env/argv, overflow/timeout/cancel/spawn recovery, and complete process-group termination.

Packaging now emits exactly `eden`/`eden.exe`, `rg`/`rg.exe`, `THIRD_PARTY_NOTICES.txt`, and the closed
`eden-assets.json`. `scripts/r2-native-tools-archive.test.mjs` copies that directory away from the checkout,
independently verifies all three hashes and target provenance, then completes one real search and one real
host-Git status round trip. TUI evidence distinguishes missing ripgrep from missing Git and changes a
restored asset to ready only after explicit `g` recheck. These are local Linux/WSL rows; hosted macOS,
Windows, and Linux archive evidence remains `not-run` until Slice 8.

Fresh deterministic Slice 5 commands:

```bash
corepack pnpm@11.13.0 --filter @eden/contracts test
corepack pnpm@11.13.0 --filter @eden/kernel test
corepack pnpm@11.13.0 --filter @eden/providers test
corepack pnpm@11.13.0 --filter @eden/coding-runtime test
corepack pnpm@11.13.0 --filter @eden/cli test
corepack pnpm@11.13.0 typecheck
corepack pnpm@11.13.0 code:check
corepack pnpm@11.13.0 --filter @eden/cli package:bun
node scripts/r2-native-tools-archive.test.mjs apps/eden/dist
```

### Slice 6: Real multi-step model/tool loop and durable attempt recovery

**Outcome:** one real model can request a supported tool, receive its local result, and produce one complete
final repository-grounded answer from Eden-owned conversation state.

- **Public seam:** kernel model-step/tool-step lifecycle, runtime attempt ledger, provider adapter, journal
  replay/reconciliation, ProductEvent/ProductView, default headless NDJSON, and TUI conversation flow.
- **RED:** complete streamed text, split tool-call ID/name/arguments, unknown tool, malformed arguments,
  attempt budget, post-delta disconnect, controlled cancel snapshot, hard-crash unresolved effect, explicit
  retry, no cross-attempt concatenation, exact/unknown usage, private continuity non-projection, replay with
  zero provider/tool calls, and model cannot emit success.
- **Independent oracle:** scripted SSE transcripts and journal records with hand-calculated terminal values;
  a call-counting side-effect boundary proves no replay dispatch.
- **Permitted fake:** scripted provider transport for every protocol/crash branch and deterministic tool
  fixture. The final matching surface uses a real provider and native tools.
- **GREEN:** extend closed kernel events/effects, runtime loop, terminal model observations, private
  continuity, explicit retry/cancel, product projections, and complete final-answer rendering.
- **Matching surface:** real DeepSeek repository question performs at least one tool round trip and ends with
  a complete sourced answer; a forced mid-stream disconnect becomes visible and recovers only after explicit
  retry from the last committed turn.

#### Slice 6 evidence

Slice 6 adds one protocol-neutral model-step contract and keeps the official SDK plus provider-specific
stream handling inside `packages/providers`. Scripted SSE fixtures cover coalesced text, split tool-call
identity/name/arguments, unknown tools, malformed arguments, byte limits, exact and unknown usage,
post-delta disconnect, controlled cancellation, and bounded private continuity. Kernel/runtime fixtures
cover the four-step/four-tool budgets, stable pre-dispatch attempt identity, one automatic retry only for
proven `not_started`, explicit retry after ambiguity, instruction revalidation, context commits, no cross-
attempt concatenation, replay with zero dispatch, and the rule that model output ends in `completed` review
rather than `succeeded`.

The owner authorized a minimally billable DeepSeek matching run using an environment-referenced credential
in a temporary private state root. On 2026-07-20, run
`run-9369765f-6361-48b3-a257-6a90ffd98eec` completed two exact-usage streamed model attempts around one
verified application-local ripgrep `search_repository` call. The final answer cited six repository source
locations and the durable terminal outcome was `completed`, not success. Read-only history reconstructed the
same review state. Earlier matching attempts exposed a recursive search-preflight symlink defect and a TUI
effect-lifecycle cancellation defect; both received focused RED/GREEN regressions before the final run.

The matching host proxy required disabled TLS certificate verification. This is explicit residual risk: the
row validates the provider/product protocol and real tool loop, but not production TLS verification or R2
release support. Kimi remains `not-run` because no subscription credential is available. No credential
value entered the repository, config file, journal, product event, diagnostic, or evidence text.

Fresh deterministic Slice 6 commands:

```bash
corepack pnpm@11.13.0 test
corepack pnpm@11.13.0 typecheck
corepack pnpm@11.13.0 code:check
corepack pnpm@11.13.0 markdown:check
corepack pnpm@11.13.0 build
corepack pnpm@11.13.0 --filter @eden/cli package:bun
node scripts/r2-native-tools-archive.test.mjs
```

### Slice 7: Product-quality responsive TUI integration

**Outcome:** all delivered provider/repository behavior is understandable, keyboard-complete, responsive,
and recoverable through the selected conversation-centered `4B+` architecture.

- **Public seam:** deterministic OpenTUI frames, focus graph, command palette/help, real PTY driver,
  `AgentClient` projections, and terminal cleanup.
- **RED:** focus order, disabled/awaiting action, composer/global shortcut conflict, palette/help, folded tool
  with complete answer retained, narrow view switching, medium drawer, wide review pane, resize focus/
  selection/scroll anchor, CJK/wide text, paste/IME fixture, long output, interruption, and error recovery.
- **Independent oracle:** closed ProductView/live fixtures and exact expected focus/action identity; real PTY
  keystrokes prove behavior beyond snapshots.
- **Permitted fake:** deterministic provider/tool product fixtures for renderer states. Real PTY is mandatory
  for input, focus, resize, cleanup, and latency claims.
- **GREEN:** replace scattered navigation branches with the focus graph, implement design tokens and
  structured blocks, complete responsive composition, and retain one runtime truth across TUI/headless.
- **Matching surface:** keyboard-only primary and failure journeys at `60x20`, `80x24`, and `100x30`, rapid
  resize, CJK/wide content, long answer, long tool evidence, and terminal-mode restoration.

#### Slice 7 evidence

Public commit `8c679fd064e8b01990d0ca4e8c21b9d68fcdb923` replaces scattered TUI navigation with one
focus graph and shared design tokens. The conversation remains primary and complete while narrow mode
switches explicitly among conversation, context, and recovery; medium mode adds a contextual drawer and
wide mode adds navigation and review. Authority changes show an immediate awaiting state before the
durable trust record commits. Provider adapters and non-selected CLI modes load only when their surface
needs them, and the production Bun archive is minified without changing the runtime contract.

Focused renderer tests cover focus reconciliation, disabled actions, palette/help, text-entry shortcut
isolation, complete answers, folded tool evidence, interruption, long history, and all three layouts. The
real Linux x64 WSL2 PTY record is
`docs/benchmark-results/2026-07-20-r2-tui-linux-x64.json`: keyboard-only primary journeys passed at
`60x20`, `80x24`, and `100x30`; rapid resize preserved focus; CJK bracketed paste, the missing-Git failure
journey, terminal-mode restoration, and parent-shell recovery were observed. One warm-up and five measured
trials retained zero failures. Event timestamps use the same PTY `onData` boundary as the Slice 0 baseline.
Cold startup measured 231.09 ms median and 243.37 ms p95 against the frozen 244 ms threshold. Trust input
acknowledgement measured 17.13 ms median and 18.36 ms p95 against the independent 100 ms target; durable
trusted rendering measured 51.17 ms median and 53.71 ms p95 against the frozen 357 ms threshold.

Earlier exact-artifact samples retained host-scheduling outliers up to 278.67 ms and failed the threshold;
the passing record therefore supports only the captured run and is not a claim of variance-free startup.
Scroll-to-render and non-Linux PTY/performance rows remain `not-run` for Slice 8.

### Slice 8: Packaged real-provider acceptance and single-agent review

**Outcome:** the exact final SHA and complete archive pass automated, hosted, real-provider, terminal, and
diff-and-spec evidence without secrets or unsupported claims.

- **Public seam:** frozen install, all package suites, standalone archives, manifests, PTY evidence,
  provider matching-surface records, and one evidence-backed single-agent review.
- **RED:** the acceptance ledger begins incomplete; each unsupported or unavailable row is `not-run` rather
  than inferred. Secret scan intentionally includes canaries and rejects any captured leak.
- **Independent oracle:** exact git SHA, archive hashes, provider request IDs after sanitization, machine
  metadata, raw deterministic fixtures, and human-observed real terminal behavior.
- **Permitted fake:** none for the claimed DeepSeek/Kimi completion rows, pinned `rg`, host Git, archive,
  process, or TUI journey. Scripted provider cases remain supporting failure evidence only.
- **GREEN:** run and repair until every required row is green; update plan, `CONTEXT.md`, focused docs, and
  support matrix with exact evidence and explicit residual risk.
- **Matching surface:** copied archive, explicit provider check, trusted repository question, native tool
  round trip, complete answer, one connection recovery, one stream recovery, one instruction-budget block,
  missing-Git prerequisite, all three target widths, and clean terminal exit.

## Likely files and boundaries

The exact diff may narrow during RED, but work stays inside these owners:

- `packages/contracts/src/protocol.ts`, fixtures, and contract tests;
- `packages/kernel/src/model.ts`, schemas, reducer/decision logic, and pure tests;
- `packages/providers/` adapter schemas, OpenAI-compatible implementation, tests, and pinned dependency;
- `packages/coding-runtime/src/profiles/`, `context/`, `tools/`, runtime/client/journal/replay/projection code,
  and focused tests;
- `apps/eden/src/args.ts`, headless/profile inspection, TUI layout/focus/components/text/runner, packaging, and
  process/renderer/PTy tests;
- native asset acquisition/verification scripts, archive manifests, third-party notices, and hosted
  workflow evidence;
- `PRODUCT.md`, `SPEC.md`, `CONTEXT.md`, architecture/contracts/event/threat/product/support docs, ADR 0013,
  ADR 0014, this plan, and reproducible benchmark/evidence records.

Do not create a daemon, desktop app, Rust crate, second provider family, generic shared-types package,
tool-specific plan directory, or alternate state machine.

## Verification commands

Run focused package commands after each RED/GREEN cycle, then the affected workspace gates. Final local
verification includes:

```bash
corepack pnpm@11.13.0 install --frozen-lockfile
corepack pnpm@11.13.0 test
corepack pnpm@11.13.0 typecheck
corepack pnpm@11.13.0 code:check
corepack pnpm@11.13.0 markdown:check
corepack pnpm@11.13.0 build
node scripts/r1-walking-skeleton-workflow.test.mjs
node scripts/smoke-standalone.mjs
```

The plan must add named R2 process, archive, provider-fixture, secret-canary, budget, and PTY commands before
their slices can complete. Final evidence runs those commands after the last relevant code change, not only
during iteration.

Real-provider commands use an owner-provided secret through an explicitly named environment reference in a
temporary host config. They never print, persist in the repository, or enter captured diagnostics. DeepSeek
is required. Kimi is required for the subscription-key support claim; if its credential is unavailable, the
row remains `not-run` and that claim cannot complete.

Hosted evidence repeats frozen install, tests, typecheck, build, complete archive packaging, copied-archive
smoke, native asset verification, deterministic PTY flows, and artifact upload on Ubuntu, macOS, and Windows.
Real-provider execution may remain in a separately authorized protected-secret lane, but its exact SHA and
artifact layout must match the hosted build.

## Acceptance ledger

| Area | Required evidence |
| --- | --- |
| Config CRUD | create, masked read, update, select, delete, direct-file reload, malformed/corrupt/unsafe state, atomic replacement, stale revision, no secret projection |
| Connection | configured/catalog/ready distinction; real fixed-content stream; invalid key, quota, model, rate, network, timeout, malformed stream, unknown error; zero raw payload leakage |
| Provider attempts | SDK retry count zero; explicit attempt IDs; no silent replay after delta; controlled incomplete snapshot; hard-crash unresolved recovery; exact/unknown usage |
| Conversation | replay reconstructs normalized turns and private continuity without provider; complete final answer; model cannot create success |
| Instructions | root-to-leaf, nested activation, sibling isolation, complete snapshots, provenance, malicious rule containment, oversize pre-network block |
| Context | explicit custom limits, sourced presets, output/safety reserve, P0 must-fit, P1/P2 deterministic omission, visible ledger, estimate distinct from billing |
| List/read | containment, symlink/traversal, binary/encoding, pagination, byte/row/visit budgets, cancellation, zero writes |
| Search | pinned app-relative `rg`, hash/version/notices, fixed argv, parsed JSON, result/timeout/cancel bounds, no fallback |
| Git status | explicit compatible host Git, fixed porcelain-v2/NUL parser, scrubbed env, no prompts/hooks, dirty/rename/untracked fixtures, missing/incompatible recovery |
| TUI | complete answer, structured runtime blocks, authority strip, focus graph, palette/help, narrow/medium/wide, resize preservation, CJK/wide, long content, keyboard-only recovery |
| Headless | durable closed NDJSON only, stable structured stderr, no ANSI/prose/raw provider values, equivalent final ProductView facts |
| Packaging | full archive in empty directory, executable plus pinned `rg` plus notices, no source/node_modules dependency, Ubuntu/macOS/Windows manifest rows |
| Performance | reproducible R1 baseline, declared R2 thresholds, cold start/event/input/scroll/large-content results, failures retained, unavailable surfaces marked `not-run` |
| Review | final diff against brief/ADRs/plan, severity-ranked findings resolved or accepted, exact commands and residual claims recorded |

## Risks and mitigations

| Risk | Mitigation or stop condition |
| --- | --- |
| Official SDK or TOML parser fails Bun archive packaging | Prove Node tests plus copied Bun archive in the owning slice; replace only the boundary dependency without changing public contracts. |
| Provider dialect leaks into kernel/runtime | Contract tests reject SDK/provider fields outside `packages/providers`; add a second same-protocol DeepSeek/Kimi fixture before claiming normalization. |
| Plaintext credential leaks | Raw errors never cross the adapter; host-only fingerprint/readiness; secret canaries across every surface; fail the slice on any match. |
| Stream or continuity exceeds journal limits | Enforce complete-output caps and encoded fixtures; stop for a plan amendment rather than truncate final truth or add storage. |
| Model context limits are wrong | Presets retain source/version; custom values are explicit; catalog drift warns but never silently rewrites; P0 fit is checked pre-network. |
| Nested instructions create scope confusion | Complete snapshots, path-bound activation, sibling isolation tests, and visible provenance; repository instructions never change host authority. |
| Native tool output varies | Fixed argv/env, pinned `rg`, minimum host Git, closed parsers, malformed-output fixtures, and separate platform rows. |
| Archive growth or cold-start regression | Baseline before production, threshold formula, full archive measurement, no optimization claim without raw evidence. |
| TUI polish becomes a final horizontal batch | Every behavior slice includes its product block and recovery; Slice 7 integrates and hardens rather than inventing missing product truth. |
| Real provider credentials are unavailable | Deterministic protocol fixtures still prove code, but the support row and slice acceptance remain incomplete; do not substitute a fake claim. |

## Rollback and amendment policy

Before a public release, rollback is a normal commit reverting the scoped R2 slice while preserving R1
journals and trust state. New provider/profile files are versioned and rejected safely by R1 code. Do not
delete user configuration automatically during rollback; show a version mismatch and preserve the file.

Stop and amend this plan if evidence requires a different provider protocol, a second conversation owner,
a new persistence/attachment format, broader credential exposure, a different instruction scope, general
shell, write authority, automatic system installation, or a changed TUI authority model. Routine file
movement, smaller measured ceilings, parser details, and platform-specific test mechanics do not reopen the
owner decisions when they preserve the frozen contract.

## Explicit non-goals

- OpenAI Responses in this first slice;
- Anthropic Messages or any second provider family;
- ChatGPT/Claude consumer OAuth or copied client identities;
- shell, arbitrary argv, repository writes, AnchorEdit, diff mutation, checks, repair, verifier success;
- Docker runner or native OS sandbox claims;
- OS keychain, encrypted vault, backup/sync/import/export, secure erase, malicious-same-user hardening;
- provider-managed conversation state, model-generated compaction, periodic stream checkpoints;
- raw chain-of-thought, provider trace export, or reasoning-as-transparency claims;
- automatic installation of Git or ripgrep;
- signed installers, upgrades, package-manager publication, or general release support.

## Human approval

The owner approved this plan, the decision brief, ADR 0013, ADR 0014, and the `SPEC.md`/`CONTEXT.md`
changes as one Freeze packet on 2026-07-19. The owner explicitly limited this session to committing and
publishing the Freeze documents, so Build remains not started. A fresh session must revalidate live state
and receive current execution authority before implementation begins.

When Build is authorized, approval covers continuous execution through Slice 8 and its automated/single-
agent Review. It does not authorize release or external publication beyond authority separately granted in
the active collaboration.

After approval, do not pause between slices merely to repeat the accepted decision. Pause only for a stop
condition above, missing external credentials required for a claimed matching-surface row, evidence that
invalidates an architecture or public contract, or a new authority request.

# R2 Freeze Decision Brief

- Status: Approved
- Date: 2026-07-19
- Roadmap stage: R2, Usable Minimal Coding Product
- Baseline: `326e1c3ca8674b44710089cb8f6c6a64e5154716`
- Decision source: dependency-ordered owner review completed on 2026-07-19
- Approved: 2026-07-19
- Implementation status: not started; the owner requested publication only in this session

## Decision requested

Approve the first R2 vertical slice as one product increment: real provider onboarding plus bounded,
read-only repository understanding through the existing journal-authoritative runtime and Bun/OpenTUI
surface.

Approval covers the decisions and test seams in this brief, ADR 0013, ADR 0014, and
`docs/plans/2026-07-19-r2-provider-onboarding-repository-understanding.md`. It does not approve a second
provider family, a general shell, repository writes, Docker execution, or a release-support claim.

## User-visible outcome

A user can create, inspect, update, select, and delete a local provider profile; run an explicit connection
check; trust a repository; ask one repository-understanding question; watch the selected model use bounded
list, read, search, or Git-status tools; and receive a complete final answer with visible source provenance
and recovery actions.

The main TUI reading flow remains conversational. Structured provider, context, model-step, tool, progress,
error, and recovery blocks appear between turns. A persistent authority strip keeps workspace trust,
profile, model, network, tool authority, and budget truth outside ordinary chat content. Tool activity and
provider-supplied reasoning summaries may fold independently; the complete final answer may not be replaced
by a progress summary.

## Current repository evidence

- R1 already proves one deterministic fake-model task through closed contracts, a pure kernel, JSONL
  journal, effect reconciliation, replay, `AgentClient`, headless NDJSON, and Bun/OpenTUI.
- `packages/providers` currently exposes only a closed fake request/response and one `ModelDriver.complete`
  call. No SDK, streaming union, tool-call normalization, usage, or provider error taxonomy exists.
- `packages/coding-runtime/src/context`, `profiles`, and `tools` contain placeholder types rather than
  behavior. This is an opportunity to add the smallest closed contracts without migrating a competing
  implementation.
- Restricted workspace mode already prevents repository reads, instruction discovery, process execution,
  network access, run creation, and effect dispatch. R2 must preserve that gate.
- Journal v1 bounds one record to 64 KiB and one run to 1 MiB/4096 records. Raw SDK chunks, unbounded tool
  output, and complete provider response objects therefore cannot become journal facts.
- ADR 0003 already selects hierarchical `AGENTS.md`; ADR 0005 requires a product-quality terminal surface;
  ADR 0006 requires one runtime behind all surfaces; ADR 0008 keeps Bun/OpenTUI inside `apps/eden`.

## Accepted decision set

The owner accepted the following dependency-ordered choices during Explore. They become Build input only
after this public Freeze packet is approved.

| ID | Accepted decision | Frozen consequence |
| --- | --- | --- |
| D1 | OpenAI SDK family, Chat Completions-compatible first | The first wire adapter uses the official low-level SDK inside `packages/providers`; OpenAI Responses is a separate later R2 protocol slice. |
| D2 | Eden owns the loop | No provider SDK, agent framework, provider conversation, or renderer owns multi-step control, policy, tools, journal, or completion authority. |
| D3 | Host-side `config.toml` CRUD | Profiles and credentials live outside the workspace; local CRUD is supported without an R2 keychain claim. |
| D4 | Explicit profile and credential source | `config.toml` is the only authority. A profile uses one inline secret or one explicitly named host environment reference; ambient SDK variables and workspace `.env` files are ignored. |
| D5 | Subscription-plan API keys, not consumer OAuth | DeepSeek is the first pay-as-you-go row and Kimi Code the first subscription-key row on the same adapter. ChatGPT and Claude consumer subscriptions are unsupported without vendor authorization. |
| D6 | Eden-owned conversation state | Chat Completions requests are rebuilt from durable normalized local facts. Provider-managed conversation state is not required for replay or recovery. |
| D7 | Typed live stream plus atomic terminal observation | Coalesced visible deltas are live-only. A complete assistant answer/tool call becomes durable only after protocol-complete decode; controlled interruption may write one bounded incomplete snapshot. |
| D8 | Private continuity lane | Required reasoning/tool continuity is durable, closed, bounded, and hidden from normal product copy. Supported provider summaries may fold; readable provider reasoning text is explicit opt-in and off by default. |
| D9 | Eden-owned attempt ledger | SDK retries are disabled. Ambiguous or post-chunk failures are not silently replayed; missing usage remains `unknown`. |
| D10 | Staged connection evidence | `configured`, `catalog_reachable`, and `completion_ready` are distinct. Only an explicit, minimally billable streamed completion probe establishes `completion_ready`. |
| D11 | Closed error normalization | Raw provider bodies, messages, headers, URLs, SDK objects, and credentials never leave the adapter boundary; product and diagnostics receive allowlisted Eden fields. |
| D12 | Four semantic repository tools | The model receives only list, bounded read, search, and Git status. It cannot supply an executable, argv, cwd, environment, or shell text. |
| D13 | Pinned ripgrep plus compatible host Git | Release archives carry an application-local pinned `rg`; Git is probed from the host. Missing Git blocks with installation guidance; Eden does not install system packages or use a fallback engine. |
| D14 | Scoped `AGENTS.md` activation | Startup loads trusted-root-to-cwd instructions; repository content activates applicable nested chains before entering context. Complete snapshots retain source, scope, hash, order, and reason. |
| D15 | Explicit custom-model limits and invariant-first budgeting | Presets own sourced limits. Custom endpoints require context-window and maximum-output values. Output/safety headroom is reserved before P0-P2 elastic input allocation. |
| D16 | Conversation-centered TUI with authority outside chat | Complete final answers own the primary reading flow; structured runtime blocks, persistent authority, contextual review, responsive layout, and keyboard truth prevent a chat-only state model. |
| D17 | Trusted host before Docker | The first slice uses closed read-only host adapters and makes no isolation claim. Later R2 slices prove policy and approval before Docker becomes an R2 exit gate. |

## Evidence behind the boundary

### Provider and subscription access

The official OpenAI JavaScript SDK supports custom base URLs, streaming, cancellation, and Bun, but a
custom transport endpoint does not prove Responses compatibility. DeepSeek documents Chat Completions and
models-list endpoints, while Kimi Code documents OpenAI-compatible profiles and subscription-created API
keys. The first adapter therefore freezes one Chat Completions-compatible protocol instead of treating all
OpenAI-shaped endpoints as interchangeable.

ChatGPT and OpenAI Platform billing remain separate. No public contract authorizes Eden to reuse Codex's
OAuth client identity or backend. Anthropic also requires authorization for third-party Claude consumer
login. Those paths remain in `docs/future-works/provider-access-and-subscription-evolution.md`.

Primary references:

- <https://github.com/openai/openai-node>
- <https://api-docs.deepseek.com/api/create-chat-completion/>
- <https://api-docs.deepseek.com/api/list-models>
- <https://platform.kimi.ai/docs/api/overview>
- <https://moonshotai.github.io/kimi-code/en/configuration/providers.html>

### Connection, errors, and usage

A credential-presence check or successful models-list request cannot prove that the selected model accepts
the selected completion protocol. The explicit connection action therefore sends fixed non-repository
content with no instructions or tools, a small output cap, streaming enabled, and SDK retries disabled.
The UI warns that the check sends fixed content and may incur a small charge.

DeepSeek documents distinct authentication, balance, validation, rate-limit, internal, and overloaded
errors. Eden maps provider-specific values to a closed taxonomy and retains only bounded request identity,
status family, retry hint, profile/model identity, and timestamps. Usage is exact only when the protocol
actually reports it.

Primary references:

- <https://platform.openai.com/docs/api-reference/models/object>
- <https://platform.openai.com/docs/api-reference/debugging-requests>
- <https://api-docs.deepseek.com/quick_start/error_codes>
- <https://platform.kimi.ai/docs/api/errors>

### Streaming and durable truth

Chat Completions text and tool-call arguments arrive as deltas; usage may arrive only near stream
termination. DeepSeek and Kimi reasoning modes may also require provider-specific continuity on a later
tool-call turn. Raw deltas are neither complete assistant messages nor executable tool calls.

Eden therefore exposes typed, coalesced live text separately from durable `ProductEvent` and journal facts.
It atomically commits a closed terminal model observation after complete protocol termination. Tool-call
arguments must be fully assembled and schema-valid before dispatch. A retry starts a new explicit attempt
from the last committed turn and never appends output to an interrupted stream.

Primary references:

- <https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events>
- <https://developers.openai.com/api/docs/guides/function-calling#streaming>
- <https://api-docs.deepseek.com/guides/thinking_mode/>
- <https://platform.kimi.ai/docs/guide/use-kimi-api-to-complete-tool-calls>

### Repository tools, instructions, and context

The semantic facade keeps model authority independent from native implementation. Search uses a fixed
`rg --json` shape and Git status uses `git status --porcelain=v2 -z`; adapters parse both into closed Eden
values. The pinned ripgrep acquisition and host Git minimum version remain release evidence rather than
model-visible behavior.

Nested `AGENTS.md` files apply by path scope. Eden loads the initial root chain and activates a deeper
chain before the corresponding repository content can enter model context. Applicable instructions that
cannot be read completely or fit the hard P0 budget block before network access; Eden does not silently
cut an instruction file in the middle.

OpenAI-compatible models-list responses do not provide one portable context-window schema. Known presets
therefore carry sourced limits; a custom endpoint must declare `context_window_tokens` and
`max_output_tokens`. The context assembler reserves output and estimation safety first, then protects
system/provider invariants, current task, workspace identity, tool schemas, applicable instructions, and
continuity before elastic recent history and supporting evidence.

Primary references:

- <https://github.com/microsoft/vscode-ripgrep>
- <https://agents.md/>
- <https://moonshotai.github.io/kimi-code/en/configuration/config-files.html>

## Frozen non-goals for the first slice

- OpenAI Responses, Anthropic Messages, a second provider family, or provider-managed conversation state;
- ChatGPT, Claude, GLM, or MiniMax consumer-account OAuth;
- model-generated shell, arbitrary argv, repository writes, AnchorEdit, diff mutation, checks, or success;
- Docker execution, native operating-system sandboxing, or a claim that trusted-host policy is isolation;
- OS keychain, encrypted vault, credential backup/sync/import/export, malicious-same-user protection, or
  secure deletion;
- model-generated compaction, periodic durable stream checkpoints, raw chain-of-thought, or provider trace
  export;
- automatic system installation of ripgrep or Git;
- release, signing, installer, package-manager publication, or general platform-support claims.

## Plan-derived values, not new owner decisions

The implementation plan may derive exact byte, item, model-step, timeout, reserve, viewport, latency, and
minimum-version values from the existing journal envelope, deterministic fixtures, reproducible R1
baseline, and official provider/tool contracts. It may not silently change any accepted authority,
credential, persistence, TUI, or non-goal boundary above.

If measurement shows that the first slice cannot fit within the current 64 KiB record or 1 MiB run budget,
the implementation must stop and propose a visible plan amendment. It may not add an attachment store,
truncate a complete final answer, or weaken replay guarantees as an implementation convenience.

## Approval and stop conditions

The owner approved this brief, ADR 0013, ADR 0014, and the executable plan on 2026-07-19. The approval makes
the first R2 slice eligible for Build, but the owner explicitly limited this session to publication. A fresh
session must revalidate repository state and receive current execution authority before starting Build.

Once Build is authorized, it proceeds continuously through the accepted RED/GREEN/REFACTOR/VERIFY slices.
Stop only when new
evidence changes a public contract or architecture decision, a required real-provider/vendor assumption is
false, the current persistence budgets cannot support the accepted complete-output contract, or authority
outside this packet is required.

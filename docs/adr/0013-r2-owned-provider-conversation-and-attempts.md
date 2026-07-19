# ADR 0013: Own R2 Provider Conversation and Attempts

- Status: Accepted
- Date: 2026-07-19

## Context

R1 proves one deterministic fake-model effect through the journal-authoritative runtime. R2 needs one real
provider without transferring Eden's loop, context, retry, recovery, or product-state authority to an SDK
or hosted conversation.

OpenAI-compatible endpoints do not implement one uniform protocol. DeepSeek and Kimi expose Chat
Completions-compatible paths, while OpenAI Responses has a different event and continuation model. A
custom `baseURL` on the OpenAI SDK proves transport configurability, not Responses compatibility.

Provider credentials are an especially narrow host asset. R2 must support useful local onboarding without
placing a secret in the workspace, prompt, tool environment, journal, product event, diagnostic, or
renderer. ChatGPT and Claude consumer subscriptions also lack a public third-party contract that Eden may
reuse merely because other tools contain product-specific OAuth clients.

Streaming introduces a second ownership problem. Text, tool-call arguments, finish reasons, usage, and
reasoning continuity may arrive in separate deltas. The SDK may retry requests before Eden can observe an
attempt. Neither a raw delta nor an SDK retry can become authoritative run history by accident.

## Decision

The first R2 provider path uses the official OpenAI JavaScript SDK only inside `packages/providers` and
implements an explicit Chat Completions-compatible adapter. The SDK normalizes one model step. It does not
own multi-step control, tools, policy, journal, verification, or terminal success. OpenAI Responses is a
separate later R2 protocol slice with its own contract tests.

Eden owns the durable normalized conversation. Each provider request is assembled from local journal facts
and bounded context. Provider conversation IDs or `previous_response_id` values are not required for
replay, inspection, or recovery. Required protocol continuity is stored as a closed, versioned, private
Eden envelope and rehydrated only by the matching adapter.

The adapter exposes two distinct outputs:

1. typed, coalesced, live-only visible deltas associated with one run, model step, attempt, output index,
   and offset;
2. one terminal closed observation after complete protocol termination and validation.

Live deltas are not journal or `ProductEvent` facts and do not enter later context. A complete terminal
observation may contain a full final answer, complete schema-valid tool calls, finish status, exact usage
when received, sanitized request identity, and bounded private continuity. A controlled interruption may
commit one explicitly incomplete, bounded visible-text snapshot; it may not contain partial tool arguments,
reported usage, or reusable continuity, and it never enters later model context. Hard-crash live text is not
recoverable in this slice.

The OpenAI SDK runs with request retries disabled. Eden records one stable effect identity and explicit
attempt identities. Only a proven `not_started` and retryable outcome may create an automatic attempt inside
the accepted budget. A failure after any application delta, an interrupted connection, or another
ambiguous outcome becomes visible `interrupted` or `unknown` and requires an explicit user retry. Missing
usage is `unknown`, never zero or an estimated billing fact.

Provider profiles live in one versioned host-side `config.toml` under the Eden state root, outside the
workspace. `config.toml` is the only profile authority. A profile declares one protocol, base URL, model,
context window, maximum output, billing-source label, and exactly one credential source: an inline local
secret or an explicitly named host environment variable. Eden does not auto-discover provider variables,
SDK defaults, workspace `.env` files, or raw secrets on command lines. Local create, masked read, update,
selection, and delete are part of R2; keychains, vaults, sync, import/export, and secure deletion are not.

DeepSeek is the first pay-as-you-go matching-surface profile. Kimi Code is the first subscription-plan
API-key profile on the same adapter. Eden does not claim ChatGPT or Claude consumer-subscription access and
does not copy another product's OAuth client identity.

Connection state is evidence-layered:

- `configured`: the profile and credential reference resolve locally;
- `catalog_reachable`: an optional model-catalog request succeeds where supported;
- `completion_ready`: an explicit fixed-content, no-tool, minimally billable streamed completion for the
  selected profile and model terminates successfully through the selected adapter.

The product explains that the completion check sends fixed content and may incur a small charge. A profile
may remain saved and editable while unverified, but a real repository run cannot begin until
`completion_ready` is current for that profile revision.

All adapter failures map to a closed Eden taxonomy with allowlisted fields. Raw provider bodies, messages,
headers, complete URLs, SDK values, account identifiers, and credentials never cross the provider boundary.
Sanitized request identity, retry hints, status family, profile/model identity, and timestamps are permitted
only after schema and size validation.

## Rejected alternatives

- **Responses-first:** excludes current Chat Completions-compatible provider targets and conflates a custom
  OpenAI transport with Responses compatibility.
- **Provider-managed conversation:** makes replay and recovery depend on hosted state, retention, and account
  availability.
- **Provider-neutral agent framework:** hides the exact stream, retry, continuity, usage, and error boundaries
  that R2 must prove while competing with Eden's loop ownership.
- **Ambient environment precedence:** lets shell state silently change endpoint, identity, and billing source.
- **Credential or models-list equals connected:** produces false-positive readiness for a missing model,
  incompatible protocol, or blocked account.
- **SDK-owned retry:** creates unjournaled model attempts and ambiguous billing/recovery evidence.
- **Persist every delta:** leaks provider wire unions into the journal and exceeds existing record budgets.
- **Consumer OAuth by client imitation:** technical reachability is not vendor authorization or a support
  contract.

## Consequences

Eden gains one explainable provider boundary, locally replayable conversation, explicit attempt ownership,
and a connection state that users can trust. The same adapter can test DeepSeek and Kimi configuration
without claiming a second provider family.

R2 must implement a host config store, safe local CRUD, stream aggregation, closed errors, attempt and
continuity schemas, negative secret-canary tests, and real provider matching-surface rows. Requests may be
larger than provider-managed conversation requests. Ambiguous failures require more user intervention than
an SDK that silently retries.

Plaintext local configuration is accessible to the same operating-system account and may be copied by
external backup software. R2 makes that limitation visible and does not claim protection from a malicious
same-user process.

Changing the first protocol, conversation authority, credential authority, retry owner, durable streaming
boundary, or supported subscription class requires a new ADR or a visible amendment before implementation.

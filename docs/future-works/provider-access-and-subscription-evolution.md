# Provider Access and Subscription Evolution

## Status

Deferred beyond the accepted R2 provider-access boundary. This record does not approve an adapter,
credential flow, provider preset, or public support claim.

## Current boundary under Freeze

R2 starts with the official OpenAI SDK contained inside `packages/providers` and an explicit
OpenAI Chat Completions-compatible protocol adapter. A host-side `config.toml` provides the selected
profile, protocol, base URL, model, and credential without exposing provider-specific values outside the
provider boundary.

DeepSeek V4 is the first pay-as-you-go matching-surface row. Kimi Code is the first subscription-plan row
on the same adapter, using its documented OpenAI-compatible endpoint and a user-created subscription key.
This proves configurable compatible endpoints and subscription-plan API keys without claiming a second
provider family.

OpenAI Responses remains a separate later R2 protocol slice. ChatGPT and Claude consumer subscriptions are
not supported by the accepted R2 boundary. Product and onboarding copy may identify ChatGPT subscription
access as conditional future work, but must not imply that a ChatGPT plan funds OpenAI Platform API calls or
that Eden is authorized to reuse the Codex backend.

## Deferred problems

- ChatGPT subscription access through an OpenAI-authorized OAuth client and documented Codex backend
  contract for Eden;
- Claude subscription access after explicit Anthropic approval for third-party `claude.ai` authentication
  and subscription rate limits;
- an official GLM Coding Plan preset after Z.AI or Zhipu confirms that Eden is within its supported-tool
  policy;
- a MiniMax Token Plan preset after the required compatible protocol is part of Eden's accepted provider
  boundary and verified against current vendor documentation;
- additional provider families, including an Anthropic Messages adapter, selected only after the R2
  normalized contract has evidence against the first real protocols;
- multi-account OAuth, credential rotation, imported tokens, provider brokers, and automatic account
  failover;
- hosted gateways or provider aggregators whose data retention, identity, billing, and failure semantics
  differ from direct provider access.

## Current non-claims

- A configurable `base_url` does not make OpenAI Responses compatible with every OpenAI-compatible service.
- A ChatGPT, Claude, Kimi, GLM, or MiniMax consumer subscription is not interchangeable with a normal
  platform API account.
- Source-visible OAuth client IDs, private headers, or token import formats are not authorization for Eden
  to impersonate another official client.
- A technically compatible endpoint is not an officially supported Eden preset until its vendor contract
  permits Eden's use and matching-surface evidence passes.

## Cost of deferral

Users cannot initially spend ChatGPT or Claude consumer-subscription allowance through Eden. GLM and
MiniMax users may need a custom profile or a later adapter instead of a first-party preset. Eden also gives
up the convenience of multi-account login and automatic quota rotation while preserving a support contract
that can be explained and independently verified.

## Decision triggers

Re-enter Explore when one of these becomes true:

- OpenAI publishes a third-party OAuth registration path or explicitly authorizes Eden to use ChatGPT
  subscription access;
- Anthropic approves Eden for third-party Claude subscription authentication;
- Z.AI, Zhipu, or MiniMax confirms Eden's supported-tool status and protocol contract;
- the accepted R2 normalized provider contract and OpenAI Responses slice pass their release evidence;
- user evidence shows that another provider family or subscription plan has higher value than the planned
  R2 work;
- a provider changes endpoint, model, quota, retention, or authentication semantics in a way that invalidates
  an existing support claim.

## Viable architecture families

1. Subscription-plan API keys: provider-specific presets over an already accepted protocol adapter, with
   explicit billing-source metadata and connection diagnostics.
2. Vendor-authorized OAuth: Eden registers its own client, stores refreshable credentials through the
   host-side credential owner, and uses only documented endpoints, scopes, and identity headers.
3. Additional direct API adapters: each official SDK stays within `packages/providers` and normalizes one
   model step without taking ownership of Eden's loop, tools, context, or journal.
4. Official external runtime integration: considered only if a user story justifies delegating execution to
   a vendor runtime and the resulting boundary does not get presented as the Eden-owned loop.

## Required evidence before changing claims

- a primary vendor contract that covers Eden's authentication method, endpoint, client identity, billing
  source, intended workload, and redistribution model;
- redacted matching-surface scenarios for login or key creation, refresh or replacement, connection check,
  normal completion, tool call, streaming interruption, quota exhaustion, revocation, and logout or delete;
- protocol contract tests proving provider SDK objects, private headers, raw errors, and credential values do
  not escape `packages/providers`;
- secret canaries across prompts, tool environments, journals, product events, TUI copy, logs, diagnostics,
  crash reports, and packaged artifacts;
- truthful capability rows distinguishing pay-as-you-go API keys, subscription-plan API keys, consumer OAuth,
  and unsupported or conditional access;
- vendor-current model, endpoint, retention, pricing, and quota evidence at release time.

# ADR 0014: Use Scoped Semantic Repository Context in R2

- Status: Accepted
- Date: 2026-07-19

## Context

The first R2 user story needs repository understanding without granting a model a general shell or write
authority. Pure TypeScript search would duplicate mature native engines, while exposing raw `rg` or Git
arguments would make executable selection, flags, cwd, environment, output parsing, and platform behavior
part of the model contract.

Repository content and instructions are untrusted. ADR 0003 already chooses hierarchical `AGENTS.md`, but
R2 must define when nested instructions apply, how their provenance survives replay, and what happens when
they do not fit. A root-only load misses subproject rules; a whole-repository load mixes unrelated sibling
scopes.

OpenAI-compatible model catalogs do not provide one reliable context-window schema. Guessing limits for a
custom endpoint can either exceed the real model or waste most of its window. Fixed percentage partitions
also cannot express which inputs are correctness invariants.

## Decision

The model receives exactly four closed semantic tools in the first slice:

- `list_files`;
- `read_file`;
- `search_repository`;
- `git_status`.

The model cannot choose an executable, argv, cwd, environment, shell, output parser, or fallback engine.
Every result has distinct bounded model content, product data, and internal diagnostics. The runtime owns
canonical workspace containment, path and symlink checks, item/byte/time budgets, cancellation, native
process lifetime, and durable result attribution.

`search_repository` invokes one application-local, pinned ripgrep binary through a fixed `rg --json`
shape. Release archives carry the binary and third-party notices beside `eden`; runtime never searches the
host `PATH` for an alternative ripgrep and never downloads one on first run. Build-time acquisition may use
the platform package layout from `@vscode/ripgrep`, but the application contract is the verified archive
asset, not that package's runtime API.

`git_status` invokes a compatible host Git through a fixed `git status --porcelain=v2 -z` shape with hooks,
pagers, editors, credential prompting, and unrestricted environment disabled. Startup or workspace attach
probes the binary and minimum version. Missing or incompatible Git produces a structured blocked
prerequisite with official installation guidance and recheck. Eden does not install system packages and
does not substitute a JavaScript Git implementation.

The first slice runs these read-only adapters on the trusted host and presents the exact policy-only,
non-isolation truth. Later R2 slices add closed command/check templates and approval evidence before the
same semantic capability enters Docker. Docker remains an R2 exit gate; trusted-host policy must never be
displayed as sandbox isolation.

Instruction discovery is scope-aware:

1. after exact workspace trust, startup loads the complete `AGENTS.md` chain from canonical trusted root to
   selected cwd;
2. before repository content from a deeper path enters model context, runtime resolves and activates that
   path's applicable root-to-leaf chain;
3. a repository-wide result groups paths by instruction scope and activates each applicable chain before
   the associated content is used;
4. sibling subtree rules remain scoped and do not become global by load order.

R2 recognizes only `AGENTS.md` inside the trusted root. It does not load remote instruction URLs,
`CLAUDE.md`, fallback names, overrides, or files above the trusted root. Each actually used instruction is
stored as a complete bounded snapshot with relative source path, scope root, content hash, precedence,
selection reason, and activated context-item identities. Unreadable, conflicting, individually oversized,
or aggregate-over-budget applicable instructions block before provider network access. Eden does not
silently omit or cut an applicable instruction file in the middle.

Known model presets carry sourced, versioned `context_window_tokens` and `max_output_tokens`. A custom
`base_url + model` profile must explicitly declare both positive values and records their provenance as
user configuration. A custom base URL does not inherit limits merely because its model ID matches an Eden
preset. Catalog metadata may produce a drift warning but cannot silently rewrite the profile.

Context allocation reserves output headroom and tokenizer/wrapper safety before input selection. The
remaining pool is elastic rather than percentage-partitioned:

- P0, non-evictable: provider/system contract, current user task, exact workspace/trust identity, enabled
  tool schemas, applicable complete instruction chains, and continuity required for the current attempt;
- P1: current and recent turns plus current tool observations;
- P2: older conversation, supporting evidence, and summaries.

If P0 does not fit, the run blocks before network access. P1 and P2 use deterministic selection, bounded
tool-result pagination or omission, and an explicit provenance ledger. The first slice does not require
model-generated compaction. Token estimates guide selection but never become provider billing usage.

## Rejected alternatives

- **Pure TypeScript search or Git:** duplicates mature native behavior and performs worse without improving
  model authority.
- **Raw allowlisted native commands:** exposes provider/model-controlled argv and makes platform command
  text the public tool contract.
- **Restricted general shell:** approval cannot prove that shell text is read-only, contained, or free of
  child-process and network effects.
- **Automatic system installation:** no trustworthy TypeScript library removes package-manager, elevation,
  proxy, rollback, and partial-success responsibilities across supported systems.
- **Portable Git in every archive:** greatly expands artifact size, credential-helper behavior, licensing,
  CVE, and update ownership for a read-only status requirement.
- **All instructions at startup:** mixes unrelated monorepo scopes and consumes context before relevance is
  known.
- **Root-to-cwd only:** misses nested rules for content read later.
- **Default custom-model limits:** turns an unverified guess into a safety and availability decision.
- **Fixed percentage context partitions:** wastes capacity and can evict correctness-critical inputs.
- **Provider overflow recovery:** discovers budget failure after a potentially billable attempt and invites
  silent truncation or ambiguous retry.

## Consequences

The semantic model contract stays small, structured, replaceable, and compatible with a later Docker
runner. Search performance is reproducible through a pinned binary; Git behavior remains aligned with the
user's host repository while retaining explicit minimum-version evidence.

The release artifact changes from one bare executable to a platform archive containing `eden`, pinned
`rg`, and notices. Clean-machine evidence must copy and exercise the complete archive layout. A machine
without compatible Git can onboard and edit provider profiles but cannot complete the repository
understanding story.

Context assembly becomes a first-class runtime module coupled to semantic content admission. The project
must test nested scope, sibling isolation, complete snapshots, malicious instructions, budget failure,
selection provenance, and no-network-before-P0-fit behavior.

General model-authored shell, stronger credential storage, periodic streaming checkpoints, and broader
provider access remain in `docs/future-works/` and cannot be pulled into this slice as fallbacks.

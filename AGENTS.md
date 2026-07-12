# Agent Instructions

This repository is the public, English-only source of truth for eden-agent.

## Start here

1. Read `CONTEXT.md` for the current project state.
2. Read `WORKFLOW.md` before planning or implementation.
3. Read `PRODUCT.md` and `SPEC.md` before changing product behavior.
4. Follow the nearest nested `AGENTS.md` if one is added later.

## Source-of-truth order

When documents disagree, use this order:

1. accepted ADRs and the current `SPEC.md`;
2. `PRODUCT.md` and focused architecture documents;
3. an approved plan in `docs/plans/`;
4. `docs/research/initial-research.md`;
5. external references.

Research explains why the project exists; it does not silently override accepted decisions.

## Repository rules

- Write all repository content, code, comments, issues, and commit messages in English.
- Keep the kernel deterministic and free of real I/O.
- Put provider, terminal, filesystem, and process behavior behind explicit ports.
- Keep product events distinct from internal kernel events.
- Never let model output declare a run successful; the verifier owns success.
- Preserve user changes and treat dirty worktrees as normal input.
- Do not introduce Rust, a daemon, a desktop shell, subagents, or a second provider without the corresponding architecture gate.
- Prefer the smallest vertical slice that produces user-visible evidence.

## Comments

- Default to no comment. Use names, types, and module interfaces to explain ordinary code.
- Add `//` comments only for non-obvious invariants, causal constraints, failure modes, compatibility or platform quirks, and measured performance decisions. Explain why the constraint exists and what would fail without it.
- Use TSDoc only when an exported contract has lifecycle, ownership, ordering, failure, security, or performance semantics that its type cannot express. An internal symbol does not need TSDoc merely because it is exported.
- Do not narrate assignments, branches, loops, signatures, or other behavior already clear from the code. Avoid section dividers and procedural comments such as `Check`, `Handle`, or `Try`.
- Link durable evidence such as an ADR, issue, specification, or benchmark when it materially explains the constraint, but keep the local invariant understandable without following the link.
- Give every TODO a removal condition. Use `TODO(#123): ...` when an issue owns the follow-up; do not leave unbounded backlog notes in source.

## Verification

- Use test-first development for behavior changes.
- Run the narrowest relevant checks while iterating, then the affected package suite.
- Run `pnpm markdown:check` for Markdown changes.
- Before claiming completion, inspect the diff and report the commands run, their results, and any unverified assumptions.

## Git

- Keep changes reviewable and scoped to one plan step.
- Do not rewrite user history or discard unrelated worktree changes.
- Do not commit generated benchmark claims without reproducible inputs and metadata.

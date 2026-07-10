# Engineering Workflow

The workflow is deliberately small: explore, freeze, build, review, and finish. Skills and plugins may accelerate a phase, but they do not own project state.

## 1. Explore

Use this phase when the problem or design space is still uncertain.

- Ground the discussion in the repository, product contract, and prior ADRs.
- Generate alternatives, risks, and falsifiable assumptions.
- Time-box spikes and record what evidence would decide between options.
- Keep this phase read-only except for disposable spike artifacts.

If available, use a brainstorming skill here. OmO/LazyCodex exploration and parallel search capabilities may help gather evidence, but one owner must synthesize the result.

Exit when the decision, open questions, and required evidence are explicit.

## 2. Freeze

Convert the chosen direction into durable project state before implementation.

- Update `PRODUCT.md` or `SPEC.md` if the contract changed.
- Add or supersede an ADR for an architectural decision.
- Write an executable plan in `docs/plans/` with acceptance checks, affected files, risks, and non-goals.
- Ask the human reviewer to approve decisions that change product scope, trust boundaries, public contracts, or roadmap gates.

If available, use a writing-plans skill. Once approved, the plan is fixed input: implementation discoveries may trigger an explicit amendment, not an invisible redesign.

## 3. Build

Implement one plan slice at a time with RED, GREEN, REFACTOR.

1. Add a failing test or deterministic scenario that expresses the behavior.
2. Run it and confirm the expected failure.
3. Make the smallest production change that passes.
4. Refactor without changing behavior.
5. Run focused checks and update the plan status.

Use OmO/LazyCodex as a capability layer for search, LSP, or long-running execution. Do not run competing planners or let an automation loop broaden the approved scope. Use systematic debugging when the cause is unknown; do not patch by guesswork.

## 4. Review

Review outcomes first, then inspect the trajectory when needed.

- Compare the diff with the plan and acceptance criteria.
- Run deterministic verification and relevant regression tests.
- Check product-state projections, recovery paths, security boundaries, and documentation drift.
- Request a read-only review for non-trivial changes. Resolve findings by severity and record accepted residual risk.

No model statement, green-looking UI, or passing happy-path test is completion evidence by itself.

## 5. Finish

Before handoff or merge:

- run the affected suite and Markdown checks;
- inspect `git diff` and `git status`;
- update `CONTEXT.md`, the plan, and relevant docs;
- report exact verification results and anything not run;
- let the human perform the key-node review defined by the plan.

The optional Superpowers workflow maps cleanly to these phases: brainstorming, writing plans, test-driven development, systematic debugging, verification before completion, requesting review, and finishing a development branch.

# Engineering Workflow

The workflow is deliberately small: explore, freeze, build, review, and finish. The repository owns project state, phase exits, and human checkpoints. Agent-native tools are the default; a skill or plugin may supply one bounded capability inside a phase.

## 1. Explore

Use this phase when the problem or design space is still uncertain.

- Ground the discussion in the repository, product contract, and prior ADRs.
- Generate alternatives, risks, and falsifiable assumptions.
- Time-box spikes and record what evidence would decide between options.
- Keep this phase read-only except for disposable spike artifacts.

Use the agent's native repository inspection and research capabilities. Optional search or parallel exploration tools may gather evidence, but one owner must synthesize it. A separate brainstorming workflow is unnecessary unless the human explicitly requests a design interview.

Exit when the decision, open questions, and required evidence are explicit.

## 2. Freeze

Convert the chosen direction into durable project state before implementation.

- Update `PRODUCT.md` or `SPEC.md` if the contract changed.
- Add or supersede an ADR for an architectural decision.
- Write an executable plan in `docs/plans/` with acceptance checks, affected files, risks, and non-goals.
- Ask the human reviewer to approve decisions that change product scope, trust boundaries, public contracts, or roadmap gates.

Use the repository's plan format in `docs/plans/` and the agent's native plan tracking. Do not create a plugin-specific spec or plan tree. Once approved, the plan is fixed input: implementation discoveries may trigger an explicit amendment, not an invisible redesign.

## 3. Build

Implement one plan slice at a time with RED, GREEN, REFACTOR.

1. Add a failing test or deterministic scenario that expresses the behavior.
2. Run it and confirm the expected failure.
3. Make the smallest production change that passes.
4. Refactor without changing behavior.
5. Run focused checks and update the plan status.

The loop above is authoritative without a TDD skill. A focused TDD reference may help at test seams accepted by the plan. Use reproduction, runtime evidence, and falsifiable hypotheses when a cause is unknown; do not patch by guesswork. Optional search, LSP, or long-running execution tools remain capability layers. Do not run competing planners or let an automation loop broaden the approved scope.

## 4. Review

Review outcomes first, then inspect the trajectory when needed.

- Compare the diff with the plan and acceptance criteria.
- Run deterministic verification and relevant regression tests.
- Drive every changed user-visible surface after the automated checks. Exercise the primary flow and one relevant failure or boundary flow through the real executable, process, or interface, then record the exact invocation and observable result.
- For TUI or CLI changes, test the real keyboard or argument flow, including help and invalid input where applicable. For visual changes, inspect affected widths, resize behavior, interaction states, and CJK rendering.
- Check product-state projections, recovery paths, security boundaries, and documentation drift.
- Request a read-only diff-and-spec review for non-trivial changes when it adds evidence. Resolve findings by severity and record accepted residual risk.

No model statement, green-looking UI, or passing happy-path test is completion evidence by itself.

## 5. Finish

Before handoff or merge:

- run the affected suite and Markdown checks;
- confirm the matching-surface scenarios passed after the last relevant edit;
- inspect `git diff` and `git status`;
- update `CONTEXT.md`, the plan, and relevant docs;
- report exact automated and matching-surface verification results, produced evidence, and anything not run;
- let the human perform the key-node review defined by the plan.

## Capability model

Use three layers and stop at the lowest layer that produces sufficient evidence:

1. Project workflow and agent-native tools own phases, scope, plan tracking, editing, execution, review, and fresh verification.
2. Focused evidence tools may add code intelligence, diagnostics, documentation lookup, structural search, or surface capture without creating competing project state.
3. A process skill, multi-agent review, visual-fidelity gate, or long-running autonomous mode is an explicit escalation for a task whose risk or shape justifies the overhead.

No plugin workflow is required to complete these phases. An escalation must inherit the accepted plan, scope, budgets, checkpoints, and stop conditions. It may not add worktrees, commits, subagents, approval gates, or plan artifacts unless the plan or human explicitly requests them.

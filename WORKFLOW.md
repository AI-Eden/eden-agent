# Engineering Workflow

The workflow is deliberately small: explore, freeze, build, review, and finish. The repository owns project state, phase exits, and human checkpoints. Agent-native tools are sufficient for the default path; a focused local skill may supply one bounded capability inside a phase.

## 1. Explore

Use this phase when the problem or design space is still uncertain.

- Ground the discussion in the repository, product contract, and prior ADRs.
- Generate alternatives, risks, and falsifiable assumptions.
- Time-box spikes and record what evidence would decide between options.
- Keep this phase read-only except for disposable spike artifacts.

Use the agent's native repository inspection, search, command, and research capabilities. One agent owns evidence synthesis and the recommendation. A separate brainstorming workflow is unnecessary unless the human explicitly requests a design interview.

When the human requests a design interview, treat it as a dependency-ordered decision tree. Verify discoverable facts instead of asking for them, ask one decision question at a time, and wait for the answer before opening dependent branches. When genuine alternatives exist, present two to four viable options, compare their benefits and risks against explicit criteria, and provide a recommendation without treating it as authorization. Do not implement the direction until the human confirms shared understanding and the accepted decision reaches Freeze.

Exit when the decision, open questions, and required evidence are explicit.

## 2. Freeze

Convert the chosen direction into durable project state before implementation.

- Update `PRODUCT.md` or `SPEC.md` if the contract changed.
- Add or supersede an ADR for an architectural decision.
- Write an executable plan in `docs/plans/` with acceptance checks, affected files, risks, and non-goals.
- For every behavior slice, record the accepted test seam, observable behavior, independent expected result, permitted boundary fakes or mocks, and matching-surface scenario.
- Ask the human reviewer to approve decisions that change product scope, trust boundaries, public contracts, or roadmap gates.

Use the repository's plan format in `docs/plans/` and the agent's native plan tracking. Do not create a generic issue-backed specification or a tool-specific plan tree. Once approved, the plan is fixed input: implementation discoveries may trigger an explicit amendment, not an invisible redesign.

## 3. Build

Implement one plan slice at a time with RED, GREEN, REFACTOR.

1. Add a failing test or deterministic scenario that expresses the behavior.
2. Run it and confirm the expected failure.
3. Make the smallest production change that passes.
4. Refactor without changing behavior.
5. Run focused checks and update the plan status.

Tests exercise observable behavior through the accepted public seam. Expected results come from the specification, a worked example, or another independent source rather than reproducing the implementation. Work one vertical slice at a time, and mock only real system boundaries when a real adapter or deterministic fake is impractical.

The repository loop is authoritative without repeatedly loading a TDD skill. Load focused TDD guidance only when Freeze has not made the test seam or mocking boundary clear; approval of the plan satisfies its seam checkpoint. This repository keeps refactoring inside each behavior slice. When a bug has no confirmed cause, use a focused diagnosis loop: establish deterministic feedback, reproduce the symptom, test falsifiable hypotheses, and lock the fix with a regression test. Compiler output, tests, Biome, repository search, and an already available language server are evidence tools, not alternate workflow owners. Do not let long-running execution broaden the approved scope.

## 4. Review

Review outcomes first, then inspect the trajectory when needed.

- Compare the diff with the plan and acceptance criteria.
- Run deterministic verification and relevant regression tests.
- Drive every changed user-visible surface after the automated checks. Exercise the primary flow and one relevant failure or boundary flow through the real executable, process, or interface, then record the exact invocation and observable result.
- For TUI or CLI changes, test the real keyboard or argument flow, including help and invalid input where applicable. For visual changes, inspect affected widths, resize behavior, interaction states, and CJK rendering.
- Check product-state projections, recovery paths, security boundaries, and documentation drift.
- Perform one evidence-backed single-agent diff-and-spec review for non-trivial changes. Resolve findings by severity and record accepted residual risk.

No model statement, green-looking UI, or passing happy-path test is completion evidence by itself. Ordinary review, visual QA, and research do not require sub-agents. A critical security, trust, release, or public-contract audit may use exactly one independent read-only reviewer only when the human or approved plan explicitly authorizes its scope and cost.

## 5. Finish

Before handoff or merge:

- run the affected suite and Markdown checks;
- confirm the matching-surface scenarios passed after the last relevant edit;
- inspect `git diff` and `git status`;
- update `CONTEXT.md`, the plan, and relevant docs;
- report exact automated and matching-surface verification results, produced evidence, and anything not run;
- let the human perform the key-node review defined by the plan.

## Durable goal runs

An agent-native durable goal may span consecutive agent-owned steps, but it may not cross a human checkpoint.

Use one for either of these bounded capsules:

- an Explore spike with one research question, explicit comparison criteria, budgets, a required evidence artifact, and a stopping condition; the goal ends before the human makes the resulting product or architecture decision;
- one approved implementation milestone after Freeze and any required first-core-invariant test review, continuing through Build, automated Review, matching-surface verification, repair, and Finish preparation before stopping for the named human review.

Every goal names one objective, one verifiable stopping condition, its source documents or approved plan, non-goals, allowed capabilities, budgets, required commands or artifacts, pause conditions, a compact progress record, and the next human checkpoint. Pause when evidence invalidates the plan, a product or architecture decision is needed, authority is missing, or the goal would broaden scope. A durable goal does not authorize commits, pushes, merges, or other external writes that the human did not already request.

Use native durable-goal state directly. Do not add another ledger, worktree manager, continuation hook, planning tree, or completion authority unless the human explicitly approves that new project state.

## Resource and delegation policy

Use one capable root agent at medium or high reasoning for ordinary work. Reserve xhigh or max reasoning on the root agent for exceptional problems whose failed hypotheses or risk justify the added latency and cost.

Exploration, planning, implementation, diagnosis, review, and visual QA use zero sub-agents by default. A large read-only evidence set with genuinely independent partitions may use one or two lower-cost low/medium native sub-agents only when the human or approved plan authorizes them. A critical security, trust, release, or public-contract audit may instead authorize exactly one independent `gpt-5.6-sol-xhigh` read-only reviewer when lower-cost review is insufficient. Every authorization names the question, cost class, read-only scope, result owner, and stopping condition.

Do not delegate proactively, nest delegation, create write-capable sub-agents, or launch broad research and review teams. No sub-agent may create project plans, commits, worktrees, approval gates, or completion claims. The root agent owns synthesis and fresh verification.

## Capability model

Use three layers and stop at the lowest layer that produces sufficient evidence:

1. Repository workflow and agent-native tools own phases, scope, plan tracking, editing, execution, review, and fresh verification. No plugin is required.
2. Focused local skills and evidence tools may add test-seam guidance, diagnosis discipline, code intelligence, diagnostics, documentation lookup, structural search, or surface capture without creating competing project state. Load one only when its task-specific trigger is present.
3. A durable goal, independent review, or bounded native delegation is an explicit escalation whose risk and evidence value justify the overhead.

An escalation inherits the accepted plan, scope, budget, checkpoints, and stop conditions. It may not add worktrees, commits, sub-agents, approval gates, or plan artifacts beyond what the human or approved plan explicitly authorized. Other locally installed skills remain outside this repository's dependency and removal policy.

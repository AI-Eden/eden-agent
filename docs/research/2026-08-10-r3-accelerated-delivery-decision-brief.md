# R3 Accelerated Delivery Decision Brief

- Status: Accepted direction and Freeze packet on 2026-08-10; amended Freeze and Build approved on 2026-08-11; R3-A review recommends no acceptance after matching-provider failure
- Date: 2026-08-10
- Workflow phase: R3-A milestone checkpoint; deterministic and copied packaged evidence passed, one matching real-provider attempt failed at the explicit network retry boundary
- Roadmap stage: R3, Verified Goal Product — v0.1
- Public baseline: `56a05e492a93f54c2a95d51c8eaec387e1283b2b`
- Decision authority: the owner accepted the direction with R3-D changed to a non-blocking, time-boxed milestone, accepted the resulting Freeze packet, later accepted a bounded multi-call and durable-budget amendment after Slice 0 evidence invalidated the one-call/1 MiB assumptions, then separately approved the amended Freeze and authorized Build plus public-first commits and pushes. The owner accepted the deterministic candidate, authorized copied packaged TUI evidence, and authorized exactly one matching real-provider/network fixture; that network authority has been consumed. Any new provider attempt, package publication, release, or R3-D activation requires separate authority.

## Decision accepted

The owner accepted five named vertical milestones: a usable coding loop, a dedicated TUI product-shell reconstruction, Plan plus verified Goal, one separately activated non-blocking read-only ExploreAgent plus bounded web-tools milestone, and a packaged v0.1 release journey.

The proposal changes delivery order and the v0.1 capability gate. It does not replace Eden's product thesis, kernel architecture, trust boundaries, or verifier-owned completion model.

The 2026-08-11 amendment keeps the 12-model/16-tool/8-action policy maxima but treats them as ceilings rather than quotas: one durable per-run grant selects values at or below policy, the model may stop early or call no tool, and the final model step exposes no tools. One earlier model step may emit up to four source-ordered calls only when all are independent read-only repository tools. Runtime preflights them, consumes budget durably, runs at most four concurrently, journals actual lifecycle, and returns results in source order. Effectful or approval-bearing calls remain singleton. The R3 profile run-journal ceiling becomes 2 MiB while 64 KiB records and 4096 records remain fixed.

## Relationship to the initial research

The [Initial Research Synthesis](initial-research.md) remains the initial research baseline. Its central conclusions remain active background: Eden owns the loop, uses an event-sourced kernel, separates model statements from verifier-owned success, projects one runtime through TUI and headless surfaces, and defers the desktop product until a local-service gate.

The original roadmap expected R2 to be a broadly usable minimal coding product and deferred subagents to R7. Delivered R2 plans instead established deeper, narrower boundaries: a real OpenAI-compatible provider path, durable conversation and attempts, four bounded repository-reading tools, digest-approved modify-only AnchorEdit, Docker-isolated named repository checks, replay, recovery, responsive TUI behavior, packaging, and reference-platform evidence. Those are valuable foundations, but the current product still lacks the breadth needed for a normal coding task.

This accepted direction supersedes only the R3-plus delivery sequencing in the initial research. Accepted ADRs, `SPEC.md`, `PRODUCT.md`, focused documents, approved plans, and `CONTEXT.md` remain authoritative and must be updated through Freeze before implementation begins.

## Evidence behind the change

| Area | Current evidence | Product gap |
| --- | --- | --- |
| Model loop | One real DeepSeek repository-matching path completed with durable attempts, one repository search, replay, and bounded usage | The runtime permits only a narrow number of model and tool steps and has not proved a normal edit-test-repair journey |
| Repository tools | Bounded list, read, search, Git status, AnchorEdit, Git review, and one named Docker repository check exist | The model lacks general policy-controlled command execution, model-visible Git diff, and new-file creation |
| Completion | `completed` review and deterministic named checks exist | GoalSpec-driven required checks, bounded repair, and verifier-owned `succeeded` are not implemented |
| Product modes | Plan, Goal, verification, and subagent skeleton types exist | No durable lifecycle or user journey exists for those modes |
| TUI | OpenTUI, responsive layouts, focus, palette, history, streaming, approval, and recovery paths exist | The surface remains an R2 evidence-oriented composition rather than a mature daily coding workspace |
| Web | Provider network authority is explicit | No web search/fetch tools, source projection, or independent web policy exists |

## Decisions that remain unchanged

- Eden owns model-tool orchestration, task convergence, policy, approval, journal, replay, and completion authority.
- The deterministic kernel performs no real I/O; provider, filesystem, process, terminal, and network behavior remain behind explicit ports.
- Explore, Plan, Build, Goal, and Review remain profiles over one runtime rather than separate runtime implementations.
- A model may propose a completion candidate but may not emit `succeeded`; deterministic required checks own success.
- Child capabilities inherit and narrow parent authority; they never expand it.
- OpenTUI remains the R3 renderer. The TUI reconstruction does not authorize a renderer rewrite or a second product state machine.
- The TUI and headless CLI consume the same contracts and runtime truth.
- Desktop, a local service, broad ecosystem compatibility, and large multi-agent systems remain outside the resume-ready critical path.

## Proposed R3 delivery sequence

### R3-A: Usable Coding Loop

Deliver the smallest real-provider loop that can read a repository through bounded multi-call batches, modify an existing file or create a new one through singleton approved effects, run a policy-controlled command or named check, inspect the resulting diff, receive structured failures, and continue within durable policy/grant/usage budgets.

Required capability additions are model-visible `git_diff`, policy-controlled `run_command`, and `write_file` limited to new files. Existing files continue to use AnchorEdit. Command requests must bind exact argv, cwd, scrubbed environment, timeout, output limits, network posture, policy decision, and approval where required.

Acceptance requires one deterministic fixture and one matching-provider journey through read, edit or create, command or check, diff inspection, and a final `completed` answer. This milestone does not authorize verifier-owned `succeeded`.

### R3-B: TUI Product Shell Reconstruction

Reconstruct the TUI immediately after the usable loop and before the complete Plan and Goal implementation. The usable loop supplies real product states; the early reconstruction prevents later features from expanding the current monolithic evidence layout.

The round owns a composable app shell, session navigation, transcript, persistent multiline composer, status and authority bar, contextual review drawer, overlays, a semantic design-token system, a tool-card registry, streaming and queued input, slash commands, command palette, predictable keyboard focus, and narrow/medium/wide layouts. Plan, verification, child-agent, and web cards must fit the same product composition as they arrive.

OpenTUI, AgentClient, ProductView, journal truth, and the existing PTY evidence seams remain in place. Acceptance uses the real executable and covers provider onboarding, a repository task, streamed tools, approval, changed files and diff, recovery, final answer, resize, CJK paste, and representative output volume.

### R3-C: Plan and Verified Goal

Deliver a read-oriented Plan profile that writes only a session-local PlanArtifact, supports review/revise/approve, and offers explicit execution-context choices. Deliver GoalSpec, required checks, verifier-owned success, bounded repair, checkpoint and rollback semantics, durable approval and resume, and an Evidence Pack projected from durable facts.

Acceptance requires a failed required check to prevent success, feed bounded evidence into one repair cycle, and reach `succeeded` only after the verifier passes all required checks. Process interruption must resume from committed state without repeating an already committed side effect.

### R3-D: Read-only ExploreAgent and Web Tools (Non-blocking)

If separately activated after R3-C, deliver exactly one read-only ExploreAgent. It receives a self-contained assignment, scoped repository reference, independent context and child journal, explicit budgets, cancellable lifecycle, and inherited-but-narrowed capabilities. It returns structured findings with paths, optional lines, evidence, and unknowns.

Deliver `web_search` and `web_fetch` through one explicit adapter rather than a custom search engine. Both tools require independent network policy, time and content bounds, redaction, and source URL/title projection. Retrieved content is evidence, not trusted instruction.

Acceptance requires a parent Plan or Goal run to obtain one bounded child exploration result and one source-backed web result without granting child or web execution broader repository, write, command, secret, or network authority.

R3-D requires a separate owner activation checkpoint after R3-C. It may land before or after R3-E, but skipping or deferring it does not block the first verified patch or the resume-ready release claim. Until it is implemented and evidenced, release, README, demo, and resume claims must omit ExploreAgent and web capability.

### R3-E: Resume-ready v0.1 Release

Deliver packaging, installation, provider onboarding, first-task, resume, doctor, troubleshooting, and uninstall guidance; three reproducible product journeys; real TUI screenshots; an explicit support matrix; and a 60–90 second product demonstration.

The primary demonstration is: open a failing repository, review and approve a plan, collect bounded repository or web evidence, edit or create, run a check, observe failed verification, repair within budget, reach verifier-owned success, and inspect the diff and Evidence Pack.

Acceptance requires the owner to complete the first verified patch from public documentation and a packaged artifact on the declared reference platform. Every resume, README, and demo claim must map to implementation and reproducible evidence.

## Resume-ready capability gate

The blocking release gate includes:

- one matching-evidence real-provider path and a clear custom OpenAI-compatible profile boundary;
- a bounded model-tool loop capable of a normal coding task;
- read, list, search, status, diff, AnchorEdit, new-file write, controlled command, and named checks;
- Plan review, revision, approval, and execution;
- Goal verification, bounded repair, durable resume, and Evidence Pack;
- a coherent, usable TUI plus headless, installation, and diagnostic paths.

One read-only ExploreAgent plus `web_search` and `web_fetch` remain the accepted R3-D enhancement direction, not a release blocker. They enter capability claims only after their own implementation and matching evidence.

This gate does not require parity with OpenCode or oh-my-pi in provider count, tool count, plugins, or multi-agent breadth. Eden's product claim remains the combination of a useful terminal agent with durable approval, replay, capability discipline, and verifier-owned completion.

## Deferred work

The following work does not block R3-E:

- Eden Studio, agentd, Tauri or Electron, GUI installers, and updaters;
- a second provider protocol family or consumer-subscription authentication;
- ReviewAgent, write workers, parallel or nested subagents, and worktree fan-out;
- MCP, plugin marketplaces, ACP, and IDE adapters;
- LSP, DAP, browser or computer-use suites, and native media;
- Rust optimization, the complete Eden Lab benchmark program, and multi-trial provider comparisons;
- equal native-sandbox or Docker Desktop support claims across Linux, macOS, and Windows.

Deferred work re-enters the roadmap only after the R3-E journey is stable and the capability improves a named user story, benchmark, or portfolio claim.

## Delivery and evidence policy

The aggressive target is a four-working-week resume-ready candidate with a fifth-to-sixth-week buffer for provider, platform, packaging, and dogfood findings. This is a scheduling target, not a completion claim.

Every milestone that enters Build must end in a runnable vertical journey. Core invariants remain test-first. Reversible UI composition and routine tool wiring use focused tests and matching-surface QA without requiring a new ADR or a separate architecture interview. Unchanged R0-R2 evidence remains reusable; a full hosted matrix is repeated when an affected platform or package contract changes and at the release-candidate gate. Without separate R3-D activation, the blocking path proceeds directly from R3-C to R3-E.

## Accepted Freeze packet

Owner acceptance moved this decision into Freeze. The accepted packet:

1. update `PRODUCT.md` with the resume-ready user journey and TUI product expectations;
2. update `SPEC.md` with the minimum tools, RunProfile behavior, child-agent boundary, web authority, and completion states;
3. update focused documents or add an ADR only for durable public-contract or trust-boundary decisions that existing documents do not cover;
4. update `CONTEXT.md` with the accepted R3 sequence and active milestone;
5. create one executable, test-first plan under `docs/plans/` with R3-A through R3-E vertical slices and owner checkpoints;
6. supersede the prior R3 Explore continuity entry without treating a handoff as implementation authority.

## Owner acceptance result

The owner completed this bounded checkpoint on 2026-08-10:

1. accepted R3-A through R3-E as the dependency order, with R3-A → R3-B → R3-C → R3-E as the blocking path;
2. accepted the R3-A minimum tools and `completed` versus `succeeded` boundary, with shell-free exact argv, exclusive new-file creation, and no automatic retry after unknown process dispatch;
3. accepted R3-B as a dedicated OpenTUI product-shell reconstruction;
4. accepted exactly one read-only ExploreAgent plus `web_search` and `web_fetch` as a separately activated, non-blocking R3-D milestone;
5. accepted the R3-E public first verified patch journey as the minimum evidence behind resume-ready claims.

The accepted Freeze packet is fixed implementation input but authorizes no implementation until Build is separately approved.

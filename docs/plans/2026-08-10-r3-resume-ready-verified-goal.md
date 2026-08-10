# R3 Resume-Ready Verified Goal Plan

- Status: Amended Freeze and Build approved on 2026-08-11; R3-A milestone review pending
- Date: 2026-08-10
- Amended: 2026-08-11
- Roadmap stage: R3, Verified Goal Product - v0.1
- Baseline: `a5355322b2bedf8562f81d631a268a6764dc88ca`
- Decision brief: `docs/research/2026-08-10-r3-accelerated-delivery-decision-brief.md`
- Required ADR: `docs/adr/0019-r3-resume-ready-vertical-delivery.md`
- Blocking path: R3-A -> R3-B -> R3-C -> R3-E
- Optional milestone: R3-D after R3-C, only with separate owner activation
- Human checkpoint: review the R3-A candidate and its explicit `not-run` rows before any R3-B work

## Authority and entry conditions

The owner accepted ADR 0019, the R3 normative and focused contract changes, and this document as one Freeze packet on 2026-08-10, then separately authorized the blocking Build plan. Slice 0 exposed a plan-changing multi-call and persistence constraint, Build stopped, and the owner accepted the bounded amendment on 2026-08-11. The owner then approved the amended Freeze, freshly reauthorized Build, and authorized public-first commits and pushes. Provider or network calls, Docker execution, hosted execution, R3-D activation, image or package publication, and release publication remain separately unauthorized.

Build restarted only after that fresh authority. Its entry audit recorded and preserved the dirty Slice 0 draft and verified the public local/canonical/GitHub refs plus tutorial gitlink before the first new RED. Publication remains public repository first and tutorial gitlink second.

The first RED test for each new core invariant requires the workflow's human checkpoint before production implementation when it exposes a different authority, recovery, or completion model than this plan. Routine RED tests that instantiate an already approved seam do not create repeated approval gates.

## Goal and user-visible outcome

Deliver a packaged, resume-ready v0.1 on the declared Linux/WSL2 reference platform. A user can configure a real provider, trust one repository, review and approve a grounded plan, let Eden read, modify an existing file or exclusively create a new one, approve a shell-free structured command, inspect the diff, observe a required check fail, repair within budget, resume across one interruption, reach verifier-owned `succeeded`, and review a content-addressed Evidence Pack through the real OpenTUI product.

The blocking release claim does not require an ExploreAgent or web tools. R3-D may be activated after R3-C, but skipped work remains absent from product, README, demo, and resume claims.

## Accepted Slice 0 amendment

The first contract-budget tracer exposed two plan-changing facts before any R3 capability activation:

- The current provider and kernel accept at most one tool call per model step. A completed run with 12 model steps can therefore execute at most 11 tool calls before the final answer. Reaching the frozen 16-tool ceiling would require a new multi-call scheduling and recovery contract or a different model-step ceiling.
- Reapplying the existing R2 maximum-fixture wire shapes to four instruction records, 12 model-observation records, and 16 tool-observation records consumes 1,028,308 of the unchanged 1,048,576-byte run limit. This is an entry estimate rather than a final R3 production-record measurement because the R3 action and output schemas do not yet exist. Its remaining 20,268 bytes cannot establish that the accepted eight action proposals plus approval, dispatch, recovery, command-output, and terminal records will fit.

The 2026-08-11 amendment resolves those findings without activating any capability:

- `usable_coding_v1` keeps policy maxima of 12 model steps, 16 tool calls, and 8 action proposals but separates immutable policy, a durable per-run grant at or below policy, and monotonic usage. The model chooses tool use and may stop early; runtime limits are ceilings rather than quotas.
- One model step may contain zero to four closed tool calls. The twelfth step is final-answer-only. Only a batch composed entirely of independent read-only repository tools is eligible for concurrency, which is capped at four. Effectful or approval-bearing calls are singleton steps; mixed, dependent, unsupported-provider, oversized, or otherwise ineligible batches close without an effect and require re-planning.
- The `usable_coding_v1` run-journal ceiling becomes 2 MiB. The 64 KiB record and 4096-record limits remain unchanged. Production encoding must prove maximum records and the complete maximum run fit without truncation, duplicate output storage, or an attachment store.

At the Freeze boundary no tool, action, verifier, resume, child, or web authority had been activated. The later Build authority activated only the accepted R3-A variants; verifier, resume, child, web, R3-D, and later-milestone authority remain absent.

## R3-A Build review

The deterministic implementation candidate closes Slices 0-5 at the local code boundary: production encoders prove maximum record/run budgets; an explicitly declared provider capability gates four-call read-only batches; replay preserves source order and blocks partial unknown work; Git diff uses semantic bounded pages with hardened Git configuration; new-file creation is exclusive and recovery-derived; structured commands bind exact executable identity, literal argv, contained cwd, scrubbed environment, bounded split output, process cleanup, and unknown post-dispatch recovery; and a real temporary-Git/Node journey ends in non-success `completed` with zero-effect replay. ProductView and OpenTUI contract tests expose exact command authority, bounded command output, diff identity, and `completed` truth at the accepted narrow, medium, and wide widths.

The local milestone gate includes `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm code:check`, `pnpm markdown:check`, `git diff --check`, repository status/ref review, focused R3 contract/runtime/process/recovery tests, and the deterministic integrated journey. Provider/network use was not authorized, so the required matching-provider journey is `not-run`. A copied packaged TUI journey was not produced in this Build slice and is also `not-run`. These two rows prevent R3-A acceptance and closure; this review must stop before R3-B.

## Current repository facts

- `packages/coding-runtime/src/planning/index.ts`, `goals/index.ts`, `verification/index.ts`, and `subagents/index.ts` are skeleton interfaces without runtime lifecycle, durable events, commands, projections, or TUI integration.
- `packages/coding-runtime/src/profiles/index.ts` has the skeleton `RunProfile` name and budget identity but the active provider loop still enforces four model steps and four tool calls in `packages/kernel/src/reducer.ts`.
- The current semantic repository surface is list, bounded read, search, and Git status. The model cannot inspect a semantic Git diff.
- AnchorEdit modifies one existing tracked regular UTF-8 file through canonical action, default-deny policy, exact approval, stable effect identity, snapshot-derived recovery, and attributed review. It cannot create files.
- The native-process port already owns `shell: false`, explicit executable/argv/cwd/environment, timeout, bounded output, cancellation, and process-tree cleanup, but runtime policy does not expose a model-authored structured process action.
- Docker named checks are exact repository-declared processes with immutable tracked snapshots and `network=none`. They remain distinct from trusted-host structured commands.
- A real provider answer and passing R2 check end in non-success `completed`. GoalSpec, verifier-owned `succeeded`, repair, public resume, and Evidence Pack are not implemented.
- OpenTUI already has responsive layouts, focus graph, palette/help, history, streaming, approval/recovery, and production PTY seams. Its current composition is R2 evidence-oriented and centered in `apps/eden/src/tui.tsx` plus supporting layout/focus files.
- Current R2 production journals remain bounded to 64 KiB per record, 1 MiB per run, and 4096 records. The amended R3 Build input raises only the `usable_coding_v1` run ceiling to 2 MiB; it does not change R2 replay, per-record limits, record count, or authorize truncation, duplicate storage, or a new artifact store.

## Frozen cross-cutting contract

### Delivery graph

R3-A, R3-B, R3-C, and R3-E are ordered blocking milestones. Each closes with a runnable vertical journey before the next begins. R3-D branches from completed R3-C and requires a separate owner activation. Build may skip directly from R3-C to R3-E.

### Run budgets

`usable_coding_v1` freezes hard policy maxima of 12 model steps, 16 tool calls, 8 executable action proposals, 30 minutes wall time, 512 KiB aggregate model-visible tool content, and 256 KiB aggregate command output. Each run durably records one grant at or below those maxima before the first provider, tool, or action dispatch. The model may stop early or use no tools but cannot raise the grant. Each command has 64 KiB stdout, 64 KiB stderr, and at most 10 minutes. A new file is at most 32 KiB UTF-8. Usage facts are replayable and monotonically consumed.

### Multi-call scheduling

A completed model observation contains zero to four source-ordered tool calls, and model step 12 exposes no tools. Runtime accepts a batch only when every call is a read-only repository tool, requires no approval, and cannot mutate workspace or external state. It preflights the complete batch and declared maximum observations, durably consumes every call budget, executes eligible calls with concurrency at most four, journals actual lifecycle, and appends closed results to model context in original source order. Partial failure preserves sibling results; cancellation closes each started call. AnchorEdit, `write_file_v1`, `run_command_v1`, and every effectful or approval-bearing tool are singleton steps. An ineligible batch produces a closed non-effecting rejection and never becomes hidden serial authority.

### Authority and recovery

All executable proposals remain closed `ActionEnvelopeV1` variants under default-deny policy. `write_file_v1` and `run_command_v1` are `ask` only for the exact v1 shape. Approval is single-use and consumed before dispatch. New-file recovery is absence/content-derived; command recovery after dispatch without terminal receipt is unknown. No workflow state, model text, plan approval, goal approval, or passing basic check may substitute for exact action authority or verifier success.

### Workspace and checkpoint policy

R3 runs in the user's current trusted worktree and preserves dirty work. Checkpoints record durable journal and workspace evidence only. No slice may automatically create a Git worktree, commit, stash, reset, checkout, stage, or roll back user files. Any need for those operations stops for a visible Freeze amendment.

### Product truth

Contracts and runtime own plan, goal, budgets, actions, verification, repair, resume, Evidence Pack, and terminal truth. TUI and headless surfaces consume the same AgentClient commands, snapshots, and events. Renderer fixtures may represent only closed public states already frozen in contracts.

## Ordered test-first slices

### Slice 0: baseline, contract budget, and no-authority guards

**Scope:** Reproduce the exact accepted R2 baseline, close the amended policy/grant/batch contracts, and prove the frozen R3 maximum envelopes fit the 64 KiB record, 2 MiB run, and 4096-record limits before activating any R3 variant.

- Public seam: existing package tests, R1/R2 named gates, journal encoder/decoder, copied archive smoke, and production PTY self-test.
- Observable behavior: R2 behavior remains unchanged; policy maxima decode separately from a lower durable grant; maximum batch, action, lifecycle, command-output, and terminal fixtures each fit 64 KiB; one complete maximum run fits 2 MiB/4096 records; no R3 action, verifier, resume, child, or web effect can dispatch.
- Independent expected result: a table of maximum event counts and independently constructed bytes is compared with the exact production encoder output; command output is stored once and only its admitted model-visible projection also consumes the aggregate tool-content budget.
- RED: add policy/grant/usage, zero-to-four-call model observation, final-answer reserve, maximum closed fixtures, single-storage, and no-authority tests that fail because the amended contracts and explicit denial guards do not exist.
- Permitted fakes: deterministic clocks/IDs and maximum-value contract fixtures only; no fake persistence length or bypassed encoder.
- Matching surface: current copied archive completes the accepted R2 safe-actuation and Docker self-test paths with all R3 commands absent or explicitly unsupported.
- Stop conditions: any maximum record exceeds 64 KiB, the complete encoded run exceeds 2 MiB/4096 records, output must be duplicated or truncated, the R2 baseline regresses, or a new artifact store becomes necessary.

### Slice 1: profile-owned budgets, bounded multi-call scheduling, and recoverable observations

**Scope:** Activate policy/grant/usage accounting, replace the fixed four-step/four-tool branch, and add the bounded multi-call scheduler for existing read-only repository tools without adding new tool kinds yet.

- Public seam: contracts decoders, provider adapter fixtures, kernel reducer/decision tests, runtime batch scheduler, journal replay, provider-loop fixture, AgentClient, ProductView budget/batch projection, and headless NDJSON.
- Observable behavior: policy maxima and the exact per-run grant are distinct and replayable; zero to four eligible read-only calls consume budget before dispatch, run with concurrency at most four, retain actual lifecycle, and return results in source order; early final answers use no quota beyond actual usage; step 12 is final-answer-only; effectful, mixed, dependent, unsupported-provider, oversized, or over-budget batches perform no effect; a closed recoverable read failure preserves sibling results while `unknown` blocks.
- Independent expected result: a table-driven ledger calculates remaining counters and bytes from committed event sizes and fixture timestamps, while controlled deferred ports independently establish start/completion order and source-ordered model results.
- RED: cover an early zero-tool final answer; four eligible reads with reversed completion order; one failed sibling; batch cancellation; a fifth same-step call; mixed read/effect and two-effect batches; unsupported provider capability; a tool request on step 12; the seventeenth run tool; a grant above policy; and replay with no redispatch.
- Permitted fakes: deterministic provider and semantic tool ports at their existing boundaries; real journal encoding remains required.
- Matching surface: a local OpenAI-compatible wire fixture proves zero-to-four-call normalization without network, and the headless deterministic journey shows one read batch, partial failure, source-ordered results, a later singleton action proposal, and exact remaining budgets.
- Stop conditions: provider capability is guessed rather than proved, a dependent/effectful call can enter a batch, result order depends on completion timing, accounting depends on ephemeral renderer/provider state, dispatch can occur before durable consumption, or limits require changing accepted journal bounds.

### Slice 2: model-visible semantic Git diff

**Scope:** Add `git_diff_v1` as the fifth semantic repository tool with bounded paging and hardened Git ownership.

- Public seam: contracts tool call/result, kernel tool lifecycle, `coding-runtime` repository adapter, provider loop, ProductEvent/ProductView, TUI card, and headless NDJSON.
- Observable behavior: the model requests root or closed path scope and continuation; runtime returns at most 24 KiB per page with current `HEAD`, status/content hashes, page identity, and continuation; external diff/textconv and raw native output never enter product or model data.
- Independent expected result: temporary real Git repositories with independently generated expected patch text and SHA-256, including dirty tracked files, renames, binary markers, large pagination, and no-diff cases.
- RED: reject executable/argv/environment fields, stale continuation, external diff/textconv sentinels, over-budget pages, malformed output, cancellation, and changed `HEAD`/status identity.
- Permitted fakes: native process output only for malformed/timeout/overflow unit cases; happy path and security cases use real Git repositories.
- Matching surface: the real TUI and headless fixture show a changed file, request diff pages, preserve CJK text, and expose source identity without executing repository code.
- Stop conditions: Git requires staging or mutation, complete page identity cannot survive pagination, or model-visible diff is conflated with Eden attribution/current repository review.

### Slice 3: exclusive new-file action and attributed review

**Scope:** Add `write_file_v1` for one new UTF-8 file in an existing directory, using canonical action, exact approval, exclusive create, recovery, and review.

- Public seam: contracts action/policy/approval/result/review schemas, independent canonical-byte fixtures, kernel lifecycle, journal/replay, coding-runtime checked filesystem adapter, AgentClient, TUI approval/review, and headless stop-at-approval.
- Observable behavior: exact absent target and parent identity plus complete bytes/hash/mode enter the digest; approval is consumed once; execution creates exactly one `0644` file without overwrite; review shows an Eden empty-to-created patch while current Git status keeps the file untracked.
- Independent expected result: direct filesystem byte/mode/link-count checks and independent SHA-256/diff construction in temporary real Git repositories.
- RED: existing target, missing parent, parent or target race, symlink/hardlink, path escape, invalid UTF-8, >32 KiB, stale approval, crash before/after exclusive create, cancellation, replay, and attempted mkdir/append/chmod/delete/rename all fail closed.
- Permitted fakes: deterministic clock/IDs and an injected before-open race hook; the filesystem, Git status, journal, and atomic/exclusive open are real.
- Matching surface: real TUI approval creates one new fixture file, shows exact digest and non-isolation truth, then renders both the Eden-created patch and untracked repository status at narrow and wide widths.
- Stop conditions: implementation needs directory creation, overwrite, staging, deletion, rename, mode selection, or cannot distinguish created bytes from a competing file.

### Slice 4: shell-free structured command action

**Scope:** Add `run_command_v1` over the existing native-process port with executable resolution, canonical authority, exact approval, scrubbed environment, bounded streams, process-tree control, and unknown recovery.

- Public seam: closed process-request/action/result contracts, canonical-byte oracle, policy tests, kernel lifecycle, runtime resolver and effect host, journal/replay, AgentClient, TUI approval/output/recovery, and headless stop-at-approval.
- Observable behavior: the model supplies one program name, literal argv, contained cwd, reason, timeout, and declared network need; runtime resolves and binds the exact executable and environment; the card says trusted host, no isolation, host-unrestricted network; dispatch uses `shell: false`; terminal results keep stdout/stderr separate and bounded.
- Independent expected result: small cross-platform fixture executables receive an exact argv sentinel, print independent byte sequences, spawn a child for cancellation tests, and record no shell expansion; filesystem sentinels prove redirection/substitution text remains literal.
- RED: shell strings, metacharacter interpretation, stdin, model environment, absolute/changed executable identity, cwd escape, stale action, approval replay, timeout, overflow, cancellation, child cleanup, non-zero exit, resolution failure, and post-dispatch missing receipt.
- Permitted fakes: executable resolver and native port only for malformed/error unit cases; success, literal-argv, timeout, cancellation, output, and process-tree cases use real fixture processes.
- Matching surface: real TUI approves `node --test` in a deterministic fixture, shows exact argv/cwd/environment/network/isolation facts, streams bounded activity, and exposes pass/fail output and recovery.
- Stop conditions: a normal fixture requires shell parsing, inherited secrets, hidden network/isolation claims, unbounded children/output, automatic retry after unknown dispatch, or platform behavior without a named fixture.

### Slice 5: R3-A real coding journey and completion boundary

**Scope:** Integrate read/search/status/diff, AnchorEdit/new-file, structured command/named check, recoverable failures, and final answer through one multi-step provider loop.

- Public seam: configured provider loop, context ledger, kernel budgets, all R3-A tool/action events, journal/replay, AgentClient, TUI, and headless projection.
- Observable behavior: a deterministic model and an authorized real provider can read, edit or create, run a command/check, inspect diff, recover from one structured failure, and return a final `completed` answer with every action and budget visible; `succeeded` is impossible.
- Independent expected result: a deterministic failing Node fixture with an independently known source correction, expected created file bytes, command exit, Git diff, and final repository oracle.
- RED: a model answer that says success, a passing command, or a passing named check must remain `completed`; budget exhaustion, denied action, stale file, and unknown command must not become success or silent retry.
- Permitted fakes: deterministic provider for the full matrix and local scripted transport for protocol failures; matching-provider execution requires separate owner authority and uses the real repository/tools/product path.
- Matching surface: copied packaged TUI performs the deterministic journey at `60x20`, `80x24`, and `100x30`; a separately authorized real-provider row repeats one bounded fixture journey with exact usage and secret-canary evidence.
- Stop conditions: provider/tool state bypasses the journal, successful completion requires Goal semantics early, or the journey cannot fit frozen budgets.

### Slice 6: R3-B shell boundaries and design tokens

**Scope:** Split the current TUI into app shell, session navigation, transcript, persistent composer, authority/status bar, review drawer, overlays, and typed card registry without changing runtime behavior.

- Public seam: existing ProductView fixtures plus new presentation-only component interfaces, OpenTUI renderer tests, focus graph, and PTY frame capture.
- Observable behavior: all R3-A states render through shared semantic tokens and typed cards; no component infers run phase, action identity, approval, changed files, or verification from local state.
- Independent expected result: frozen ProductView fixtures rendered at exact viewports and inspected for semantic labels, focus order, selected identity, and card-specific authority fields.
- RED: component-local color/spacing variants, generic cards that omit typed authority, renderer-created phase/outcome, and resize that changes active approval identity fail structural or frame assertions.
- Permitted fakes: renderer-native test surface and closed ProductView fixtures; no mocked runtime truth outside contracts.
- Matching surface: real executable navigates onboarding, task, approval, command output, diff, recovery, and final answer across the three viewports with terminal restoration.
- Stop conditions: the reconstruction requires a renderer/runtime replacement, changes ProductView to satisfy layout only, or introduces mock-only future states.

### Slice 7: persistent composer, navigation, streaming, and progressive review

**Scope:** Complete the R3-B interaction model: multiline composer, queued/steering input, slash commands, palette/help, typed tool cards, drawers/overlays, and stable focus/scroll behavior.

- Public seam: OpenTUI keymap, focus reducer, ProductCommand submission, transient stream subscription, renderer frames, and production PTY driver.
- Observable behavior: user input and full answers stay primary; tool/action/check activity folds; approval/diff/recovery expands; queued or steering input is explicit; CJK bracketed paste and multiline editing preserve text; resize preserves focus, selection, expansion, scroll anchor, and safety.
- Independent expected result: deterministic key sequences and exact input strings compared with submitted ProductCommands and semantic frame text rather than implementation component state.
- RED: paste loss, duplicate submit, hidden queued input, focus escape, stale approval activation, answer truncation, scroll reset, and resize-induced action changes.
- Permitted fakes: renderer test backend and deterministic AgentClient fixture; production PTY remains required for matching evidence.
- Matching surface: copied executable covers rapid resize, CJK paste, multiline edit, steering queue, palette/help, large output, large diff, and clean parent-shell return.
- Stop conditions: interaction requires terminal-local execution authority, inaccessible keyboard paths, or unbounded output/layout work.

### Slice 8: PlanArtifact lifecycle and execution-context choice

**Scope:** Activate Plan mode with journal-local `PlanArtifactV1`, revision, review/revise/approve, and explicit fresh/compact/keep-context execution choice.

- Public seam: Plan contracts/commands/events/view, kernel reducer/decision, planning runtime, journal/replay, AgentClient, TUI plan editor/review, and headless projection.
- Observable behavior: Plan mode has read-only repository tools plus PlanArtifact write; revision invalidates approval; only the user approves; context choice changes provider input selection but not durable scope, checks, capabilities, or budgets.
- Independent expected result: fixed plan fixtures and a table of command revision transitions; provider request capture independently compares included context items for the three choices.
- RED: workspace write/command/action requests in Plan mode, model-created approval, stale revision approval, >24 KiB artifact, hidden assumptions/risks, and context choice that changes GoalSpec facts.
- Permitted fakes: deterministic planner provider and request-capture adapter; journal, contracts, reducer, and repository reads remain real.
- Matching surface: real TUI starts a task, reviews repository evidence and plan, revises one step, approves the exact revision, and selects each context policy without executing a repository action.
- Stop conditions: plan truth requires a workspace file, plan approval grants action authority, or context handling needs a second journal/source of truth.

### Slice 9: GoalSpec, checkpoints, and durable resume

**Scope:** Add human-approved `GoalSpecV1`, safe-boundary checkpoints, explicit resume commands, workspace revalidation, and action-specific reconciliation without automatic rollback/worktrees.

- Public seam: goal/checkpoint/resume contracts, kernel lifecycle, journal/replay, runtime workspace observer and effect host, CLI grammar, AgentClient, TUI resume, and headless NDJSON resume.
- Observable behavior: one approved goal binds plan revision/scope/checks/capabilities/budgets; checkpoints record current evidence without Git mutation; `eden run resume` replays first, reconciles exactly, revalidates current state, and either continues from a safe boundary or blocks visibly.
- Independent expected result: temporary real Git repositories and externally captured HEAD/status/file hashes before exit and resume, plus process-count sentinels proving no duplicate dispatch.
- RED: wrong workspace/run, stale plan/goal/policy/provider, changed scoped bytes, untracked unrelated user work, unresolved edit/command states, approval pending, terminal run, corrupt journal, and attempted worktree/stash/reset/rollback.
- Permitted fakes: deterministic crash hooks, clocks, IDs, and provider port; Git/filesystem/journal/reopen and process dispatch counters are real.
- Matching surface: exit after an approved edit at a declared checkpoint, reopen the copied TUI, inspect drift/recovery, resume without duplicate action, and continue; headless resume stops at the next exact interactive approval.
- Stop conditions: safe resume requires automatic reset/stash/worktree, unknown dispatch would rerun, or read-only inspection gains execution authority.

### Slice 10: verifier, bounded repair, Evidence Pack, and terminal success

**Scope:** Activate required/optional checks, completion candidate, deterministic verification, one default repair cycle/two hard maximum, persisted Evidence Pack, and verifier-owned `succeeded`.

- Public seam: GoalSpec/check/result/repair/Evidence Pack contracts, kernel reducer/decision, verification runtime, check action adapters, journal/replay, artifact store, ProductEvent/ProductView, TUI, and headless terminal event.
- Observable behavior: a completion candidate starts verification; a failing required check prevents success and emits minimum repair evidence; one repair may return to verification; all current required checks, scope, artifacts, policy, budgets, and persisted Evidence Pack are required before verifier success.
- Independent expected result: a deterministic fixture with one intentionally failing exact required check, an independently known correction, expected diff scope, artifact hashes, and an external validator that recomputes Evidence Pack identity and required rows.
- RED: model-authored success, stale check result, skipped required check, out-of-scope diff, missing artifact, unresolved effect, missing Evidence Pack, exhausted repair, optional-only pass, and altered goal identity all reject `succeeded`.
- Permitted fakes: deterministic model for completion/repair proposals and check port for narrow error taxonomy tests; the acceptance journey uses real fixture commands/named checks, filesystem, journal, artifact bytes, and independent validator.
- Matching surface: real TUI shows completion candidate, failed required check, remaining repair budget, repaired diff, verifier success, and expandable Evidence Pack; headless emits terminal success only after the same persisted pack.
- Stop conditions: verifier needs model judgment for a required fact, repair can widen the goal or budget, evidence depends on transient output, or success can precede artifact persistence.

### Slice 11: R3-C integrated verified-goal journey

**Scope:** Join Plan, Goal, command/edit/create, verification, repair, checkpoint/resume, and Evidence Pack through the packaged product before release work.

- Public seam: complete AgentClient and CLI/TUI product surface over one run journal.
- Observable behavior: the deterministic fixture completes Plan approval -> execution -> failed check -> bounded repair -> verifier success, including one process exit/resume and no duplicate effect.
- Independent expected result: external fixture oracle validates final bytes, Git status/diff, required check exit, effect counts, goal scope, budgets, Evidence Pack rows/hash, and terminal event order.
- RED: inject crashes at approval consumption, file creation, command dispatch, checkpoint, check receipt, Evidence Pack persistence, and terminal append; each path resumes or blocks according to the frozen matrix.
- Permitted fakes: deterministic provider only; product, Git/filesystem, process, journal, artifact store, TUI/headless clients, and package are real.
- Matching surface: copied packaged TUI runs the full three-viewport verified-goal journey with CJK input and terminal restoration; headless independently replays and validates the final result.
- Stop conditions: any required state is renderer-only, repeated effects occur, or current R2 behavior regresses.

### Optional Slice 12: R3-D activation checkpoint

**Scope:** Decide whether available schedule and R3-C evidence justify the non-blocking child/web milestone.

- Entry evidence: R3-C integrated journey is green, R3-E critical-path estimate is current, no unresolved release blocker exists, and the owner explicitly authorizes R3-D Build scope plus any real network/provider use.
- Result when not activated: record `not-run`, omit all R3-D product and resume claims, and proceed directly to Slice 15.
- Result when activated: execute Slices 13-14 without changing R3-E acceptance or delaying mandatory repair of a release blocker.
- Stop conditions: missing authority, schedule pressure, new trust-boundary ambiguity, or any R3-A-C regression.

### Optional Slice 13: one read-only ExploreAgent

**Scope:** Add exactly one child run with self-contained assignment, scoped repository reference, independent context/journal, explicit budgets, cancellation, inherited-and-narrowed read-only authority, and structured result.

- Public seam: child assignment/lifecycle/result contracts, parent/child journal linkage, kernel projection, runtime scheduler limited to one child, AgentClient, TUI card, and headless events.
- Observable behavior: the child can list/read/search/status/diff only within its scope, cannot write/command/approve/network, respects cancellation/budgets, and returns paths/optional lines/evidence/unknowns without granting parent success.
- Independent expected result: a fixture repository with known cross-file answer and forbidden sibling/authority canaries, validated outside the child result.
- RED: scope escape, capability expansion, second/nested child, parent secret/context leakage, cancellation loss, budget overrun, child approval/success forgery, and replay dispatch.
- Permitted fakes: deterministic child provider; repository tools, journals, scopes, cancellation, and parent projection are real.
- Matching surface: TUI shows assigned/running/cancelled/completed child state, budgets, findings, and unknowns while write/command actions remain unavailable.
- Stop conditions: generic parallel scheduler, write worker, nested child, worktree fan-out, or provider authority beyond the explicit activation.

### Optional Slice 14: bounded web search and fetch

**Scope:** Add `web_search_v1` and `web_fetch_v1` through one explicit adapter with separate network policy and untrusted-source projection.

- Public seam: web call/result contracts, policy, adapter, journal, context admission, ProductEvent/ProductView, TUI sources, and headless events.
- Observable behavior: explicit policy permits bounded HTTPS public search/fetch; redirects, time, bytes, content types, and source metadata are closed; local/private destinations and unsafe redirects block; content is redacted and labelled untrusted.
- Independent expected result: local scripted HTTP boundaries for redirects/content/error taxonomy plus a separately authorized public-source row whose URL/title/hash is independently captured.
- RED: loopback/private/link-local/metadata destinations, DNS/redirect rebinding, non-HTTPS, oversized/streaming content, unsupported MIME, secret canary, prompt-injection instruction promotion, timeout, cancellation, and source omission.
- Permitted fakes: scripted search/fetch server for deterministic contract and security cases; real public network is used only with separate owner authority.
- Matching surface: TUI presents source URL/title, network authority, bounded result, warning, and recovery; child and web cards cannot be mistaken for trusted repository instruction.
- Stop conditions: custom search engine, browser/computer-use, credential-bearing browsing, broad URL access, or missing SSRF/redaction evidence.

### Slice 15: R3-E packaging, guidance, and three product journeys

**Scope:** Produce the release-candidate archive, public install/upgrade/uninstall/provider/doctor/troubleshooting guidance, three deterministic journeys, screenshots, support truth, and demo source.

- Public seam: copied release archive, `eden --help`, provider/profile commands, TUI, headless, run resume, doctor, public Quickstart/README/support matrix, evidence driver, and uninstall/cleanup instructions.
- Observable behavior: a fresh isolated environment completes happy path, approval/recovery, and failed-check/repair from public instructions; exact hashes and commands reproduce the evidence; R3-D appears only if activated and passed.
- Independent expected result: external driver validates archive manifest, executable/assets, fixture before/after bytes, Git diff, check outcomes, event ordering, Evidence Pack hash/rows, terminal restoration, state cleanup, and documentation commands.
- RED: missing prerequisite guidance, source-tree dependency, stale command, wrong hash, hidden credential, unsupported claim, non-reproducible screenshot/demo, upgrade incompatibility, incomplete uninstall, and R3-D claim without evidence.
- Permitted fakes: deterministic provider for the three mandatory release journeys; at least one matching-provider journey requires separate authority and uses the same packaged product path.
- Matching surface: owner-operated first verified patch in a fresh isolated Linux/WSL2 environment using only public instructions and the packaged artifact, plus real screenshots and a 60-90 second demo derived from that path.
- Stop conditions: package requires repository source, secrets enter evidence, cleanup removes user data without explicit instruction, or support claims exceed matching evidence.

### Slice 16: release-candidate review and hosted closure

**Scope:** Run the complete affected suite, matching-surface PTY/product journeys, hosted regression, artifact validation, diff/spec/security review, and owner key-node review preparation.

- Public seam: all repository gates, copied archive drivers, production PTY, hosted workflows, machine-readable evidence, and release documentation.
- Observable behavior: exact release candidate passes local and declared hosted rows; every claim maps to a reproducible row; failures and `not-run` surfaces remain explicit; no actionable diff/spec/security finding remains.
- Independent expected result: evidence validator reads only published candidate hashes, archived outputs, exact commands, and closed schemas; it does not trust workflow labels or model summaries.
- RED: mutate one artifact hash, omit one required journey row, forge success before Evidence Pack, add a secret canary, or claim an unrun platform/capability; validator and review must fail.
- Permitted fakes: none for release identity, package, journal, Git/filesystem, process, TUI, or evidence validation. Provider and platform rows retain their exact declared matching/fake status.
- Matching surface: repeat the owner-operated first verified patch after the last relevant edit, inspect narrow/medium/wide TUI and CJK/resize/output/diff behavior, and confirm parent-shell/state cleanup.
- Stop conditions: hosted or matching-surface failure, stale exact-SHA evidence, actionable review finding, support overclaim, missing cleanup, or unapproved external action.

## Acceptance matrix

| Milestone | Required vertical evidence | Terminal/claim boundary |
| --- | --- | --- |
| R3-A | deterministic and separately authorized real-provider read/edit-or-create/command/diff journey | non-success `completed`; no verifier claim |
| R3-B | copied real TUI journey at narrow/medium/wide, resize, CJK, large output/diff, recovery | renderer owns no durable truth |
| R3-C | packaged plan/goal/fail/repair/resume/verifier/Evidence Pack journey | only verifier emits `succeeded` |
| R3-D | optional activated child plus web evidence | `not-run` is valid and absent from release claims |
| R3-E | owner-operated packaged first verified patch plus three journeys and hosted regression | resume-ready reference-platform v0.1, not broad release support |

## Verification commands

Run focused tests after each RED/GREEN/REFACTOR slice, then the affected package suite. Before every milestone review run at minimum:

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm code:check
pnpm markdown:check
git diff --check
git status --short --branch
```

R3-A additionally runs focused contract/kernel/runtime/tool/action/process/recovery tests and copied deterministic coding-loop evidence. R3-B runs renderer tests plus production PTY at `60x20`, `80x24`, and `100x30`. R3-C runs plan/goal/verifier/repair/checkpoint/resume/Evidence Pack tests plus the packaged verified-goal driver. R3-E runs copied-archive package smoke, all three product journeys, support/evidence validators, production PTY, and the affected hosted matrix at the exact candidate SHA.

Provider, public web, Docker, hosted, commit, push, package publication, and release commands are executed only after their separate owner authority is explicit. A not-authorized row is recorded as `not-run`, never simulated or inferred.

## Risks and stop conditions

- Stop if structured commands require shell-language parsing, inherited secrets, hidden network authority, or a sandbox claim.
- Stop if new-file usefulness requires overwrite, recursive directory creation, delete, rename, chmod, or staging.
- Stop if a maximum event or run cannot fit the amended 64 KiB record, 2 MiB run, and 4096-record limits without truncation, duplicate output storage, or a new artifact/persistence contract.
- Stop if multi-call execution admits an effectful, approval-bearing, dependent, unsupported-provider, or unbudgeted call, or if replay/result order depends on completion timing.
- Stop if a plan, TUI, or model can approve a goal/action, change budgets, or create completion truth.
- Stop if checkpoint/resume requires automatic Git commits, stashes, worktrees, reset, checkout, rollback, or duplicate dispatch.
- Stop if verifier success depends on model judgment, stale evidence, optional checks, or an Evidence Pack not yet persisted.
- Stop if R3-B needs a renderer/runtime replacement or future mock-only state.
- Skip R3-D unless separately activated; stop it immediately if it threatens an R3-E blocker or expands into write workers, parallel/nested agents, broad browsing, or new provider authority.
- Stop release review for any false support claim, missing exact hash, secret leak, unverified product path, actionable review finding, or external action without authority.

## Non-goals

- Shell-language commands, PTY command sessions, background-job control, arbitrary stdin, or native-sandbox claims.
- Automatic Git worktrees, commits, stashes, staging, reset, checkout, rollback, or repository cleanup.
- Delete, rename, chmod, recursive directory creation, binary-file write, or broad patch-language editing.
- ReviewAgent, write worker, parallel/nested subagents, worktree fan-out, or a general multi-agent scheduler.
- MCP, plugin marketplace, ACP/IDE adapters, LSP, DAP, browser/computer-use, image/audio, or broad web browsing.
- Second provider family, consumer OAuth, keychain/vault migration, GUI, local service, desktop installer/updater, or Rust optimization.
- Real macOS/Windows Docker Desktop support, equal native sandbox parity, signing, package-manager publication, update-channel support, or general release support.
- Reopening completed R0-R2 contracts or rerunning unchanged evidence without an invalidated input.

## Rollback and amendment policy

This plan includes the owner-accepted 2026-08-11 Freeze amendment and became fixed implementation input after its review. Fresh Build authority and public-first commit/push authority were granted on 2026-08-11. If later evidence invalidates an authority, recovery, product, platform, batching, persistence, or completion decision, stop the current slice and propose another visible ADR/plan amendment; do not silently widen the action, raise a budget, weaken a check, change checkpoint semantics, or move R3-D into the release gate.

Implementation remains reviewable one slice at a time. No Build step may discard unrelated user changes or rewrite history. Publication, if separately authorized later, remains public first and tutorial gitlink second.

## Human checkpoints

1. **Freeze amendment review:** completed on 2026-08-11 when the owner accepted the amended ADR, normative/focused contracts, and complete plan as one packet.
2. **Build reauthorization:** granted on 2026-08-11 for implementation from the amended packet.
3. **External authority:** public-first commit and push were granted on 2026-08-11; real provider/network, Docker, hosted, package, and release actions still require separate authority.
4. **R3-D activation:** after R3-C evidence, explicitly activate or skip the non-blocking milestone.
5. **Milestone review:** review each runnable R3-A, R3-B, and R3-C outcome before the next blocking milestone when the accepted plan names a key-node checkpoint.
6. **Release candidate:** review the first verified patch, evidence matrix, support claims, and residual risks before any public release claim.

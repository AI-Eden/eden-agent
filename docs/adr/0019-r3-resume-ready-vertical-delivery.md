# ADR 0019: Deliver R3 Through Resume-Ready Vertical Milestones

- Status: Accepted; amended 2026-08-11
- Date: 2026-08-10
- Decision source: `docs/research/2026-08-10-r3-accelerated-delivery-decision-brief.md`
- Scope: R3 delivery order, minimum authority boundaries, and release gate

## Context

R0-R2 established a real provider path, durable attempts and replay, bounded repository understanding, digest-bound modify-only editing, Docker-contained named checks, responsive OpenTUI behavior, packaging, and reference-platform evidence. The delivered product still cannot complete a normal read-edit-or-create-command-diff journey, cannot turn an approved GoalSpec into verifier-owned success, and does not yet provide the coherent terminal shell or release journey required for a credible v0.1.

Continuing to deliver every narrow mechanism as an isolated horizontal round would preserve strong internal evidence while delaying the first useful coding-agent journey. Pulling child agents, web tools, broad ecosystem support, and release engineering into one mandatory milestone would create the opposite problem: the resume-ready claim would depend on new authority and lifecycle boundaries that are not necessary to prove Eden's central product thesis.

The owner accepted the accelerated direction and this Freeze packet on 2026-08-10 with one amendment: R3-D remains a valid bounded direction but is not a release blocker. Slice 0 then proved that the inherited one-tool-call-per-model-step contract could not reach the accepted 16-tool ceiling within 12 model steps and that the unchanged 1 MiB journal could not establish headroom for the complete R3-A lifecycle. After a bounded comparison with current coding-agent practice, the owner accepted the multi-call and budget amendment on 2026-08-11. The amended ADR is fixed Build input but requires a fresh Build authorization.

## Decision

### Dependency order and blocking path

R3 keeps five named milestones, but the blocking release path is `R3-A -> R3-B -> R3-C -> R3-E`. R3-D becomes eligible only after R3-C and requires a separate owner activation checkpoint. It may land before or after R3-E; omission or delay cannot block the first verified patch or resume-ready claim.

Every milestone that enters Build ends in a runnable vertical journey with matching-surface evidence. Horizontal contracts, placeholder interfaces, mock-only UI states, or model-authored completion claims cannot close a milestone.

### R3-A: usable coding loop

R3-A adds three capabilities to the existing semantic tools and AnchorEdit path:

- `git_diff_v1` is a read-only semantic tool. Runtime code owns the Git executable, fixed arguments, environment, parsing, paging, and complete source identity; the model receives bounded patch pages and cannot supply native process details.
- `write_file_v1` creates a new regular UTF-8 file only in an already existing directory beneath the captured trusted root. The action binds exact parent/path absence, complete content bytes and hash, mode `0644`, scope, policy, and budgets. It uses exclusive creation and never overwrites, appends, creates directories, follows links, stages, chmods, deletes, or renames.
- `run_command_v1` is a shell-free structured process request, not a shell-language tool. The model supplies one program name, argv array, root-relative cwd, reason, timeout request, and declared network need. Runtime resolves the exact executable before policy, owns the scrubbed environment, rejects shell text and stdin, binds the resolved executable, argv, cwd, environment identity, network truth, budgets, and lifetime into the canonical action, and uses the existing process-tree runner.

Every `write_file_v1` and `run_command_v1` action is default-denied and evaluates to `ask` only for the closed v1 shape. R3-A trusted-host commands truthfully report `executionMode=trusted_host_policy_only`, `isolation=none`, and `network=host_unrestricted`; environment scrubbing and user approval do not imply filesystem, child-process, or network containment. A later isolated command profile requires its own accepted contract and evidence.

The first `usable_coding_v1` policy freezes hard maxima of 12 model steps, 16 tool calls, 8 executable action proposals, 30 minutes wall time, 512 KiB aggregate model-visible tool content, and 256 KiB aggregate command output. A closed per-run grant selects values at or below those maxima and becomes durable before the first provider, tool, or action dispatch; later profile or configuration changes cannot alter replay. The model may stop or answer before any ceiling and may choose no tool. It cannot raise a grant. Each command permits at most 64 KiB for stdout and 64 KiB for stderr and a timeout no greater than 10 minutes. Each new file is valid UTF-8 and at most 32 KiB. The per-record and record-count limits remain 64 KiB and 4096, while `usable_coding_v1` raises the run-journal ceiling to 2 MiB. Dispatch blocks before any declared maximum observation would exceed a remaining limit, and the maximum production fixture must fit without truncation or duplicate storage.

One completed model step may contain zero to four closed tool calls. The twelfth model step is final-answer-only with tools disabled, so a completed run always retains one provider turn for a terminal answer. Every call consumes the run's tool budget durably before execution. A batch is accepted only when all calls are read-only repository tools and no call requires approval or can mutate workspace, process, network, provider, or external state. The runtime preflights calls in source order, executes an accepted read-only batch with concurrency no greater than four, records actual lifecycle order, and appends closed tool results to model context in the model's original call order. One failed read does not erase sibling results; cancellation terminates the batch and closes every started call.

AnchorEdit, `write_file_v1`, `run_command_v1`, and any current or future approval-bearing or effectful call must be the sole call in their model step. A mixed, dependent, unsupported-provider, oversized, or otherwise ineligible batch produces a closed non-effecting observation and requires a later model step to re-plan; Eden never serializes such a batch into hidden authority. Matching-provider evidence must prove the provider's multi-call wire behavior before Eden claims the batching capability for that provider.

Tool and action failures become closed observations with recoverability, source identity, and bounded evidence. A failure may continue the model loop when policy and remaining budgets allow, but an unresolved process after durable dispatch remains `unknown`, requires explicit user resolution, and never retries automatically.

R3-A ends in non-success `completed` review. No passing command, named check, model answer, or diff can emit `succeeded` before R3-C verifier ownership exists.

### R3-B: TUI product-shell reconstruction

R3-B reconstructs the terminal product after the real R3-A loop and before Plan and Goal expansion. OpenTUI, Bun, AgentClient, ProductView, journal authority, and current PTY evidence seams remain fixed. The renderer may own only ephemeral layout, focus, selection, drafts, expansion, and scroll state.

The application shell owns composable session navigation, transcript, persistent multiline composer, authority/status bar, contextual review drawer, overlays, and one tool-card registry. The registry shares presentation envelopes while preserving typed details; it cannot create a generic runtime tool schema or predeclare mock-only Plan, child, web, verification, or Evidence Pack truth.

Narrow, medium, and wide layouts remain one-column switching, conversation plus drawer, and session/conversation/review respectively. Complete user input and model answers remain the primary reading flow. Tool activity is compact by default, while action, diff, check, recovery, and evidence detail expands without changing durable state or active approval identity.

### R3-C: Plan and verified Goal

Plan mode may read repository evidence and write one closed `PlanArtifactV1` only to the current run journal. It has no workspace-write or process authority. The artifact carries identity, revision, objective, ordered steps, acceptance checks, required capabilities, assumptions, risks, and non-goals. Only a human product command can approve a current revision; revision supersedes earlier approval.

Approved plan execution selects one explicit context policy: `fresh`, `compact`, or `keep_context`. The choice changes provider context only; it cannot change GoalSpec identity, scope, capabilities, checks, budgets, approval state, or journal truth.

`GoalSpecV1` is a closed, canonically identified runtime value containing objective, canonical workspace and path scope, required and optional exact checks, expected artifacts, allowed capabilities, action/model/tool/time/repair budgets, stop conditions, workspace-drift policy, and `checkpoint_only_no_automatic_rollback` recovery strategy. A goal approval binds the current plan revision and GoalSpec digest. Models may propose work or a completion candidate but cannot revise or approve the goal.

The v0.1 checkpoint is a durable safe-boundary record, not a Git commit, automatic stash, copied worktree, or filesystem rollback. Eden continues in the user's current trusted worktree, records current `HEAD`, scoped status and content identities, completed effects, budgets, plan, goal, and verifier state, and revalidates them on resume. R3 creates no automatic Git worktree and performs no automatic rollback. Repair is a new policy-controlled action; user work is never reset.

Required checks are exact goal-approved named checks or closed `run_command_v1` actions. Verifier code revalidates goal/workspace identity, unresolved effects, scope, current diff, required checks, artifacts, and budgets. Only a current all-required-pass verifier observation may persist an Evidence Pack and emit `succeeded`.

A failed required check produces one minimum structured repair observation. The default repair budget is one cycle and the hard maximum is two. A remaining budget may return the run to repairing; exhausted recoverable work becomes `failed`, while missing authority, unavailable capability, ambiguous effect, or required user input becomes `blocked`. Optional-check failure is visible residual risk and does not override required-check policy.

Resume is a separate execution command, never an implication of read-only inspection. `eden run resume <run-id>` opens the exact run interactively; `eden run resume --json <run-id>` emits the same durable product stream and still stops at any approval requiring interactive resolution. Resume replays first, performs kind-specific reconciliation, revalidates workspace/plan/goal/policy/provider identities, and dispatches only from an explicitly resumable safe boundary.

The Evidence Pack is a versioned artifact stored outside the workspace under runtime-owned state. Its journal event binds content hash, byte length, goal and plan identities, scoped diff summary, required and optional check results, artifacts, policy exceptions, budget use, environment metadata, support truth, and residual risk. It is produced before `succeeded`; model text cannot author or replace its facts.

### R3-D: optional read-only exploration and web evidence

R3-D is not part of the blocking release gate. After R3-C, the owner may separately activate a time-boxed implementation of exactly one read-only ExploreAgent plus `web_search_v1` and `web_fetch_v1`.

If activated, the child receives a self-contained assignment, canonical repository scope, independent context and child journal, explicit token/tool/time budgets, cancellable lifecycle, and inherited-but-narrowed read-only capabilities. It returns a closed result with paths, optional lines, evidence, unknowns, budget use, and terminal reason. It receives no write, command, approval, provider-secret, or broader network authority.

Web tools use one explicit adapter, separate network policy, HTTPS-only public destinations, bounded redirects/time/content, content-type enforcement, redaction, and URL/title/source projection. Retrieved content is untrusted evidence and never becomes repository instruction. Any change to these boundaries requires approval of the R3-D activation packet before implementation.

### R3-E: resume-ready v0.1

R3-E is complete only when the packaged artifact and public instructions let the owner complete one first verified patch in a fresh isolated environment on the declared Linux/WSL2 reference platform. The product journey covers installation or archive setup, provider onboarding, workspace trust, Plan review and approval, edit or create, command or named check, failed required verification, bounded repair, verifier-owned success, diff, Evidence Pack, interruption/resume, doctor, troubleshooting, upgrade compatibility, and uninstall or clean removal instructions.

The release candidate includes three reproducible journeys: happy path, approval/recovery, and failed-check/repair. It includes real TUI evidence at narrow, medium, and wide viewports, resize, CJK paste, representative output and diff volume, package smoke, declared hosted regression, exact commands and hashes, support matrix, known limitations, and a 60-90 second demo derived from the implemented path.

R3-E does not require R3-D. ExploreAgent or web evidence appears in release or resume claims only when the separately activated milestone has passed its own matching evidence.

## Rejected alternatives

- **Keep Goal internals ahead of a usable loop:** preserves conceptual order but continues to design completion around a product that cannot perform a normal coding task.
- **Reconstruct the TUI before real R3-A states:** invites mock-only product truth and another rewrite after commands and new-file review exist.
- **Move TUI reconstruction after Plan, Goal, child, and web:** compounds the current evidence-oriented layout and makes later interaction repair more expensive.
- **Use shell-language text for R3-A:** combines parsing, expansion, pipelines, redirection, background processes, and interpreter semantics before Eden has matching evidence.
- **Treat approval or environment scrubbing as containment:** misstates host authority and would make network and child-process claims unverifiable.
- **Use automatic Git worktrees, commits, stashes, or rollback in v0.1:** expands repository mutation and recovery semantics before the verified loop needs them.
- **Make R3-D a release blocker:** adds child-run and remote-content trust boundaries to the accelerated critical path without being necessary for Eden's first verified patch claim.
- **Keep one tool call per model step:** makes the accepted 16-tool budget unreachable within a completed 12-step run and spends provider turns on independent repository reads.
- **Run every multi-call batch in parallel:** allows stale dependent calls, overlapping effects, and concurrent approvals or mutations without a deterministic authority order.
- **Call packaged owner evidence broad release support:** conflates one declared reference journey with signing, package-manager publication, update channels, and equal platform support.

## Consequences

R3 gains a usable critical path while retaining action identity, policy, approval, journal, replay, and verifier ownership. The plan must implement the milestones as vertical slices, preserve R0-R2 behavior, and stop whenever evidence requires a wider authority or different recovery contract.

The structured command is intentionally more capable and less isolated than R2 named checks. Product copy, approval, tests, and evidence must make that trade-off explicit. A shell language, automatic worktree manager, broad subagent system, second provider family, GUI, local daemon, MCP, LSP, DAP, browser/computer-use, and cross-platform sandbox parity remain outside this ADR.

Approval of this amended ADR and its companion plan makes them fixed Build input only. On 2026-08-11 the owner separately approved the amended Freeze, freshly authorized Build, and authorized public-first commits and pushes. Provider/network use, Docker use, hosted execution, image or package publication, release, and R3-D activation remain separate authority checkpoints. The deterministic R3-A candidate does not close the milestone until its required matching-provider and copied packaged TUI evidence are authorized and reviewed.

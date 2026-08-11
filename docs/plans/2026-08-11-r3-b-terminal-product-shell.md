# R3-B Terminal Product Shell Plan

- Status: Slices 0-5 locally complete at exact evidence candidate `9dd9e0d9fa8fa3696bfc0e25c129d0e93cb3a8c0`; owner milestone review pending
- Date: 2026-08-11
- Milestone: R3-B, after accepted R3-A and before R3-C
- Architecture decision: `docs/adr/0020-r3-b-conversation-spine-and-typed-intervention.md`
- Parent plan: `docs/plans/2026-08-10-r3-resume-ready-verified-goal.md`
- Human checkpoint: review the formal copied-package evidence before R3-C

## Goal and user-visible outcome

Reconstruct the existing Bun/OpenTUI terminal surface into a conversation-first product shell that exposes all current R3-A truth without becoming an evidence dashboard. A developer can follow complete conversation, inspect compact typed tool activity, act on approval or recovery, review diff and command evidence contextually, and submit a durable steering message or queued follow-up from the active run. Narrow, medium, and wide layouts preserve authority and interaction identity across resize.

This plan refines and supersedes only the R3-B implementation detail in Slices 6 and 7 of the parent plan. It does not change the R3 dependency graph, the completed R3-A runtime claims, or the later R3-C/R3-D/R3-E contracts.

## Current repository facts

- The published Build-entry baseline is `b80bb10ae3a1942a76eab96cdf5c07f2c0f8e22f`; the tutorial gitlink points to that exact commit.
- R3-A is owner-accepted. Its exact candidate `468c4ba0f726715c2f190b3c2842f798992e8543` has passing copied-package, normal-TLS matching-provider, and exact-candidate hosted R1/R2 evidence.
- Exact evidence candidate `9dd9e0d9fa8fa3696bfc0e25c129d0e93cb3a8c0` adds closed `conversation.steer` and `conversation.queue` submission through `AgentClient`, while pause and resume remain unsupported.
- `ProductView` now projects typed active-input availability, reservation, pending, delivered, and closed truth in addition to existing conversation, tool, approval, review, check, budget, retry, and repository-check facts. The renderer does not invent durable state.
- Provider context now receives delivered steering before the next safe provider request and queued input after a complete model stop. Both paths are journaled and replayable; terminal `completed` still remains non-success.
- The TUI remains on Bun, OpenTUI 0.4.3, React 19.2.7, one focus graph, and the frozen narrow/medium/wide thresholds. A managed multiline textarea is pinned below a bounded conversation viewport during every active provider run.
- Pinned OpenTUI React types expose textarea and scrollbox primitives but no assumed intrinsic diff component. R3-B must use capabilities proven in the installed version.
- Two private generated images are accepted only as non-normative density and hierarchy references. Public source, tests, and runtime behavior cannot depend on those files.

## Current Build evidence

- Slice 0 remains green for the unchanged baseline, maximum input fixture, ProductView inventory, and 2 MiB journal/context ledger.
- Slice 1 is implemented through additive protocol v1 commands/events/view projection, kernel reservation and lifecycle state, serialized journal commits, replay, provider-context ordering, and AgentClient concurrent acceptance.
- Slices 2-4 are implemented through an exhaustive typed tool registry, compact routine activity, persistent managed textarea, steer/queue and legacy newline chords, stable focus/palette access, urgent authority rails, history switching, responsive transcript containment, and existing evidence/review surfaces.
- Typecheck, build, code formatting, contract/kernel/runtime targets, and affected TUI regressions are locally green.
- The first exact-source run exposed a terminal-exit focus race: a stale `run.composer` focus could briefly swallow `q` after durable completion. Candidate `9dd9e0d9fa8fa3696bfc0e25c129d0e93cb3a8c0` narrows the composer key guard to non-terminal runs and adds a regression proving terminal keys bypass stale composer focus.
- The validated copied-package record at `docs/benchmark-results/2026-08-11-r3-b-packaged-tui-local.json` binds that exact candidate and passes `60x20`, `80x24`, and `100x30`. Each journey delivered one exact multiline CJK steer and one queued follow-up, consumed eight exact model attempts, executed six expected tools with three approvals, passed the independent repository oracle, exited zero, and restored the parent terminal. The `100x30` journey also passed rapid `60x20 -> 80x24 -> 100x30` resize; the provider was a deterministic local fixture with no external network and no verifier-success claim.
- Slice 5 local evidence is complete. R3-B remains at the owner milestone-review checkpoint; R3-C has not started.

## Frozen product contract

### Authority layering

1. Journal and kernel state own accepted/delivered/closed input, run phase, action, approval, outcome, and budget truth.
2. ProductEvent and ProductView project closed renderer-neutral facts.
3. AgentClient is the only TUI command/subscription boundary.
4. Renderer state is limited to layout, focus, pane/view selection, draft, cursor, text selection, card expansion, and scroll anchors.
5. Presentation helpers may derive labels and grouping from typed ProductView variants but may not infer execution truth from text, color, component state, or elapsed time.

### Product shell

- `AppShell`: global lifecycle and overlays, not run truth.
- `SessionNavigation`: current-workspace run catalog and selected run identity.
- `Transcript`: complete user/model turns plus compact typed activity rows.
- `ActiveComposer`: multiline draft and explicit steering/queue submission.
- `AuthorityStatusBar`: workspace, trust, phase, provider/model, network/isolation, budget, pending action, and risk.
- `EvidenceLens`: selected approval, diff, command, check, changed-file, recovery, or final-review evidence.
- `OverlayHost`: history/session navigation at reduced widths, command palette, shortcut help, onboarding, readiness, and focused evidence.
- `ToolPresentationRegistry`: one shared envelope with exhaustive typed presenters for current tools/actions/checks; no generic runtime schema.

Component names are explanatory, not mandatory filenames. The boundaries and authority rules are normative.

### Responsive behavior

| Layout | Trigger | Primary surface | Secondary access | Persistent truth |
| --- | --- | --- | --- | --- |
| Narrow | width `<=60` or height `<=20` | one of Chat, Action, Review, History | explicit switcher and overlays | compact run identity, urgent action rail, composer, queue count |
| Medium | width `<=80` or height `<=24` | transcript plus contextual evidence | session navigation overlay | authority/status bar and composer |
| Wide | larger than medium | session navigation, transcript, evidence lens | overlays for transient tasks | authority/status bar and composer |

Resize preserves focus identity when still available, active approval identity, selected evidence identity, pending-input identity, draft/cursor, card expansion, and transcript/evidence scroll anchors. When a focused region disappears, reconciliation moves to the nearest semantic equivalent and never activates a control.

### Active-run input contract

The public schema adds `conversation.steer` and `conversation.queue` commands. Each uses protocol version, command ID, run ID, expected revision, and non-empty well-formed Unicode content with a 4 KiB UTF-8 byte ceiling. Runtime assigns the durable message ID at acceptance and correlates it with the command ID.

The run accepts at most eight active-run inputs and 16 KiB aggregate input bytes. Pending capacity is one steering message plus three queued messages. Acceptance reserves one remaining model step and is rejected before append when any schema, identity, revision, byte, count, pending, or reservation condition fails. Duplicate command identity is idempotent and cannot append or reserve twice. Ordinary provider dispatch cannot consume pending reservations. The last unreserved step of the current turn has tools disabled, preserving one answer boundary before queued capacity is released.

The lifecycle is:

1. `accepted`: durable content, mode, message identity, order, and reserved-step identity exist.
2. `delivered`: the user turn is durably appended before its reserved provider dispatch.
3. `closed`: a structured reason explains why a terminal transition prevented delivery.

Steering waits for the current in-flight effect or accepted read-only batch to close, then delivers before the next provider request. It never cancels dispatched work. Approval blocks delivery until explicitly resolved; awaiting retry blocks delivery until explicit retry. Neither command resolves those boundaries.

Queue remains FIFO until a complete model `stop`. The assistant answer is first persisted as a normal non-terminal conversation turn. The oldest queued message is then delivered and its reserved provider step begins. Terminal `completed` occurs only when `stop` has no deliverable input.

ProductView adds a closed `conversationInput` availability and lifecycle projection. Delivered steering/queue input appears as a typed user conversation turn; pending and closed input remains separately visible without pretending it was model context. ProductEvent emits `conversation.input.updated` lifecycle events. Draft text is never a product event.

Protocol v1 compatibility is additive: the commands and event are new closed union variants, `ProductView.conversationInput` is optional when decoding pre-R3-B snapshots and journals, and every active R3-B run must project it. Existing required shapes and durable conversation meanings remain unchanged. A required-shape or semantic compatibility break is an amendment trigger, not an implementation detail.

Default keys are `Enter` steer, `Alt+Enter` queue, and `Shift+Enter` newline. Paste inserts text only. Palette commands expose both submission modes. The keymap must remain complete without mouse input.

### Typed activity and evidence

- Read/list/search/status activity is one-line by default with source, bounded result identity, state, and timing only when runtime truth provides it.
- Diff, edit, new-file, command, repository-check, approval, and recovery presenters expose their typed authority, outcome, and risk fields; they never fall back to raw JSON.
- One active evidence selection owns the contextual lens. Opening or closing detail changes no ProductView state.
- Urgent approval, retry, recovery, and terminal failure retain a visible text/symbol indicator in every responsive mode and do not rely on color alone.
- Complete user input and assistant answers are never replaced by generated summaries. Raw private continuity and provider payloads remain absent.

## Likely affected boundaries

- `packages/contracts/src/protocol.ts`, fixtures, decoders, and contract tests;
- `packages/kernel/src/model.ts`, reducer, decision/effect ordering, schema, and replay tests;
- `packages/coding-runtime/src/agent-client.ts`, runtime provider-context assembly, projection/view projection, and tests;
- `apps/eden/src/tui.tsx`, `tui-layout.tsx`, `tui-focus.ts`, `tui-design.ts`, focused components/registries added during refactor, and TUI tests;
- production PTY, copied-package, evidence validator, and benchmark-result surfaces used by the accepted R3-B gate;
- public product, contract, UX, context, and plan documentation.

These are forecast boundaries, not permission to edit every listed file.

## Ordered test-first slices

### Slice 0: accepted baseline, fixture inventory, and budget ledger

**Scope:** Reproduce the exact R3-A package/TUI baseline, inventory every ProductView variant that R3-B must render, and prove the maximum active-input journal/context fixture fits existing R3-A limits before activating a command.

- Public seam: current contract fixtures, R3-A deterministic journey, package smoke, TUI text/frame tests, and a closed size ledger for eight inputs/16 KiB content plus lifecycle records.
- Observable behavior: no production command or layout changes; all current R3-A states and three viewport journeys remain green; the measured maximum remains below 64 KiB per record, 2 MiB per run, 4096 records, and the immutable model-step grant.
- Independent expected result: direct UTF-8 byte counts and serialized journal-record sizes computed from maximum valid fixtures, not from production budget helpers.
- RED: a proposed message/event/view shape exceeds a record/run/count limit, duplicates content without an owning consumer, or cannot reserve a model step without raising the grant.
- Permitted fakes: deterministic IDs/clocks and maximum closed fixtures; package, renderer, journal serialization, and byte counting remain real.
- Matching surface: unchanged copied executable performs the R3-A journey at `60x20`, `80x24`, and `100x30` and returns to a clean parent shell.
- Stop conditions: a new persistence profile, artifact store, raised R3-A grant, renderer/runtime replacement, or undocumented loss of an existing state is required.

### Slice 1: typed intervention contracts, kernel lifecycle, and replay

**Scope:** Add steering/queue commands, lifecycle events, ProductView summaries, durable reservation/delivery/closure state, provider-context ordering, and AgentClient submission without TUI controls.

- Public seam: closed TypeBox command/event/view schemas, independent fixtures, kernel reducer/decision, journal/replay, AgentClient submit/snapshot/subscription, and captured provider requests.
- Observable behavior: valid input accepts once, receives one runtime message identity, reserves once, delivers at its specified safe boundary, appears in replay and provider context exactly once, and closes visibly when terminalization prevents delivery. Ordinary provider dispatch preserves pending capacity, the last unreserved current-turn step has tools disabled, approval/retry remain explicit, and in-flight effects are not cancelled.
- Independent expected result: a table-driven lifecycle oracle supplies command order, effect boundary, expected conversation order, reservation count, and terminal eligibility independently of reducer helpers.
- RED: stale/wrong-run/empty/invalid UTF-8/>4 KiB/over-count/over-aggregate/over-pending/no-reservation commands, duplicate command IDs, steer during in-flight effect, queue across model stop, approval and retry boundaries, cancellation/blocking, crash after acceptance and delivery, and replay without dispatch.
- Permitted fakes: deterministic provider/request capture, IDs, clock, and effect gates. Journal and replay are real; real repository/process effects are replaced only at their existing ports.
- Matching surface: headless/fixture client submits one steer and one queue, observes exact lifecycle events, and proves no approval resolution, automatic retry, duplicate provider dispatch, or forged completion.
- Stop conditions: delivery requires cancelling accepted effects, modifying an approval digest, raising the run grant, unbounded pending state, or renderer-owned persistence.

### Slice 2: shell decomposition, tokens, and typed registry

**Scope:** Split the monolithic TUI presentation into the frozen shell regions, extend shared semantic tokens, and route every current R3-A tool/action/check through an exhaustive typed presentation registry without changing behavior.

- Public seam: frozen ProductView fixtures, presentation-only component interfaces, structural exhaustiveness tests, OpenTUI renderer frames, and focus graph.
- Observable behavior: all current states render through one calm hierarchy; routine tools collapse; exact approval/diff/command/recovery facts remain available; no presenter infers phase, action identity, outcome, or authority.
- Independent expected result: fixture-to-required-label matrices name each typed variant and the authority/source/outcome labels that must be present when selected.
- RED: generic raw-JSON fallback, missing typed variant, component-local semantic colors/spacing, renderer-created summaries presented as facts, future mock-only states, and hidden urgent action.
- Permitted fakes: renderer test backend and closed ProductView fixtures only.
- Matching surface: real executable navigates onboarding, task, read batch, edit/create/command approval, output, diff, recovery, and final answer at medium and wide widths.
- Stop conditions: layout requires ProductView-only-for-rendering fields, assumes an unpinned OpenTUI intrinsic, or erases a current authority field.

### Slice 3: persistent multiline composer and responsive navigation

**Scope:** Connect the active composer to the Slice 1 commands, implement multiline editing and explicit steer/queue submission, and realize the wide/medium/narrow navigation and resize contract.

- Public seam: OpenTUI textarea behavior, pure editor/keymap/focus reducers, AgentClient submission, deterministic renderer frames, and production PTY input.
- Observable behavior: draft persists through active phases and resize; Enter steers, Alt+Enter queues, Shift+Enter inserts newline, paste never submits; availability and pending count come from ProductView; narrow Chat/Action/Review/History keeps urgent action visible.
- Independent expected result: exact byte/string fixtures and deterministic key sequences compared with emitted ProductCommands and semantic frame text, not local component internals.
- RED: duplicate submit, paste submission, CJK loss, newline loss, stale revision, unavailable command mutation, hidden pending input, approval/retry bypass, focus escape, scroll reset, resize activation, and terminal composer authority.
- Permitted fakes: deterministic AgentClient port and renderer backend for automated cases; production PTY is required for terminal encoding and chord evidence.
- Matching surface: copied executable covers multiline ASCII/CJK paste, one steering message, one queued follow-up, approval while input is pending, rapid `100x30 -> 60x20 -> 80x24 -> 100x30` resize, palette fallback, and clean terminal restoration.
- Stop conditions: supported terminals cannot distinguish a required chord without the palette fallback, OpenTUI loses input or focus identity, or an urgent action disappears in narrow mode.

### Slice 4: contextual evidence lens and progressive review

**Scope:** Complete evidence selection, expansion, scrolling, and responsive detail for approval, command output, diff, changed files, checks, recovery, and final review.

- Public seam: ProductView fixtures, pure evidence-selection/expansion/scroll state, renderer frames, and real R3-A runtime views.
- Observable behavior: conversation remains primary; one contextual lens shows complete bounded evidence; routine rows stay compact; selected identity and scroll anchor survive updates/resize; urgent action is reachable without losing composer draft.
- Independent expected result: fixture matrices and external patch/output/check identities determine required detail and truncation/complete-or-blocked copy.
- RED: output/diff clipping without a visible continuation or blocked state, selection drift to another approval, hidden risk/isolation/network truth, card expansion changing runtime state, and narrow navigation losing action identity.
- Permitted fakes: closed maximum-volume ProductView fixtures; matching diff/output/repository evidence uses the real existing adapters.
- Matching surface: copied executable reviews representative maximum output and multi-file diff, switches all narrow views, resolves one exact approval, recovers one structured failure, and returns to the same transcript anchor.
- Stop conditions: the lens requires unbounded rendering, raw provider/private continuity, or a second review source of truth.

### Slice 5: copied-package R3-B evidence and milestone review

**Scope:** Run the complete affected suite and one copied-package production-TUI journey, publish a closed R3-B evidence record, and prepare the owner milestone review.

- Public seam: package archive, production PTY driver, independent fixture/repository oracle, evidence schema/validator, exact artifact hash, and diff/spec review.
- Observable behavior: the copied artifact covers onboarding/readiness, trusted repository task, streamed tools, exact approval, steer, queue, changed files/diff, command output, structured recovery, final answer, large output/diff, resize, CJK paste, focus safety, terminal restoration, and zero renderer-owned durable truth.
- Independent expected result: driver-owned terminal rows, repository bytes/status/diff oracle, expected command/event order, queue delivery order, and parent-shell sentinel.
- RED: remove an authority label, alter one expected message order, duplicate delivery, hide urgent action, reset focus/draft/scroll on resize, leak a canary, forge terminal success, or alter the package hash; validator must fail.
- Permitted fakes: deterministic provider transport for the closed journey. No fake package, TUI renderer, journal, Git/filesystem/process behavior, terminal input, or evidence validation.
- Matching surface: copied package passes `60x20`, `80x24`, and `100x30`, rapid resize, CJK/multiline input, representative output and diff, action/review navigation, and clean parent-shell return.
- Stop conditions: any acceptance row fails, evidence comes from source-tree execution only, current R3-A behavior regresses, or review finds an unresolved contract/authority defect.

## Acceptance criteria

- ADR 0020 and the focused public contracts are approved before Build.
- `conversation.steer` and `conversation.queue` are closed, replayable, budgeted ProductCommands with distinct delivery semantics.
- No accepted input is duplicated, silently dropped, or represented as delivered before it enters durable model context.
- Approval, retry, cancellation, effect dispatch, and terminal outcome authority remain outside the composer.
- The shell follows conversation spine plus evidence lens at wide/medium widths and the explicit minimal-stream/action fallback at narrow width.
- Every current R3-A tool/action/check has typed presentation with no generic authority-erasing fallback.
- Renderer state remains ephemeral and resize preserves the frozen identities and anchors.
- Automated, production PTY, copied-package, independent oracle, and evidence-validator rows pass after the last relevant change.
- R3-B ends at owner milestone review. R3-C, Build beyond this plan, external actions, publication, and release remain separately gated.

## Verification commands

Use focused commands named by each RED/GREEN slice, then at milestone review run at minimum:

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm code:check
pnpm markdown:check
pnpm peers check
bun test apps/eden/test/tui*.test.tsx apps/eden/test/tui-focus.test.ts
node --test scripts/r2-tui-pty.test.mjs scripts/terminal-screen.test.mjs
git diff --check
git status --short --branch
```

The Build phase must name the exact copied-package PTY invocation and output evidence path after the driver exists. Provider/network, Docker, hosted Actions, commit, push, package publication, and release remain `not-run` unless separately authorized.

## Risks and explicit amendment triggers

- Alt/Shift Enter encoding may vary across terminals; the palette fallback is mandatory, and any semantic remap requires review.
- Model-step reservation and queue terminalization touch kernel truth; a simpler renderer queue is not an acceptable fallback.
- More conversation turns and input lifecycle records may invalidate current fixture/journal headroom; Slice 0 blocks activation rather than raising limits silently.
- A large shell refactor may regress existing trust, onboarding, history, approval, or recovery paths; slices keep each current ProductView fixture in the acceptance matrix.
- Pinned OpenTUI behavior may differ from current upstream examples; only installed-version types and matching-surface evidence are authoritative.
- Generated visual references contain non-Eden labels and missing status details. They guide density only and cannot override this plan.

Stop and amend the Freeze packet if implementation needs a renderer/runtime replacement, a product-protocol breaking change, higher R3-A budgets, effect cancellation for steering, hidden approval/retry behavior, future R3-C/R3-D state, unbounded output/layout work, or a new public support claim.

## Non-goals

- R3-C Plan, GoalSpec, pause/resume activation, verifier, repair, Evidence Pack, or `succeeded`.
- R3-D child agent or web tools.
- Shell language, terminal command sessions, arbitrary stdin, background jobs, or stronger isolation/network claims.
- Provider, kernel, action, approval, or journal replacement; protocol-independent renderer state.
- Copying OpenCode, Pi, or oh-my-pi branding, logos, powerlines, exact layouts, palettes, or component code.
- Mouse-only interactions, animations, desktop UI, local service, daemon, IDE integration, or release packaging/publication.
- Updating support claims from source-tree screenshots or generated images.

## Rollback and amendment policy

Before Build, review may edit or reject this packet. After approval, implementation is fixed to these seams and slices. A discovery that changes message delivery, effect ordering, approval, budget, persistence, protocol compatibility, responsive authority, or evidence requirements stops the active slice and produces a visible ADR/plan amendment. It may not be hidden inside a renderer refactor.

No Build step may discard unrelated user changes. Commit, push, provider/network, Docker, hosted, publication, and release actions require separate authority.

## Human checkpoints

1. **Freeze review:** completed on 2026-08-11 when the owner accepted ADR 0020, the focused contract changes, and this plan as one R3-B packet.
2. **Build authorization:** granted separately on 2026-08-11 after Freeze publication.
3. **First core RED:** completed when the owner approved continuation and autonomous work within the frozen R3-B boundary.
4. **Exact candidate authority:** pending; commit and push remain separately gated.
5. **Milestone review:** review the formal copied-package R3-B evidence before R3-C begins.

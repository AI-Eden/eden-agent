# ADR 0020: Use a Conversation Spine and Typed Active-Run Intervention

- Status: Accepted; Build authorized; first-core RED reviewed; Slices 0-4 candidate locally green
- Date: 2026-08-11
- Decision source: R3-B TUI Explore and owner design-direction checkpoint on 2026-08-11
- Scope: R3-B terminal information architecture, responsive degradation, and active-run input authority

## Context

R3-A established the real runtime states that the terminal product must expose: streamed model work, bounded read-only batches, exact approvals, edits and new-file creation, structured commands, changed files, diff, failures, retry boundaries, budgets, and non-success `completed` review. The current TUI proves those states but organizes them as an evidence-oriented implementation surface. It has a pre-run single-line task input, no truthful active-run composer, generic tool presentation paths, a mostly statistical wide session area, and renderer-local pane state that does not yet form a coherent daily coding loop.

Research into current OpenCode, Pi, and oh-my-pi terminal products showed three reusable principles without establishing a copy target: keep the transcript and composer as the stable reading path, compress routine tool activity until detail is requested, and make pending human action impossible to miss. Their framework choices, permission models, powerlines, brand treatments, and exact layouts do not override Eden's OpenTUI, React, AgentClient, ProductView, journal, approval, or recovery contracts.

The owner selected the conversation-first direction on 2026-08-11, allowed a minimal stream plus action overlay as the narrow fallback, and required the active-run composer to become a real typed steering and queue contract. Two generated images were accepted as non-normative visual references in the private tutorial repository. They communicate density and hierarchy only; they are not public dependencies or implementation specifications.

## Decision

### Conversation spine and evidence lens

The primary surface is a continuous transcript containing complete user input, complete model answers, and compact typed activity rows. A persistent multiline composer remains attached to every non-terminal active run. A restrained authority/status bar keeps workspace, run state, phase, provider/model, budget, trust/network/isolation truth, and current risk visible.

Evidence is contextual rather than permanently dominant. Diff, command output, approval, recovery, checks, changed files, and final review open in one evidence lens selected from durable ProductView truth. Routine read activity is collapsed by default. An urgent approval, retry, or recovery boundary remains visible even when its detailed lens is closed.

The shell has explicit regions for app/session navigation, transcript, active composer, authority/status, contextual evidence, and overlays. A typed presentation registry may share spacing, focus, and expansion behavior, but it preserves each tool, action, approval, check, and recovery shape. It cannot introduce a generic execution schema or render future Plan, Goal, child, web, verifier, or Evidence Pack state before those contracts exist.

### Responsive degradation

The existing viewport classes remain fixed unless matching evidence requires an explicit amendment:

- narrow when width is at most 60 columns or height is at most 20 rows;
- medium when width is at most 80 columns or height is at most 24 rows;
- wide otherwise.

Wide shows session navigation, the conversation spine, and the evidence lens. Medium keeps conversation plus evidence and moves session navigation to an overlay. Narrow becomes one primary column with explicit `Chat`, `Action`, `Review`, and `History` switching. This narrow mode borrows the minimal-stream/action-overlay principle, but a compact urgent-action rail remains visible in every view. Resize preserves focus identity, active approval identity, selected evidence, expansion, draft, pending-input identity, and scroll anchor.

### Typed active-run input

R3-B adds two closed ProductCommand variants: `conversation.steer` and `conversation.queue`. Both carry the existing command/run/revision envelope and non-empty well-formed Unicode content whose UTF-8 encoding is at most 4 KiB. Runtime assigns the durable message identity at acceptance and correlates it with the command identity. At most eight active-run inputs and 16 KiB aggregate input bytes are accepted per run. At most one steering message and three queued follow-ups may be pending simultaneously.

Acceptance is durable and idempotent by command identity. Before appending acceptance, runtime reserves one remaining model step for that message. A command is rejected without journal mutation when its shape, revision, run, byte budget, pending limit, or model-step reservation is unavailable. Ordinary provider dispatch cannot consume capacity reserved for pending input. When the current turn reaches its last unreserved step, tools are disabled so that the step must close with an answer before queued capacity is consumed. Delivery releases one reservation and consumes that capacity through normal provider dispatch; it does not raise the immutable run grant.

A steering message applies to the current agent turn. It never aborts or rewrites an already dispatched provider, tool batch, action, command, or check. Runtime delivers it after the current in-flight effect closes and before the next provider request. If exact approval or explicit model retry is pending, the accepted steering message remains visible and waits; it does not resolve approval or trigger retry.

A queued message applies after the current agent turn. It remains FIFO until a model `stop` that would otherwise produce terminal `completed`. Runtime first persists the complete assistant answer, then delivers the oldest queued user message and continues through its reserved provider step. `completed` is emitted only when a model `stop` has no deliverable steering or queued input. Pending messages close with a structured reason if the run is cancelled, blocked, failed, or otherwise becomes terminal before delivery.

`conversation.input.updated` projects accepted, delivered, and closed input lifecycle updates. ProductView exposes one `conversationInput` projection with exact input availability, message identities and modes, pending/closed state, counts, remaining input budget, reservation truth, and structured unavailability or closure reasons. Delivered input becomes a typed user turn in the durable conversation. Draft text, cursor, selection, and editor history remain renderer state and never enter ProductView until submission succeeds.

This is an additive protocol v1 extension: the commands and event are new closed union variants, `ProductView.conversationInput` is optional for pre-R3-B snapshots and journals, and every active R3-B run must project it. Existing required shapes and existing conversation-turn meanings remain decodable. If Build requires changing an existing required shape or reinterpreting a durable value, it must stop for an explicit protocol amendment.

The default keyboard mapping is `Enter` to steer, `Alt+Enter` to queue, and `Shift+Enter` to insert a newline. Paste never submits. Command-palette actions provide equivalent steering and queue submission if a supported terminal cannot distinguish a chord. A matching-surface failure requires an explicit keymap amendment rather than a silent platform-specific semantic change.

## Consequences

R3-B is not a visual-only refactor. The active composer extends ProductCommand, ProductEvent, ProductView, kernel state, journal replay, provider-context ordering, budget accounting, and AgentClient behavior before the renderer can expose it. That contract work must land test-first before the shell uses the new controls.

The design keeps Eden's identity as a calm evidence instrument: conversation is the main reading flow, semantic color communicates status rather than decoration, and evidence expands at decision boundaries. The accepted reference images may guide density and hierarchy, but copied product names, logos, powerlines, exact colors, exact pane ratios, and generated text defects are excluded.

R3-B does not activate pause/resume, Plan, Goal, verifier success, repair, child agents, web tools, a general shell, a renderer replacement, or a protocol-independent TUI source of truth. Approval of this ADR and its companion plan did not itself authorize Build or external actions. The owner separately authorized Build and reviewed the first-core RED on 2026-08-11. Commit, push, provider/network, package publication, and release authority remain separately gated.

## Rejected alternatives

- **Review workbench as the permanent primary surface:** keeps evidence visible but compresses the transcript and composer during the normal coding loop.
- **Minimal stream with action overlay at every width:** is calm and inexpensive but hides session and review context on medium and wide terminals.
- **Renderer-only active composer:** looks interactive while lacking durable delivery, replay, budget, and failure truth.
- **One ambiguous submit command:** makes steering and queued follow-up semantics depend on local key handling rather than a closed product command.
- **Interrupt in-flight effects for steering:** would silently broaden cancellation, action, approval, and recovery contracts.
- **Copy another terminal product's visual system:** imports branding and assumptions that do not match Eden's authority model or pinned OpenTUI/React stack.

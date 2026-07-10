# Initial Research Synthesis

## Status and purpose

This document records the research thesis that led to eden-agent's product and architecture direction. It is independent background, not a normative specification. Accepted ADRs, `SPEC.md`, and `PRODUCT.md` take precedence.

The research asks a portfolio-driven question: what should a solo, open-source coding-agent project own and demonstrate if its author wants to show both harness engineering and independent product ability?

## Executive conclusion

eden-agent should be a product-grade, evidence-driven coding agent: a replayable TypeScript harness beneath a trustworthy terminal product and, later, a cross-platform desktop control plane.

Its differentiated center is not maximum tool count or another chat UI. It is the combination of:

- snapshot-safe editing;
- monotonic capability boundaries;
- durable, digest-bound human approval;
- verifier-owned completion;
- event replay and trace-to-evaluation workflows;
- an interface that makes progress, authority, changes, checks, and recovery legible.

The terminal product is part of the architecture from the first vertical slice. A desktop app is a valuable later target because it exercises local protocols, process boundaries, release engineering, and multi-session product design, but it must follow a local-service gate instead of driving an early rewrite.

## From one loop to three

Modern agent reliability is easier to understand as three interacting loops.

### Model-tool loop

The inner loop assembles context, calls a model, routes tool requests, returns structured observations, and manages token and tool budgets. Tool design, errors, context provenance, and prompt composition live here.

### Task-convergence loop

The middle loop turns intent into an accepted plan or goal, enforces authority, checks the actual workspace, repairs within budgets, pauses for durable human input, and decides whether work is terminal. This is where false completion must be solved structurally rather than rhetorically.

### Harness-improvement loop

The outer loop converts traces and dogfood failures into reproducible scenarios, compares alternatives across multiple trials, ablates scaffolds, and ratchets quality without relying on anecdotal transcripts.

This produces seven working principles:

1. Completion is a runtime state, not natural language.
2. The repository and journal are durable memory; the context window is a working set.
3. Evaluate outcomes before interpreting transcripts.
4. Every scaffold should be removable in an ablation.
5. Tools and context both consume budgets.
6. Sandbox isolation and approval policy are separate control planes.
7. Product interfaces project runtime semantics instead of owning parallel state machines.

## What the reference systems contribute

### Pi

Pi demonstrates the value of a small core, composable extensions, a session tree, and minimal default context. Eden adopts the pressure toward simplicity and explicit composition. It does not outsource core safety, journaling, or verified completion to optional plugins.

### oh-my-pi

[oh-my-pi](https://github.com/can1357/oh-my-pi) is more than a list of features added to Pi. It is useful evidence about where a lightweight harness encounters production pressure.

The most valuable lessons are:

- Measure harness changes. A native search or edit primitive is valuable only with before/after evidence.
- Keep TypeScript as the orchestration language while using native code for narrow, measured primitives.
- Treat editing as a concurrency protocol. Reads establish snapshots; writes must fail safely when the workspace drifts.
- Use progressive disclosure for tools rather than placing an ever-growing catalog in the initial prompt.
- Model subagents with lifecycle, inherited capability, budgets, isolation, child journals, and cancellation—not as a single function call.

Features such as a continuous advisor model, image-based history compaction, autonomous memory, broad IDE/debugger/browser integration, or a large default tool inventory are interesting experiments but poor v0.1 defaults. They increase cost and state space before Eden proves its core thesis.

oh-my-pi's implementation also supports a restrained native strategy: benchmark a narrow boundary first; do not rewrite the runtime for aesthetic reasons.

### OpenCode

[OpenCode](https://github.com/anomalyco/opencode) provides strong reference points for Plan/Build separation, agent configuration, permissions, and a product-quality TUI. Eden adopts profile-based behavior and interface craft while avoiding competition on the number of tools or providers.

### Codex

[OpenAI Codex](https://github.com/openai/codex) reinforces default-safe execution, repository instructions, worktree-aware operation, approvals, and the value of native code where profiling and distribution justify it. The broader product direction around long tasks and reviewable artifacts supports Eden's emphasis on session continuity and evidence.

### Claude Code

[Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview) is a reference for mature context discipline, low-friction terminal interaction, human-in-the-loop control, and continuity across terminal, IDE, desktop, and web surfaces. Eden should study observable behavior and public documentation, not reproduce leaked proprietary source.

### Karpathy-style outer loops

AutoResearch-like workflows make the harness itself an optimization target: define a metric, run bounded experiments, preserve improvements, and turn failures into the next experiment. Eden Lab generalizes this principle to coding-agent behavior, security, and product quality.

## Vercel Eve: valuable reference, wrong core dependency

[Vercel Eve](https://github.com/vercel/eve) describes itself as a framework for building agents. Its strongest ideas are durable backend sessions, filesystem-first authoring, human-in-the-loop suspension, sandboxed execution, subagent budgets, and evaluation primitives.

### Concepts worth adopting

Session, turn, and step form a useful durable hierarchy:

- a session is the recoverable task container;
- a turn captures a user-agent interaction boundary;
- a step records one model, tool, policy, approval, or verification transition.

Durable human-in-the-loop behavior is particularly relevant. Approval is not an in-memory modal callback; it is a persisted state that can survive process exit and resume without changing the action being approved.

Filesystem-first authoring is valuable because state is inspectable, diffable, and portable. Eden should apply that to plans, goals, evidence, fixtures, and reports while keeping schemas explicit.

Eve's sandbox and evaluation models are also useful comparison points. Eden can adopt vocabulary and test ideas without adopting framework-owned execution semantics.

### Why not build Eden on Eve

Direct use would have both positive and negative portfolio effects. It could accelerate a durable app prototype and demonstrate framework fluency. However, Eden's primary résumé claims—the coding loop, policy, journal, completion protocol, and trace-to-eval architecture—would partly belong to Eve.

The product semantics also differ. Eve is a general agent framework; Eden is a local coding product with repository drift, diffs, checks, worktrees, shell authority, and edit consistency at its center.

Therefore Eve is best used later as:

- a design reference;
- an optional remote execution adapter;
- a baseline in evaluation;
- a rapid prototype environment for non-core experiments.

It should not own Eden's kernel or convergence loop.

## Productization as a technical axis

Without a complete user surface, Eden could have an elegant reducer, policy engine, and benchmark while still requiring users to infer task state from commands and logs. That would under-signal product judgment and independent delivery.

Product requirements deepen the harness:

| User need | Required systems capability |
| --- | --- |
| Resume after closing the app | Durable journal, checkpoint, idempotent effects |
| Understand current work | Event projection and stable view models |
| Approve one risky command | Scoped approval, pause/resume, digest checks |
| Continue from another surface | Versioned protocol and one source of truth |
| Review the result | Diff, checks, artifacts, and Evidence Pack |
| Install and update safely | Packaging, migration, release CI, and diagnostics |
| Report a problem privately | Redaction and sanitized diagnostic bundles |

Productization is therefore not a decorative chat layer. It forces durability, security, observability, protocol, recovery, and release engineering to become real.

## Recommended product surfaces

### Terminal product

`eden` should default to a full-screen TUI and `eden exec --json` should support scripts and evaluations. The TUI is the v0.1 product, not a demo. It needs onboarding, session navigation, plan review, approvals, progress, changed files, diff, checks, evidence, steering, pause, resume, cancel, and explicit recovery.

The R0 renderer spike should compare [OpenTUI](https://github.com/anomalyco/opentui) with a Node-oriented option such as Ink. Decision evidence includes Windows and macOS behavior, Chinese IME, wide characters, paste, resize, large output, large diffs, startup, memory, frame latency, testing, and binary distribution. Renderer novelty is not a selection criterion.

### Eden Studio

A later desktop app is a meaningful target because it demonstrates:

- local service and versioned IPC design;
- process and trust boundaries;
- multi-project and multi-session interaction;
- rich diff, checks, and artifact review;
- keychain, notifications, deep links, installers, and updates;
- Windows, macOS, and Linux release engineering.

It should be an agent control plane, not an editor. The default spike is Tauri 2 with a packaged TypeScript sidecar and a narrow Rust host. Electron is a valid fallback if sidecar, PTY, packaging, or cross-platform evidence favors it. The engineering story is the measured trade-off, not the framework brand.

## Recommended architecture

### Stable boundaries

- `contracts`: versioned product commands, events, view models, and errors.
- `kernel`: pure events, state reduction, and effect decisions.
- `coding-runtime`: context, tools, policy, workspace, journal, profiles, goals, and verification.
- `providers`: single-step model adapters.
- `lab`: scenarios, replay, graders, and reports.
- `apps/eden`: TUI, headless CLI, terminal lifecycle, and composition.

Future `agentd` and desktop packages appear only after the local-service gate. A native crate appears only after profiling.

### Run profiles

Explore, Plan, Build, Goal, and Review are profiles over one runtime, not independent agents. Profiles compose instructions, tool policy, stop policy, verifiers, and budgets.

- Explore and Review are read-only.
- Plan may write only a session plan artifact.
- Build allows policy-controlled workspace changes.
- Goal adds a GoalSpec, repair budget, checkpoints, and verifier-owned terminal state.

### Context

Keep initial context small, sourced, and explainable. Use hierarchical `AGENTS.md` rather than a new Eden-specific instruction file. Record why each context item was selected. Compaction must preserve tool and task invariants rather than merely summarize prose.

### Tools and editing

Start with listing, bounded reads, search, command execution, Git status/diff, verification, and AnchorEdit. Tool results have model-facing content, product-facing structure, and trace-facing diagnostics.

AnchorEdit v1 uses snapshot identity and explicit anchors. A stale snapshot returns an actionable error that teaches the next safe step. LSP is lower priority than a correct edit protocol and verifier.

### Policy and sandbox

Use allow, ask, and deny decisions with capabilities that only shrink through composition. Keep trusted-host, Docker, and native sandbox claims distinct. Approval UI is part of the security boundary because the displayed action must match executed bytes and scope.

### Goal and completion

GoalSpec defines scope, checks, artifacts, capabilities, budgets, and stop conditions. The verifier checks current repository evidence and owns success. Failed required checks may trigger bounded repair, blocking, or failure, never optimistic completion.

### Subagents

Subagents arrive after the single-agent runtime is reliable. The first two are a read-only ExploreAgent and a read-only ReviewAgent. They inherit narrower capabilities and budgets, use child journals, return structured artifacts, and cannot silently edit the parent workspace.

### Rust

Do not port the kernel, orchestration, or policy engine. Candidate native primitives include search, diff, parsing, file watching, PTY, or sandbox integration only after a profile shows a user-visible bottleneck and a benchmark justifies the boundary.

## Delivery roadmap

### R0: product contract and spikes

Freeze product, specification, architecture, threat, event, contracts, goal, evaluation, and UX documents. Build deterministic kernel and product fixtures plus a real terminal-framework spike.

### R1: installable walking skeleton

Deliver contracts, reducer, dispatcher, JSONL journal, replay, fake model and tools, default TUI, headless JSON, workspace trust, approval, crash-boundary tests, and clean installation. Fake data must travel through real contracts.

### R2: usable minimal coding product

Add one real provider, core repository tools, AnchorEdit, policy, trusted-host and Docker execution, onboarding, structured action cards, changed files, diff, basic checks, actionable recovery, and `eden doctor`.

### R3: verified goal product

Add GoalSpec, plan approval, verifier and bounded repair, checkpoints, worktree support, durable resume, Evidence Pack, review flow, diagnostics, release artifacts, and a concise product demo. R3 is the first résumé-ready product.

### R4: Eden Lab and hardening

Publish multi-trial comparisons, failures, baselines, trace viewer, product-performance suites, redaction tests, and dogfood-derived regression fixtures.

### R5-R6: local service and Eden Studio

First prove snapshot/cursor subscriptions, authenticated local IPC, reconnect, version negotiation, packaging, and the Tauri/Electron trade-off. Then build the desktop alpha on the same runtime truth.

### R7: selective expansion

Choose second provider, subagents, skills, MCP, IDE adapter, LSP, optional Eve runner, or one native primitive only when a user story or benchmark supports it.

## Portfolio and interview value

The strongest demonstration is a short, inspectable journey: give Eden a failing repository task, review its plan, reject or approve a scoped action, interrupt and resume, watch a stale edit recover safely, then inspect the diff, checks, and Evidence Pack.

The author should be able to explain:

- why success is a verifier event;
- how replay avoids repeating side effects;
- why product and kernel events differ;
- how capabilities shrink and approvals bind to execution;
- why the TUI does not own state;
- what data selected the renderer or a native port;
- which failure became a regression fixture;
- why Eve is a reference or adapter rather than the core.

That story combines architecture, systems judgment, experimentation, security, user experience, and delivery. It is stronger than a longer feature list.

## Selected references

- [OpenAI Codex](https://github.com/openai/codex)
- [Anthropic Claude Code overview](https://docs.anthropic.com/en/docs/claude-code/overview)
- [OpenCode](https://github.com/anomalyco/opencode)
- [Pi mono repository](https://github.com/badlogic/pi-mono)
- [oh-my-pi](https://github.com/can1357/oh-my-pi)
- [Vercel Eve](https://github.com/vercel/eve)
- [OpenTUI](https://github.com/anomalyco/opentui)
- [Tauri 2](https://v2.tauri.app/)
- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)

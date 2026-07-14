# Terminal Framework Selection Case Studies

- Status: Decision support for the R0 runtime-and-renderer checkpoint
- Research date: 2026-07-14
- Related evidence: [local terminal framework spike](terminal-framework-spike.md)
- Source policy: first-party repositories, project documentation, release history, and package artifacts only

## Question

Why does OpenCode use OpenTUI while Gemini CLI and Claude Code use Ink, and what should `eden-agent`
learn from the difference?

## Short answer

The three projects did not make equivalent greenfield choices at the same time.

- OpenCode 1.0 replaced a Go and Bubble Tea TUI that its maintainers explicitly described as having
  performance and capability problems. The same organization built OpenTUI as an in-house Zig and
  SolidJS framework and rewrote the product TUI around it.
- Gemini CLI used Node, React, and Ink from its first public commit. Its open-source repository still
  maintains that architecture for enterprise and API-key users. Google has nevertheless moved its
  strategic consumer terminal experience to Antigravity CLI, a Go implementation intended to share an
  architecture with the Antigravity desktop product.
- Claude Code launched before OpenTUI powered OpenCode in production. Public evidence confirms React
  and Ink continuity, but Anthropic does not publish the product source or a framework-selection ADR.
  A specific Claude Code rationale therefore cannot be verified and must remain an inference.

The difference is primarily about chronology, existing UI investment, product shape, and framework
ownership. It is weak evidence for a universal framework winner. It is useful evidence about where each
choice places complexity.

## Evidence boundary

This note separates three evidence levels:

1. **Explicit**: the project or framework owner states the fact or reason.
2. **Observed**: a first-party manifest, source file, commit, or configuration demonstrates the fact.
3. **Inferred**: the explanation follows from explicit and observed evidence but is not stated by the
   project owner.

The OpenCode migration reason is explicit. Gemini CLI's initial and current open-source architecture is
observable, and Google has explicitly announced the consumer transition to Antigravity CLI, but its
original comparison against alternatives is not documented. Claude Code's framework rationale is not
public.

## OpenCode: a vertically owned rewrite

### What is explicit

The [OpenCode 1.0 migration commit](https://github.com/anomalyco/opencode/commit/96bdeb3c7b04e95ecabaa0253deddd2a22e14afe)
added a migration note that says the previous Go and Bubble Tea TUI suffered from performance and
capability issues. It describes the replacement as an in-house framework, OpenTUI, written in Zig and
SolidJS. The commit added more than eight thousand lines and replaced a separately built Go TUI with a
TypeScript/Solid application connected to the same OpenCode server.

OpenTUI's [official introduction](https://opentui.com/docs/getting-started/) states that it is a native
Zig terminal UI core with TypeScript bindings, focuses on correctness, stability, and performance, and
powers OpenCode in production.

### What is observed now

At source commit
[`775f687`](https://github.com/anomalyco/opencode/tree/775f687ca9f39ff034af498f8febab1bb41aae1f),
OpenCode pins `@opentui/core`, `@opentui/keymap`, and `@opentui/solid` 0.4.3. Its
[TUI package](https://github.com/anomalyco/opencode/blob/775f687ca9f39ff034af498f8febab1bb41aae1f/packages/tui/package.json)
runs tests with Bun and depends directly on those three packages. Its
[application root](https://github.com/anomalyco/opencode/blob/775f687ca9f39ff034af498f8febab1bb41aae1f/packages/tui/src/app.tsx)
uses the Solid renderer, the native CLI renderer, a managed keymap, routes, dialogs, sidebars, and a
command palette.

The framework supplies product-level terminal primitives rather than only layout:

- a [textarea](https://opentui.com/docs/components/textarea/) with multiline cursor movement,
  selection, undo, redo, wrapping, and configurable bindings;
- a [keymap engine](https://opentui.com/docs/keymap/overview/) with layers, command metadata,
  multi-stroke sequences, focus-aware dispatch, and diagnostics;
- an [in-memory renderer](https://opentui.com/docs/core-concepts/testing/) that captures character
  frames, spans, cursor state, native statistics, resize, keyboard, and mouse input;
- Solid bindings with native textarea, markdown, code, diff, scrollbox, and select components.

### What follows

OpenCode could justify a large rewrite because it owned both sides of the boundary: the product and the
replacement framework. Product requirements could become framework features, and framework defects could
be fixed without waiting for an external maintainer. OpenTUI is therefore part of OpenCode's vertical
product stack, not an ordinary third-party dependency.

That ownership also changes the risk calculation. OpenCode can absorb rapid framework evolution that
would be a material external-dependency risk for another project. Its adoption is strong evidence that
OpenTUI can support a complex agent workbench, but weaker evidence that every independent CLI should take
the same maintenance trade.

## Gemini CLI: an Ink system that evolved in place

### What is explicit and observed

Gemini CLI's [first public commit](https://github.com/google-gemini/gemini-cli/commit/add233c5043264d47ecc6d3339a383f41a241ae8)
on 2025-04-17 describes the terminal UI as Ink-based. The initial manifest used Node, React 18, Ink 5,
`ink-text-input`, `ink-select-input`, and `ink-spinner`. Ink was part of the product foundation rather
than a later response to a framework comparison.

The current [project context](https://github.com/google-gemini/gemini-cli/blob/main/GEMINI.md) still
names Node as the runtime and React with Ink as the UI framework. The current
[CLI manifest](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/package.json) uses React
19.2.4 and aliases `ink` to the maintained `@jrichman/ink` 6.6.9 fork. The fork entered through
[commit `f8ce358`](https://github.com/google-gemini/gemini-cli/commit/f8ce3585eb60be197874f7d0641ee80f1e900b24).

Gemini CLI has continued to build terminal infrastructure around Ink. Its
[configuration reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md)
exposes an Ink render process, a terminal-buffer architecture, alternate-buffer mode, incremental
rendering, and a plain-text screen-reader mode. At the research date, the render process is enabled by
default while terminal-buffer and alternate-buffer modes remain opt-in.

### The strategic terminal path changed in 2026

Google's [2026-05-19 transition announcement](https://github.com/google-gemini/gemini-cli/discussions/27274)
states that the Gemini terminal experience for free, Google AI Pro, and Google AI Ultra users is moving
from Gemini CLI to Antigravity CLI. Google describes Antigravity CLI as a Go implementation that is
snappier, supports asynchronous background workflows, and shares an architecture with Antigravity 2.0
on the desktop. Consumer-tier Gemini CLI requests were scheduled to stop on 2026-06-18.

This is not a complete shutdown of the Ink codebase. The same announcement says enterprise access and
API-key access are unaffected and that the open-source Gemini CLI repository will continue receiving
model releases, bug fixes, and security updates. The correct current description is therefore two-track:
the maintained open-source and enterprise product remains an Ink system, while Google's strategic
consumer terminal product has moved to a Go-based successor.

### What is inferred

No public Gemini CLI document says that the team compared current Ink with current OpenTUI and selected
Ink on technical merit. The defensible explanation for the maintained Ink codebase is continuity:

- the project began as a Node and React codebase before OpenTUI powered OpenCode in production;
- Ink gave the initial team familiar React composition, Yoga layout, and an existing CLI ecosystem;
- the current UI contains a large React component and test estate;
- maintaining a focused Ink fork and adding buffer/process layers costs less organizationally than a
  complete renderer rewrite, as long as the result continues to meet product requirements.

Gemini CLI demonstrates that Ink can support a large agentic CLI when a team is willing to own advanced
input, buffering, scrolling, flicker control, and renderer changes above or inside Ink. It does not show
that those features are free. The Antigravity transition also shows that accumulated renderer investment
does not prevent a larger replacement when product unification, background execution, or responsiveness
becomes more important than preserving the existing UI estate.

## Claude Code: confirmed continuity, unpublished rationale

### What can be confirmed

Anthropic introduced Claude Code as a research preview on
[2025-02-24](https://www.anthropic.com/news/claude-3-7-sonnet), before OpenTUI's OpenCode production
rewrite. Ink's [official project page](https://github.com/vadimdemedes/ink) lists Claude Code as a
production user. Anthropic's public
[changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md) records React Compiler work,
per-frame rendering reductions, synchronized terminal output, fullscreen behavior, mouse support,
screen-reader work, and repeated fixes for flicker, scrolling, streaming, and long content.

The public `anthropics/claude-code` repository is not the product source repository. Neither the
[launch announcement](https://www.anthropic.com/news/claude-3-7-sonnet) nor the later
[product history](https://www.anthropic.com/features/making-of-claude-code) publishes an Ink selection
rationale.

### What is inferred

The available evidence supports a narrow inference: Claude Code adopted an established React/Ink path
early and has accumulated substantial product and renderer investment on it. Continued optimization of
that path is less disruptive than a renderer migration. It would be speculation to claim that Anthropic
recently compared Ink and OpenTUI, or that Ink won such a comparison.

Claude Code also shows that renderer choice and distribution choice are separable. A product can retain
a React/Ink UI while changing installers, packaging, process architecture, and terminal modes around it.
`eden-agent` should therefore decide Bun versus Node and OpenTUI versus Ink as controlled comparisons,
as the approved spike already does.

## What the framework difference actually means

Ink describes itself as [React for CLIs](https://github.com/vadimdemedes/ink). It is a React renderer
with Yoga Flexbox layout and a small set of core terminal components and hooks. That makes it attractive
when React familiarity, JavaScript portability, ecosystem maturity, and incremental adoption dominate.
Complex editor and terminal-buffer semantics remain largely application or ecosystem concerns.

OpenTUI describes itself as a native terminal UI core. It owns more of the terminal stack and provides
managed editor, keymap, code, diff, markdown, rendering, and test surfaces. That makes it attractive when
the terminal is a persistent application surface with multiple focus regions, large navigable content,
rich editing, and strict frame behavior. The cost moves into native packaging, FFI, a larger artifact,
and a younger, faster-changing API surface.

The choice is therefore less "React versus Solid" than "how much terminal machinery should the framework
own?"

| Decision pressure | Ink tends to fit | OpenTUI tends to fit |
| --- | --- | --- |
| Existing UI estate | Large React component and test estate | Greenfield or planned renderer rewrite |
| Product surface | Conversational or scrollback-first CLI | Managed, application-like TUI with routes and focus regions |
| Input ownership | Team accepts owning composer/editor policy | Team wants a managed textarea and keymap |
| Rendering ownership | React renderer plus application buffer logic | Native frame renderer and terminal lifecycle |
| Distribution | Prefer a mature JS/Node path and smaller native surface | Accept native packages and larger standalone artifacts |
| Framework control | External framework with app-level extensions or a maintained fork | Close collaboration with, or trust in, a young native framework |
| Migration economics | Preserve a working React system | Replace a limiting renderer or start without legacy UI code |

## Lessons for `eden-agent`

### 1. Do not count product names as votes

OpenCode, Gemini CLI, and Claude Code validate that both framework families can ship serious agentic
products. Their choices do not form a two-to-one vote for Ink because they were made at different times,
from different starting points, with different ownership and migration costs. Google's consumer move
from the Ink-based Gemini CLI to a Go successor makes the vote-counting interpretation even less useful.

### 2. OpenCode is the closer product-shape analogue

The planned `eden-agent` surface includes a multiline composer, approvals, focus transitions, large output,
large diffs, recovery, and responsive layouts. Those requirements are closer to an application-like TUI
than to a minimal prompt-and-stream CLI. OpenTUI's managed textarea, keymap, diff/code components, and
deterministic renderer tests directly address those needs.

### 3. Gemini CLI and Claude Code are stronger evidence for Ink's ceiling than its cost

They show that Ink can be extended to a sophisticated product. Gemini CLI's fork and buffer/process work,
and Claude Code's continuing rendering work, also show the engineering ownership required after the basic
React component model stops being the hard part. Antigravity shows the other possible outcome: replace the
terminal architecture when maintaining the existing renderer is no longer aligned with the product path.

### 4. OpenCode understates OpenTUI dependency risk for outsiders

OpenCode develops against its own framework. `eden-agent` would consume OpenTUI as an external native
dependency. The local spike's maintenance and distribution deductions remain valid even though OpenCode
uses the same stack successfully.

### 5. The local spike remains the deciding evidence

The local comparison already controls runtime, fixture, actions, tests, packaging, and Windows Terminal
QA. OpenTUI/Bun led Ink/Bun by seven weighted points and cleanly supplied the vertical multiline cursor
behavior that required custom work in the bounded Ink prototype. The case studies explain that result;
they do not replace it.

## Selection implication

This research strengthens the provisional **OpenTUI/Bun** recommendation for `eden-agent`, for reasons
specific to this repository:

- the UI is greenfield, so there is no React/Ink migration cost;
- the required surface benefits from framework-owned editing, keymaps, diffs, and deterministic frames;
- Bun is already the eligible runtime in the controlled comparison;
- the spike observed a material renderer advantage after charging OpenTUI for native distribution and
  maintenance risk.

The recommendation should carry explicit containment rules:

1. Keep OpenTUI, Solid, keymap, Bun, and native types inside the application/renderer boundary.
2. Keep the shared fixture and black-box oracle independent of the renderer.
3. Pin OpenTUI and Bun versions; upgrade only with the renderer, process, packaging, and terminal QA suite.
4. Preserve current-baseline Linux, Windows, and macOS package smoke as a release gate.
5. Treat real-terminal input and cleanup QA as required evidence for supported terminal changes.
6. Keep the Ink spike as fallback evidence until the selected renderer reaches its first production
   acceptance checkpoint; do not maintain both as production implementations.

The decision remains human-owned. The external case studies add context, but they do not remove the
platform-evidence risks recorded in the [R0 spike report](terminal-framework-spike.md).

## Primary sources

Accessed 2026-07-14:

- [OpenCode 1.0 / OpenTUI migration commit](https://github.com/anomalyco/opencode/commit/96bdeb3c7b04e95ecabaa0253deddd2a22e14afe)
- [OpenCode current TUI package](https://github.com/anomalyco/opencode/blob/775f687ca9f39ff034af498f8febab1bb41aae1f/packages/tui/package.json)
- [OpenCode current TUI application root](https://github.com/anomalyco/opencode/blob/775f687ca9f39ff034af498f8febab1bb41aae1f/packages/tui/src/app.tsx)
- [OpenTUI introduction and runtime support](https://opentui.com/docs/getting-started/)
- [OpenTUI textarea](https://opentui.com/docs/components/textarea/)
- [OpenTUI keymap](https://opentui.com/docs/keymap/overview/)
- [OpenTUI renderer testing](https://opentui.com/docs/core-concepts/testing/)
- [Gemini CLI initial commit](https://github.com/google-gemini/gemini-cli/commit/add233c5043264d47ecc6d3339a383f41a241ae8)
- [Gemini CLI project context](https://github.com/google-gemini/gemini-cli/blob/main/GEMINI.md)
- [Gemini CLI current manifest](https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/package.json)
- [Gemini CLI Ink-fork adoption](https://github.com/google-gemini/gemini-cli/commit/f8ce3585eb60be197874f7d0641ee80f1e900b24)
- [Gemini CLI configuration reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md)
- [Gemini CLI to Antigravity CLI transition announcement](https://github.com/google-gemini/gemini-cli/discussions/27274)
- [Claude Code launch announcement](https://www.anthropic.com/news/claude-3-7-sonnet)
- [Claude Code public changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)
- [The Making of Claude Code](https://www.anthropic.com/features/making-of-claude-code)
- [Ink project and current user list](https://github.com/vadimdemedes/ink)

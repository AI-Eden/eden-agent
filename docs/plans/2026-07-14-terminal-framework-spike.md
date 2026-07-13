# R0 Terminal Runtime and Framework Spike Plan

- Status: Approved
- Approved: 2026-07-14
- Execution: Slices 1-4 complete; Slice 5 pending
- Date: 2026-07-14
- Roadmap stage: R0, Product Contract and Architecture Spikes
- Human checkpoint: approve this plan before execution; choose a release runtime and renderer only after the evidence report is complete

## Goal and user-visible outcome

Produce reproducible evidence for choosing the release runtime and terminal renderer for the first `eden` terminal product. Compare three controlled candidate combinations: Ink on Node, the same Ink implementation on Bun, and OpenTUI on Bun. Every combination must drive the same small Eden journey through a real terminal, survive the same automated scenarios, and expose its runtime, packaging, cross-platform, and maintenance costs.

The preferred release hypothesis is a standalone Bun executable, but it remains subject to the same hard gates as every candidate. Ink/Node is the control and fallback, Ink/Bun isolates the runtime choice, and OpenTUI/Bun isolates the renderer choice. This plan ends with a recommendation and a human runtime-and-renderer checkpoint. It does not select a final combination in advance, replace the scaffold CLI, or begin the next contracts-and-reducer implementation slice.

## Current repository facts

- `CONTEXT.md` identifies this comparison as the next R0 decision and confirms that no framework has been selected.
- `PRODUCT.md` makes the keyboard-first TUI the v0.1 default while requiring it to share execution truth with the headless surface.
- `SPEC.md` remains `Draft for R0`; changes to trust, terminal states, public product contracts, or non-goals require an ADR and human approval.
- ADR 0005 requires a real terminal-interface spike in R0 and forbids building a renderer from scratch.
- ADR 0006 requires every future surface to consume one runtime through product contracts and an `AgentClient` port.
- `apps/eden/src/index.ts` is still an R0 scaffold. Production TUI integration is outside this plan.
- `packages/contracts` has no executable schemas or `ProductView` fixtures. Those belong to the second public plan.
- The repository currently uses Node 24, pnpm 11.7, TypeScript 5.9, Biome, and Node's built-in test runner. Bun is not installed in the current WSL development environment.
- The current host is WSL2 and exposes `powershell.exe`. Real Windows Terminal evidence still requires access to that matching surface, and this host cannot by itself produce real macOS Terminal or macOS IME evidence.
- `docs/benchmark-results/` rejects unsupported performance claims. This work is a comparative spike; measurements must not be presented as a product benchmark.

## Product and architecture review gate

Before adding spike code, compare the proposed scenario and decision rubric with:

- `PRODUCT.md`;
- `SPEC.md`;
- `docs/architecture.md`;
- `docs/threat-model.md`;
- `docs/product-contracts.md`;
- `docs/product/user-journey.md`;
- `docs/product/ux-state-model.md`;
- `docs/product/design-language.md`;
- `docs/product/release-support-matrix.md`;
- ADRs 0002, 0005, 0006, and 0007.

The review is confirmatory. If the scenario requires a change to product identity, trust boundaries, terminal states, public contracts, non-goals, or the R0/R1 boundary, stop before implementation. Record the mismatch in this plan and request a human decision; do not let spike code silently redefine the product.

## Locked scope

### In scope

- One shared, spike-only scenario describing the same visible information and interactions for all candidate combinations.
- One Ink/React implementation run, tested, measured, and packaged independently with Node 24 and Bun.
- One OpenTUI/React implementation run, tested, measured, and packaged with Bun.
- Deterministic renderer tests, PTY-level smoke paths, resize and input scenarios, packaging experiments, and multi-trial measurements.
- Automated Linux, Windows, and macOS build/test smoke where hosted runners can provide evidence.
- Real matching-surface QA on available terminals, including actual Chinese IME input rather than paste-only substitutes.
- A durable English evidence report with raw commands, environment metadata, failures, scores, residual risk, and a recommendation.

### Out of scope

- Executable public contract schemas or production `ProductView` fixtures.
- Kernel reducer expansion, effect dispatch, JSONL journal, replay, or product projections.
- Replacing the production scaffold in `apps/eden/src/index.ts`.
- A real provider, autonomous loop, Goal runtime, policy engine, AnchorEdit, or sandbox.
- A daemon, local IPC, desktop shell, subagents, MCP, LSP integration, or Rust/native module owned by Eden.
- Building a custom terminal renderer or patching either renderer upstream.
- Claiming full platform support from CI alone or treating simulated keyboard input as IME evidence.
- Selecting a release runtime or renderer before the report and human checkpoint are complete.

## Planned files and boundaries

The implementation should remain removable until the runtime and renderer decision is accepted.

```text
.github/workflows/terminal-framework-spike.yml
spikes/terminal-framework/
  fixture/
    package.json
    src/
      fixture.ts
      oracle.ts
    test/
      fixture.test.ts
  harness/
    package.json
    src/
      pty.ts
      measure.ts
      record-environment.ts
    test/
      process-smoke.test.ts
  ink/
    package.json
    src/app.tsx
    test/app.test.tsx
  opentui/
    package.json
    src/app.tsx
    test/app.test.tsx
  tsconfig.json
  results/
    README.md
    result.schema.json
docs/research/terminal-framework-spike.md
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
```

The root manifest and workspace files may change only to register the isolated spike packages and make their checks reproducible. The fixture, harness, Ink importer, and OpenTUI importer must have separate manifests. Framework dependencies must not enter the fixture or harness package, nor `apps/eden`, `packages/kernel`, `packages/contracts`, or `packages/coding-runtime` during this plan.

The normal workspace install is for development and is not distribution evidence. Installation size, dependency count, native-package behavior, and launch smoke must be measured from clean combination-specific deployment trees containing only one renderer importer, one runtime path, and the shared fixture. Record each importer's production dependency graph separately. Ink/Node and Ink/Bun must use the same Ink source and dependency graph so their difference is attributable to runtime and packaging; never attribute the combined workspace graph to any candidate.

Generated binaries, videos, terminal dumps containing local paths, and unbounded raw logs must not be committed. CI artifacts may retain binaries and captures for review, but expiring CI artifacts are supporting evidence rather than the durable record. Commit bounded, redacted structured summaries and trial rows under `results/` after they validate against `result.schema.json`; every record must contain environment metadata, the source commit, commands, candidate artifact hashes, and the evidence outcome.

## Candidate snapshot

Pin the following versions for the spike so all candidate combinations share the same React and TypeScript baseline:

| Dependency or runtime | Spike version |
| --- | --- |
| Node.js | 24.15.0 locally and in every CI row |
| pnpm | 11.7.0 |
| Bun | 1.3.14 |
| `@opentui/core` | 0.4.3 |
| `@opentui/react` | 0.4.3 |
| `ink` | 7.1.0 |
| `ink-testing-library` | 4.0.0 |
| `react` | 19.2.7 |
| `@types/react` | 19.2.17 |
| `tsx` | 4.23.1 |
| TypeScript | repository version 5.9.3 |

Record resolved versions and integrity through `pnpm-lock.yaml` and repeat them in the evidence report. Record each hosted-runner image identifier as well as its OS version. Updating a candidate, runtime, or runner image during the spike requires rerunning all three combinations from the beginning; do not compare results produced against different shared baselines.

Install Bun through a version-pinned setup action or development dependency and make every local and CI path verify `bun --version` before use. A floating installer result is not acceptable evidence.

Keep pnpm and `pnpm-lock.yaml` as the workspace dependency-management authority during this spike. Bun is introduced as a candidate runtime, bundler, and standalone packager; this plan does not authorize a repository-wide switch to `bun install`, Bun workspaces, or Bun's test runner.

## Shared scenario

Both renderer implementations and all three runtime combinations consume the same immutable, spike-only `TerminalSpikeFixture`. It is renderer evaluation data, not a public `ProductView` and not a preview of the second plan's schema design.

The fixture contains:

- workspace identity, trust mode, profile, phase, model placeholder, network state, and budget summary;
- one running action and a short progress timeline;
- an approval request with exact command display, working directory, reason, and scope;
- changed-file rows, one unified TypeScript diff, one passing check, and one failing check with recovery text;
- a task composer initialized empty;
- deterministic large-output and large-diff generators with recorded line and byte counts.

The prototypes must support the same observable actions:

1. move focus through the primary regions with keyboard input;
2. approve or deny the displayed action without changing its canonical text;
3. switch between progress and review information;
4. type and edit Chinese text in the composer;
5. paste a multiline task without interpreting pasted control-looking text as shortcuts;
6. resize between narrow, medium, and wide layouts without losing focus or changing the selected action;
7. open and scroll the large output and diff, then return to the primary action;
8. exit through the documented keyboard path and restore the terminal.

All state transitions exist only inside the spike. The implementation must name them as prototype state and must not introduce fake runtime, kernel, journal, or `AgentClient` abstractions.

Freeze these black-box oracle rows in `fixture/src/oracle.ts` before either renderer is implemented. Each row must contain its initial state, exact key/paste/resize inputs, expected visible state, expected focus, unchanged canonical action text, allowed collapsed content, and exit result.

| Oracle row | Input sequence | Required observable result |
| --- | --- | --- |
| Primary approval | Focus approval, inspect details, press the displayed approve key | Exact command, cwd, reason, and scope remain visible before approval; status becomes `approved`; progress becomes the focused region; no completion claim appears |
| Denial and recovery | Focus approval, press deny, focus composer, enter a revised request | Status becomes `denied`; the command text is unchanged; recovery text and composer are visible; no action runs implicitly |
| Failing-check review | Switch from progress to review, focus the failed check, open recovery | Failed check, failure summary, recovery action, changed-file rows, and canonical diff remain attributable to the same action |
| Chinese editing and paste | Type the fixed IME corpus, move by grapheme, delete once, then paste the fixed multiline corpus | Text and grapheme deletion match the corpus; pasted control-looking text remains literal; focus stays in the composer |
| Resize | Resize to 60x20, 100x30, and 160x45 while approval is selected | Action identity, trust mode, approval status, exact command, and focus remain visible; secondary timeline/diff context may collapse behind a labelled affordance only |
| Stress navigation | Open large output, scroll to a named marker, open large diff, return | Marker and diff file identity become visible; return restores the prior selected action and focus |
| Exit and cancellation | Exit normally, then repeat with forced cancellation | Process exits with the specified code, the shell sentinel succeeds, and terminal cleanup checks pass or name the failed state |

Candidate renderer tests must import this oracle. Candidate-specific expectations may describe framework mechanics, but may not weaken or replace the shared observable result.

## Evaluation gates and rubric

### Hard gates

A runtime/renderer combination cannot be recommended unless it satisfies all of the following with named evidence:

- It installs, typechecks, tests, and launches through documented commands on the supported spike toolchain.
- The shared primary flow and denial/failure flow pass through the framework's real renderer.
- Chinese text, wide characters, emoji, multiline paste, Backspace/Delete, arrows, Escape, Ctrl+C, and resize do not corrupt input or terminal state on the real terminals exercised.
- Narrow, medium, and wide layouts keep the current action legible and safe.
- Large output and large diff remain navigable without an unrecoverable freeze or terminal corruption.
- Cleanup restores cursor visibility, raw mode, alternate-screen state, and normal shell input after success, invalid invocation, and forced cancellation.
- The combination has a reproducible Linux, Windows, and macOS build/test smoke path. Hosted CI is evidence for build and automated behavior only, not for IME or visual quality.
- Framework-specific runtime or native APIs remain inside the spike/app boundary and do not require changes to kernel, contracts, or coding-runtime.

If a hard gate cannot be exercised, mark it `not run`; do not convert missing evidence into a pass. The final human checkpoint may extend the spike, accept a provisional choice with explicit residual risk, or reject all combinations.

### Weighted comparison after hard gates

Score each category from 0 to 5 and calculate `(score / 5) x weight`, producing a maximum weighted total of 100. Every score must link to a command, structured result, capture, or matching-surface note.

| Category | Weight | 0 anchor | 3 anchor | 5 anchor |
| --- | ---: | --- | --- | --- |
| Terminal correctness | 25 | corrupts input or terminal state | all required input, resize, cleanup, and recovery paths pass with minor documented defects | all paths pass cleanly across every required matching surface |
| Product-surface fit | 20 | cannot express a safe primary flow | oracle passes with some custom composition or limited accessibility | oracle is clear and complete with strong built-in interaction and accessibility support |
| Testability | 15 | core behavior cannot be observed deterministically | renderer, input, resize, and failures have repeatable tests with usable diagnostics | the full oracle is concise, deterministic, and produces excellent failure diagnostics |
| Distribution and platforms | 15 | no reproducible install and launch path | clean candidate deployment works on all CI OS rows with documented complexity | deployment is small, simple, reproducible, and matching-surface evidence is complete |
| Performance and resource use | 15 | freezes, corrupts output, or exceeds a hard gate | stress cases complete and measured results are acceptable for R0 | consistently strong median/p95, memory, artifact, and visual behavior without special casing |
| Maintenance risk | 10 | incompatible runtime or unbounded native/API risk | maintainable with pinned, documented dependencies and contained framework APIs | low-churn APIs, small attributable dependency graph, and straightforward debugging/upgrades |

Scores 1, 2, and 4 interpolate between the adjacent anchors and require a written reason. A required `not run` hard gate prevents a final winner and makes the report provisional; missing evidence is never converted into a numeric advantage. The executing agent proposes scores, an independent reviewer audits evidence links and arithmetic, and the human owns the final selection.

Hard gates override weighted totals. Use the scores in two controlled comparisons rather than ranking three unrelated totals:

1. **Runtime decision:** compare Ink/Bun with Ink/Node. Prefer Bun as the release runtime when Ink/Bun passes every hard gate and trails Ink/Node by no more than 5 points on the 0-100 scale. Choose or retain Node when Bun fails a hard gate or trails by more than 5 points. This is a declared preference for standalone Bun distribution, not bonus points added to Bun's score.
2. **Renderer decision:** if Bun passes the runtime decision, compare OpenTUI/Bun with Ink/Bun. A gap of 5 points or fewer is a practical tie; in that tie, prefer Ink/Bun because the shared Ink implementation has the smaller renderer-specific native surface. OpenTUI/Bun has a material renderer advantage only when it leads by more than 5 points while passing every hard gate.
3. **Fallback:** if Bun does not pass the runtime decision, Ink/Node remains the eligible combination. OpenTUI on Node is not part of this plan because its native renderer requires Node 26.4 experimental FFI rather than the repository's Node 24 baseline.

Apply each tie rule once and add no hidden bonus. Report both controlled comparisons even when an earlier hard gate determines the final recommendation.

## Test-first implementation slices

### Slice 1: freeze the evidence manifest and shared fixture

- Public seam: import the spike-only fixture, black-box oracle, and generated stress data from `spikes/terminal-framework/fixture/src/`.
- Independent expected result: `PRODUCT.md`, `SPEC.md`, the UX state model, and release support matrix define the information and terminal cases the spike must expose.
- RED: a Node test fails because the fixture, size presets, interaction cases, and deterministic large-data metadata do not exist.
- GREEN: add the smallest readonly fixture and generators needed by both renderer implementations and all three runtime combinations.
- Permitted fakes: fixed clock values and deterministic generated text inside the spike only.
- Matching surface: print a redacted fixture manifest and verify that it contains no provider key, local absolute path, raw reasoning, or invented completion claim.
- Acceptance: the same fixture object is imported by every combination; no renderer or runtime path owns a divergent copy.

### Slice 2: shared Ink renderer on Node and Bun

- Public seam: launch the same Ink entrypoint as `ink-node` and `ink-bun`, then render the same component tree with `ink-testing-library` under each runtime.
- Independent expected result: the shared fixture and action list define visible text, focus order, transitions, and size behavior.
- RED: a runtime-neutral renderer verification script fails under Node 24 and Bun because the Ink implementation is absent.
- GREEN: implement only the components and local prototype state required by the shared scenario.
- Permitted fakes: `ink-testing-library` stdin/stdout streams for deterministic component tests. The same verification module must run through `node --import tsx` and `bun`; runtime-specific forks of the oracle or component tree are prohibited.
- Matching surface: run the same Ink entrypoint in a real PTY on Node 24 and Bun; complete the primary flow, denial path, multiline paste, resize, and exit under both.
- Acceptance: Node and Bun tests assert the same observable frames and actions rather than React component internals or exact ANSI byte streams. Any runtime-specific branch must be listed, justified, and scored as compatibility cost.

### Slice 3: OpenTUI/Bun renderer path

- Public seam: launch the OpenTUI candidate command and render it with `@opentui/core/testing`.
- Independent expected result: the same fixture, actions, and size behavior used by the Ink path.
- RED: frame, input, and resize tests fail because the OpenTUI candidate is absent.
- GREEN: implement only the equivalent components and local prototype state required by the shared scenario.
- Permitted fakes: OpenTUI's in-memory renderer, mock keyboard/paste input, and simulated resize for deterministic tests.
- Matching surface: run the native renderer with Bun in a real PTY; complete the same primary flow, denial path, multiline paste, resize, and exit.
- Acceptance: the OpenTUI path does not rely on Node experimental FFI and does not introduce Bun APIs outside the spike directory. It uses the same pinned Bun version as Ink/Bun.

### Slice 4: common process, stress, and cleanup harness

- Public seam: invoke `ink-node`, `ink-bun`, and `opentui-bun` through one process-smoke test and one measurement command.
- Independent expected result: the hard gates define readiness, exit, stress, and cleanup observations; all three combinations must receive identical fixture sizes and action sequences.
- RED: the harness fails because the combinations do not expose a deterministic readiness signal, scripted scenario mode, or structured result output.
- GREEN: add a harness package pinned to `node-pty` 1.1.0 and the smallest spike-only probe needed to capture timestamps, exit status, fixture identity, and cleanup outcome without changing visible product semantics. The same harness launches all three combination commands, writes the same byte sequences, applies the same resize sequence, and records the same bounded transcript fields.
- Permitted fakes: temporary directories, fixed environment variables, and generated fixture data. Do not mock the child process or renderer.
- Matching surface: run happy, invalid-argument, and forced-cancellation paths in a real PTY. Capture `stty -g` before and after on Unix-like hosts and an equivalent console-mode snapshot on Windows; check cursor-show and alternate-screen-exit output; then send a unique shell sentinel and require its exact response.
- Acceptance: non-interactive smoke has a bounded timeout, kills its process tree on failure, emits a non-zero exit for invalid invocation, restores the recorded terminal/console mode, and leaves the parent shell responsive. A PTY adapter result does not count as real IME composition evidence.

### Slice 5: platform and packaging matrix

- Public seam: run `.github/workflows/terminal-framework-spike.yml` on Ubuntu, Windows, and macOS hosted runners.
- Independent expected result: the release support matrix defines the target OS families; official framework/runtime documentation defines supported build and packaging commands.
- RED: the matrix fails because runtime installation, native packages, build scripts, or packaged smoke paths are missing.
- GREEN: pin Node 24.15.0, pnpm, and Bun; record the runner image; install from the lockfile; run typecheck and combination tests; create clean combination-specific deployment trees; build each documented distribution artifact; smoke each artifact on the host that built it. `package:ink-node` builds a package tarball, installs it into a clean temporary Node 24 project, and smokes its executable. `package:ink-bun` compiles the same Ink entrypoint as a Bun standalone executable. `package:opentui-bun` compiles the OpenTUI entrypoint and embeds its required native packages in a Bun standalone executable. A Node SEA build is recorded as a separate experiment rather than an Ink/Node hard gate because SEA is a distinct Node distribution feature.
- Permitted fakes: none for install, build, and launch. Hosted virtual machines are acceptable platform adapters but do not count as real IME evidence.
- Matching surface: on available local Windows Terminal/PowerShell and WSL terminals, launch the same commit and repeat the interactive checklist.
- Acceptance: each matrix row publishes commands, versions, exit status, artifact size, and failure logs; a missing OS row remains an explicit failure or `not run`.

### Slice 6: multi-trial measurements and real terminal QA

- Public seam: run `spikes/terminal-framework/harness/src/measure.ts` and the matching-surface checklist against all three combinations from the same commit.
- Independent expected result: `docs/eval-methodology.md` requires explicit environment metadata, multiple trials, failures, latency, and infrastructure versions.
- RED: the measurement script rejects missing warm-up count, trial count, fixture identity, runtime version, terminal identity, or output destination.
- GREEN: collect comparable structured measurements without combination-specific hidden shortcuts. Runtime comparison uses identical Ink source and dependencies; renderer comparison uses the same Bun version, fixture, and action sequence.
- Permitted fakes: none for process timing or matching-surface QA. Generated deterministic fixture content is allowed.
- Matching surface: at a named human-operated QA checkpoint, the project owner or an explicitly named delegate types Chinese with a real IME, pastes multiline text, navigates the large diff/output, resizes repeatedly, cancels, and returns to the shell. The agent prepares the exact checklist and structured observation template; scripted Unicode cannot fill the IME fields.
- Acceptance: run five warm-ups and thirty recorded trials for startup and scripted state updates; report median and p95, raw failures, artifact size, and observed peak or stable memory using the same platform-specific method for all three combinations.

### Slice 7: evidence report and decision checkpoint

- Public seam: review `docs/research/terminal-framework-spike.md` from a clean checkout using only its linked commands and artifacts.
- Independent expected result: this plan's hard gates and rubric determine the report structure; they do not determine the human choice.
- RED: a report completeness check fails when candidate versions, baseline commit, environment matrix, commands, failures, `not run` rows, hard-gate verdicts, weighted scores, or residual risks are absent.
- GREEN: fill the report with verified results and a recommendation supported by the recorded evidence.
- Permitted fakes: none.
- Matching surface: rerun one primary scenario and one failure scenario for each combination after the last relevant change, then compare the observation with the report.
- Acceptance: the report first decides Bun versus Node from Ink/Bun versus Ink/Node, then decides OpenTUI versus Ink from OpenTUI/Bun versus Ink/Bun when Bun remains eligible. It offers five explicit outcomes: select OpenTUI/Bun, select Ink/Bun, select Ink/Node, extend the spike for one named uncertainty, or reject/defer all combinations. It stops before changing production code.

## Evidence collection details

### Automated widths and stress inputs

- Narrow: 60 columns by 20 rows.
- Medium: 100 columns by 30 rows.
- Wide: 160 columns by 45 rows.
- Large output: 10,000 deterministic lines and at least 1 MiB of text.
- Large diff: at least 2,000 changed lines across 20 synthetic files, generated from a fixed seed.
- Text corpus: ASCII, Simplified Chinese, combining marks, emoji, ZWJ emoji, full-width punctuation, tabs, and multiline pasted text.

Frame tests may normalize ANSI color and nondeterministic cursor blink. They must not normalize away spacing, wrapping, focus, truncation, replacement characters, or the canonical action text.

### Real terminal checklist

Record terminal name/version, shell, locale, font, width/height, runtime, candidate commit, and whether Kitty keyboard or other enhanced protocols are active.

Name committed structured records as `results/<os>-<arch>-<terminal>-<candidate>.json`. Each record must contain the source commit, candidate and runtime versions, terminal identity, command, fixture identity, width, bounded per-trial measurements, summary statistics, trial counts, timestamps, exit status, candidate artifact SHA-256, hard-gate observations, and redacted failure details. CI-only rows use `ci` as the terminal identity and cannot satisfy matching-surface fields. The report must link to these committed records; an expired external artifact cannot be the sole support for a claim.

Required R0 targets are:

- Windows Terminal with PowerShell and WSL;
- macOS Terminal and one common alternative;
- one common Linux terminal.

For each available target, exercise Chinese IME composition, paste, multiline editing, grapheme deletion, arrow navigation, Escape/Alt ambiguity, Ctrl+C, rapid resize, large output, and large diff. A screenshot proves layout only; it does not prove input, cleanup, or responsiveness. Record unavailable targets as `not run` and keep the runtime and renderer decision provisional unless the human explicitly accepts the residual risk.

### Measurement interpretation

- Use the same commit, host load policy, fixture, trial count, and readiness definition for all three combinations.
- Report distributions and failures, not only the best run.
- Separate in-memory renderer timings from real-process timings.
- Treat framework-native statistics as diagnostic detail, not a cross-framework score unless an equivalent measurement exists.
- Do not call these results a benchmark outside the spike report.
- A performance lead cannot compensate for failed input, cleanup, recovery, or architecture gates.

## External source baseline

Use primary sources and record the access date in the final report:

- OpenTUI getting started and runtime support: <https://opentui.com/docs/getting-started/>
- OpenTUI testing: <https://opentui.com/docs/core-concepts/testing/>
- OpenTUI keyboard and paste: <https://opentui.com/docs/core-concepts/keyboard/>
- OpenTUI React binding and built-in components: <https://opentui.com/docs/bindings/react/>
- OpenTUI standalone executables: <https://opentui.com/docs/reference/standalone-executables/>
- OpenTUI environment and width controls: <https://opentui.com/docs/reference/env-vars/>
- Ink repository and APIs: <https://github.com/vadimdemedes/ink>
- Ink testing library: <https://github.com/vadimdemedes/ink-testing-library>
- Bun standalone executables: <https://bun.sh/docs/bundler/executables>
- Node single-executable applications: <https://nodejs.org/api/single-executable-applications.html>
- Claude Code native installation and binary distribution: <https://code.claude.com/docs/en/getting-started>

Claude Code is relevant production prior art for standalone distribution, not proof that Eden should inherit its runtime or renderer choices. Documentation claims establish available APIs, not comparative quality. IME behavior, terminal correctness, resource use, packaging success, and real platform support must come from the spike.

## Verification commands

The implementation plan must add exact combination scripts, but the completed slice must support at least:

```sh
pnpm install --frozen-lockfile
pnpm code:check
pnpm typecheck
pnpm test
pnpm markdown:check
pnpm --filter @eden/terminal-spike-fixture test
pnpm --filter @eden/terminal-spike-ink test:node
pnpm --filter @eden/terminal-spike-ink test:bun
pnpm --filter @eden/terminal-spike-opentui test:bun
pnpm --filter @eden/terminal-spike-harness test:process
pnpm --filter @eden/terminal-spike-harness measure
pnpm --filter @eden/terminal-spike-ink package:node
pnpm --filter @eden/terminal-spike-ink package:bun
pnpm --filter @eden/terminal-spike-opentui package:bun
git diff --check
git status --short
```

Run the affected combination test after every RED/GREEN/REFACTOR slice. Run the complete stack and all three matching-surface paths after the last implementation change. A command that was skipped, unsupported, or run before the last relevant change must be reported as unverified.

## Risks and mitigations

| Risk | Mitigation or stop rule |
| --- | --- |
| The spike invents public state before contracts exist | Keep one explicitly spike-only fixture; prohibit changes to production contracts and runtime |
| OpenTUI introduces Bun/native assumptions into the core | Keep all imports in the spike; fail the architecture gate if they leak inward |
| Ink/Node appears simpler because packaging is not exercised | Always build and smoke its clean Node package path; record Node SEA as a separate experiment where supported |
| CI is mistaken for terminal QA | Separate CI, in-memory renderer, PTY, and human/agent matching-surface evidence in the report |
| Simulated Unicode is mistaken for IME support | Require actual composition on real terminals; paste and scripted Unicode are separate cases |
| Candidate versions move during the experiment | Pin all versions and restart all three combinations if a version changes |
| One combination receives a simpler scenario | Import one fixture and audit the action/width matrix before scoring |
| The Bun preference predetermines the result | Keep Bun as a declared hypothesis only; hard gates and the controlled Ink runtime comparison can reject it |
| Ink/Node and Ink/Bun drift apart | Require one source tree, dependency graph, fixture, and oracle; list every runtime-specific branch as compatibility cost |
| Performance tooling favors one framework | Use common external measurements for scoring; keep native counters diagnostic-only |
| macOS or another target is unavailable | Mark it `not run`; extend the spike or require explicit human acceptance of a provisional choice |
| The report selects a runtime or renderer from one three-way total | Use the two controlled comparisons; hard gates dominate; preserve failures and residual risks; require the human checkpoint |
| The spike becomes permanent duplicate UI code | Keep it outside `apps/eden`; after selection, preserve the report and remove or archive candidate code under a separately approved change |

## Rollback path

Until a runtime and renderer are selected, the spike is isolated. Rollback removes the spike workspace registration, spike dependency changes, CI workflow, and spike source while retaining this plan and any already-reviewed research report. Production packages and the scaffold CLI must remain unchanged, so rollback requires no product-state or journal migration.

After a selection, do not copy the winning prototype wholesale into `apps/eden`. The second plan freezes executable contracts and fixtures first; a later R1 plan uses those public seams to implement the real terminal vertical slice.

## Human checkpoints

1. **Plan approval before execution.** Confirm the scope, test seams, hard gates, rubric, tie-break rule, cross-platform evidence policy, and stop conditions.
2. **Contract-change checkpoint.** If the confirmatory review finds a product, trust, contract, or roadmap mismatch, stop and agree on the document or ADR change before spike code.
3. **Runtime and renderer decision after evidence.** Review the two controlled comparisons and choose OpenTUI/Bun, Ink/Bun, Ink/Node, an explicitly bounded extension, or deferral. The agent recommendation is advisory, and this plan stops as soon as the decision is requested.
4. **Publication checkpoint.** Commit or push the public spike, report, tutorial submodule pointer, or teaching artifact only when explicitly authorized.

After the human selects a release runtime and renderer, a separately authorized documentation slice must create ADR 0008 with the decision and rejected alternatives, update `CONTEXT.md`, and mark this plan's outcome. That slice is not part of this execution, does not reuse approval of this plan, and must not begin the second public plan.

## Completion criteria

This plan's execution is evidence-complete when:

- all three combinations consume the same committed fixture and pass their deterministic renderer tests;
- all three combinations have fresh real-process primary and failure-path evidence;
- CI reports Linux, Windows, and macOS build/test/package rows without hiding `not run` cases;
- available real terminals have fresh input, IME, resize, stress, cancellation, and cleanup observations;
- measurements include identical trial rules, environment metadata, failures, median, p95, memory method, and artifact size;
- the English report contains hard-gate verdicts, weighted scores, the controlled runtime and renderer comparisons, direct evidence, residual risks, and a recommendation;
- all repository quality commands pass after the last relevant change;
- production CLI, contracts, kernel, runtime, providers, and lab behavior remain unchanged;
- execution stops at the runtime-and-renderer-selection checkpoint without creating the selection ADR or changing `CONTEXT.md`;
- the separately authorized post-decision documentation slice and the second public plan have not begun.

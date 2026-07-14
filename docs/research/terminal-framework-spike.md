# R0 Terminal Runtime and Framework Spike Evidence

- Status: Decision accepted; OpenTUI/Bun selected in ADR 0008
- Evidence date: 2026-07-14
- Roadmap stage: R0, Product Contract and Architecture Spikes
- Approved method: [terminal runtime and framework spike plan](../plans/2026-07-14-terminal-framework-spike.md)
- Shared fixture: `terminal-spike-r0-v1`
- Measurement baseline commit: `0038e734f358e97d92f37d7cfc78f6874dfda714`

## Recommendation

The project owner selected **OpenTUI/Bun** on 2026-07-14 and accepted the remaining R0
platform-evidence risk. Bun clears the controlled runtime comparison, and OpenTUI/Bun leads Ink/Bun by 7 weighted
points, which exceeds the plan's 5-point renderer threshold. OpenTUI's native textarea also provides
the multiline vertical cursor behavior that the bounded Ink composer does not implement.

This is not an unconditional winner. The current baseline has human-operated Windows Terminal WSL
evidence, while Windows Terminal PowerShell, native Linux terminals, macOS Terminal, and a common
macOS alternative remain `not-run`. The three-platform hosted workflow passed on an earlier commit,
not the measurement baseline. If the project owner does not accept those gaps, choose the explicit
`extend the spike` outcome for only those named uncertainties.

No production code, public contract, or ADR changes are authorized by this recommendation.

## Baseline and candidate versions

The Windows Terminal records use the same baseline commit and lockfile. The earlier WSL2 agent-PTY
records use commit `1a961f41743eb888c7e9dcd3b8029c52cbef0156`; the candidate artifact SHA-256
values are identical across both commits because the intervening commit changed result records only.

| Component | Version | Evidence |
| --- | --- | --- |
| Node | Node 24.15.0 | Workflow and every result record |
| Bun | Bun 1.3.14 | Candidate manifests, workflow, and every result record |
| pnpm | 11.7.0 | Root manifest and workflow |
| Ink | Ink 7.1.0 | [Ink candidate manifest](../../spikes/terminal-framework/ink/package.json) |
| React | 19.2.7 | Both candidate manifests |
| OpenTUI core/react/keymap | OpenTUI 0.4.3 | [OpenTUI candidate manifest](../../spikes/terminal-framework/opentui/package.json) |
| PTY harness | node-pty 1.1.0 | [Harness manifest](../../spikes/terminal-framework/harness/package.json) |

The candidate seams remain isolated under `spikes/terminal-framework/`. Ink/Node and Ink/Bun use
one component tree. OpenTUI/Bun uses Bun FFI and native renderer packages only inside its spike
package. No imports entered contracts, kernel, coding-runtime, providers, lab, or the production CLI.

## Environment matrix

| Surface | Baseline | Ink/Node | Ink/Bun | OpenTUI/Bun | Evidence status |
| --- | --- | --- | --- | --- | --- |
| Windows Terminal WSL, zsh, 120x30 | `0038e73` | Passed | Passed | Passed | Human IME, resize, stress, and cleanup passed |
| WSL2 agent PTY | `1a961f4` | 30/30 | 30/30 | 30/30 | Automated measurement; real-terminal fields `not-run` |
| GitHub `windows-2025` | `a57f4dc` | Passed | Passed | Passed | Install, typecheck, test, package; earlier baseline |
| GitHub `ubuntu-24.04` | `a57f4dc` | Passed | Passed | Passed | Install, typecheck, test, package; earlier baseline |
| GitHub `macos-15` | `a57f4dc` | Passed | Passed | Passed | Install, typecheck, test, package; earlier baseline |
| Windows Terminal PowerShell | unavailable | `not-run` | `not-run` | `not-run` | Required real-terminal gap |
| Native Linux terminal | unavailable | `not-run` | `not-run` | `not-run` | Required real-terminal gap |
| macOS Terminal | unavailable | `not-run` | `not-run` | `not-run` | Required real-terminal gap |
| Common macOS alternative | unavailable | `not-run` | `not-run` | `not-run` | Required real-terminal gap |

The hosted evidence is [workflow run 29299771791](https://github.com/AI-Eden/eden-agent/actions/runs/29299771791)
at `a57f4dc28ef55f5d3dc19e1226cb4d8e69240532`. All three jobs and every install,
typecheck, test, and candidate package step passed. The current workflow remains reproducible in
[terminal-framework-spike.yml](../../.github/workflows/terminal-framework-spike.yml), but it has not
run against the final cursor-fix baseline.

## Reproduction commands

Install and verify the repository:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm code:check
pnpm markdown:check
```

Launch the matching surfaces:

```sh
pnpm --filter @eden/terminal-spike-ink start:node
pnpm --filter @eden/terminal-spike-ink start:bun
pnpm --filter @eden/terminal-spike-opentui start
```

Package the three candidates from one clean commit:

```sh
artifact_root="$(mktemp -d)"
EDEN_PACKAGE_ARTIFACT_DIR="$artifact_root" pnpm --filter @eden/terminal-spike-ink package:node
EDEN_PACKAGE_ARTIFACT_DIR="$artifact_root" pnpm --filter @eden/terminal-spike-ink package:bun
EDEN_PACKAGE_ARTIFACT_DIR="$artifact_root" pnpm --filter @eden/terminal-spike-opentui package:bun
find "$artifact_root" -name result.json -print
```

Run five warm-ups and thirty recorded trials with the three successful package-result paths:

```sh
pnpm --filter @eden/terminal-spike-harness measure -- \
  --warmups 5 \
  --trials 30 \
  --fixture terminal-spike-r0-v1 \
  --runtime-versions node=v24.15.0,bun=1.3.14 \
  --terminal <terminal-id> \
  --host-load-policy "<bounded host-load policy>" \
  --output-dir spikes/terminal-framework/results \
  --artifact-evidence <ink-node-result.json> \
  --artifact-evidence <ink-bun-result.json> \
  --artifact-evidence <opentui-bun-result.json>

pnpm --filter @eden/terminal-spike-harness validate:results
```

The complete human checklist and evidence rules are in the
[results README](../../spikes/terminal-framework/results/README.md).

## Measurement results

### Windows Terminal WSL

| Candidate | Startup median / p95 | State update median / p95 | RSS median / p95 | Failures |
| --- | ---: | ---: | ---: | ---: |
| Ink/Node | 339 / 374 ms | 40.40 / 42.12 ms | 189.78 / 191.89 MB | 0/30 |
| Ink/Bun | 180 / 189 ms | 42.74 / 45.78 ms | 187.08 / 188.29 MB | 0/30 |
| OpenTUI/Bun | 242.5 / 255 ms | 15.48 / 16.04 ms | 172.24 / 173.32 MB | 0/30 |

### WSL2 agent PTY

| Candidate | Startup median / p95 | State update median / p95 | RSS median / p95 | Failures |
| --- | ---: | ---: | ---: | ---: |
| Ink/Node | 346.5 / 379 ms | 40.40 / 41.97 ms | 189.30 / 191.24 MB | 0/30 |
| Ink/Bun | 182 / 196 ms | 41.78 / 45.60 ms | 186.98 / 189.35 MB | 0/30 |
| OpenTUI/Bun | 247 / 271 ms | 15.48 / 16.13 ms | 171.79 / 173.22 MB | 0/30 |

The values are comparative spike observations from this machine, not product benchmarks. Bun cut
Ink startup median by about 47% on Windows Terminal WSL. OpenTUI/Bun used about 8% less stable RSS
than Ink/Bun and completed the scripted state update about 64% faster, while starting about 35%
slower than Ink/Bun.

### Distribution artifacts

| Candidate | Artifact size | Installed size | SHA-256 prefix | Distribution shape |
| --- | ---: | ---: | --- | --- |
| Ink/Node | 370,305 B | 1,980,574 B | `30ff900a0901` | Package tarball; requires Node 24 |
| Ink/Bun | 96,458,880 B | 96,458,880 B | `8ccd7ec2a286` | Standalone Bun executable |
| OpenTUI/Bun | 114,493,568 B | 114,493,568 B | `532d56b1f55c` | Standalone Bun executable with native renderer |

Direct structured records:

- [Windows Terminal WSL Ink/Node](../../spikes/terminal-framework/results/linux-x64-windows-terminal-wsl-ink-node.json)
- [Windows Terminal WSL Ink/Bun](../../spikes/terminal-framework/results/linux-x64-windows-terminal-wsl-ink-bun.json)
- [Windows Terminal WSL OpenTUI/Bun](../../spikes/terminal-framework/results/linux-x64-windows-terminal-wsl-opentui-bun.json)
- [WSL2 agent PTY Ink/Node](../../spikes/terminal-framework/results/linux-x64-wsl2-agent-pty-ink-node.json)
- [WSL2 agent PTY Ink/Bun](../../spikes/terminal-framework/results/linux-x64-wsl2-agent-pty-ink-bun.json)
- [WSL2 agent PTY OpenTUI/Bun](../../spikes/terminal-framework/results/linux-x64-wsl2-agent-pty-opentui-bun.json)

## Failures and not-run evidence

All six structured records contain five warm-ups, thirty successful recorded trials, and zero
startup or state-update failures. The shared primary, invalid-argument, cancellation, cleanup, large
output, and large diff process tests passed for all candidates.

The project owner accepted two Ink spike limitations after completing the Windows checklist:

- the multiline Ink composer does not move the cursor vertically, while OpenTUI's native textarea
  does;
- after Ink receives Ctrl+C, pnpm's recursive-run message begins at the final composer cursor column
  instead of a new left-aligned line. Exit code 130, terminal-mode restoration, cursor visibility,
  and immediate parent-shell input still pass.

The real-terminal rows listed as `not-run` in the environment matrix remain missing evidence. The
hosted three-platform result predates the final cursor fix. These gaps apply to all three candidates
and prevent an unconditional hard-gate winner.

## Hard-gate verdicts

| Hard gate | Ink/Node | Ink/Bun | OpenTUI/Bun | Evidence |
| --- | --- | --- | --- | --- |
| Install, typecheck, test, launch | Passed | Passed | Passed | Local full suite and hosted run |
| Shared primary, denial, failure flows | Passed | Passed | Passed | Renderer and process tests |
| IME, wide text, paste, editing, keys | Passed with accepted limits | Passed with accepted limits | Passed | Windows matching-surface records |
| 60x20, 100x30, 160x45 safety | Passed | Passed | Passed | Automated and human resize cases |
| Large output and large diff | Passed | Passed | Passed | Stress tests and human checklist |
| Exit, cancellation, shell cleanup | Passed with presentation note | Passed with presentation note | Passed | Process harness and human checklist |
| Linux, Windows, macOS build/package | `not-run` on current baseline | `not-run` on current baseline | `not-run` on current baseline | Earlier hosted run passed |
| Framework/runtime isolation | Passed | Passed | Passed | Imports remain under the spike boundary |
| Overall | Provisional | Provisional | Provisional | Human risk acceptance required |

No candidate failed an exercised hard gate. Every candidate shares the current-baseline hosted-CI
gap and missing real-terminal targets, so those gaps do not become score advantages.

## Weighted scores

Each cell is `raw score / weighted points`. The total follows `(score / 5) x weight`.

| Category | Weight | Ink/Node | Ink/Bun | OpenTUI/Bun |
| --- | ---: | ---: | ---: | ---: |
| Terminal correctness | 25 | 3 / 15 | 3 / 15 | 4 / 20 |
| Product-surface fit | 20 | 3 / 12 | 3 / 12 | 4 / 16 |
| Testability | 15 | 4 / 12 | 4 / 12 | 5 / 15 |
| Distribution and platforms | 15 | 4 / 12 | 4 / 12 | 3 / 9 |
| Performance and resource use | 15 | 3 / 9 | 4 / 12 | 4 / 12 |
| Maintenance risk | 10 | 4 / 8 | 4 / 8 | 3 / 6 |
| **Total** | **100** | **68** | **71** | **78** |

Score reasons:

- Ink earns terminal-correctness 3 because all required Windows WSL cases pass with the two accepted
  composer/presentation limitations. OpenTUI earns 4 because its native textarea also supports the
  observed vertical multiline movement; missing real-terminal surfaces keep it below 5.
- Ink earns product-surface fit 3. Its bounded composer required custom grapheme, paste, cursor, and
  deletion logic. OpenTUI earns 4 through its native textarea and managed keymap, but accessibility
  quality was not independently exercised.
- Ink earns testability 4 through one shared Node/Bun renderer suite plus real interactive stdout
  coverage. OpenTUI earns 5 because its in-memory native renderer deterministically covers character
  frames, textarea input, paste, resize, and focus with concise diagnostics.
- Ink's Node tarball and Bun executable earn distribution 4. OpenTUI earns 3 because its 114 MB
  executable and platform-native renderer packages add deployment complexity. All candidates share
  the latest-baseline CI and real-terminal evidence gaps.
- Ink/Node earns performance 3. Ink/Bun earns 4 for the fastest startup. OpenTUI/Bun earns 4 for the
  fastest updates and lowest RSS, offset by slower startup and the largest artifact.
- Ink earns maintenance 4 through one mature renderer source and no renderer-native binary layer.
  OpenTUI earns 3: its APIs are contained and pinned, but version 0.4.3, Bun FFI, keymap integration,
  and platform-native packages carry more upgrade surface.

## Runtime comparison

Ink/Bun scores 71 and Ink/Node scores 68. The three-point Bun lead is within the plan's five-point
tolerance and every exercised Ink/Bun hard gate passes. The declared standalone-distribution
hypothesis therefore selects **Bun** as the provisional release runtime. Ink/Node remains the lowest
risk fallback if Bun later fails a supported-platform gate.

## Renderer comparison

OpenTUI/Bun scores 78 and Ink/Bun scores 71. The seven-point lead exceeds the plan's five-point
practical-tie threshold. The advantage is attributable to terminal correctness, product-surface fit,
testability, update latency, and memory. Its native dependency and distribution costs are already
deducted in the distribution and maintenance categories.

The provisional renderer recommendation is therefore **OpenTUI**, not the Ink tie-break fallback.

## Residual risks

1. The final baseline has no hosted `windows-2025`, `ubuntu-24.04`, or `macos-15` run. The earlier
   run proves the workflow and pinned candidates, but not the final cursor-fix commit.
2. Windows Terminal PowerShell, native Linux terminals, macOS Terminal, and a common macOS
   alternative have no real IME, resize, navigation, or cleanup observation.
3. OpenTUI 0.4.3 and `@opentui/keymap` 0.4.3 are early native APIs. Upgrades may change renderer,
   textarea, keymap, or packaged-native behavior.
4. The spike uses fake product state. It proves a renderer/runtime boundary, not production
   integration with future executable contracts and `AgentClient`.
5. Performance was measured on one host and must not be generalized beyond this controlled spike.
6. The Ink limitations remain useful fallback-risk evidence; they do not justify further prototype
   work before the renderer decision.
7. The executing agent self-audited the score arithmetic and evidence links. An independent agent
   score review was unavailable under the session's no-subagent constraint, so the human checkpoint
   must review the score reasons before accepting a selection.

## Decision checkpoint

The project owner must choose one outcome. This report recommends the first outcome only with
explicit acceptance of the residual platform-evidence risk:

1. **select OpenTUI/Bun** provisionally, accepting the named `not-run` and stale-hosted-CI risks;
2. **select Ink/Bun** if the smaller renderer-native surface outweighs OpenTUI's seven-point lead;
3. **select Ink/Node** if avoiding Bun becomes more important than standalone distribution;
4. **extend the spike** for the current-baseline hosted matrix and named real-terminal targets;
5. **reject or defer all combinations** and retain the production CLI scaffold.

Stop here. Do not create ADR 0008, update `CONTEXT.md`, remove candidate code, or begin the
contracts-and-reducer plan until the human records a selection and separately authorizes the
post-decision documentation slice.

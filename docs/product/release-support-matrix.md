# Release Support Matrix

## Purpose

Support is an evidence claim, not a package-manager guess. Each release records what was built, installed, launched, and exercised on each target.

## R0 evidence targets

| Area | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Development runtime | Node 24 | Node 24 | Node 24 |
| Terminal spike | Windows Terminal, PowerShell, WSL | Terminal and one common alternative | One common desktop terminal |
| Input | Chinese IME, paste, multiline | Chinese IME, paste, multiline | Wide characters, paste, multiline |
| Stress | resize, large output, large diff | resize, large output, large diff | resize, large output, large diff |

## Release gates

R1 requires clean-machine installation for the selected development distribution. R3 requires install, upgrade, uninstall, doctor, and fixture smoke coverage. R5 desktop artifacts are experimental until installer, signing status, updater behavior, IPC security, and known limitations are explicit.

Unsupported guarantees, especially native sandbox parity, must be visible in the product and release notes.

## Accepted R2 Docker repository-check evidence gates

The accepted 2026-07-29 Freeze packet separates implementation evidence from whole-R2 and release claims:

| Lane | Docker execution | Required claim |
| --- | --- | --- |
| Hosted Ubuntu x64 | authoritative automated fixture, recovery, containment, package, and TUI/headless rows | implementation candidate |
| Hosted macOS arm64 | no nested Docker claim; contracts, package, TUI, and negative doctor only | non-Docker regression |
| Hosted Windows x64 | no Docker Desktop claim; contracts, package, TUI, and negative doctor only | non-Docker regression |
| Real Linux/WSL2 | same exact-SHA automated Docker driver | matching backend evidence |
| Real macOS Docker Desktop | Linux-container mode and same exact-SHA automated driver | required whole-R2 row |
| Real Windows Docker Desktop WSL2 | Linux-container mode and same exact-SHA automated driver | required whole-R2 row |
| Independent external user | pinned failing-test Quickstart with their own configured provider | required whole-R2 journey |

Every Docker row records exact application SHA, archive hash, image index and resolved platform manifest,
client/daemon/backend versions, platform, profile, fixture/input digest, lifecycle receipt, resource
enforcement, and cleanup. Missing rows remain `not-run`; multi-architecture image or emulation evidence
cannot substitute for a real Docker Desktop backend.

An Ubuntu-green candidate does not close whole R2. Complete rows do not by themselves establish
installation, upgrade, uninstall, signing, update, or release support.

## Accepted R1 evidence

The owner accepted R1 on 2026-07-17. The final
[exact-SHA workflow](https://github.com/AI-Eden/eden-agent/actions/runs/29513232236) ran the same frozen
install, tests, typecheck, build, standalone packaging, copied-artifact smoke, and production PTY driver on
hosted Ubuntu, macOS, and Windows runners at
`c95596ed231a3493e72674cb61229f2aa9089907`. Each lane uploaded the executable, a machine-readable manifest,
raw ANSI PTY evidence, standalone process evidence, and exact OpenTUI renderer frames for the 60x20 and
100x30 history states.

The hosted PTY row proves the packaged process accepts input, renders the required product states, exits
with the expected status, restores terminal modes, and returns control to its parent shell. Renderer frames
prove the frozen viewport layout without depending on a lossy ANSI-to-text projection.

R1 does not claim evidence for Terminal.app, Windows Terminal, PowerShell IME, a Linux desktop-terminal
matrix, signing, an installer, package-manager publication, or release support. Those rows remain explicit
`not-run` values until their roadmap gate is separately approved and exercised.

## R2 Build evidence

Slice 0 recorded the unchanged R1 Linux x64 WSL2 executable at `978bb78f` before R2 product behavior. The
copied standalone and production PTY flows passed. One warm-up and five measured `100x30` PTY trials are
recorded under `docs/benchmark-results/`; non-Linux performance and scroll-to-render remain `not-run`.
Future R2 support evidence must exercise the complete archive containing `eden`, application-local `rg`,
and notices on hosted Ubuntu, macOS, and Windows. This local baseline is not a release-support claim.

Slice 1 locally exercised masked profile CRUD, direct-file reload, malformed-file recovery, and renderer
capture at `60x20`, `80x24`, and `100x30`. Linux/WSL verified private `0700` state and `0600` configuration
modes plus linked-file rejection. Windows permission behavior and all real-provider rows remain `not-run`;
this evidence does not expand release support.

Slice 2 locally exercised the official SDK against scripted HTTP/SSE boundaries, readiness persistence,
explicit charge confirmation, and TUI auth, timeout, and network-recovery paths. The real
`deepseek-v4-pro` fixed-content stream reached `completion_ready` on 2026-07-20 after the adapter explicitly
disabled provider thinking. A public invalid credential reached the fixed authentication recovery, and a
local connection-reset fixture reached the fixed network recovery without exposing either canary. Kimi is
`not-run` because no owner-provided subscription credential is available; no Kimi support claim is made.
This local DeepSeek row is provider matching evidence, not release-support evidence.

Slice 3 locally exercised complete scoped instruction snapshots and deterministic context admission with
real filesystem fixtures. The TUI displayed exact used sources and one pre-network oversized-instruction
recovery; the request-counting provider remained at zero. POSIX unreadable-file behavior is evidenced on
Linux/WSL; Windows permission behavior and hosted context matching remain `not-run`. This evidence does not
expand release support.

Slice 4 locally exercised real bounded list/read adapters with exact UTF-8 offsets and hashes, row/byte/
visit continuation limits, containment, link/binary/cancel/stale-identity failures, and zero-write
snapshots. One fake-model read round trip persisted requested/completed activity, passed the closed result
into one continuation, rendered complete CJK content and provenance, and replayed after the source file was
removed with zero model/tool calls. `Ctrl+C` aborted an in-flight model before tool dispatch. Hosted and
non-Linux tool rows remain `not-run`; this evidence does not expand release support.

Slice 5 locally exercised the real pinned ripgrep 15.0.0 asset under both Node and Bun, compatible host Git
2.43.0, fixed argv/environment, parsed JSON and porcelain-v2/NUL fixtures, 256-row search pagination,
missing/modified/old/malformed/timeout/cancel/overflow recovery, process-group cleanup, and zero-write
digests. The copied four-file Bun archive completed one search and one dirty Git-status round trip from an
empty directory; its closed manifest hashes matched `eden`, `rg`, and notices. TUI fixtures distinguished
missing ripgrep from missing Git and rechecked a restored asset. Hosted Ubuntu/macOS/Windows archive rows
remain `not-run`; this local Linux/WSL evidence does not expand release support.

Slice 6 locally exercised streamed text, split tool-call fields, malformed/unknown calls, exact/unknown
usage, budgets, cancellation, post-delta interruption, crash reconciliation, explicit retry, private
continuity isolation, and replay with zero dispatch. The authorized real `deepseek-v4-pro` run
`run-9369765f-6361-48b3-a257-6a90ffd98eec` completed two exact-usage model attempts, one verified local
ripgrep `search_repository` call, and one sourced `completed` review answer. An earlier live interrupted
attempt exposed the explicit retry path and led to a renderer-lifecycle fix; deterministic transport tests
prove the completed recovery branch. The matching host required disabled TLS certificate verification for
its proxy, so this row does not prove production TLS verification. Kimi and hosted provider matching remain
`not-run`; this local evidence does not expand release support.

Slice 7 locally exercised the complete keyboard focus graph, palette/help, disabled and awaiting actions,
narrow conversation/context/recovery switching, the medium contextual drawer, and the wide navigation and
review composition. The exact-SHA Linux x64 WSL2 PTY record passed `60x20`, `80x24`, and `100x30`, rapid
resize, CJK bracketed paste, missing-Git recovery, terminal restoration, and parent-shell return. Its
startup p95 was 243.37 ms against the frozen 244 ms threshold, but earlier exact-artifact samples retained
host-scheduling outliers up to 278.67 ms. Scroll-to-render, Linux desktop terminals, macOS, Windows, and
IME-specific matching remain `not-run`; this local record does not expand release support.

Slice 8 candidate `0c83048f11df712a38960e07bfb994bac7cdcb97` passed the full local gate and
[hosted R2 workflow 29746955645](https://github.com/AI-Eden/eden-agent/actions/runs/29746955645).
Ubuntu x64, macOS arm64, and Windows x64 each passed frozen install, all workspace and named R2 tests,
typecheck, build, code/Markdown checks, complete four-file archive verification, copied-archive smoke,
production PTY, and artifact upload. The independent R1 matrix also passed at the same candidate. Linux
passed functional responsive PTY and the controlled WSL2 performance gates; non-Linux responsive timing,
desktop-terminal, and IME rows remain `not-run`.

The single-agent diff/spec review resolved budget semantics, hosted portability, Windows native search-path
normalization, and startup-threshold findings, with no unresolved code or contract finding. Exact platform
hashes and residual claims are retained in
[`docs/evidence/r2-exit-closure/review.md`](../evidence/r2-exit-closure/review.md). At public evidence head
`abf5f01`, the reproduced copied archive retained the exact hosted hashes, presented the explicit
possible-charge confirmation, and reached DeepSeek readiness under normal TLS verification. One retained
matching run failed closed before tool dispatch; the final bounded run completed two exact-usage attempts,
one pinned-ripgrep search, a sourced `completed` answer, and budget 3/16. Thirteen host evidence files plus
the PTY transcript retained zero credential matches. Kimi remains `not-run`; this evidence closes the
accepted provider-matching plan but does not expand release support.

The Docker repository-check implementation candidate is complete. Local preparation used a fresh
independent Linux amd64 Engine 29.6.2 daemon with `userns-remap`, built-in seccomp, and private cgroup
namespaces. A completion audit superseded the earlier candidate after dispatch-journal/recovery and
cancellation gaps were repaired. At exact reviewed code commit
`8c37f7939e384eaada13582a8f0ac71668eb9a98`, hosted R2 run
[`30698539397`](https://github.com/AI-Eden/eden-agent/actions/runs/30698539397) passed the authoritative
Ubuntu x64 Docker lane plus the Ubuntu, macOS, and Windows non-Docker acceptance lanes. The downloaded
Docker artifact has SHA-256 `a1cafe64fa9aa9a1c6fbe61d387645ac6d29215eea36c2caa82ce77b6598873e` and
records all 12 required rows passed for the fixed initial-fail, correct-edit/pass, and wrong-edit/fail
fixture scenarios against immutable image index
`sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f`, with distinct snapshots,
local-only raw output, zero provider calls, zero duplicate executions, receipt-before-cleanup ordering,
and zero remaining containers. Companion R1 run
[`30698539398`](https://github.com/AI-Eden/eden-agent/actions/runs/30698539398) passed all three hosted
platforms. Real macOS Docker Desktop, Windows Docker Desktop WSL2, and independent external-user rows
remain `not-run`. Whole R2 and release support are not closed.

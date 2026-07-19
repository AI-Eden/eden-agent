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

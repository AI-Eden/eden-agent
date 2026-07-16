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

## R1 exit-candidate evidence

The R1 workflow must run the same frozen install, tests, typecheck, build, standalone packaging, copied-
artifact smoke, and production PTY driver on hosted Ubuntu, macOS, and Windows runners. Each lane uploads
the executable, a machine-readable manifest, raw ANSI PTY evidence, standalone process evidence, and exact
OpenTUI renderer frames for the 60x20 and 100x30 history states.

The hosted PTY row proves the packaged process accepts input, renders the required product states, exits
with the expected status, restores terminal modes, and returns control to its parent shell. Renderer frames
prove the frozen viewport layout without depending on a lossy ANSI-to-text projection.

R1 does not claim evidence for Terminal.app, Windows Terminal, PowerShell IME, a Linux desktop-terminal
matrix, signing, an installer, package-manager publication, or release support. Those rows remain explicit
`not-run` values until their roadmap gate is separately approved and exercised.

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

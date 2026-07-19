# Benchmark Results

Benchmark records in this directory identify their exact source commit, executable shape, fixture,
environment, warm-up and measured trials, retained failures, and threshold calculation. A result supports
only the named machine and surface; unavailable platform or interaction rows remain `not-run`.

The first R2 record is
[`2026-07-19-r2-r1-baseline-linux-x64.json`](2026-07-19-r2-r1-baseline-linux-x64.json). It measures the
unchanged R1 executable before R2 production behavior: one warm-up and five recorded `100x30` PTY launches,
including time to the input-ready marker and the exact-workspace trust action. Scroll-to-render was not
measured by that fixture and is not inferred. The R1 input result exceeds the approved R2 100 ms absolute
target; Slice 7 owns improvement and fresh evidence rather than rewriting this baseline.

The Slice 7 Linux x64 WSL2 record is
[`2026-07-20-r2-tui-linux-x64.json`](2026-07-20-r2-tui-linux-x64.json). At exact public commit
`8c679fd064e8b01990d0ca4e8c21b9d68fcdb923`, keyboard-only primary journeys passed at `60x20`, `80x24`,
and `100x30`, including rapid resize, CJK bracketed paste, a missing-Git failure journey, terminal-mode
restoration, and parent-shell recovery. One warm-up and five measured trials retained zero failures.
Startup p95 was 243.37 ms against the frozen 244 ms threshold; trust acknowledgement p95 was 18.36 ms
against the independent 100 ms ceiling; durable trusted rendering p95 was 53.71 ms against the frozen
357 ms threshold. Earlier exact-artifact samples observed host-scheduling outliers up to 278.67 ms, so the
record does not support a variance-free startup claim. Scroll-to-render and non-Linux rows remain
`not-run`.

Do not publish unsupported performance or success-rate claims here.

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

The final-code-candidate Linux x64 WSL2 record is
[`2026-07-20-r2-tui-linux-x64.json`](2026-07-20-r2-tui-linux-x64.json). At exact public commit
`0c83048f11df712a38960e07bfb994bac7cdcb97`, keyboard-only primary journeys passed at `60x20`, `80x24`,
and `100x30`, including rapid resize, CJK bracketed paste, a missing-Git failure journey, terminal-mode
restoration, and parent-shell recovery. One warm-up and five measured trials retained zero failures.
Startup p95 was 234.82 ms against the frozen 244 ms threshold; input-to-render p95 was 17.86 ms against the
independent 100 ms ceiling; durable trusted rendering p95 was 50.71 ms against the frozen 357 ms threshold.
Earlier Slice 8 samples observed 248.86 ms, 338.40 ms, and an exact optimized-artifact 273.69 ms scheduling
spike, so the record does not support a variance-free or cross-machine startup claim. Scroll-to-render and
non-Linux rows remain `not-run`.

Do not publish unsupported performance or success-rate claims here.

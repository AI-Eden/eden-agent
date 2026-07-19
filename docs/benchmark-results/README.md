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

Do not publish unsupported performance or success-rate claims here.

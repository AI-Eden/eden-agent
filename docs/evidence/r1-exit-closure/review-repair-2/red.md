# R1 Exit Closure Review Repair 2: RED

- Date: 2026-07-16
- Baseline HEAD: `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f`
- Candidate: dirty worktree after the first fresh final five-lane review

## Command

```sh
pnpm --filter @eden/coding-runtime test
```

## Observed failures before implementation

- coding-runtime: exit 1, 86 passed / 2 failed;
- newline-inclusive record limit: bounded replay accepted a valid 65,537-byte JSONL record that append
  rejected, so append and replay disagreed at the frozen 64 KiB boundary;
- cumulative record stop: after exactly 16,384 records, the catalog touched an additional empty journal
  instead of stopping before the next run.

The raw output is retained locally at `/tmp/r1-review2-red-runtime.log`.

## Review-only gaps in the same repair attempt

- the terminal-control regression did not name the lower and upper C1 boundary values;
- the older real-process start/revoke test did not retain and unconditionally terminate every child;
- the two accepted slice plans did not clearly mark lifecycle statements superseded by ADR 0011 and ADR
  0012 as historical evidence.

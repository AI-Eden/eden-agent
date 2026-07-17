# R1 Exit Closure Review Repair 1: RED

- Date: 2026-07-16
- Baseline HEAD: `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f`
- Candidate: dirty worktree after the first five-lane exit review

## Command

```sh
pnpm --filter @eden/contracts test
pnpm --filter @eden/coding-runtime test
pnpm --filter @eden/cli test
```

## Observed failures before implementation

- contracts: exit 1, 14 passed / 1 failed. Safe-integer regression observed that an unsafe revision decoded
  successfully.
- coding-runtime: exit 1, 77 passed / 2 failed. A record larger than 64 KiB appended successfully, and a
  stored `1e100` trust revision loaded as trusted.
- CLI: exit 1, 26 passed / 3 failed. Control characters remained raw, stale trust controls retained cached
  trusted authority, and the valid combined 60x20 history state overlapped rows.

Raw outputs were captured during the run as `/tmp/r1-red-contracts.log`, `/tmp/r1-red-runtime.log`, and
`/tmp/r1-red-cli.log`.

## Review reproductions that opened this attempt

- a schema-valid oversized journal append created bytes that the bounded reader rejected on reopen;
- 99 available plus one selected unavailable history entry with truncation and one notice corrupted the
  60x20 frame;
- the frozen child-process matrix lacked same-revision trust competition, retarget, collision, abort,
  timeout, killed owner, and malformed owner coverage;
- exact numeric boundary acceptance was missing beside limit-plus-one rejection.

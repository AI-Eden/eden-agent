# R1 Exit Closure Review Repair 1: GREEN

- Date: 2026-07-16
- Baseline HEAD: `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f`
- Candidate: dirty worktree; exact implementation SHA pending final gates

## Focused commands

```sh
pnpm --filter @eden/contracts test
pnpm --filter @eden/coding-runtime typecheck
pnpm --filter @eden/coding-runtime test
pnpm --filter @eden/cli typecheck
pnpm --filter @eden/cli test
```

## Focused results

- contracts: 15 passed / 0 failed;
- coding-runtime: 87 passed / 0 failed;
- CLI: 29 passed / 0 failed;
- process matrix subset: 3 passed / 0 failed, including same-revision competition, symlink retarget,
  run-ID collision, aborted wait, killed owner/orphan timeout, and malformed owner timeout;
- exact boundary rows pass for catalog entry/notice/child/cumulative-byte/cumulative-record budgets, journal
  record/file/count budgets, trust serialization, and lock-owner bounded reading.

## Complete local gate

The frozen verification sequence in `docs/plans/2026-07-16-r1-exit-closure.md` completed with exit code 0
after the final tracked edit. The complete command output is retained locally at
`/tmp/eden-r1-final-v6.log`, and `/tmp/eden-r1-final-v6.passed` records the successful shell completion.

- evidence directory: `/tmp/eden-r1-final-evidence-v6`;
- production artifact SHA-256: `95dab08abcefed3146782f8b672edc051b570131d762d7440f690882331501da`;
- required evidence rows: 15 passed / 0 failed;
- code check: 174 files checked / 0 errors;
- Markdown check: 46 files checked / 0 errors;
- standalone boundary: copied artifact executed outside the checkout while `apps`, `packages`, `spikes`,
  and `node_modules` were unavailable;
- read-only history side effects: 0 new effect receipts and no state-digest change;
- production PTY: 60x20 and 100x30 captures passed, shell sentinel observed, terminal mode restored;
- support rows remain explicitly `not-run` for real terminal applications, PowerShell IME, signing,
  installers, and release support.

Fresh final review results remain pending and will be appended before publication.

# R1 Exit Closure Review Repair 5: RED

- Date: 2026-07-16
- Baseline HEAD: `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f`
- Candidate: dirty worktree after the simplified single-agent review transition

## Commands

```sh
pnpm --filter @eden/coding-runtime exec node --test \
  test/workspace-trust.test.ts test/agent-client.test.ts
node --test scripts/r1-walking-skeleton-workflow.test.mjs
```

## Observed failures

- coding-runtime: 31 passed / 4 failed; opening a fresh restricted workspace and opening a missing run
  created an empty configured state root, and a restricted no-op consumed filesystem state;
- workflow: 8 passed / 1 failed; the production PTY driver did not use the repository-owned cleanup
  helper and retained its weaker duplicate `taskkill.exe` path;
- the 15-second real headless process test retained only its first child for cleanup, so an early failure
  could leave later children or pipe handles alive.

The matching-surface reproduction returned the correct `workspace_trust_required` error with exit code 2
but left the previously absent `EDEN_STATE_DIR` as an empty directory.

# R1 Exit Closure Review Repair 4: RED

- Date: 2026-07-16
- Baseline HEAD: `7a93d2968dc4d0f5b2f9d2f913e4108c2f04a48f`
- Candidate: dirty worktree after the third fresh final five-lane review

## Commands

```sh
pnpm --filter @eden/kernel test
pnpm --filter @eden/coding-runtime test
```

## Observed failures before implementation

- kernel: exit 1, 10 passed / 1 failed; a schema-valid `fake.model.completed` event with forged Action
  fields was accepted;
- coding-runtime: exit 1, 90 passed / 1 failed; replay accepted a forged completed Action;
- context review: the accepted fake-task plan described subscription cancellation only and did not
  distinguish it from the durable model-effect and explicit run-cancellation outcomes.

Raw outputs are retained locally at `/tmp/r1-review4-red-kernel.log` and
`/tmp/r1-review4-red-runtime.log`.

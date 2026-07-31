# R2 Docker Build Contract-Gap Decision Brief

- Status: Accepted Freeze amendment
- Date: 2026-08-01
- Owner decision: Option A approved 2026-08-01
- Trigger: Slice 5 real-runner completion and Slice 6 Build-entry integration
- Governing sources: ADR 0017 and the accepted Docker repository-check plan

## Decision frontier

Build reached a public-contract mismatch that cannot be resolved by implementation alone. The accepted
plan requires an approved repository-check action to bind Docker compatibility facts and requires changed
backend facts to block before `docker create` or `docker start`. `RepositoryCheckActionEnvelopeV1` binds
the requested platform, image, profile, and budgets, but it does not bind the selected Docker context or
the observed client, daemon, security, and resource-capability facts. Consequently, two different
compatible-looking backends can currently satisfy the same approved action digest.

The runner audit found one related result-composition mismatch. The accepted result vocabulary makes
`cleanup_failed` visible while also retaining the wrapper reason. The current result refinement accepts
`cleanup_failed` only with `process_exited`, so a timeout, cancellation, OOM, output overflow, or engine
failure followed by cleanup failure cannot preserve both truths in one valid result.

These are pre-release contract defects, not requests for broader authority. No Docker command, network,
provider call, mutable image reference, shell, repository-authored environment, or cleanup action is
needed to repair them.

## Live evidence already established

- The fixed real Docker test completed one exact create/start/wait/receipt/cleanup path on the approved
  fresh `userns-remap` daemon.
- The result was `passed`, the receipt was durable before cleanup, and the post-run exact-label container
  census was zero.
- Deterministic runner tests now cover exact create arguments, strict inspect matching, stale staging,
  daemon uncertainty, create/start/wait ambiguity, missing results, created/running/exited recovery,
  zero duplicate create/start, receipt recovery, OOM attribution, and ordinary cleanup failure.
- No provider request, new image publication, commit, push, release, merge, or package publication was
  used for this audit.

## Options

### A. Amend the closed contracts now (recommended)

Add one closed `dockerCompatibility` object to `RepositoryCheckActionEnvelopeV1` and therefore to the
canonical approval digest. It should contain only bounded non-secret observations already owned by
Doctor:

- safe context name and SHA-256 of its endpoint, never the raw endpoint in provider context;
- client version and API version;
- daemon version, minimum API version, API version, Linux OS type, and architecture;
- fixed booleans for user namespace, cgroup namespace, seccomp, memory, swap, CPU quota/period, and PIDs
  enforcement;
- the already frozen image index, platform manifest, and image config identities.

Preparation records these facts, approval displays them in bounded form, and dispatch re-observes and
compares every field before create/start. Any drift blocks without Docker mutation.

Also change the `cleanup_failed` result refinement so cleanup failure remains the primary outcome while
the original closed wrapper reason is retained. Cleanup remains an independently recorded object state;
this does not add the future cleanup action that the accepted plan explicitly excludes.

### B. Keep the current action contract

Re-observe only generic readiness at dispatch without binding it to the approval digest. This permits an
approved action to move across compatible Docker backends and therefore contradicts the accepted
changed-backend rejection row. This option requires weakening the accepted trust claim and is not
recommended.

### C. Defer repository-check execution

Keep Slice 0-5 runner work local but do not activate the model/approval/product flow. This preserves the
Freeze but cannot reach the authorized Ubuntu implementation candidate.

## Accepted owner decision

The owner approved Option A as one narrow Freeze amendment. The amendment changes only closed identity
and result composition. It does not expand execution authority or release support.

## Stop condition

Build may implement and verify the accepted Option A shapes before activating Slice 6 repository-check
approval and dispatch semantics. Build must stop again if exact compatibility observations cannot fit the
closed action, approval, journal, and product contracts, or if implementation requires broader Docker,
credential, provider, cleanup, or release authority.

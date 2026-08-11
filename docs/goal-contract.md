# Goal Contract

## Status

The owner accepted the R3 direction and ADR 0019 Freeze packet on 2026-08-10, then accepted the amended Freeze and freshly authorized Build on 2026-08-11. R3-A is owner-accepted and closed, and the focused R3-B Freeze packet and Build are separately authorized. R3-B has a locally green Slices 0-4 candidate and copied-package diagnostic, while formal exact-source evidence remains pending. The exact Goal contract below remains fixed later-slice input, and R3-C has not started.

## Purpose

Goal mode turns an open-ended instruction into a bounded, verifiable task. It is not a prompt that tells the model to try harder; it is runtime data enforced outside the model.

## GoalSpec

A goal contains:

- a human-readable objective;
- repository and path scope;
- required and optional checks;
- expected artifacts;
- allowed capability classes;
- time, token, action, and repair budgets;
- explicit stop conditions;
- policy for workspace drift and human steering.

`GoalSpecV1` is a closed, canonically identified value bound to one approved `PlanArtifactV1` revision. It contains one to eight required checks, up to eight optional checks, up to sixteen expected artifacts, allowed capability classes, model/tool/action/time/repair budgets, stop conditions, workspace-drift policy, and the v0.1 `checkpoint_only_no_automatic_rollback` strategy. A changed plan or goal revision invalidates the prior approval.

Goal budgets select a durable per-run grant no greater than the active RunProfile policy maxima. They are ceilings, not instructions to spend the full allowance: the model may answer early or use no tool, but it cannot increase a grant. Multi-call batching changes only how eligible read-only calls share one model step; every call still consumes the same tool budget, and no batch may combine or parallelize an approval-bearing or effectful action.

## Plan lifecycle

Plan mode reads repository evidence and writes only one journal-local `PlanArtifactV1`; it has no workspace-write, command, approval, or success authority. The plan records identity, revision, objective, ordered steps, acceptance checks, capabilities, assumptions, risks, and non-goals within 24 KiB.

Only the user may approve the current revision. Execution chooses `fresh`, `compact`, or `keep_context` for provider context, but that choice cannot change plan or GoalSpec identity, scope, checks, capabilities, budgets, or durable evidence.

## Ownership

The user approves the goal. The planner may propose a plan that satisfies it. The model may propose actions and repair attempts. Policy controls authority. The verifier alone decides whether evidence satisfies the goal.

No model response may remove a required check, expand scope, increase a budget, or emit success.

The default repair budget is one cycle and the hard maximum is two. The model may propose a completion candidate or repair action; neither changes the goal, approves an action, or owns terminal state.

## State progression

The conceptual progression is draft, planned, approved, executing, verifying, repairing, and terminal. Awaiting approval and paused are durable substates. The exact kernel representation will be fixed by tests before implementation.

The v0.1 checkpoint is a durable safe-boundary fact containing the approved plan and goal identities, current `HEAD`, scoped workspace identities, completed effects, budgets, approval state, and verifier state. It does not create a Git commit, stash, worktree, filesystem snapshot, or automatic rollback. Repair uses a new policy-controlled action and never resets user changes.

Resume is distinct from historical inspection. `eden run resume <run-id>` is interactive; `eden run resume --json <run-id>` emits the same product stream and stops at interactive approvals. Resume replays before I/O, performs kind-specific reconciliation, revalidates workspace/goal/policy/provider facts, and dispatches only from a declared safe boundary. Unknown effects block.

## Verification order

1. Confirm the current workspace and goal identity.
2. Check for policy violations or stale evidence.
3. Run deterministic required checks.
4. Collect optional checks and artifacts.
5. Evaluate scope and diff constraints.
6. Either emit verifier-backed success, request bounded repair, block for user input, or fail.

A required-check failure emits only the minimum structured evidence needed for repair. A remaining budget returns the run to repairing. Exhaustion becomes `failed`; missing authority, unavailable capability, ambiguous effect, or required user input becomes `blocked`. Optional-check failure remains visible residual risk and cannot conceal a required-check result.

## Evidence Pack

`EvidencePackV1` is a versioned runtime-state artifact of at most 256 KiB. It binds goal and plan identities, the scoped diff summary, required and optional check results, artifacts, approval exceptions, budget use, environment and support metadata, and residual risk. Its hash and byte length are journaled before the verifier emits `succeeded`. It is a review aid, not a guarantee that generated code is flawless.

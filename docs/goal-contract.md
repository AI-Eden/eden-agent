# Goal Contract

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

## Ownership

The user approves the goal. The planner may propose a plan that satisfies it. The model may propose actions and repair attempts. Policy controls authority. The verifier alone decides whether evidence satisfies the goal.

No model response may remove a required check, expand scope, increase a budget, or emit success.

## State progression

The conceptual progression is draft, planned, approved, executing, verifying, repairing, and terminal. Awaiting approval and paused are durable substates. The exact kernel representation will be fixed by tests before implementation.

## Verification order

1. Confirm the current workspace and goal identity.
2. Check for policy violations or stale evidence.
3. Run deterministic required checks.
4. Collect optional checks and artifacts.
5. Evaluate scope and diff constraints.
6. Either emit verifier-backed success, request bounded repair, block for user input, or fail.

## Evidence Pack

The Evidence Pack references immutable or content-addressed evidence where practical. It summarizes the diff, check commands and results, artifacts, approval exceptions, budget use, environment metadata, and residual risk. It is a review aid, not a guarantee that generated code is flawless.

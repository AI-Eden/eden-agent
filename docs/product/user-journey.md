# v0.1 User Journey

1. The user installs `eden` and sees a useful welcome state without a provider key.
2. They choose or configure a provider, store credentials outside Eden's journal, and run a connection check.
3. They open a repository and review trust, dirty-worktree state, instructions, available checks, sandbox, and network status.
4. They describe a task or provide a GoalSpec.
5. Eden explores read-only and proposes a repository-grounded plan.
6. The user revises or approves the plan and its authority.
7. Eden executes while the product shows phase, current action, changed files, budget, and blockers.
8. A risky action produces a scoped approval card. Rejection becomes a recoverable observation.
9. The user may steer, pause, cancel, exit, or resume at defined boundaries.
10. Eden verifies the current workspace and enters review only with current evidence.
11. The user inspects diff, checks, artifacts, exceptions, and residual risk.
12. They accept, request another repair, open the changes in an editor, or export a sanitized diagnostic bundle.

The journey is incomplete if any transition requires the user to inspect raw JSON, infer whether a command actually ran, or trust a natural-language completion claim.

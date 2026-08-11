# v0.1 User Journey

1. The user installs `eden` and sees a useful welcome state without a provider key.
2. They choose or configure a provider, store credentials outside Eden's journal, and run a connection check.
3. They open a repository in restricted mode, review its exact identity and current authority, and
   explicitly trust that path before a task may start. Later slices add dirty-worktree, instruction,
   available-check, sandbox, and network inspection to the same review state.
4. They may inspect this exact workspace's prior runs without granting task-start authority or continuing
   historical execution.
5. They describe a task or provide a GoalSpec.
6. Eden explores read-only and proposes a repository-grounded plan.
7. The user revises or approves the plan and its authority.
8. Eden executes while the product shows phase, current action, changed files, budget, and blockers.
9. A risky action produces a scoped approval card. Rejection becomes a recoverable observation.
10. During an active run, the persistent multiline composer lets the user submit a typed steering message for the current turn or queue a FIFO follow-up after the current answer. Input never resolves approval, triggers retry, cancels an in-flight effect, or invents pause/resume authority. The user may still cancel or exit at defined boundaries; pause and resume arrive only with their accepted milestone.
11. Eden verifies the current workspace and enters review only with current evidence.
12. The user inspects diff, checks, artifacts, exceptions, and residual risk.
13. They accept, request another repair, open the changes in an editor, or export a sanitized diagnostic bundle.

The blocking R3-E proof instantiates this journey as one packaged first verified patch: the owner follows public instructions in a fresh isolated environment, approves a plan and exact actions, creates or edits, observes a failed required check, repairs within budget, resumes across one interruption, reaches verifier-owned success, and reviews the diff and Evidence Pack.

R3-D is optional. When separately delivered, a Plan or Goal may request one bounded read-only child result or source-backed web result. The primary journey remains complete when those capabilities are absent, and the product must not display them as hidden release requirements.

The journey is incomplete if any transition requires the user to inspect raw JSON, infer whether a command actually ran, or trust a natural-language completion claim.

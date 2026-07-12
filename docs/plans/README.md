# Implementation Plans

Plans turn accepted product and architecture decisions into executable work. Name them `YYYY-MM-DD-short-topic.md`.

Each plan contains:

- goal and user-visible outcome;
- current repository facts;
- exact files or boundaries likely to change;
- ordered test-first implementation slices;
- acceptance checks and commands;
- risks, decision points, and rollback path;
- explicit non-goals;
- review checkpoints requiring human approval.

## Testing decisions

For each behavior slice, record:

- the public seam through which behavior is exercised;
- the observable outcome and its independent source of truth;
- the smallest RED test or deterministic scenario that proves the behavior is missing;
- any permitted fake or mock, limited to a real system boundary when a real adapter or deterministic fake is impractical;
- the matching-surface scenario used after automated checks.

Prefer existing seams to new ones. Keep one test, one minimal implementation, and one refactor inside each vertical slice rather than writing a horizontal batch of imagined tests. A plan reviewer approves these seams once during Freeze; Build does not reopen that checkpoint before every test unless new evidence invalidates the plan.

An approved plan is fixed input for implementation. If discovery invalidates it, stop, document the new fact, and amend or replace the plan before broadening scope.

The first plan should cover PRODUCT/SPEC review and the comparative terminal-framework spike. The second should define contract schemas and fake ProductView fixtures. Do not start the real provider or autonomous loop in the same change.

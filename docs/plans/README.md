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

An approved plan is fixed input for implementation. If discovery invalidates it, stop, document the new fact, and amend or replace the plan before broadening scope.

The first plan should cover PRODUCT/SPEC review and the comparative terminal-framework spike. The second should define contract schemas and fake ProductView fixtures. Do not start the real provider or autonomous loop in the same change.

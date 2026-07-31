# Repository-check failing fixture

This dependency-free repository is the fixed R2 Docker acceptance fixture.

- Initial state: `src/add.js` subtracts, so the tracked `test/add.test.js` check fails.
- Task: change the existing tracked return expression to addition.
- Allowed capabilities: one exact AnchorEdit and one named `test` repository check.
- Expected change: `return left - right;` becomes `return left + right;`.
- Required check: `.eden/checks/catalog.json` invokes `/usr/local/bin/node --test test/add.test.js`.
- Expected terminal state: the check observation is `completed`; it never claims verifier success.
- Secret canary: the acceptance driver creates ignored `.acceptance-secret` bytes after the Git commit and
  proves they are absent from snapshots, journals, product output, and evidence.

The fixture has no package dependency, install step, provider requirement, or network requirement.

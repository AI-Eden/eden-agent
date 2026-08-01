# ADR 0018: Close R2 on a Declared Reference Platform

- Status: Accepted
- Date: 2026-08-01
- Amends: the R2 exit-evidence gate in ADR 0017 and
  `docs/plans/2026-07-29-r2-docker-repository-check.md`

## Context

Eden is a portfolio-first personal coding-agent product. Its R2 value comes from owning and proving the
provider loop, bounded repository context, snapshot-safe actuation, exact approval, Docker-contained
repository checks, recovery, and truthful product projections. The product explicitly does not promise
every provider, operating-system sandbox, installer, or release surface in v0.1.

ADR 0017 originally made real macOS Docker Desktop, real Windows Docker Desktop WSL2, and one independent
external-user journey mandatory for whole-R2 closure. Those rows are useful platform-support and user-
feedback evidence, but their availability depends on hardware and third parties outside this personal
project. Keeping them as roadmap gates would make R3 progress depend on resource access rather than on the
quality of Eden's core harness and product contract.

The reviewed implementation already has stronger evidence on its declared reference surface: exact-SHA
hosted Ubuntu Docker execution, an owner-controlled fresh Linux/WSL2 `userns-remap` daemon, hosted
Ubuntu/macOS/Windows non-Docker regression lanes, a real provider/tool loop, exact safe actuation, closed
machine-readable evidence, and cleanup with no duplicate execution or residual Docker objects.

## Decision

R2 closes as a **reference-platform product milestone** on Linux/WSL2. Closure requires:

- the accepted provider/repository-understanding, safe-actuation, and Docker repository-check packets to
  be implemented and reviewed;
- exact-SHA hosted Ubuntu Docker execution of the fixed fail/correct-pass/wrong-fail journey;
- one owner-controlled fresh Linux/WSL2 backend proving the accepted containment profile and cleanup;
- hosted Ubuntu, macOS, and Windows contract, package, TUI, and negative-doctor regression evidence;
- a real configured-provider matching journey with secrets excluded from repository, journal, UI, and
  evidence surfaces;
- clean machine-readable artifacts, public documentation, exact remote publication, and explicit support
  limitations.

Real macOS Docker Desktop, real Windows Docker Desktop WSL2, and independent external-user journeys become
optional future platform-support or feedback evidence. Missing rows remain `not-run`; they are never
inferred from hosted lanes, image architecture, emulation, or the Linux reference backend. They no longer
block the R2 roadmap milestone.

R3 may replace its third-party tester gate with an owner-operated end-to-end journey in a fresh isolated
environment using only public instructions and the packaged artifact. That journey must retain exact
commands, artifact hashes, visible product evidence, and the verifier-owned Evidence Pack. Independent
external feedback remains desirable, but it belongs to optional portfolio evidence and later dogfood
hardening rather than completion authority.

The allowed claim is: **R2 is complete for the declared Linux/WSL2 reference platform, with hosted
cross-platform portability regression.** This decision does not establish real macOS or Windows Docker
Desktop support, native sandbox parity, installation support, upgrade/uninstall behavior, signing,
package-manager publication, an update channel, or general release support.

ADR 0017's runtime, approval, Docker containment, recovery, output, Doctor, and completion contracts are
unchanged.

## Rejected alternatives

- **Keep inaccessible hardware and third-party participation as roadmap gates:** preserves the old matrix
  but makes core product progress depend on resources outside the project.
- **Silently waive the missing rows:** creates an unreviewable contradiction and risks false support
  claims.
- **Leave R2 permanently open while starting R3:** obscures the portfolio roadmap and makes completion
  mean resource availability rather than delivered product capability.
- **Call the reference-platform milestone release support:** conflates implementation evidence with
  installation, signing, update, and platform guarantees that have not been exercised.

## Consequences

R2 can close on the existing reviewed implementation and evidence without obtaining a Mac or recruiting
an external participant. Public status and support documents must preserve every optional row as
`not-run`, name Linux/WSL2 as the reference platform, and keep release support open.

The next roadmap work is R3 Explore and Freeze: GoalSpec, plan review, verifier-owned completion, bounded
repair, checkpoints, worktrees, durable resume, Evidence Pack, packaging, and a reproducible product demo.
R3 Build still requires its own accepted plan and authorization.

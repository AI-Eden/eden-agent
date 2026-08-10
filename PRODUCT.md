# Product Definition

## Positioning

eden-agent is a trustworthy coding product for developers who are willing to delegate medium-sized repository tasks but need a clear plan, bounded authority, visible changes, verification evidence, and reliable recovery.

It is not positioned as another general chat interface, a feature-count competitor, a multi-agent platform, or a benchmark-only research harness.

## Primary user

The first user is an independent developer or small-team engineer working in a local Git repository. They value autonomy only when they can understand and constrain its impact.

## Job to be done

Give Eden a task with acceptance conditions; let it understand, plan, edit, execute, and repair; intervene at meaningful boundaries; then review a diff, checks, and completion evidence.

## Product promise

The product should always help the user answer six questions:

1. What is happening now?
2. Why does Eden need me?
3. What changed?
4. What was verified?
5. What risk remains?
6. What can I do next?

## v0.1 surface

The default `eden` command is a polished, keyboard-first TUI. `eden exec --json` is the headless execution
surface. Headless run listing and inspection use `eden run list --json` and
`eden run show --json <run-id>`. All surfaces consume the same product contracts and cannot own separate
execution or history semantics.

The TUI must cover onboarding, workspace trust, current-workspace run history, read-only historical
inspection, plan review, scoped approvals, progress, changed files, diff, required checks, evidence,
steering, pause, resume, cancellation, and recovery. Historical inspection does not imply that execution
can resume from that run.

The accepted remaining R2 contract adds one interactive, exact-approved, Docker-isolated named repository
check and a separate `eden doctor` prerequisite surface. Doctor is read-only by default; its explicit
Docker probe is a separately confirmed diagnostic action, not automatic setup or remediation. Headless
clients receive the same check and approval facts but stop before interactive execution.

R2 closes on a declared Linux/WSL2 reference platform under ADR 0018. Hosted macOS and Windows remain
portability regression surfaces, not real Docker Desktop support. Real macOS Docker Desktop, real Windows
Docker Desktop, and independent external-user evidence are optional and remain explicitly `not-run` until
exercised. This milestone does not establish release support.

## R3 resume-ready product direction

The owner accepted the accelerated R3 direction and complete Freeze packet on 2026-08-10, then accepted an R3-A multi-call and durable-budget amendment on 2026-08-11. The packet keeps five named milestones while making `R3-A -> R3-B -> R3-C -> R3-E` the blocking release path:

- R3-A makes the existing real-provider loop usable for a bounded repository task with policy/grant/usage budgets, up to four independent read-only calls per model step, model-visible diff, exclusive new-file creation, shell-free controlled command execution, structured failures, and non-success `completed` review. The model chooses whether to call a tool or answer and may stop early; runtime ceilings, a reserved final-answer step, singleton effectful calls, and exact approval remain outside model authority.
- R3-B reconstructs the OpenTUI product shell around real runtime truth before Plan and Goal add more states.
- R3-C adds Plan review and approval, GoalSpec, required checks, bounded repair, checkpointed resume, verifier-owned `succeeded`, and an Evidence Pack.
- R3-D may add exactly one read-only ExploreAgent plus bounded web search and fetch after R3-C, but requires separate activation and does not block R3-E.
- R3-E packages and documents the first verified patch journey on the declared reference platform.

The owner approved the amended Freeze and freshly authorized Build plus public-first commit/push on 2026-08-11, then accepted the deterministic candidate and authorized copied packaged TUI evidence plus exactly one matching real-provider/network fixture. Candidate `092f9a107e93112b401a1c9e48dcad04ff064529` is green for deterministic implementation, all three copied-package viewports, and the complete hosted R2 matrix. The single `deepseek-v4-pro` journey stopped at the explicit `network` retry boundary before completion and was not retried; later offline diagnosis found that the old driver had inherited `NODE_TLS_REJECT_UNAUTHORIZED=0`, so the attempt cannot prove normal TLS. A bounded repair now removes that variable and persists sanitized failures, but no second network attempt has been authorized or run. The milestone review therefore recommends no R3-A acceptance or closure; the accepted production claim remains R2 and R3-B has not started.

The first resume-ready claim requires a packaged owner-operated journey from public instructions in a fresh isolated environment. It must show a normal bounded coding loop, plan approval, a failed required check, repair within budget, verifier success, diff and Evidence Pack review, and one interruption/resume path. It does not require R3-D and does not imply broad release support.

## Later surface

Eden Studio is a cross-platform session control plane considered only after the local-service architecture gate. It adds multi-project navigation, dense review, notifications, keychain integration, installers, and updates. It must not duplicate the harness or become a code editor.

## Non-goals

- Replacing VS Code, JetBrains IDEs, or Git clients.
- Shipping a cloud control plane, accounts, billing, or team RBAC.
- Supporting every provider, tool protocol, or operating-system sandbox in v0.1.
- Exposing a local daemon directly to the public internet.
- Treating raw reasoning or token streaming as product transparency.
- Maximizing tool or subagent count.
- Treating a shell-free structured process request as a general shell or sandbox.
- Requiring ExploreAgent or web tools for the first resume-ready release.

## Success measures

Agent outcome and product quality are separate release dimensions. The project tracks verified task success, false-completion rate, recovery, installation success, time to first verified patch, crash-free sessions, approval consistency, responsive rendering, cross-platform smoke tests, and secret redaction.

Portfolio milestones use reproducible evidence on their declared reference surface. Missing hardware or
third-party availability does not block a roadmap milestone when the limitation remains explicit and no
platform or release-support claim is inferred.

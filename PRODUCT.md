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

## Later surface

Eden Studio is a cross-platform session control plane considered only after the local-service architecture gate. It adds multi-project navigation, dense review, notifications, keychain integration, installers, and updates. It must not duplicate the harness or become a code editor.

## Non-goals

- Replacing VS Code, JetBrains IDEs, or Git clients.
- Shipping a cloud control plane, accounts, billing, or team RBAC.
- Supporting every provider, tool protocol, or operating-system sandbox in v0.1.
- Exposing a local daemon directly to the public internet.
- Treating raw reasoning or token streaming as product transparency.
- Maximizing tool or subagent count.

## Success measures

Agent outcome and product quality are separate release dimensions. The project tracks verified task success, false-completion rate, recovery, installation success, time to first verified patch, crash-free sessions, approval consistency, responsive rendering, cross-platform smoke tests, and secret redaction.

# ADR 0009: Require Explicit Path-Scoped Workspace Trust

- Status: Accepted
- Date: 2026-07-15

## Context

The first R1 slice assigned a random workspace identity per run and injected `trusted` presentation state
from each client. That placeholder cannot support honest onboarding: a renderer could appear trusted before
runtime enforcement, and opening a client created a run journal before the user made a workspace decision.

Workspace trust, action approval, network policy, and sandbox isolation answer different questions. Eden
needs one narrow trust meaning before real repository tools arrive.

## Decision

Resolve the selected directory to an exact canonical root and derive its stable opaque identity from a
domain-separated SHA-256 digest. New workspaces begin restricted. Persist the user's trust or restriction
outside the workspace until explicit revocation; never inherit trust from a parent, prefix, Git remote, or
repository name.

Restricted mode may display canonical workspace metadata and fixed R1 capability truth, but it cannot
create a run, load repository content or instructions, inspect Git state, execute an effect, or use the
network. Both TUI and headless clients submit the same versioned trust command through `AgentClient`.
Headless `--trust-workspace` and fake-action approval remain independent grants.

The trust registry is configuration state, not a run journal. Once a trusted run starts, the runtime copies
the exact workspace snapshot into the `run.started` event. Kernel state and replay own that historical
snapshot; later revocation controls new runs without rewriting completed ones.

## Consequences

Trust survives ordinary relaunches without broad parent-directory authority. Missing, corrupt, stale, or
mismatched trust state fails closed. The state directory cannot be equal to or nested beneath the trusted
workspace because repository-controlled files cannot be authoritative trust configuration.

Trust permits task entry only. It does not approve an action, enable repository reads or writes, enable
network access, configure a sandbox, authenticate repository authors, or make project content safe.
Provider onboarding, Git inspection, instructions, real tools, policy, and isolation remain later gates.

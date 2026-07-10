# UX State Model

## Product states

The interface projects durable runtime truth into a small set of understandable states: onboarding, workspace review, planning, awaiting approval, executing, paused, verifying, review, blocked, failed, cancelled, and succeeded.

Each state defines:

- the primary question the user is answering;
- the evidence shown by default;
- available commands;
- recovery action;
- whether the state survives process exit.

## Information hierarchy

Always visible: workspace, session, profile, phase, trust mode, network, model, and budget. The main surface prioritizes progress, changed files, checks, and blockers. Raw tool detail and trace diagnostics are expandable.

## Responsive terminal layout

- Narrow: one primary column with explicit view switching.
- Medium: timeline plus contextual drawer.
- Wide: session navigation, timeline, and review pane.

Width changes must preserve current focus and action safety. Three permanent panes are not assumed.

## Recovery

Every denial, error, disconnection, stale edit, and failed check exposes a next action such as retry, revise scope, reconfigure, inspect, or ask the user. A generic error toast is not a recovery design.

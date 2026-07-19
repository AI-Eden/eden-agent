# UX State Model

## Product states

The interface projects durable runtime truth into a small set of understandable states: onboarding, workspace review, planning, awaiting approval, executing, paused, verifying, review, blocked, failed, cancelled, and succeeded.

Each state defines:

- the primary question the user is answering;
- the evidence shown by default;
- available commands;
- recovery action;
- whether the state survives process exit.

Onboarding and workspace review precede run creation. A new canonical root is restricted, the product
shows its exact path and fixed capability truth, and the task composer remains unavailable until a
runtime-accepted trust command. Revocation returns the pre-run surface to restricted without rewriting
historical runs.

Run history is a workspace-review subview available in both restricted and trusted states. It lists only
the exact canonical workspace partition. Opening an entry creates a read-only historical inspection with
an explicit back action; it never exposes approval, cancellation, or resume controls. Unavailable entries
stay visible with structured recovery text while other valid runs remain usable.

## Information hierarchy

Always visible: workspace, session, profile, phase, trust mode, network, model, and budget. The main surface prioritizes progress, changed files, checks, and blockers. Raw tool detail and trace diagnostics are expandable.

For the R2 first slice, onboarding distinguishes unconfigured, configured, catalog-reachable, and
completion-ready profile evidence. The conversation is the primary reading surface, while provider checks,
context admission, model attempts, semantic tools, interruptions, errors, and recovery remain structured
runtime blocks. Complete final answers do not collapse into progress summaries.

## Responsive terminal layout

- Narrow: one primary column with explicit view switching.
- Medium: timeline plus contextual drawer.
- Wide: session navigation, timeline, and review pane.

Width changes must preserve current focus and action safety. Three permanent panes are not assumed.

R2 navigation uses one focus graph: `Tab` and `Shift+Tab` move between focusable regions, arrows move within
a collection, `Enter` activates, `Esc` returns or collapses, `Ctrl+P` opens the command palette, and `?`
opens shortcut help outside text entry. Resize preserves focus identity, selection, expansion, scroll
anchor, and action safety.

R1 uses an explicit history key and selection view rather than a permanent pane. Narrow layouts preserve
workspace identity, read-only mode, selected run, outcome, and the back/exit actions before optional
timeline detail.

## Recovery

Every denial, error, disconnection, stale edit, and failed check exposes a next action such as retry, revise scope, reconfigure, inspect, or ask the user. A generic error toast is not a recovery design.

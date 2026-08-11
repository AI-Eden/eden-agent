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

For the safe-actuation slice, awaiting approval prioritizes the exact operation, path, base
snapshot, digest, policy rule and reason, single-use lifetime, trusted-host/no-isolation mode, and
approve/deny actions. Resize or focus movement cannot change the active digest. A stale proposal disables
approval and names the required recovery.

Review keeps two patches visibly separate: **Eden change** is the approved base-to-desired delta, while
**Current repository** is the complete tracked Git patch observed against `HEAD`. Changed-file rows label
Eden, pre-existing, or shared attribution. Baseline and current `git diff --check` evidence remain separate,
and passing copy says the closed check passed rather than claiming verification or success.

For the accepted Docker repository-check contract, approval prioritizes the resolved literal process,
catalog/input/image/platform digests, read-only mounts, omitted host authorities, closed environment,
`network=none`, containment profile, budgets, policy reason, and one-use lifetime. The isolation label says
Linux container and names the current Docker backend; it does not say native sandbox or daemon isolation.

Execution uses preparing, created, running, stopping, reconciling, and cleaning product states without
showing raw Docker CLI syntax as authority. Review distinguishes passed, failed, timed out, cancelled, OOM,
overflow, engine failure, cleanup failure, and unknown. Complete bounded stdout and stderr are separately
expandable local evidence. Passing copy says the named basic check passed and the run remains `completed`.

Default doctor is a separate read-only prerequisite view. An explicit Docker probe presents its own exact
confirmation before creating an object. Missing image, unsupported backend, mismatch, or cleanup residual
has a concrete manual next action; doctor never offers automatic pull, daemon configuration, or broad
cleanup.

Under the accepted 2026-07-31 amendment, interactive probe states are preflight, awaiting approval,
creating, created, running, result decoded, cleaning, and terminal review. A prior unresolved approved
probe is shown as exact recovery before any new proposal. JSON mode projects approval-required or
recovery-required and exits without mutation. Interactive recovery either closes a proven non-start as
`not_started`, resumes the exact durable object, or stops fail-closed for ambiguous identity.

For R3-A, command approval prioritizes resolved executable identity, literal argv, cwd, reason, scrubbed-environment identity, timeout/output budgets, `network=host_unrestricted`, `executionMode=trusted_host_policy_only`, `isolation=none`, digest, policy, and one-use lifetime. New-file approval prioritizes path, target/parent absence, content length/hash, fixed mode, scope, and exclusive-create truth. Neither card uses sandbox wording.

For R3-B, the conversation spine is the default reading state. A persistent active-run composer exposes two distinct ProductCommands: steering for the current agent turn and FIFO queueing after its complete answer. ProductView, not the editor, supplies availability, pending identity/content, reserved-step truth, counts, byte budget, delivery, and closure reasons. Approval and awaiting-retry states keep draft and pending input visible, but input cannot resolve approval or trigger retry. An already dispatched provider/tool/action continues to its durable boundary before steering may enter model context.

For R3-C, planning shows artifact revision, assumptions, risks, acceptance checks, capabilities, and approval state. Goal execution keeps objective, scope, required checks, remaining model/tool/action/time/repair budgets, current checkpoint, and blockers visible. Verifying and repairing are distinct states; a failed required check cannot be styled as success, and an Evidence Pack appears only from persisted verifier facts.

Resume is an explicit action on one eligible exact run, not a control on read-only historical inspection. The resume surface shows the last safe checkpoint, workspace drift, unresolved effects, approvals requiring review, and the next permitted transition before any dispatch.

## Responsive terminal layout

- Narrow: one primary conversation stream with explicit Chat, Action, Review, and History switching; a compact urgent-action rail stays visible in every view.
- Medium: conversation plus contextual evidence; session navigation opens as an overlay.
- Wide: session navigation, conversation, and contextual evidence.

Width changes must preserve current focus and action safety. Three permanent panes are not assumed.

R3-B additionally preserves the active approval, pending-input identity, evidence selection, composer draft/cursor, expansion, and transcript/evidence scroll anchors. When a region disappears, focus moves to its nearest semantic equivalent without activating a command. The default active-composer mapping is Enter steer, Alt+Enter queue, and Shift+Enter newline; paste never submits, and the command palette exposes equivalent actions.

R2 navigation uses one focus graph: `Tab` and `Shift+Tab` move between focusable regions, arrows move within
a collection, `Enter` activates, `Esc` returns or collapses, `Ctrl+P` opens the command palette, and `?`
opens shortcut help outside text entry. Resize preserves focus identity, selection, expansion, scroll
anchor, and action safety.

R1 uses an explicit history key and selection view rather than a permanent pane. Narrow layouts preserve
workspace identity, read-only mode, selected run, outcome, and the back/exit actions before optional
timeline detail.

## Recovery

Every denial, error, disconnection, stale edit, and failed check exposes a next action such as inspect,
revise scope, reconfigure, or ask the user. Safe actuation never offers blind retry after unknown process
dispatch. A generic error toast is not a recovery design.

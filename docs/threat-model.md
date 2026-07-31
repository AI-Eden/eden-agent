# Threat Model

## Assets

- repository contents and uncommitted user work;
- provider credentials and environment secrets;
- host files outside the approved workspace;
- command authority, network access, and process lifetime;
- journal integrity and approval records;
- the user's ability to understand what will execute.

## Trust boundaries

The model is untrusted input. Repository text, tool output, plugins, MCP servers, and remote content may also be adversarial. The terminal renderer is presentation code, not execution authority. A later desktop renderer is treated as less trusted than the host and agent service.

## Primary threats

- Prompt injection causes a broader action than the user intended.
- Displayed approval content differs from the executed action.
- A stale edit overwrites concurrent user changes.
- Secrets leak through prompts, environment variables, logs, traces, diagnostics, or UI events.
- A project plugin executes code merely by being discovered.
- Resume repeats a non-idempotent effect.
- Path traversal or symlink changes escape the workspace.
- Network access turns a local action into data exfiltration.
- A UI or client forges terminal events.

## Required controls

- Validate every external schema at the boundary.
- Model capability as allow, ask, or deny, with child scopes no broader than parents.
- Bind approval to canonical action bytes, working directory, environment class, and expiry.
- Revalidate paths, snapshots, and approval digests immediately before execution.
- Scrub environments and redact structured output at ingestion.
- Separate plugin discovery from trust and execution.
- Journal effect intent and observed completion with reconciliation identifiers.
- Make network, sandbox, workspace trust, and current authority visible in the product.
- Bind workspace trust to one runtime-resolved canonical root, store it outside that root, fail closed on
  invalid state, and revalidate identity immediately before accepting a trust command or starting a run.
- Keep workspace trust distinct from action approval and capability grants; trust may only unlock task
  entry in the R1 slice.
- Partition run state by the runtime-derived workspace ID, reject symlinked or structurally invalid run
  entries, and never use a catalog scan to append, repair, reconcile, or dispatch.
- Bound one catalog to 512 visited partition children, 16 MiB and 16384 cumulative journal records; bound
  each journal to 1 MiB, each record to 64 KiB, and each run to 4096 records.
- Reject hardlink trust records and journals, and compare file identity at the documented checkpoints.
- Serialize cooperating Eden trust changes and run starts with the bounded per-workspace state lock.
- Keep historical inspection read-only even when its replayed view contains a pending approval or
  non-terminal phase; only a separately specified resume flow may regain execution authority.
- Let only trusted runtime code emit verifier-backed terminal events.
- Keep provider profiles in one versioned host-side file outside the workspace; resolve only the selected
  credential source, reject linked or permissive state, replace atomically, and never project the secret or
  readiness fingerprint.
- Admit complete applicable `AGENTS.md` snapshots before governed content or provider network access; path
  containment, sibling scope, provenance, and hard P0 budgets fail closed.
- Keep repository tools semantic and read-only. Runtime code owns fixed native argv, scrubbed environment,
  cancellation, output bounds, and repeated path containment; the model never selects a process or shell.
- Resolve ripgrep only from the closed application archive manifest, reject missing/linked/hardlinked/
  modified/wrong-target assets, and verify version plus SHA-256 before every search. Probe host Git with a
  minimum version, disable interactive/config/pager/optional-lock behavior, parse only bounded semantic
  output, and terminate the complete native process group on timeout or cancellation.
- Keep streamed model deltas ephemeral and bounded. Commit only protocol-complete closed model observations;
  exclude interrupted partial text, partial tool calls, usage, and private continuity from later context.
- Persist provider attempt identity before dispatch, disable SDK retries, and allow automatic retry only for
  one proven `not_started` attempt. Unknown or post-delta work requires an explicit user retry.
- Never recurse through repository symlinks during search preflight and pass ripgrep an explicit no-follow
  policy; a directly requested linked scope still fails closed.
- Resolve an explicitly named credential only at the adapter boundary. Never write its value to workspace
  configuration, prompts, tool environments, journals, product events, diagnostics, or evidence artifacts.
- Canonicalize every executable action in trusted runtime code and bind policy, display, approval,
  dispatch, receipt, and observation to the same digest. Consume a single-use approval durably before
  dispatch and reject changed policy, workspace, snapshot, scope, lifetime, or operation facts.
- Default safe-actuation policy to deny. Treat runtime-owned Git trackedness, diff, and diff-check shapes as
  distinct closed actions; never turn the native-process port into model-selected executable, argv, cwd,
  environment, or shell authority.
- Permit AnchorEdit only for an existing tracked regular UTF-8 file with a complete base snapshot, unique
  non-overlapping anchors, checked identity, preserved mode, same-directory replacement, and desired
  verification. Existing dirty bytes are eligible only when they equal the approved base.
- Keep Eden attribution separate from current repository truth. Project changed files from runtime
  observations, show both the approved base-to-desired delta and current tracked Git patch, and never
  silently truncate an over-budget review value.
- Harden `git diff` and `git diff --check` against external diff drivers and text conversion, scrub
  interactive environment behavior, and execute no repository script, hook, test runner, or shell.
- Reconcile real effects by kind. Exact desired/base content can prove edit completion/not-started; a
  process that durably started without terminal evidence is unknown and cannot retry automatically.
- Describe trusted-host policy containment, approval, network mode, and Docker isolation as separate
  controls. The presence of one must not change the product claim for another.
- Treat a repository check catalog as untrusted executable intent. Read it only after exact-root trust,
  require one tracked regular UTF-8 current snapshot, bind its complete hash and resolved process to one
  always-ask action, and reject shell grammar, includes, parameters, or persistent grants in the first
  Docker slice.
- Build a complete bounded manifest from Git-tracked current regular-file bytes and stage it outside the
  workspace. Exclude `.git`, untracked/ignored files, links, gitlinks, special files, host/provider/Docker
  state, and over-budget data; mount only the revalidated snapshot read-only.
- Bind immutable image index, requested Linux platform, resolved platform manifest, wrapper, profile,
  mounts, closed environment, `network=none`, and every budget to the approved action. Check dispatch must
  never build, pull, import, install, or consult a registry credential.
- Run repository code non-root with a read-only root/workspace, all capabilities dropped, no new
  privileges, built-in seccomp, no privileged mode, devices, Docker/agent sockets, host namespaces, ports,
  restart, inherited environment, or catalog override of containment.
- Separate Docker create and start, journal dispatch before start, derive exact names/labels from the
  stable effect, and reconcile created/running/exited objects without duplicate execution. Remove only
  exactly attributed objects after a durable terminal receipt; never prune or use fuzzy Eden-like labels.
- Bound stdout and stderr independently and treat all repository output and wrapper results as untrusted
  basic evidence. Do not send raw output to a provider or let exit zero create verifier success.
- Keep doctor read-only by default. Require a separate canonical approval for the bounded Docker probe and
  grant no automatic image, package, daemon, context, trust, configuration, or cleanup remediation.
- Under the accepted 2026-07-31 amendment, keep probe authority outside repository runs. Bind backend,
  image/platform, fixed program, profile, budgets, and exact labels to one standalone digest; consume one
  always-ask approval before create; journal receipt before exact cleanup; and block synthetic workspace,
  broad recovery, raw Docker diagnostics, or non-interactive approval. The passing real Slice 4 probe
  exercised these boundaries without adding repository or provider authority.

## Execution modes

R2 distinguishes trusted-host execution from Docker isolation. They share policy vocabulary but make different guarantees. Native OS sandboxing is a later per-platform project; the UI must not imply equal isolation where evidence differs.

The accepted repository-check profile constrains one Linux container and its repository process. It does
not constrain a compromised Docker daemon, Docker Desktop VM, host kernel, administrator, or malicious
same-user holder of Docker authority. Hosted Ubuntu evidence does not prove macOS or Windows Docker Desktop
behavior, and architecture emulation does not prove a host backend.

## Desktop extension

If Eden Studio proceeds, the renderer holds no provider key and no shell or arbitrary filesystem capability. It sends typed product commands through authenticated local IPC. The daemon owns the journal; clients rebuild from snapshot and cursor. A short-lived capability token and restrictive socket permissions protect the local channel.

## Verification

Security claims require negative tests: canonical-byte and digest mismatch, single-use approval replay,
policy-revision drift, symlink or identity swap, stale or hardlinked edit, ambiguous anchor, protected path,
external diff/textconv sentinel, post-dispatch unknown process, denied network, secret canaries, malicious
repository instructions, replay after crash, and renderer-forged events.

R1 detects static corruption, hardlinks, bounded-work violations, observed identity replacement, and
cooperating Eden races. It does not claim resistance to malicious same-user path substitution, lock
sabotage, reparse or mount races, cryptographic forgery, or administrator compromise. The construction
path for stronger guarantees is recorded in
`docs/future-works/adversarial-local-state-filesystem-hardening.md` and is not authorized R1 work.
The `EDEN_STATE_DIR` override does not qualify group- or world-writable, network-mounted, synchronized,
imported, or untrusted restored roots; R1 evidence covers a private local root used by one OS account and
cooperating Eden processes.

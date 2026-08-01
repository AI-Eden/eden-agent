# Repository Check Contract Evolution

## Status

Deferred alternatives beyond the owner-approved 2026-07-29 Freeze packet for the first Docker-isolated
repository check. This record does not amend that Freeze, approve implementation, assign a roadmap stage
to an alternative, or make a Docker, platform, release-support, or verifier-success claim.

## Current frozen direction

The accepted bounded first-slice contract has all of these constraints:

- one Docker runner and one closed named repository check, not a runner-only substrate or a generalized
  Docker command tool;
- one versioned declarative catalog under the trusted repository root at `.eden/checks/`;
- workspace trust permits catalog discovery but grants no execution authority;
- the model selects a check name and cannot supply shell text, executable overrides, appended arguments,
  interpolation, conditions, pipelines, or includes;
- every selected check becomes a separately reviewed, single-use canonical action; there is no persistent
  catalog grant;
- the catalog is a Git-tracked regular UTF-8 file; current dirty bytes are allowed but their complete hash,
  dirty status, `HEAD`, resolved entry, and stale transition are explicit;
- one Eden-owned Node 24 fixture image is pinned by immutable multi-platform index digest; the action also
  identifies the requested Linux platform and resolved platform-manifest digest;
- check dispatch never builds, pulls, or installs dependencies; `eden doctor` reports a missing exact
  local image as a blocked prerequisite and gives manual preparation guidance;
- Eden constructs a bounded, hashed snapshot from current Git-tracked regular-file bytes; `.git`,
  untracked and ignored files, links, gitlinks, special files, provider state, and over-budget inputs do
  not enter the first container;
- the snapshot workspace and container root are read-only, with only a bounded temporary filesystem for
  explicitly named runtime scratch paths;
- the container has no external network, no published ports, and no per-check network override;
- the container receives only an Eden-owned closed non-secret environment; host, catalog, provider, Git,
  SSH, GPG, cloud, proxy, Docker, agent-socket, and credential-helper values do not enter it;
- the Linux-container profile fixes a numeric non-root user, drops all capabilities, prevents new
  privileges, uses the built-in seccomp profile, excludes privileged mode, devices, Docker API access,
  host namespaces, extra mounts, and restart, and applies Eden-owned memory, CPU, PID, file, time, output,
  staging, and temporary-filesystem budgets;
- every repository-code execution is an exact, single-use, separately reviewed action that binds the
  catalog and resolved process, current input-manifest digest, image and platform manifests, mounts,
  environment, network, containment profile, budgets, policy revision, and proposal lifetime; no current
  repository check is automatically allowed;
- the runtime derives one stable named container and labels from the stable effect identity, separates
  create from start, forbids automatic removal and restart, persists a bounded internal result, reconciles
  created, running, and exited states without duplicate execution, and removes only exactly owned
  container and staging objects after a durable terminal receipt; and
- separate bounded stdout and stderr remain local product evidence with byte counts and hashes; output
  overflow stops the check instead of presenting truncated output as a pass, and R2 does not automatically
  send raw repository-check output to a provider or open a repair loop;
- the interactive TUI owns exact approval and execution; headless NDJSON projects the same journal-derived
  facts but stops at approval with structured recovery instead of adding a broad preapproval flag, a
  second-invocation continuation protocol, or a general resume command;
- hosted Ubuntu x64 is the authoritative automated Docker execution lane, while hosted macOS and Windows
  retain non-Docker contract, package, TUI, and negative-doctor coverage; exact real-host automated rows
  for macOS Docker Desktop and Windows Docker Desktop WSL2/Linux-container behavior are optional platform
  evidence, and missing rows remain `not-run` rather than being inferred from image architecture;
- `eden doctor` is read-only by default; an explicit bounded Docker probe uses the already-present exact
  image, no repository input, no provider, no network, and a smaller fixed profile to test actual backend
  enforcement and exact cleanup, while neither mode pulls, builds, installs, configures the daemon, or
  performs automatic remediation;
- the first exit fixture is an Eden-owned dependency-free Node repository with an independent deterministic
  fail/pass oracle; CI uses a scripted non-provider driver, while an independent external-user Quickstart
  remains optional future feedback evidence with that user's own configured provider; and
- the result is a basic check observation in non-success `completed` review. It is not a GoalSpec,
  verifier-owned `succeeded`, repair loop, Evidence Pack, or release-support claim.

The runtime and trust constraints above remain the accepted Freeze contract. ADR 0018 amends only the R2
exit-evidence gate: the implementation and matching Linux/WSL2 evidence now exist, while optional real
Docker Desktop and external-user rows remain `not-run`. This does not broaden execution authority,
platform support, or release support.

## Deferred product problems

### Catalog authority and onboarding

The first contract intentionally pays a small repository-configuration cost to keep command authorship
and review explicit. Re-enter Explore if evidence justifies one of these broader families:

1. **Eden-owned ecosystem templates:** provide zero-configuration closed checks for a small, explicitly
   supported ecosystem corpus.
2. **User-authored per-run structured checks:** let the human supply exact executable, argument, and
   working-directory values without adding repository configuration.
3. **Persistent catalog grants:** separately approve a catalog revision or capability so unchanged named
   checks can execute without repeated action approval, while separately addressing changed repository
   input snapshots.
4. **Host-side workspace catalogs:** support repositories the user cannot modify while defining precedence,
   portability, and drift relative to repository revisions.
5. **Existing-manifest import:** derive candidates from package scripts, Make targets, or language manifests
   without silently importing their shell grammar or treating discovery as approval.
6. **Broader repository catalogs:** admit untracked local definitions, nested scope, bounded parameters,
   includes, or multiple catalog files only with explicit identity, precedence, stale, and review rules.

The current choice of repository-declared named checks is not a disguised general shell. Model-authored
structured processes and shell text remain in
[Model-Generated General Shell](model-generated-general-shell.md).

### Image and toolchain ownership

The first Eden-owned image proves one fixed fixture, not general language or dependency support. Possible
later families include:

1. additional Eden-owned, digest-pinned toolchain images selected by closed IDs;
2. repository-declared immutable images with explicit registry, platform, entrypoint, provenance, and
   support semantics;
3. user-selected pre-existing local images bound to a host-side workspace configuration;
4. repository Dockerfile builds with an independent build-context, network, secret, cache, receipt,
   cancellation, and cleanup contract;
5. a separately approved `image.prepare` action that pulls one exact registry digest without merging
   acquisition authority into check dispatch; and
6. offline OCI archives whose distribution, import, size, signing, licensing, update, and rollback
   semantics belong to an explicit release-support design.

Pull-on-check-dispatch is not retained as a preferred family. It conflates registry network, Docker image
store mutation, optional credential-helper use, and repository-code execution in one approval and one
recovery path.

### Repository ingress and writable outputs

The first tracked-file snapshot excludes many real repository workflows. A later contract may need:

1. additional declared untracked or generated inputs without implicitly exposing ignored secrets;
2. bounded symlink, submodule, Git LFS, executable-bit, or large-repository behavior;
3. a read-only live bind for explicitly observational checks, with daemon-path and concurrent-drift
   semantics;
4. a container-local copy-on-write workspace for tests that create caches, coverage, snapshots, or
   generated output;
5. explicitly exported artifacts with independent type, path, size, digest, retention, and review rules;
   or
6. dependency caches whose ownership, poisoning, concurrency, eviction, and cross-run reuse are visible.

A read-write bind of the live host worktree is not a default evolution path. It would give untrusted
repository code broad mutation authority and bypass the accepted modify-only AnchorEdit boundary. Such a
change requires a new product threat model and architecture decision, not a convenience toggle.

### Network, environment, and containment tiers

The first fixture does not justify dynamic egress, ambient configuration, or repository-controlled
resources. Later evidence may reopen:

1. an Eden-owned named egress profile with independently enforced DNS, address, port, redirect, proxy,
   response, and receipt semantics;
2. a user-authorized per-run network capability whose exact reach is narrower than ordinary Docker bridge
   networking;
3. bounded catalog-declared literal non-secret environment values with reserved-name and loader/hook
   controls;
4. a measured host-environment allowlist that remains deterministic and excludes paths, agents, proxies,
   credentials, and indirect authority;
5. a rootless-Docker-required support tier with separate Linux Engine and Docker Desktop guarantees; or
6. Eden-owned larger resource profiles selected by closed IDs when representative checks exceed the first
   fixture budgets.

Default bridge networking, inherited host environment with a secret denylist, repository-requested Linux
capabilities, and a minimal profile without memory, CPU, PID, and file limits are not safe fallback
defaults. Reconsidering one requires a new threat statement and matching evidence.

### Output, automation, and platform support

The first surface keeps repository-check output local and completes execution interactively. Possible
later families include:

1. a provider-context projection that selects explicit structured check facts or bounded output under a
   Goal/privacy contract;
2. model explanation without repair, if user evidence shows the intermediate half-loop has durable value;
3. verifier-owned bounded repair and recheck under R3 GoalSpec, capability, attempt, and completion rules;
4. an exact headless continuation protocol integrated with durable run reopen, optimistic revision,
   reconciliation, and multi-client ownership rather than a broad approval flag;
5. a standalone human-invoked check surface only if it reuses the same action, approval, journal, receipt,
   and review contracts instead of becoming a second runner;
6. owner-controlled or self-hosted macOS, Windows/WSL2, Linux, and architecture lanes when repeated release
   evidence justifies their security, secret, maintenance, availability, and cost obligations; or
7. additional Docker backends and native-container modes with independent filesystem, process, network,
   resource, lifecycle, and support claims.

Cross-architecture emulation can qualify an image variant but cannot replace a real Docker Desktop or host
backend row. Hosted package and TUI evidence cannot be relabeled as container execution evidence.

### Doctor remediation and fixture evolution

The first doctor and fixture deliberately separate diagnosis, deterministic contract evidence, and real
product usability. Later focused Explore may consider:

1. an exact `image.prepare` action for one immutable registry digest when manual image preparation is a
   measured onboarding blocker;
2. an exact orphan-cleanup action that accepts only fully attributed effect, run, container, and staging
   identities, with preview, receipt, crash recovery, and no fuzzy Eden-like matching;
3. automatically offering or running the bounded probe only after evidence shows users understand its
   Docker writes and explicit authority remains visible in every surface;
4. additional dependency-free ecosystem fixtures that preserve independent fail/pass oracles;
5. a pinned representative repository corpus covering package managers, monorepos, generated files,
   writable ephemeral state, and supported platform backends; or
6. independently maintained third-party or upstream-accepted catalogs after license, revision, dependency,
   network, and provenance obligations are explicit.

A synthetic fixture is not evidence of general repository support. Automatic package installation, daemon
administration, registry access, broad cleanup, or repair remains outside doctor authority unless each
mutation becomes its own reviewed product action with a separate threat model and evidence packet.

## Cost of continuing to defer

- New repositories must add and track an Eden catalog before the first check.
- Only the named Node 24 fixture and already prepared exact image can be exercised.
- Checks that need dependency installation, untracked inputs, submodules, writable workspaces, persistent
  caches, or exported artifacts remain unsupported.
- Users prepare a missing image outside check dispatch.
- Repeated safe checks still require exact action review.
- Stable containers and staging may remain temporarily after a host/runtime crash until recovery proves
  ownership and either reconstructs a terminal receipt or fails closed.
- Networked checks, repository-specific environment values, and repository-selected resource or privilege
  changes remain unsupported.
- Raw check output is not provider context, automated repair is unavailable, and non-interactive clients
  cannot approve and continue this action in the first slice.
- Missing real-host Docker Desktop rows keep those platforms `not-run` and keep the broader R2 exit open.

These costs are deliberate while Eden lacks evidence that broader authority is necessary and can remain
legible across TUI, headless, journal, recovery, and platform surfaces.

## Decision triggers

Re-enter Explore for one bounded family when one or more of these facts are measured:

- an external-repository corpus cannot express required checks through the closed catalog without
  duplicating or weakening an established project contract;
- repeated exact approvals materially block a demonstrated user journey and action identity remains stable;
- exact recovery evidence shows stable named containers or internal bounded results are the dominant
  reliability or cleanup cost rather than a correctness boundary;
- manual exact-image preparation is a dominant onboarding failure after `eden doctor` guidance is tested;
- exact diagnostic probe evidence is insufficient to explain or reproduce a backend mismatch, or repeated
  probe invocation becomes a measured onboarding burden;
- exact Eden-owned orphan objects recur often enough that manual attribution and cleanup is a measured
  reliability problem;
- the dependency-free fixture passes while a representative repository corpus identifies one specific
  unsupported ecosystem, dependency, input, or writable-state contract;
- a required supported ecosystem cannot fit an Eden-owned image without repository-specific system or
  dependency setup;
- a measured check requires external network or a non-secret environment value and no equivalent offline,
  fixed-environment fixture is viable;
- the first fixed resource profile fails representative checks for a measured resource reason rather than
  repository, image, or platform drift;
- a supported Linux deployment requires a stronger rootless-daemon guarantee and can meet its installation,
  namespace, cgroup, storage, and networking prerequisites;
- users repeatedly need model interpretation of local check output and a privacy/context design can name
  exactly which facts cross the provider boundary;
- an accepted R3 Goal/verifier design is ready to own repair, recheck, and terminal success rather than
  extending the R2 basic observation informally;
- headless users have a concrete automation journey that cannot use the TUI and can support durable reopen,
  exact approval identity, reconciliation, and concurrent-client rules;
- a standalone check entry point removes measured friction without creating a second action or journal
  protocol;
- one-off real-host platform evidence becomes too costly or stale to sustain an accepted support claim;
- tracked-only snapshots exclude required source or generated inputs in a measured corpus;
- observational checks require a live view, or real tests require writable ephemeral state or exported
  artifacts;
- copy size or latency violates an accepted budget on representative repositories; or
- a claimed Linux-container platform cannot meet the current index, resolved-manifest, filesystem, and
  cleanup contract.

One trigger opens one focused Explore. It does not automatically authorize every family above.

## Required evidence before changing the current direction

- a representative repository corpus and a written account of which current constraint is the actual
  blocker;
- canonical identities for catalog bytes, entry, image index, requested platform, resolved manifest,
  input snapshot, command, environment, mounts, network, resources, and output budgets;
- allow, ask, deny, changed input, stale approval, missing prerequisite, cancellation, timeout, crash,
  unknown dispatch, and cleanup scenarios with durable attribution;
- adversarial fixtures for ignored secrets, catalog substitution, symlinks, gitlinks, special files,
  output exfiltration, process trees, disk and memory pressure, and dependency or cache poisoning where
  relevant;
- equivalent TUI and headless presentation of authority, isolation truth, check observation, and recovery;
- exact local, packaged, and hosted rows for every claimed operating system, architecture, Docker backend,
  and Linux-container mode, with unsupported and `not-run` rows preserved; and
- a new ADR and approved executable plan before a public contract, support claim, or implementation stage
  changes.

# R2 Docker Repository Check Freeze Decision Brief

- Status: Approved
- Date: 2026-07-29
- Roadmap stage: R2, Usable Minimal Coding Product
- Baseline: `0ed7873bf4c134b77a4c00e96dbaf182007f031b`
- Decision source: owner-accepted 17-question Explore tree and confirmed shared understanding
- Required architecture approval: ADR 0017
- Accepted plan: `docs/plans/2026-07-29-r2-docker-repository-check.md`
- Approved: 2026-07-29
- Build status: not authorized

## Decision

The owner approved the next bounded R2 vertical slice: one repository-declared named check, executed once
against an immutable tracked-file snapshot in an exact Eden-owned Docker image, with single-use approval,
default-deny containment, durable local output, crash-safe reconciliation, interactive product review, and
read-only doctor plus an explicit bounded probe.

Approval covers the public contract, ADR, derived budgets, test seams, evidence matrix, and executable plan
in this packet. It does not authorize Build. It also does not authorize a real provider credential, Docker
execution, image publication, commit, push, release, signing, installer work, or another external write.

## User-visible outcome

A trusted-workspace user asks Eden to repair one dependency-free failing Node test. Eden may use the
already accepted read and AnchorEdit capabilities, then select one named check from the tracked
`.eden/checks/catalog.json`.

Before execution, the user sees the exact resolved process, dirty catalog truth, repository input
identity, image and Linux platform manifests, mounts, environment, network, containment profile, budgets,
policy rule, and single-use digest. Approval runs that exact action once.

The TUI shows staging, create, running, stopping, reconciling, and cleanup truth. Review exposes a basic
passed, failed, timed-out, cancelled, OOM, overflow, unknown, or cleanup-failed observation with complete
bounded stdout and stderr. The run remains non-success `completed`; a passing test is not verifier-owned
success and does not start a repair loop.

`eden doctor` reports prerequisites without changing the host. An explicitly confirmed probe can validate
the current Docker backend without repository input, provider access, or external network.

## Current repository facts

- `ActionEnvelopeV1` currently admits only AnchorEdit and runtime-owned Git operations and fixes
  `executionMode` to `trusted_host_policy_only`.
- ADR 0015 already supplies canonical JSON, SHA-256 action identity, ordered default-deny policy,
  single-use approval, consume-before-dispatch, and kind-specific recovery requirements.
- The kernel has no repository-check or Docker effects. `RunEffectHost` routes fake and safe-actuation
  effects only.
- `NativeProcessRunner` already owns `shell: false`, exact argv/environment, separate stdout/stderr limits,
  timeout, cancellation, and process-tree termination. It is a mechanism, not Docker authority.
- `InProcessAgentClient.open({ runId })` can reopen an exact journal and recover unresolved effects, while
  public `run.resume` remains unsupported.
- TUI and headless already project the same safe-actuation approval and review facts. Headless stops at a
  real approval instead of supplying a broad approval flag.
- The CLI has no `eden doctor` command. The repository has no Docker runner, Eden check image, image
  manifest, or `.eden/checks/` production decoder.
- Current package and hosted evidence marks Docker and repository-code checks `not-run`.
- The accepted safe-actuation packet is complete at public commit
  `0ed7873bf4c134b77a4c00e96dbaf182007f031b`; whole R2 and release support remain incomplete.

## Accepted decision tree

```text
R2 Docker-isolated repository checks
├── slice: runner + one closed named check
├── authority: repository-declared catalog at trusted-root `.eden/checks/`
├── catalog: tracked UTF-8 current bytes; dirty allowed and fully hashed
├── image: Eden-owned digest-pinned Node 24 Linux-container image
├── acquisition: check never builds or pulls
├── input: bounded hashed tracked-current-byte snapshot
├── network: none
├── environment: Eden-owned closed non-secret values
├── profile: fixed hardened rootful-compatible limits
├── action: exact single-use always-ask canonical action
├── lifecycle: stable create/start object with inspect/reconcile and exact cleanup
├── output: bounded durable local stdout/stderr; no automatic provider projection
├── surface: interactive TUI completion; headless stops at approval
├── evidence: hosted Ubuntu plus real Mac and Windows/WSL2 matching rows
├── doctor: read-only default plus explicit bounded probe
└── exit: deterministic fixture CI plus one independent external-user journey
```

The owner decision frontier is empty. The remaining checkpoint is whether this Freeze packet faithfully
records the shared understanding and gives Build an executable, test-first path.

## Frozen catalog and authority boundary

The first catalog path is `.eden/checks/catalog.json`. It is one closed JSON document with version 1 and
literal named process entries. The first schema has no nested discovery, include, parameter, shell,
interpolation, environment, network, image, mount, resource, or persistent-approval field.

Catalog discovery happens only after exact-root workspace trust. The current file must be tracked, regular,
non-linked, UTF-8, and within the plan budget. Dirty bytes are not rejected or hidden. Their full hash and
dirty status join the action; untracked catalog creation must be staged by the user before Eden can use it.

The action pipeline is:

```text
selected catalog name
  -> runtime reads and resolves one closed process
  -> runtime constructs and hashes the complete tracked-file manifest
  -> runtime resolves exact local image and Docker backend facts
  -> canonical repository_check_v1 action
  -> default-deny policy returns ask
  -> one digest-bound approval
  -> durable approval consumption and full revalidation
  -> staging, create, dispatch, observation, receipt, cleanup
  -> local basic-check evidence in non-success completed review
```

The action binds every executable and containment fact. The renderer, provider, repository process, and
Docker output cannot create or revise the digest, policy decision, approval, receipt, cleanup truth, or
terminal state.

## Frozen image, snapshot, and containment boundary

The first image is Eden-owned, Node 24, immutable, and multi-platform. The application-owned manifest maps
one toolchain ID and image-index digest to the exact permitted Linux platform manifests. A tag is
informational only. Check dispatch uses pull-never behavior and blocks unless the requested platform
variant is already local and matches.

The repository snapshot contains only current bytes of Git-tracked regular files. A canonical manifest
records path, length, SHA-256, and executable-bit projection. `.git`, untracked and ignored paths, symlinks,
hardlinks, gitlinks, special files, credentials, provider state, Docker state, and over-budget input are
excluded or block before approval.

Staged bytes are mounted read-only at `/workspace`; the root filesystem is read-only. Only fixed bounded
temporary and result locations are writable. The action uses `network=none`, no ports, no Docker or agent
socket, no host namespace selection, no devices, no privileged mode, all capabilities dropped,
`no-new-privileges`, built-in seccomp, numeric non-root repository execution, no restart, and fixed
resource limits.

These facts are Docker container containment, not daemon isolation, native sandbox parity, or resistance
to an administrator, kernel exploit, compromised Docker backend, or malicious same-user Docker authority.

## Frozen lifecycle and evidence boundary

The stable effect identity derives the exact container name, labels, staging path, and receipt identity.
Create and start are distinct. Dispatch start is durable before `docker start`; automatic remove and
restart are disabled.

An Eden-owned PID 1 wrapper runs one literal process without a shell, bounds wall clock and separate output,
and produces one closed internal result. Recovery inspects the exact object and either continues observing
the same execution, reconstructs its terminal receipt, proves it never started, or blocks as unknown. It
never creates a second container after possible dispatch.

Raw stdout and stderr are complete within their caps or the result is overflow. They remain local product
evidence and are excluded from automatic provider context and default diagnostic bundles. Because
repository code and its output are untrusted, neither exit zero nor a plausible-looking result becomes
verifier evidence.

Hosted Ubuntu x64 is authoritative for automated Docker candidate evidence. Hosted macOS arm64 and Windows
x64 prove only the non-Docker contracts, package, TUI, and negative-doctor paths. Real macOS Docker Desktop
and Windows Docker Desktop WSL2/Linux-container rows must run the same automated driver. An independent
external user must also complete the pinned failing-test journey with their own configured provider on a
real supported host. No credential value is collected.

An Ubuntu-green implementation may be described as an implementation candidate. Missing real-host rows
remain `not-run` and keep whole R2 incomplete. Even complete R2 evidence does not establish release support.

## Frozen doctor boundary

Default doctor is read-only. Its closed rows report:

- Docker client, daemon, context, API reachability, and versions;
- Linux-container mode, host/backend, architecture, and unsupported native mode;
- exact image index, requested platform, resolved manifest, and local availability;
- required security, resource, filesystem, staging, and budget prerequisites;
- exactly attributed Eden-owned orphan summaries without raw output;
- existing provider, Git, ripgrep, state-permission, and terminal prerequisites without secret values.

An explicit probe is a separately confirmed diagnostic action. It has no repository mount, provider,
credential, or network. It verifies actual UID, capability, seccomp, read-only, tmpfs, resource, timeout,
result, and cleanup behavior under a smaller fixed profile.

Neither doctor mode pulls, builds, imports, installs, starts or configures a daemon, changes a Docker
context, modifies trust or repository state, deletes objects automatically, or sends provider traffic.

## Plan-derived values, not new owner decisions

The associated plan freezes bounded first-fixture values for catalog size and entries, manifest size and
file count, snapshot bytes, stdout/stderr, memory, CPU, PID, file descriptors, file size, tmpfs, timeout,
stop grace, labels, and canonical schema fields.

These values are derived under the existing 64 KiB journal-record and 1 MiB/4096-record run limits. They
may be reduced during RED if an independent byte-count oracle proves the proposed value cannot fit. They
may not be enlarged, truncated, paginated, externalized to a new artifact store, or made catalog-selectable
without an explicit plan amendment.

The exact published image index and platform-manifest digests cannot be invented during Freeze. Build must
produce reproducible image evidence and stop at a separate external-publication checkpoint before any
registry push. Check execution remains disabled until the immutable digests are reviewed and committed to
the application-owned manifest.

## Explicit non-goals

- general shell, model-authored process, arbitrary appended argv, catalog parameters, persistent grants,
  or repeated automatic checks;
- repository-selected images, repository Dockerfiles, check-time build, pull, import, dependency install,
  package-manager bootstrap, or registry credentials;
- untracked or ignored input, links, gitlinks, special files, live host mounts, writable repository
  workspace, caches, exported artifacts, or host worktree mutation;
- container network, published ports, host environment inheritance, provider/Git/SSH/GPG/cloud/proxy
  secrets, Docker socket, agent socket, privileged mode, devices, or host namespaces;
- provider projection of raw output, post-check explanation, repair, recheck, GoalSpec, Evidence Pack,
  verifier implementation, or `succeeded`;
- broad headless approval, public general resume, standalone task-runner semantics, native Windows
  containers, rootless-Docker support claim, or cross-platform inference;
- automatic doctor remediation, image preparation, package installation, daemon administration, broad
  cleanup, release, signing, installers, updates, or package-manager publication.

## Approval and stop conditions

The owner approved this brief, ADR 0017, the focused product documents, and the test-first plan as one
fixed Freeze packet on 2026-07-29. Build still requires a separate explicit owner authorization.

Return to Explore or amend Freeze if implementation requires a different catalog authority, model-written
command, broader input or mount, network, environment value, image source, persistent grant, different
completion owner, new artifact store, public resume protocol, automatic remediation, or weaker evidence
matrix.

Routine file placement, internal type names, a dedicated Docker CLI port, and smaller independently proven
limits do not reopen owner decisions when they preserve this public contract.

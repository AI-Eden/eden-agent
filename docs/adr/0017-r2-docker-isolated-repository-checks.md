# ADR 0017: Isolate Repository-Declared Checks in Exact Docker Actions

- Status: Accepted
- Date: 2026-07-29
- Accepted amendment: `docs/research/2026-07-31-r2-docker-diagnostic-probe-freeze-amendment.md`;
  owner approved 2026-07-31
- Accepted amendment: `docs/research/2026-08-01-r2-docker-build-contract-gap-decision-brief.md`;
  owner approved Option A on 2026-08-01
- Exit-evidence amendment: `docs/adr/0018-r2-reference-platform-portfolio-closure.md`; owner approved
  2026-08-01. ADR 0018 changes the R2 closure gate only; this ADR's runtime and trust decisions remain
  unchanged.

## Context

ADR 0015 binds executable work to canonical actions, ordered default-deny policy, single-use approval,
durable intent, and action-specific reconciliation. ADR 0016 implements one trusted-host AnchorEdit and one
runtime-owned Git diagnostic, but deliberately excludes repository-authored code and Docker.

R2 still lacks its promised Docker runner, repository-code check, and doctor surface. Treating a named
check as harmless would collapse several independent boundaries: repository authorship of the process,
model selection of the name, user authority for one execution, immutable repository input, Docker
containment, daemon authority, process lifecycle, output privacy, and completion ownership.

The first Docker slice must prove those boundaries through one user-visible failing-test journey. It must
not become a general shell, repository image builder, package installer, repair loop, verifier, broad
headless approval protocol, or release-support claim.

## Decision

### Catalog and action authority

The trusted repository root may contain one versioned closed catalog at `.eden/checks/catalog.json`.
Workspace trust permits discovery only. The file must be a Git-tracked regular UTF-8 file beneath the
captured root. Current dirty bytes are eligible, but the proposal records their complete hash, dirty truth,
current `HEAD`, selected entry, and resolved process. Untracked, ignored, linked, hardlinked, nested,
included, or malformed catalogs are rejected.

The catalog contains named structured processes. It has no shell string, interpolation, conditional,
pipeline, include, environment, network, image, mount, resource, or approval fields. The model may select
one name and cannot supply or alter the executable, arguments, cwd, or budgets.

Every selection becomes one `repository_check_v1` canonical action under the existing action domain and
policy architecture. The action binds:

- run, workspace, proposal revision, and single-use lifetime;
- catalog path, bytes, Git state, entry identity, and resolved literal process;
- `HEAD`, the complete canonical input manifest, its digest, file count, byte count, and path summary;
- Eden toolchain identity, immutable image-index digest, requested Linux platform, and resolved
  platform-manifest digest;
- read-only workspace and root filesystem mounts plus the fixed temporary and result areas;
- the closed non-secret environment, `network=none`, containment profile, and every execution budget;
- policy and profile revisions, exact display, execution mode, and isolation truth.

The accepted 2026-08-01 Option A amendment additionally binds one closed `dockerCompatibility` object to
the canonical action and approval digest: safe context name and endpoint SHA-256, client version/API,
daemon version/minimum API/API/Linux OS type/architecture, fixed namespace/security/resource booleans,
and exact image index/platform-manifest/config identities. The raw endpoint is local-only. Preparation
records the bounded object and dispatch re-observes every field before Docker mutation; any difference
makes the approved action stale. If cleanup subsequently fails, the result exposes `cleanup_failed` while
retaining the original closed wrapper reason and independent cleanup object state.

Repository-code execution always evaluates to `ask` in this slice. Workspace trust, a catalog revision, a
previous approval, or a passing earlier check never grants automatic execution. Approval is consumed
durably and every bound fact is revalidated before staging and before dispatch. Drift makes the action
stale; it does not silently produce a replacement action.

### Toolchain and repository ingress

The first toolchain is one Eden-owned Node 24 Linux-container image. Eden publishes and records an
immutable multi-platform index plus each supported platform manifest. The catalog cannot select an image.
Check dispatch never builds, pulls, imports, or installs anything. A missing exact local platform image is
a blocked prerequisite.

Eden constructs a private, bounded staging snapshot from current Git-tracked regular-file bytes. The
canonical manifest includes normalized path, byte length, SHA-256, and the Git executable-bit projection.
The snapshot excludes `.git`, untracked and ignored paths, links, gitlinks, special files, host state,
Docker state, and provider state. The manifest is durable; staged bytes are ephemeral and are removed only
through exact ownership.

The container sees the staged snapshot read-only at `/workspace`. The container root filesystem is
read-only. Only Eden-owned bounded temporary and result locations are writable. No live host worktree,
Docker socket, agent socket, device, credential, provider state, or additional mount enters the container.

### Docker containment and process contract

The first profile runs Linux containers with:

- one numeric non-root user for repository code;
- all Linux capabilities dropped, `no-new-privileges`, Docker's built-in seccomp profile, and no
  privileged mode;
- no host PID, IPC, UTS, user, or network namespace selection, no devices, no published ports, no restart
  policy, and `network=none`;
- fixed memory, CPU, PID, file-descriptor, file-size, wall-clock, stop-grace, output, staging, and
  temporary-filesystem budgets.

This profile constrains a container, not the Docker daemon. It does not claim resistance to a compromised
daemon, administrator, kernel, Docker Desktop VM, or malicious same-user control of Docker.

One Eden-owned wrapper is PID 1. It starts exactly the resolved process without a shell, owns wall-clock
and output enforcement, captures stdout and stderr separately, and writes one closed bounded internal
result. Repository output remains untrusted evidence and never gains verifier authority.

### Lifecycle, receipts, and recovery

Container and staging identities derive from the stable effect identity. Eden separates create from start,
uses exact labels and configuration identity, disables automatic removal and restart, and records dispatch
start before `docker start`.

Recovery inspects only the exact owned objects:

- absent with proof that create/start did not occur: `not_started`;
- exact matching `created`: start that container once;
- exact matching `running`: resume observation and enforce stop without creating another container;
- exact matching `exited` with a valid bounded result: reconstruct the terminal receipt;
- missing, mismatched, corrupt, or ambiguous state after possible dispatch: `unknown`, never automatic
  re-execution.

Cancellation and timeout request termination, wait a fixed grace period, then kill if necessary. A durable
terminal receipt distinguishes check failure, timeout, cancellation, OOM, output overflow, engine failure,
and cleanup failure. Cleanup occurs only after durable receipt and removes only exactly owned container and
staging objects. Replay folds facts and performs no Docker inspection, reconciliation, or cleanup.

### Output, surfaces, and completion

Complete bounded stdout and stderr, byte counts, and hashes are durable local product evidence. Overflow
terminates the process and cannot be presented as a complete pass. Raw repository output is not
automatically sent to a provider or included in a diagnostic bundle.

The interactive TUI presents and resolves the exact action, shows lifecycle progress, and exposes the
terminal observation and cleanup truth. Headless NDJSON projects the same journal-derived facts but stops
at approval with structured recovery. This ADR adds no broad approval flag, stdin control protocol,
second-invocation continuation, or public general resume command.

A repository check is a basic observation in non-success `completed` review. It cannot emit `succeeded`,
weaken GoalSpec, start repair, or produce an Evidence Pack.

### Doctor and evidence boundary

`eden doctor` and `eden doctor --json` are read-only by default. They inspect closed prerequisite rows,
including Docker client/daemon reachability, Linux-container mode, exact local image/platform identity,
required backend features, staging prerequisites, and exactly attributed orphan summaries. They do not
pull, build, install, configure, start a daemon, change a Docker context, delete an object, read raw check
output, or contact a provider.

The explicit probe may additionally select one already existing Docker context through
`--context <safe-name>`, where the name matches `[A-Za-z0-9][A-Za-z0-9_.-]{0,127}`. The same global
selection prefixes every Doctor and diagnostic lifecycle invocation. This does not expose a raw host or
socket, create a context, or change the user's default context; omission retains active-context behavior.

Image evidence is exact across both descriptor-capable and classic stores. Every ready image must match
the frozen index RepoDigest, platform config digest, OS/architecture, entrypoint, nonroot user, and working
directory. When a local `.Descriptor.digest` exists it must equal the frozen platform manifest. Only when
the descriptor is absent may the exact config digest select that manifest from the application-owned
immutable platform mapping. Present-but-malformed or contradictory evidence blocks without registry
lookup, credential, or network fallback.

An explicit Docker probe is a separately confirmed canonical diagnostic action. It uses the exact local
image, no repository input, no provider, no network, and a smaller fixed profile. It produces a receipt and
uses the same exact ownership and recovery rules. It is not automatic remediation.

Slice 4 discovered that the original accepted public contracts did not define this standalone action. The
accepted 2026-07-31 amendment keeps the probe outside repository runs and freezes a dedicated action,
always-ask approval command, diagnostic journal, product event/view, receipt, cleanup, and recovery
contract. It reuses the `eden.action.v1` canonical domain without adding a synthetic workspace or
reinterpreting `repository_check_v1`. The owner authorized its deterministic Build, including exact active
recovery; Docker execution and external preparation remain separate authority.

The accepted 2026-08-01 matching-surface amendment binds the immutable image certificate path alongside
the fixed application environment. Inspection compares the exact unique environment set without treating
Docker's returned order as semantic. Missing, duplicate, changed, inherited, or additional values remain
blocked; no host environment, image, network, or privilege authority was added.

Slice 4 subsequently passed one real probe on the approved independent `userns-remap` backend. Active
recovery used the same exact created container without a second approval or duplicate create, all nine
enforcement rows passed, receipt preceded exact cleanup, and the backend returned to zero containers.

Hosted Ubuntu x64 is the authoritative automated Docker lane. Hosted macOS and Windows retain non-Docker
contract, package, TUI, and negative-doctor evidence. ADR 0018 supersedes this ADR's original whole-R2
exit gate: the required implementation and owner-controlled Linux/WSL2 evidence close the
reference-platform milestone, while real macOS Docker Desktop, real Windows Docker Desktop WSL2/Linux
containers,
and an independent external-user journey remain optional `not-run` evidence. Native Windows containers,
corresponding platform support, and broad release support are not implied.

## Rejected alternatives

- **Generalized Docker command tool:** opens model-authored executable or shell authority before a
  representative repository corpus proves it necessary.
- **Eden-only inferred checks:** reduces onboarding but makes Eden own ecosystem command discovery and
  weakens the repository's durable check contract.
- **Persistent catalog or command grant:** approves future repository bytes that were not part of the
  reviewed action.
- **Repository image or Dockerfile:** combines untrusted process and toolchain authority and adds an
  independent build, network, cache, secret, and recovery system.
- **Pull during check dispatch:** combines registry network and Docker-store mutation with repository-code
  execution.
- **Live read-only or read-write worktree mount:** exposes ignored local data or grants host mutation and
  loses immutable input identity.
- **Docker logs as the only result:** cannot enforce Eden's output budget during a runtime crash or
  distinguish the accepted terminal reasons reliably.
- **`docker run --rm`:** can erase the object needed to decide whether execution started or completed.
- **Automatic doctor remediation:** makes a diagnostic surface a registry, package, daemon, configuration,
  and cleanup authority.
- **Hosted Ubuntu as cross-platform closure:** does not prove Docker Desktop backend, mount, resource, or
  lifecycle behavior.

## Consequences

The first check is intentionally compatible only with a small dependency-free fixture and an already
prepared exact image. Repositories needing package installation, network, untracked inputs, submodules,
writable workspaces, caches, exported artifacts, different images, or automatic repeated checks remain
unsupported.

The implementation must add closed catalog, manifest, action, doctor, result, receipt, cleanup, product
event, and view contracts; a Docker CLI adapter; exact staging; an image wrapper; TUI/headless projections;
deterministic and real-backend drivers; and truthful platform evidence.

The complete numeric limits, exact schema fields, image publication checkpoint, test seams, and ordered
Build slices belong to the associated plan. If they cannot fit the existing journal and private-state
contracts without truncation or a new artifact store, implementation must stop for a visible amendment.

The owner accepted this ADR with the complete 2026-07-29 Freeze packet. That approval does not authorize
Build, image publication, credentials, Docker execution, commit, or push.

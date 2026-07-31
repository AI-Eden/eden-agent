# R2 Docker Diagnostic Probe Freeze Amendment

- Status: Accepted; owner approved 2026-07-31
- Date: 2026-07-31
- Roadmap stage: R2, Usable Minimal Coding Product
- Amends: ADR 0017 and `docs/plans/2026-07-29-r2-docker-repository-check.md`
- Trigger: Slice 4 Build discovery
- Build status: Slice 4 complete; deterministic runner, active recovery, named-context, classic-store,
  exact closed-environment, and external-label normalization paths passed one real probe with exact-object
  recovery and cleanup

## Discovered contract gap

The accepted Freeze requires `eden doctor --probe-docker` to present one exact canonical diagnostic
action, require interactive confirmation, produce a terminal receipt, and use exact recovery and cleanup.
The current closed contracts cannot represent that behavior:

- `ActionEnvelopeV1` is run- and workspace-bound and admits only trusted-host operations plus
  `repository_check_v1`;
- `approval.resolve`, `ProductEvent`, and the execution journal require a repository run identity;
- repository-check receipt, cleanup, result, labels, and product projections require repository input,
  a check name, and a run;
- the read-only `DockerDoctorReportV1` correctly has no mutation authority.

Using a synthetic run or an empty repository snapshot would make false workspace and repository claims.
Reusing `repository_check_v1` would also make a runtime-owned diagnostic program look repository-authored.
Build therefore stopped before accepting or executing the probe command.

## Proposed decision

Add one standalone `docker_diagnostic_probe_v1` transaction outside repository runs. It reuses the
existing canonical action domain, single-use approval rule, consume-before-effect ordering, stable effect
identity, exact Docker ownership, receipt-before-cleanup ordering, and fail-closed recovery principles. It
does not reuse repository-check action, journal, input, result, or product identities.

The transaction has:

- no run, workspace, repository path, catalog, snapshot, staging tree, provider, credential, or model;
- one application-owned fixed Node diagnostic program, identified by byte length and SHA-256;
- the already published exact Eden Node 24 image and resolved local Linux platform manifest;
- one exact active Docker backend/context identity, revalidated before create;
- one fixed smaller containment profile;
- one dedicated always-ask policy rule;
- one bounded standalone diagnostic journal under the Eden state root;
- one stable named and labelled container, receipt, exact cleanup, and closed product projection.

This is diagnostic execution, not a repository check, verifier, remediation action, support claim, or
general Docker command.

## Standalone authority boundary

### Diagnostic action v1

The new exported contract is `DockerDiagnosticProbeActionV1`. It is not a member of the run-bound
`ActionEnvelopeV1` union. It uses the same canonical action domain so policy and approval keep one digest
model without changing existing action bytes.

The closed action has these top-level fields:

| Field | Frozen value or rule |
| --- | --- |
| `actionVersion` | `1` |
| `actionId` | bounded opaque action ID; excluded from canonical bytes exactly as existing actions |
| `probeId` | path-safe `probe-[a-z0-9][a-z0-9-]{0,121}`; included in canonical bytes |
| `proposalRevision` | positive safe integer; equals lifetime revision |
| `kind` | `docker_diagnostic_probe_v1` |
| `operation` | exact fixed diagnostic operation below |
| `scope` | capability `docker.diagnostic.probe`; repository and paths are `none` |
| `authority` | exact Docker diagnostic policy, environment, network, isolation, and remediation truth |
| `backend` | active context/daemon/API/platform identity |
| `toolchain` | exact image, platform, Node, and diagnostic-program identity |
| `profile` | exact diagnostic containment profile |
| `budgets` | exact smaller diagnostic budgets |
| `lifetime` | `single_use_proposal_revision` |

The operation is:

```json
{
  "type": "docker_diagnostic_probe_v1",
  "probeProtocolVersion": 1,
  "programId": "eden-docker-diagnostic-probe-v1",
  "checks": [
    "process_user",
    "user_namespace",
    "capabilities",
    "no_new_privileges",
    "seccomp",
    "root_filesystem",
    "temporary_filesystem",
    "resource_limits",
    "result_protocol"
  ]
}
```

The ordered check list is exact. Unknown, missing, duplicated, reordered, or additional checks are
invalid. The model, repository, renderer, and user cannot supply a program, argument, check, image,
platform, context, environment, mount, resource value, or Docker option.

### Canonical bytes and policy

Canonical bytes are:

```text
UTF8("eden.action.v1\0") || UTF8(recursively-key-sorted JSON without actionId)
```

The complete action must fit 16 KiB. SHA-256 of those bytes is the approval digest. Existing AnchorEdit,
Git, and repository-check canonical bytes remain byte-for-byte unchanged.

The literal independent fixture is `packages/contracts/test/docker-diagnostic-probe-fixture.ts`. Its
accepted action encodes to 2,477 bytes and hashes to
`c72190e0aebe5512362cf891954913bca226aa1d734a71bd0635998a99f92b03`. Build fixed the reviewed
3,865-byte diagnostic program at
`sha256:21a3f9fa698cc1ee547ecf503a64c3d9ced43d89d5fcc501620eb90f1060a19d`;
changing those source bytes or their semantics requires another amendment.

The dedicated rule set is `r2-docker-diagnostic-probe-v1`. The only non-deny rule is:

```text
r2.docker-diagnostic-probe.exact -> ask
```

There is no `allow` rule, persistent grant, trust inheritance, previous-probe grant, flag, environment
override, or policy fallback. Approval binds the action digest and proposal revision and is consumed
durably before Docker create. Denial creates no diagnostic journal and no Docker object.

### Backend and toolchain identity

The action binds:

- active context name and SHA-256 of its complete endpoint under
  `eden.docker-context-endpoint.v1\0`, rather than projecting a raw endpoint;
- SHA-256 of Docker daemon identity under `eden.docker-daemon-identity.v1\0`;
- client API, daemon API, daemon minimum API, server version, Linux OS type, and architecture;
- requested platform `linux/amd64` or `linux/arm64`;
- exact image index
  `sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f`;
- the matching published platform manifest;
- toolchain ID `eden-node24-check-v1`, Node major 24, and `/nodejs/bin/node`;
- diagnostic program ID, byte length at most 8 KiB, and SHA-256 of its exact UTF-8 bytes.

The program is application-owned source passed directly to Node with fixed exec-form arguments. It uses
no shell, repository file, `PATH` lookup, image rebuild, wrapper translation, dependency, package manager,
or network. Build may determine the program's final hash from reviewed source, but changing its semantics,
inputs, or check set requires another amendment.

Every bound backend, image, platform, and program fact is revalidated after approval and before Docker
create. Drift makes the action stale and consumes no Docker execution authority.

## Fixed diagnostic profile v1

The profile revision is `r2-docker-diagnostic-probe-v1`.

| Control | Frozen value |
| --- | --- |
| Container user | `65532:65532` |
| Entrypoint | `/nodejs/bin/node` |
| Root filesystem | read-only |
| Working directory | `/tmp` |
| Repository/workspace mount | none |
| Other host bind mounts | none |
| `/tmp` | 1 MiB tmpfs; writable, `noexec`, `nosuid`, `nodev` |
| Network | none; no exposed or published ports |
| Environment | exact set `HOME=/tmp`, `LANG=C.UTF-8`, `PATH=/usr/local/bin:/usr/bin:/bin`, `SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt`; fixed Node invocation only |
| Capabilities | drop all |
| Privilege | `no-new-privileges`; not privileged |
| Seccomp | Docker built-in default |
| Host namespaces | none |
| Devices and sockets | none beyond Docker defaults; no Docker or agent socket |
| Restart and removal | restart disabled; automatic removal disabled |
| Memory and swap | 64 MiB memory; 64 MiB total memory-plus-swap; effective swap disabled |
| CPU | quota 50,000 μs per 100,000 μs period |
| PIDs | 16 |
| File descriptors | 64 |
| Stdout | 4 KiB complete-or-overflow |
| Stderr | 4 KiB complete-or-overflow |
| Wall clock | 10 seconds |
| Stop grace | 2 seconds before kill |

Unsupported or unenforced controls block before create or make the result fail. The profile cannot be
downgraded. It constrains one container, not the daemon, Docker Desktop VM, host kernel, administrator, or
same-user holder of Docker authority.

The fixed program reports only closed semantic observations. Independent runtime inspection must also
verify the exact container configuration. A passing result requires:

- numeric process UID/GID `65532:65532`;
- a non-identity remapped user-namespace mapping plus the required backend feature;
- zero effective capabilities;
- `NoNewPrivs=1`;
- seccomp filter mode active;
- kernel-reported read-only root mount;
- `/tmp` reported as writable tmpfs with the frozen size/options;
- cgroup and process limits matching the frozen memory, CPU, PID, and file-descriptor budgets;
- one complete valid result under the 4 KiB stream limits.

## Docker ownership and recovery

The container name is `eden-probe-` plus the first 24 lowercase hexadecimal characters of
`SHA256(effectId)`. Exact labels are:

```text
eden.schema=eden.docker-diagnostic-probe.v1
eden.probe-id=<probeId>
eden.action-id=<actionId>
eden.effect-id=<effectId>
eden.image-index-digest=<sha256>
eden.platform-manifest-digest=<sha256>
eden.profile-revision=r2-docker-diagnostic-probe-v1
eden.config-digest=<sha256>
```

The configuration digest uses recursively key-sorted JSON under
`eden.docker-diagnostic-config.v1\0`. Unknown, missing, duplicated, over-budget, or mismatched identity is
`unknown`; it never authorizes a new or fuzzy-matched object.

The ordered lifecycle is:

1. read-only prerequisite and prior-session inspection;
2. construct, decode, hash, and present the exact action;
3. receive interactive approve or deny;
4. append action-prepared and approval-consumed facts;
5. append stable effect intent;
6. revalidate action and exact Docker prerequisites;
7. create the stable container without start, automatic removal, or restart;
8. append container-created identity;
9. append dispatch-start before `docker start`;
10. start once, wait, inspect, and decode the fixed result;
11. append terminal receipt before cleanup;
12. remove only the exact matching container;
13. append cleanup and terminal product facts.

Recovery inspects only the one unresolved journal-owned identity:

- action prepared without consumed approval: `not_started`; no Docker inspection or mutation;
- consumed approval/effect intent with proven pre-create absence: `not_started`;
- exact matching `created`: start once under the consumed approval;
- exact matching `running`: observe or stop that object without creating another;
- exact matching `exited` with a valid result: reconstruct the receipt;
- receipt without cleanup: remove only the exact matching container and record cleanup;
- missing, mismatched, corrupt, multiple unresolved, or ambiguous post-dispatch state: `unknown`, no new
  probe and no broad cleanup.

Default Doctor never performs this recovery. A later explicit interactive probe invocation first resumes
one exact previously approved unresolved transaction before it may propose a new action. JSON mode only
projects `recovery_required` and exits; it performs no recovery mutation. Pure projection from diagnostic
journal facts performs no Docker I/O.

## Dedicated diagnostic journal

Probe state is not written to a repository run journal. The dedicated path is:

```text
<eden-state>/diagnostics/docker-probe-v1/journal.jsonl
```

It uses private state ancestors, one regular non-linked `0600` journal, exclusive bounded ownership, and
the existing JSONL safety rules. Limits are 64 KiB per newline-inclusive record, 1 MiB total, and 4,096
records. Reaching a limit blocks a new probe; there is no automatic truncation, compaction, deletion, or
new artifact store.

Every record binds diagnostic journal version 1, probe ID, sequence, event ID, type, timestamp, redaction
state, and one closed payload. Event types are:

```text
docker.probe.action.prepared
docker.probe.approval.consumed
docker.probe.effect.intent
docker.probe.container.created
docker.probe.dispatch.started
docker.probe.receipt.recorded
docker.probe.cleanup.recorded
docker.probe.terminal
docker.probe.recovery.closed
```

`docker.probe.recovery.closed` is the alternative `not_started` end defined by the accepted active-recovery
amendment; it does not follow container or receipt facts. Only one unresolved probe may exist. Concurrent
invocations serialize through one bounded diagnostic lock.
A malformed, linked, hardlinked, permissive, oversized, sequence-invalid, or multiply unresolved journal
blocks without Docker mutation.

## Result, receipt, and cleanup

`DockerDiagnosticProbeReceiptV1` is durable before cleanup. It binds probe/action/effect, exact container
ID/name/labels/config digest, image/platform/profile, terminal container state, execution outcome, result
digest, and timestamp.

Execution outcomes are:

```text
passed
failed
timed_out
cancelled
oom
output_overflow
engine_failed
unknown
```

`DockerDiagnosticProbeCleanupV1` binds the same identities and records container state as `removed`,
`absent`, `failed`, or `unknown`. `complete` is valid only for removed/absent with no error.

`DockerDiagnosticProbeResultV1` contains the receipt, cleanup, ordered nine-row observation set, start/end
times, and final outcome. Final outcome `cleanup_failed` is permitted only when execution reached a
receipt and cleanup is not complete. `passed` requires every row passed, a passed receipt, complete
cleanup, and exact identity equality. There is no repository output, check name, input manifest, provider
content, verification result, repair action, Evidence Pack, or `succeeded`.

The observation set is a fixed tuple with no unknown fields:

| Row | Closed semantic fields |
| --- | --- |
| `process_user` | `status`; integer `uid`/`gid` or null |
| `user_namespace` | `status`; `remapped`, `identity`, or `unavailable` |
| `capabilities` | `status`; 16-lowercase-hex effective mask or null |
| `no_new_privileges` | `status`; boolean `enabled` or null |
| `seccomp` | `status`; `filter`, `strict`, `disabled`, or `unavailable` |
| `root_filesystem` | `status`; `read_only`, `read_write`, or `unavailable` |
| `temporary_filesystem` | `status`; filesystem kind, writable/options booleans, and size or null |
| `resource_limits` | `status`; memory/swap/CPU/PID/file-descriptor integers or null |
| `result_protocol` | `status`; version or null, byte length, and SHA-256 of fixed-program output |

Every row status is `passed`, `failed`, or `unavailable`. All nine rows are always present in this order.
`passed` is valid only when its closed values equal the action. Raw `/proc`, cgroup, mount, Docker inspect,
or log text is never projected.

Raw Docker stderr, daemon messages, socket paths, program source, and container logs never enter product
contracts or the diagnostic journal. Closed errors use allowlisted codes and suggested actions.

## Product and CLI contract

The standalone contracts are:

- `DockerDiagnosticProbeCommandV1`;
- `DockerDiagnosticProbeEventV1`;
- `DockerDiagnosticProbeApprovalRequiredV1`;
- `DockerDiagnosticProbeRecoveryRequiredV1`;
- `DockerDiagnosticProbeRecoveryResolvedV1`;
- `DockerDiagnosticProbeProductViewV1`.

They do not join the run-bound `ProductCommand`, `ProductEvent`, or `ProductView` unions.

Product event literals are:

```text
docker.probe.approval.required
docker.probe.recovery.required
docker.probe.recovery.resolved
docker.probe.lifecycle.updated
docker.probe.terminal
```

`DockerDiagnosticProbeApprovalRequiredV1` contains protocol version, probe/revision, complete action,
action digest, `ask` policy decision, approval ID/expected revision/approve-deny choices, limitations, and
next actions. `DockerDiagnosticProbeRecoveryRequiredV1` contains the original probe/action/effect
identities, last durable lifecycle state, nullable receipt and cleanup, one closed error, limitations, and
the exact recovery next action. `DockerDiagnosticProbeRecoveryResolvedV1` records only a proven
`not_started` closure and its fixed reason. `DockerDiagnosticProbeProductViewV1` contains the same identities and
policy plus the ordered lifecycle, nullable result/receipt/cleanup, limitations, and next actions.
Identity, revision, lifecycle tail, terminal result, receipt, and cleanup must agree.

The only state-changing command is:

```json
{
  "protocolVersion": 1,
  "commandId": "command-probe-approval-1",
  "type": "docker.probe.approval.resolve",
  "probeId": "probe-example-1",
  "approvalId": "approval-probe-1",
  "actionDigest": "<64 lowercase hex>",
  "expectedRevision": 1,
  "decision": "approve"
}
```

`deny` is the only other decision. There is no public resume, cleanup, retry, reconfigure, arbitrary
Docker, or broad approval command.

Exact CLI grammar is:

```text
eden doctor
eden doctor --json
eden doctor --probe-docker
eden doctor --probe-docker --json
eden doctor --probe-docker --context <safe-name>
eden doctor --probe-docker --context <safe-name> --json
```

Other ordering, duplicate flags, `--yes`, stdin approval, environment approval, stored approval, and
second-invocation approval are rejected.

`<safe-name>` is one existing Docker context name matching
`[A-Za-z0-9][A-Za-z0-9_.-]{0,127}`. Raw Docker hosts, socket paths, context creation, and default-context
mutation are not public CLI authority. Omitting `--context` retains the existing active-context behavior.
When a safe name is supplied, every Doctor and diagnostic lifecycle Docker invocation receives the same
global `--context <safe-name>` selection. The selected context name and endpoint digest remain part of the
presented action and are revalidated after approval.

- `eden doctor` and `eden doctor --json` remain the existing zero-mutation read-only surfaces.
- `eden doctor --probe-docker` performs read-only preflight, presents the complete action and policy, and
  waits for interactive approve/deny. Denial exits 2 with no journal or Docker object.
- `eden doctor --probe-docker --json` emits exactly one closed approval-required or recovery-required
  value, exits 2, and creates no journal, lock, or Docker object.
- approved pass exits 0; diagnostic failure, unknown, cleanup failure, or infrastructure failure exits 1.
- the plain and structured projections expose the same action digest, policy, lifecycle, observations,
  receipt, cleanup, limitations, and next action without raw Docker command syntax.

## Test-first amendment to Slice 4

The first approved Build RED must prove current production rejects:

- the standalone action, command, event, receipt, cleanup, result, and product view;
- both explicit probe CLI forms;
- a probe encoded as a repository check or synthetic run;
- unknown/reordered checks, program drift, backend drift, image/platform drift, wider profile/budgets,
  repository/provider/network/mount authority, missing labels, and canonical-byte drift.

Subsequent RED-to-GREEN slices are:

1. closed standalone contracts, independent canonical bytes/digest, and always-ask policy;
2. strict CLI preview/denial with zero journal and zero Docker writes;
3. private diagnostic journal, lock, ordering, corruption, and replay-only projection;
4. fixed diagnostic program and scripted Docker-port parser/failure matrix;
5. real compatible-backend create/start/result/receipt/exact-cleanup enforcement;
6. created/running/exited/receipt-before-cleanup crash recovery with zero duplicate objects;
7. plain/JSON/TUI-sized product parity and evidence closeout.

Independent oracles are literal JSON, a separate canonical encoder and SHA-256 call, exact command/write
counters, fixed `/proc` and cgroup fixtures, real Docker inspect/object state, journal ordering, stable
container identity, and zero-object census after cleanup. Docker CLI fakes are permitted only for
malformed/unavailable/crash matrices. Every enforcement and recovery row requires a real compatible Linux
backend before Slice 4 closes.

## Build discovery checkpoint

The approved deterministic Build completed the standalone schemas, canonical digest, always-ask and
single-use approval policy, strict CLI grammar and preview/denial function, private journal safety and
replay, fixed 3,865-byte program, closed output/inspect parsers, read-only preflight construction, and the
production CLI dispatcher. JSON preview remains zero-mutation; unresolved recovery projects the durable
first-record identity without Docker inspection or journal mutation. No Docker command, credential,
network publication, commit, or push was used.

During integration, Build stopped for owner confirmation of two exact semantics:

1. The frozen `memoryBytes=67_108_864` and `memorySwapBytes=67_108_864` map to Docker `Memory=64 MiB` and
   `MemorySwap=64 MiB`. Docker interprets `MemorySwap` as the total memory-plus-swap ceiling, so this is a
   64 MiB memory limit with effective swap disabled. The recommended clarification retains those exact
   fields and changes the prose to “64 MiB memory; 64 MiB total memory-plus-swap; effective swap 0.” The
   deterministic parser provisionally enforces this stricter interpretation.
2. A crash after `docker.probe.action.prepared` but before `docker.probe.effect.intent` has no durable
   `effectId`, while the accepted recovery-required product value requires one. The recommended
   clarification generates the stable effect ID before the first journal write and includes it in the
   closed action-prepared payload; effect-intent must later repeat the same identity. This adds no Docker
   or broader authority and makes pre-effect recovery exact.

The owner approved both recommended clarifications on 2026-07-31. The fixed profile therefore retains
`Memory=67_108_864` and `MemorySwap=67_108_864`, with effective swap disabled. The stable effect ID must
be generated before the first journal write, included in `docker.probe.action.prepared`, and repeated
unchanged in `docker.probe.effect.intent`. Deterministic CLI integration may continue within those exact
boundaries. Both clarifications and the production CLI dispatcher are now implemented and covered by
focused deterministic tests. The real Docker probe later passed the matching-surface checkpoint described
below.

## Matching-surface checkpoint result

The owner subsequently authorized the frozen create/start/receipt/cleanup runner and exactly one real
probe on a fresh independent `userns-remap` daemon. The deterministic runner now closes the pull-never
container configuration, stable name and labels, post-approval revalidation, create/inspect/start/wait/
inspect/logs ordering, durable receipt-before-cleanup, exact remove, terminal result, and interactive CLI
exit behavior. JSON remains preview-only. Pre-effect and post-effect failures remain fail-closed and
project one durable recovery identity. The later approved active-recovery Build now closes pre-create
absence, resumes exact created/running/exited objects, and reconstructs receipt/cleanup/terminal crash
points without duplicate create or broad cleanup.

The pre-Docker inventory then found no `dockerd` executable, running independent `dockerd` or
`containerd`, independent Unix socket, retained Docker Engine 29.6.2 bundle, or retained exact OCI archive.
Slice 3 already records that its prior temporary daemon, data, executable, archive, and loaded image state
were removed. Therefore no fresh daemon exists on which the exact image could already be local. The
authorized attempt stopped before any Docker command, daemon state creation, network access, credential
use, image pull/import, or container creation.

## Active recovery Build-entry audit

After the owner authorized deterministic active recovery, Build re-audited every journal prefix before
writing the first recovery RED. The accepted created/running/exited behavior is sufficiently exact, but
two crash barriers cannot be closed by the current fixed event order and closed payloads:

1. `not_started` has no durable closure. After action-prepared, approval-consumed, or effect-intent, the
   journal can currently advance only toward container-created, receipt, cleanup, and a terminal
   `DockerDiagnosticProbeResultV1`. That result requires an exited-container receipt, cleanup, and the
   nine-row observation tuple. The recovery rule correctly forbids inventing those facts when approval
   was not consumed or exact pre-create absence is proven. Leaving the prefix unresolved forever would
   also prevent the required later interactive invocation from resolving the old transaction before
   proposing a new one.
2. The receipt does not retain enough data to reconstruct the terminal result after removal. It binds the
   result digest and execution outcome, but not the nine-row observations required by
   `DockerDiagnosticProbeResultV1`. If exact `docker rm` succeeds and the process crashes before
   cleanup-recorded, recovery can prove container absence and reconstruct cleanup, but the removed
   container and its logs are no longer available. The same missing observation tuple blocks a crash
   after cleanup-recorded and before terminal.

The owner approved the following minimal amendment on 2026-07-31:

- add an alternative journal closure fact and standalone recovery-resolution value for only
  `not_started`; permit it after action-prepared without consumed approval, or after consumed
  approval/effect-intent with proven exact pre-create absence; it carries the original identities,
  prior lifecycle state, fixed reason, and timestamp, but no receipt, cleanup, observations, or execution
  claim;
- keep `unknown` unresolved and blocking, with no automatic cleanup or new probe;
- extend the private receipt-recorded payload with a closed terminal draft containing `startedAt`,
  `endedAt`, the exact nine-row observations, and execution outcome; validate its identities, outcome,
  and result digest against the public receipt, and persist it before any remove attempt;
- permit cleanup and terminal reconstruction only from that validated durable draft plus exact owned
  object state.

The journal closure type is `docker.probe.recovery.closed`. Its payload contains the exact action digest,
action/effect identities, previous lifecycle state, outcome `not_started`, and reason
`approval_not_consumed` or `pre_create_absent`. The first reason is valid only immediately after
action-prepared and performs no Docker inspection. The second is valid only after approval-consumed or
effect-intent and requires proven exact pre-create absence. It is an alternative resolved end to the
transaction and never fabricates container, receipt, cleanup, observation, or execution facts.

The standalone product value is `DockerDiagnosticProbeRecoveryResolvedV1`, with event literal
`docker.probe.recovery.resolved`. It carries the same identities, prior lifecycle state, outcome, reason,
resolution timestamp, fixed limitations, and next action. It is not a run-bound ProductEvent. JSON mode
continues to project recovery-required without mutation; only the explicit interactive invocation can
produce the resolution while reconciling the previous transaction.

The private terminal draft contains exactly `startedAt`, `endedAt`, `observations`, and execution
`outcome`. Its observation result-protocol digest and outcome must equal the receipt, its timestamps must
be ordered, and it is written in the same receipt-recorded fact before removal. It is not a second public
receipt or a provider-visible result.

This preserves receipt-before-cleanup, avoids synthetic container facts, adds no Docker, network,
credential, repository, provider, or public general-resume authority, and leaves the frozen two-second
stop grace unchanged. The owner approval authorizes deterministic active recovery Build and tests at the
already accepted journal, runner, Docker-port, and interactive-CLI seams. It does not authorize Docker
execution, daemon or image preparation, credentials, network access, commit, push, or publication.

The deterministic implementation now covers action-prepared and proven pre-create `not_started`
closures; intent-owned created adoption; exact created, running, and exited continuation; frozen
stop-then-kill timeout handling; receipt-before-cleanup and cleanup-before-terminal reconstruction from the
durable draft; exact absence after a completed remove; multi-session lifecycle isolation; and fail-closed
ambiguous discovery. JSON recovery remains projection-only, while an interactive resolved non-start may
continue to a fresh exact proposal in the same invocation.

## Named-context matching-surface amendment

The first authorized fresh-daemon preparation reached a clean independent Docker Engine 29.6.2
`userns-remap` surface and loaded the exact immutable image. Before the probe, production-path review
found that the execution adapter could select a daemon directly but the Doctor adapter and public CLI
could not select the same backend. Running the packaged CLI would therefore have inspected the user's
active Docker context while dispatching elsewhere, or would have required an environment, wrapper, raw
host, or default-context workaround outside the Freeze. The probe stopped before approval, container
create, or any diagnostic execution.

The owner approved the recommended named-context amendment on 2026-07-31:

- add only the two exact `--context <safe-name>` probe forms frozen above;
- select an already existing named context, never a raw host or socket through the public CLI;
- pass the same context selection to every Doctor and diagnostic execution Docker invocation;
- leave the user's default Docker context unchanged and keep context omission backward-compatible;
- bind and revalidate the selected context name and endpoint exactly as the existing action requires;
- permit one temporary evidence context to be created and removed only as part of the separately
  authorized matching-surface preparation.

The temporary daemon, image, registry configuration, credential scope, bind mount, and working directory
from the blocked attempt were removed. No diagnostic container was created. Local Build may now add this
closed grammar and adapter binding with deterministic tests. It does not authorize a raw host option,
default-context switch, repository check, provider call, commit, push, or publication.

## Classic image-store platform evidence amendment

The next authorized matching-surface preparation verified the named-context production path against a
fresh Docker Engine 29.6.2 `userns-remap` daemon. The exact immutable amd64 image was pulled into its
classic `overlay2` store. Before probe approval, the read-only image fixture established that this store
returns the exact index RepoDigest, image config digest, OS, architecture, entrypoint, user, working
directory, and layer identity, but does not expose `.Descriptor`. `docker image ls --tree` also exposes no
local platform descriptor on this backend. The existing Doctor therefore would fail closed before
approval because it required `.Descriptor.digest` as its only local platform-manifest evidence.

The attempt stopped with zero diagnostic commands and zero container creates. The temporary registry
configuration, image, named context, daemon, data, executable bundle, mount, working directory, and
`read:packages` scope were removed. The user's default Docker context remained `default`.

The owner approved the following minimal evidence amendment on 2026-08-01:

- freeze the already independently published platform config digests alongside the existing platform
  manifest digests: amd64 config
  `sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443` and arm64 config
  `sha256:31b5c699e50ea674594f825c59f65c7b3f84d3f73ea0fdcd47a3cb4fb4b8566f`;
- always require the exact image index RepoDigest, exact platform config digest from image `Id`, Linux
  OS/architecture, nonroot user, fixed entrypoint, and working directory;
- when a local `.Descriptor.digest` exists, require it to equal the frozen platform manifest digest;
- only when `.Descriptor` is absent, resolve the action's platform manifest digest from the
  application-owned exact `(platform, manifest digest, config digest)` mapping after every preceding
  local fact matches;
- treat a present-but-malformed descriptor, missing or mismatched config digest, mutable tag, index-only
  match, unknown platform, or any other drift as blocked; never fall back from contradictory evidence;
- apply the same evidence rule during initial Doctor preparation and post-approval revalidation.

This does not add registry lookup, network, credential, pull, mutable metadata, daemon storage reads,
another image, or weaker digest authority. The canonical action continues to bind the exact frozen
platform manifest digest. Descriptor-present backends retain their direct local check; classic stores add
the exact config-digest proof required to select the already accepted platform mapping.

## Closed image-environment matching-surface amendment

The next authorized matching-surface attempt reached the packaged interactive approval, consumed approval
for one exact action, and created the exact labelled container on the fresh independent `userns-remap`
daemon. The runner then failed closed before start because Docker inspect returned the immutable image's
`SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt` value and a daemon-defined environment order. The
existing parser required only the three application arguments in their CLI order. The container remained
in `created`, never started, and was removed by exact full ID after its name, labels, configuration, and
state were inspected. The isolated daemon returned to zero containers and zero images; the temporary
context was removed and the user's default context remained `default`.

The owner approved the recommended minimal amendment on 2026-08-01:

- bind the immutable image certificate path explicitly in the canonical action profile and the Docker
  create arguments;
- define the closed container environment as the exact unique four-value set shown in the profile table;
- treat Docker inspect ordering as non-semantic while rejecting a missing, duplicated, changed, inherited,
  or additional value;
- retain the same image, program, network, repository, provider, mount, privilege, namespace, resource,
  approval, receipt, recovery, and cleanup boundaries.

This amendment adds no host environment inheritance and no new runtime choice. The fixed certificate path
already belongs to the accepted immutable image config; making it action-bound closes the previously
implicit value. Rebuilding or republishing the image is unnecessary.

## Passing matching-surface result

The next authorized attempt used Docker Engine 29.6.2 on the fresh independent `userns-remap` backend and
the exact immutable linux/amd64 image. After approval and create, Docker inspect exposed one final
application-owned defect: the parser compared real external `eden.*` label keys against internal
camel-case names because the focused fixture had not modeled Docker's keys. A focused RED replaced that
fixture with the exact external representation and added rejection of additional labels. The minimal
GREEN performs one closed key mapping and preserves exact-key, exact-value comparison.

The packaged CLI reopened the same journal at `effect_intent` and recovered container
`cc867ab80b9c359d0ae055288939321c681052165931fe1db55f09c826254e9e`. It did not consume a second approval
or issue a duplicate create. The same container started, exited with all nine semantic checks passing,
recorded result digest `sha256:e4d6e6bc90c81e362235e2725628fce100cf0e5c54f94fe4655c461bfce219c3`,
wrote its durable receipt before cleanup, and was removed by exact identity. The daemon then reported zero
containers. The terminal journal has eight records and SHA-256
`a19cbd681e997e4767e7235ab04708137f195fb9785aa4235b54db5ade2641f6`.

## Non-goals and stop conditions

This amendment by itself did not authorize:

- Docker create/start runner or execution, image preparation/publication, credentials, commit, or push;
- a repository run, synthetic workspace, model/provider call, repository mount, or repository code;
- image rebuild, pull, import, registry login, package install, network, or daemon/context configuration;
- general Docker command/argv, host environment inheritance, shell, device, socket, port, privilege, host
  namespace, or weaker containment;
- automatic remediation, orphan cleanup, journal truncation, state pruning, public resume, headless
  approval, verifier success, Evidence Pack, support, release, signing, or installer claims.

Return to owner review if implementation needs a different image, diagnostic program semantics, check set,
state retention model, public continuation command, broader authority, another writable mount, larger
budget, output truncation, or weaker evidence.

## Approval checkpoint

Approval of these amendments authorized their Slice 4 REDs and deterministic Build only within the closed
diagnostic contract. The consumed matching-surface authorization covered one exact probe attempt and its
exact cleanup. A further real probe requires fresh execution and preparation authority. Commit, push,
publication, repository-check execution, and other external writes remain unauthorized.

The owner subsequently approved a bounded continuous authority packet for the remaining accepted plan.
That later packet authorized the passing probe above, the plan-required public commits and remote proofs,
and fixed-fixture repository-check execution while preserving the image-publication, provider, release,
merge, package-publication, and public-contract stop conditions.

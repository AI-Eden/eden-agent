# R2 Docker Repository Check Plan

- Status: Accepted; Slices 0-8 locally complete; Slice 9 implementation-candidate CI is pending
- Date: 2026-07-29
- Roadmap stage: R2, Usable Minimal Coding Product
- Baseline: `0ed7873bf4c134b77a4c00e96dbaf182007f031b`
- Decision brief: `docs/research/2026-07-29-r2-docker-repository-check-freeze-decision-brief.md`
- Required ADR: `docs/adr/0017-r2-docker-isolated-repository-checks.md`

## Goal and user-visible outcome

Deliver the remaining bounded R2 execution/isolation slice without claiming a general coding loop.

A trusted-workspace user can let Eden select one tracked repository-declared named check, review one exact
single-use Docker action, approve it in the TUI, and see one immutable tracked-file snapshot execute in an
exact local Eden Node 24 image. The resulting check observation, separate stdout/stderr, input and image
identity, lifecycle receipt, and cleanup truth enter non-success `completed` review.

Default `eden doctor` is read-only. An explicit separately confirmed probe can test actual Docker backend
enforcement without repository input, provider access, network, or remediation.

The deterministic fixture starts with one failing Node built-in test. One AnchorEdit changes an existing
tracked source file, the same named check then passes against the changed snapshot, and the product still
does not emit verifier-owned `succeeded`.

## Entry conditions and authority

Build may begin only after the owner accepts this plan, the decision brief, ADR 0017, and focused contract
changes as one Freeze packet, then separately authorizes Build.

Build authorization does not automatically authorize:

- a registry push or other image publication;
- use of a real provider credential;
- an external-user session;
- commit, push, merge, release, signing, installer, or package-manager publication.

The image-publication and external-user evidence checkpoints require their own exact owner coordination.
Local Docker execution during an approved Build must use only test fixtures, the exact locally built or
prepared image under review, no provider credential, and no external network unless separately authorized.

## Current repository facts

- `packages/contracts/src/safe-actuation.ts` now includes the closed `repository_check_v1` envelope while
  preserving AnchorEdit and runtime-owned Git decoding. The existing host policy still default-denies the
  Docker action; no repository-check execution path exists.
- ADR 0015 already fixes canonical JSON, SHA-256 action identity, policy revision, single-use approval,
  consume-before-dispatch, stable effect identity, and effect-kind reconciliation.
- `packages/kernel` decodes closed repository-check lifecycle and completed facts, but its reducer rejects
  them until the lifecycle slice. It has no Docker dispatch or cleanup behavior.
- `packages/coding-runtime/src/run-effect-host.ts` routes fake and safe-actuation effects only.
- `packages/coding-runtime/src/native-process.ts` already provides exact `shell: false` process requests,
  separate output caps, timeout, cancellation, and process-tree termination. It must remain a mechanism,
  not policy or model command authority.
- `InProcessAgentClient.open({ runId })` can reopen one exact execution journal and drive kind-specific
  reconciliation. `run.resume` remains an unsupported public command.
- The TUI has static renderer-neutral repository-check and read-only-doctor cards in addition to the
  existing digest-bound safe-actuation approval and attributed review. ProductView/ProductEvent decode the
  same closed repository-check projection; runtime journal projection remains deliberately inactive.
- `apps/eden/src/args.ts` and `apps/eden/src/index.ts` have no doctor command.
- The archive currently contains `eden`, `rg`, notices, and `eden-assets.json`; it contains no Docker image.
- The repository has closed catalog, snapshot, application toolchain, action, result, receipt, cleanup,
  doctor, and product decoders. It still has no Docker CLI adapter, image wrapper, tracked catalog/snapshot
  runtime service, or Docker evidence driver.
- Existing R2 evidence explicitly marks Docker and repository-code checks `not-run`.

## Frozen public contract after approval

### Catalog v1

The only first-slice path is `.eden/checks/catalog.json`. The file is closed JSON:

```json
{
  "version": 1,
  "checks": [
    {
      "name": "test",
      "process": {
        "executable": "/usr/local/bin/node",
        "arguments": ["--test", "test/failing.test.js"],
        "cwd": "."
      }
    }
  ]
}
```

Frozen rules:

- catalog bytes: at most 16 KiB;
- entries: 1-16, with unique names matching `[a-z][a-z0-9-]{0,63}`;
- executable: one absolute POSIX container path, 1-256 UTF-8 bytes, no NUL, no trailing slash;
- arguments: at most 32 literal values, each at most 256 UTF-8 bytes, at most 4 KiB total, no NUL;
- cwd: `.` or one normalized root-relative directory, at most 256 UTF-8 bytes;
- no unknown keys, shell string, interpolation, parameter, include, nested catalog, condition, pipeline,
  environment, network, image, mount, timeout, output, resource, or approval value.

The runtime does not search `PATH`, append arguments, expand variables, run a shell, or interpret package
scripts. Repository code may itself start child processes inside the container; the fixed PID/resource/
network/filesystem profile contains that behavior and the observation remains untrusted.

The catalog must be a Git-tracked regular UTF-8 file with link count one. Current dirty bytes are allowed.
The action records catalog SHA-256, byte length, dirty truth, `HEAD`, entry name, schema version, and exact
resolved process. Any current-byte or Git-identity change makes the proposal stale.

### Snapshot manifest v1

The first snapshot contains current bytes for Git-tracked regular files only:

- at most 64 files;
- at most 1 MiB per file;
- at most 8 MiB total content;
- at most 24 KiB canonical manifest JSON;
- normalized root-relative paths only;
- index mode `100644` becomes read-only `0444`; `100755` becomes read/execute `0555`;
- directories are materialized as `0555`;
- each manifest row binds path, byte length, `sha256:<hex>`, and executable-bit truth.

The manifest uses recursively key-sorted canonical JSON and SHA-256 under the domain
`eden.repository-snapshot.v1`. The complete manifest is durable before approval. The action card may show
a bounded path summary, but action identity uses the complete manifest.

`.git`, the catalog if not returned by tracked-file enumeration, untracked/ignored files, symlinks,
hardlinks, gitlinks/submodules, special files, sparse or missing tracked entries, over-budget files,
concurrent identity drift, and unreadable bytes block. The snapshot contains no host/provider/Docker state.

Staging uses a private runtime-state directory derived from run and effect identity, never the workspace.
Files are created without following links, hashed after copy, and revalidated against the approved manifest
before container create. The staged tree is mounted read-only at `/workspace`.

### Toolchain manifest v1

One application-owned closed manifest names:

- `toolchainId: "eden-node24-check-v1"`;
- immutable OCI image-index digest;
- allowed `linux/amd64` and `linux/arm64` platform rows;
- exact resolved platform-manifest digest for each published row;
- wrapper protocol version and content hash;
- Node major version 24;
- fixed container paths and profile revision.

Tags are display-only. Check dispatch sets pull policy to never and blocks unless local Docker inspection
matches the index, requested platform, resolved manifest, wrapper protocol, and profile. Check dispatch
never builds, pulls, imports, logs in, or installs.

The image source is Eden-owned and dependency-free beyond Node 24. Its base image must be pinned by digest.
The wrapper receives one closed process request from a read-only control file, uses no shell, captures one
child process tree, and emits one closed result. Image construction is release preparation, not check
dispatch.

### Canonical repository check action

Extend `ActionEnvelopeV1` with one discriminated `repository_check_v1` operation and its Docker-specific
authority, manifest, image, mount, profile, and budget values. Existing AnchorEdit and Git action canonical
bytes must remain byte-for-byte unchanged. The new operation remains under the ADR 0015 action domain and
must have an independent canonical-byte oracle.

The action binds:

- action/run/workspace/proposal revision, exact cwd, and single-use lifetime;
- catalog identity and exact resolved process;
- current `HEAD`, complete manifest and digest, file/byte counts, and path summary;
- toolchain/index/requested-platform/resolved-manifest/wrapper identities;
- staging, `/workspace`, temporary, and result mount identities and access modes;
- exact closed environment values and revision;
- `network=none`;
- containment profile and every numeric budget;
- Docker compatibility facts, policy/rule/profile revisions, and proposal lifetime.

Policy returns `ask` only for the exact first-slice shape and default-denies all other repository checks.
The current slice has no `allow` rule. Approval is consumed durably, then catalog, Git state, manifest,
image, Docker backend, profile, and staging hashes are revalidated. Stale facts block before create/start.

### Fixed container profile v1

The first fixture profile is:

| Control | Frozen value |
| --- | --- |
| Linux user | image-owned numeric non-root repository user |
| Root filesystem | read-only |
| Workspace | `/workspace`, read-only |
| Working directory | resolved beneath `/workspace` |
| Network | none; no published or exposed ports |
| Capabilities | drop all |
| Privilege | `no-new-privileges`; not privileged |
| Seccomp | Docker built-in default; no repository override |
| Namespaces | no host PID, IPC, UTS, user, or network namespace |
| Devices and sockets | none beyond Docker defaults; no Docker or agent socket |
| Restart and removal | restart disabled; automatic removal disabled |
| Memory | 256 MiB; swap no greater than memory where backend supports it |
| CPU | one CPU |
| PIDs | 64 |
| File descriptors | 256 |
| File size | 16 MiB |
| Snapshot | 64 files, 8 MiB total |
| `/tmp` | 16 MiB tmpfs, noexec, nosuid, nodev |
| Internal result | 64 KiB maximum |
| Stdout | 16 KiB complete-or-overflow |
| Stderr | 16 KiB complete-or-overflow |
| Wall clock | 30 seconds |
| Stop grace | 2 seconds before kill |

The wrapper and runtime use byte counts, not character counts. An exceeded stdout or stderr cap terminates
the child and produces `output_overflow`; it never preserves a truncated pass. Unsupported or unenforced
limits block rather than downgrade.

The first compatibility predicate requires Linux-container mode and the Docker API/features needed by the
exact create, start, wait, inspect, copy/result, stop, kill, and remove operations. Slice 0 records the
derived minimum API and command fixtures; Build must amend Freeze if the expected Docker 24/API 1.43 floor
does not represent the required feature set.

### Lifecycle and receipt v1

Container name, labels, staging path, and receipt identity are deterministic from the stable effect ID.
Names never include raw repository paths or secrets. Labels bind Eden schema, run, action, effect, manifest,
image, platform, and profile digests.

The ordered lifecycle is:

1. validate action and Docker prerequisites;
2. construct and hash staging;
3. `docker create` the exact config without `--rm` or restart;
4. inspect and record the exact container ID/config identity;
5. append durable dispatch-start;
6. `docker start` once;
7. wait, inspect, and obtain the wrapper result;
8. decode and bind the terminal receipt;
9. append the durable terminal observation;
10. remove only the exact container and staging tree and append cleanup truth.

Recovery uses exact name, ID, labels, config, and result:

- pre-create absence with durable proof: `not_started`;
- matching `created`: eligible to start once;
- matching `running`: observe or stop the same container;
- matching `exited` plus valid result: reconstruct receipt;
- mismatch, missing result after possible completion, corrupt result, or missing object after dispatch:
  `unknown`, no duplicate execution.

Cleanup failure is visible. Doctor may summarize exact owned orphans but cannot delete them. A future exact
cleanup action remains outside this plan.

### Result and product projection v1

The closed result distinguishes:

- `passed`;
- `failed`;
- `timed_out`;
- `cancelled`;
- `oom`;
- `output_overflow`;
- `engine_failed`;
- `cleanup_failed`;
- `unknown`.

It records check/action/effect identity, start/end times, exit code where known, wrapper reason, separate
complete stdout/stderr bytes, byte counts and SHA-256 values, image/platform/input/profile identities, and
cleanup state. Repository output is terminal-control sanitized only for display; durable bytes and hashes
remain unchanged.

Raw output is local product evidence. It is absent from provider context, provider continuity, prompts,
ordinary diagnostics, and default evidence bundles. The provider may receive only the named structured
outcome needed to close the current R2 conversation; it receives no raw stream and cannot initiate repair.

TUI approval shows process, catalog/input/image/platform digests, mount, environment, network, profile,
budgets, policy, lifetime, and isolation truth. Progress shows lifecycle states without exposing a raw
Docker command. Review shows result, output, receipt, input identity, cleanup truth, limitations, and next
action.

Headless NDJSON emits equivalent events and stops with exit 2 at `approval.presented`. It gains no broad
approval flag, stdin protocol, second invocation, or general resume command.

### Doctor v1

`eden doctor` renders the same closed rows as `eden doctor --json`. Default mode is read-only and has no
run journal, provider request, Docker object mutation, repository mutation, or remediation.

Rows cover current existing prerequisites plus:

- client/daemon/context/API reachability and versions;
- backend, Linux-container mode, host OS/architecture, and unsupported native Windows mode;
- exact local image index, requested platform, resolved manifest, wrapper/profile identity, and
  pull-never status;
- security option, cgroup/resource, staging filesystem, state permission, and budget prerequisites;
- exactly attributed orphan counts and identities without raw output or automatic cleanup.

`eden doctor --probe-docker` first presents one exact diagnostic action. It may select one existing safe
named context only as `--context <safe-name>` before optional `--json`; Doctor and execution receive that
same selection, the default context is unchanged, and raw hosts/sockets are rejected. Interactive
confirmation is required. `--json` projects the approval requirement and stops; there is no `--yes`
equivalent. Image readiness requires the exact index RepoDigest and platform config digest plus its fixed
Linux configuration. A present local descriptor must match the frozen platform manifest; only an absent
descriptor may resolve through the application-owned exact platform/config mapping, without registry
lookup or network. The probe has no repository mount, provider, or network; uses one existing exact image,
64 MiB memory, 0.5 CPU,
16 PIDs, 64 file descriptors, 1 MiB tmpfs, 4 KiB per stream, and a 10-second wall clock; verifies actual
UID, capability, no-new-privileges, seccomp, read-only root, tmpfs, limits, result, and exact cleanup.

Doctor never pulls, builds, imports, installs, starts/configures a daemon, changes context, reads a secret
value, changes repository/trust/configuration, deletes an object, or contacts a provider.

## Test strategy and independent oracles

Every slice follows RED, minimal GREEN, REFACTOR, VERIFY. The first test for each core invariant must fail
because production behavior is absent, not because an existing fixture was rewritten.

Independent sources of truth are:

- literal accepted/rejected JSON tables and separately encoded SHA-256 fixtures;
- real Git index/status/file bytes and a test-only canonical manifest encoder;
- Docker CLI JSON captured from controlled scripted ports for parser/error matrices;
- actual Docker object state, image/config inspection, container exit, and host directory state in the
  authoritative Linux lane;
- a dependency-free Node fail/pass oracle whose expected value is computed without production code;
- exact journal records, dispatch counters, process IDs, content hashes, and absence of duplicate objects;
- exact TUI frames/headless events and external-user recorded observations.

Permitted fakes are limited to real boundaries: clock/IDs, provider/model proposal driver, Docker CLI for
malformed or unavailable responses, and named crash barriers. Canonical encoding, policy, reducer, journal,
catalog/file validation, Git snapshot truth, real Docker happy paths, cleanup, and product projection are
not mocked in their integration lanes.

## Ordered test-first implementation slices

### Slice 0 evidence

The owner separately authorized Build on 2026-07-30. Slice 0 ran at exact accepted Freeze SHA
`a99718f3d091fe90e031e90b6259fb0e5bdf4b49`; the plan baseline
`0ed7873bf4c134b77a4c00e96dbaf182007f031b` remains its ancestor. Both worktrees were clean before the
first Build change.

The pre-change full workspace suite passed after rerunning outside the restricted command sandbox. The
initial sandbox attempt failed only because two existing hook tests could not spawn temporary Git fixtures
(`spawnSync git EPERM`); the identical unrestricted command passed those tests and every workspace suite.
No Docker command, repository code, provider, credential, or external network was used.

The independent literal fixture ledger is:

| Fixture | Encoded bytes | Frozen limit |
| --- | ---: | ---: |
| Selected process arguments | 3,926 | 4 KiB |
| Catalog fixture | 4,133 | 16 KiB |
| Complete 64-file manifest | 23,734 | 24 KiB |
| Canonical action journal record | 29,931 | 64 KiB |
| Complete result journal record | 44,965 | 64 KiB |
| Estimated action lifecycle run | 82,622 | 1 MiB |

The action and result records remain below the independently retained 80% record-headroom threshold.
Current action, product, kernel, journal, model-tool, and CLI decoders reject all repository-check and
doctor shapes. CLI help exposes no doctor or approval bypass. Existing safe-actuation evidence retains
Docker and repository-code rows as `not-run`, `executionMode=trusted_host_policy_only`,
`isolation=none`, and `network=not_requested`.

The copied Bun archive passed its native-asset check with application SHA-256
`478c6b8fcac93d68983cecc2c2f332736fccae26d629456667a488437b38b65f`, pinned ripgrep SHA-256
`193906679498de4d939345b937fa24e0e69a03c244bd70c859f5e41232713f21`, notices SHA-256
`6863f5d24ecd1aa71f3abb859389cd55d41e3755f65a1e8b64e60269aa12dfa5`, and manifest SHA-256
`5c22c1b633e8306ebd81aa7e80fe38cae49fd79304f992600375d1b2f9afb443`. The packaged safe-actuation
driver passed its six existing scenarios, and approval/review stayed visible without an isolation claim at
`60x20`, `80x24`, and `100x30`.

The machine-readable record is
`docs/benchmark-results/2026-07-30-r2-docker-slice0-linux-x64.json`. Slice 0 changed no production
behavior and triggered no stop condition. Slice 1 begins with the first new closed-contract RED.

### Slice 0: Baseline, budget ledger, and no-authority guards

**Public seam:** current full workspace gate, Bun archive, safe-actuation acceptance driver, journal
decoder, CLI help, and current Docker `not-run` evidence.

**RED:** add literal catalog/action/manifest/result fixtures and prove current decoders reject them. Add
guards proving current CLI has no doctor, model cannot request a repository check, and existing safe
actuation cannot claim Docker isolation.

**Independent oracle:** exact baseline SHA, current package hashes, 64 KiB record and 1 MiB run decoders,
literal byte counts for every proposed maximum, and current status/evidence rows.

**Permitted fakes:** none for repository or archive facts. Existing deterministic model/provider fixtures
remain unchanged for regression.

**Matching surface:** unchanged safe-actuation approval/review at `60x20`, `80x24`, and `100x30`.

**Stop:** dirty unrelated baseline, regression, a frozen value that cannot fit the persistence limits, or a
Docker feature requiring a broader API/platform contract.

### Slice 1: Closed catalog, manifest, action, doctor, result, and view contracts

**Likely files:**

- `packages/contracts/src/`
- `packages/contracts/test/`
- `packages/kernel/src/model.ts`
- `packages/kernel/src/schema.ts`
- `packages/kernel/src/index.test.ts`

**Public seam:** non-throwing decoders, canonical fixtures, `ProductEvent`, `ProductView`, and command
validation.

**RED:** unknown fields, duplicate names, shell/interpolation fields, malformed paths/argv, untracked
identity, manifest order/digest drift, image/platform mismatch, missing budgets, environment/network
override, forged cleanup, truncated output presented as pass, and check result presented as `succeeded`.

**Independent oracle:** checked-in literal JSON and canonical byte strings hashed by a separate test-only
SHA-256 call. Production constructors may not generate expected values.

**Permitted fakes:** fixed IDs and timestamps only.

**Matching surface:** static approval, lifecycle, doctor, and review fixtures render in TUI components and
headless JSON with identical semantic fields.

**Build evidence, 2026-07-30:** complete. The catalog, snapshot, toolchain, action, result, receipt,
cleanup, doctor, ProductView/ProductEvent, and kernel-fact RED matrices failed on absent production
behavior and then passed. Snapshot digest fixtures use a separate test-only SHA-256 implementation under
`eden.repository-snapshot.v1`; the existing AnchorEdit canonical-byte oracle remains unchanged. Static
repository-check approval/lifecycle and read-only doctor rows pass at widths 60, 80, and 100. The complete
workspace `pnpm test` passed outside the filesystem sandbox after the sandbox reproduced its known
`spawnSync git EPERM` limitation; workspace typecheck, Biome, and diff checks are green. No Docker command,
repository code, provider credential, external network, image publication, commit, or push was used.

The contract-only boundary is explicit: `repository_check_v1` remains default-denied by the active host
policy; repository-check kernel events decode but reduce/project as inactive. Slice 2 may implement only
tracked catalog discovery and immutable staging and may not cross into Docker dispatch.

### Slice 2: Tracked catalog discovery and immutable snapshot staging

**Likely files:**

- new focused catalog and snapshot modules under `packages/coding-runtime/src/`
- `packages/coding-runtime/src/tools/` only for shared checked-file primitives
- focused runtime tests with temporary real Git repositories

**Public seam:** runtime resolves one selected name and prepares one canonical manifest from a trusted
temporary repository.

**RED:** clean and dirty tracked catalog, untracked catalog, symlink/hardlink/special catalog, changed bytes,
duplicate or nested definitions, invalid UTF-8, shell-shaped fields, tracked clean/dirty files, executable
bit, untracked/ignored secret canaries, symlink, hardlink, gitlink, missing tracked file, file/count/total/
manifest overflow, concurrent replacement, and staging cleanup.

**Independent oracle:** real `git ls-files`/index modes, real bytes and `stat`, a separate manifest encoder,
directory enumeration, and explicit secret-canary absence. Expected staging bytes do not come from the
production copier.

**Permitted fakes:** named barriers at checked-read/copy/revalidate points. No in-memory filesystem or
mocked Git in the integration lane.

**Matching surface:** catalog unavailable, dirty, stale, and snapshot-overflow states show exact recovery
before an approval control exists.

**Build evidence, 2026-07-30:** complete. A real temporary-Git RED matrix now covers clean and dirty
tracked catalog bytes, exact named-process selection, untracked and invalid-UTF8 catalogs, hardlinks,
tracked symlinks/unsupported index modes, current dirty file bytes, executable-bit mapping, untracked
secret-canary absence, missing tracked files, 64-file overflow, concurrent source drift, workspace-external
staging, post-copy hashing, read-only modes, and exact cleanup. The runtime uses fixed non-interactive Git
argv through the existing bounded native-process port. It stages no `.git`, untracked/ignored path,
symlink, hardlink, gitlink, or unsupported object. No Docker command, provider credential, external
network, image publication, commit, or push was used.

### Slice 3: Eden image source, immutable toolchain manifest, and wrapper protocol

**Approved Freeze amendment, 2026-07-30:** anonymous read-only registry metadata established that the
current official Node 24 distroless nonroot image is
`gcr.io/distroless/nodejs24-debian13:nonroot`, not a Debian 12 variant. The approved immutable index is
`sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212`; its approved
`linux/amd64` manifest is
`sha256:b1386d556b478c420927eb212236bfb31be9834a4549850a060a6351f7fff514`, and its approved
`linux/arm64` manifest is
`sha256:c6465a8fcd268010c53e6e33e58d479dd232aa34f2312500afad8f605caffdc3`.
Because distroless exposes Node at `/nodejs/bin/node` while the accepted catalog freezes
`/usr/local/bin/node`, the Eden image must install an image-level alias from the frozen path to the
distroless path; wrapper-side command translation remains forbidden. Result `stdout` and `stderr` are
canonical Base64 strings with explicit `base64` encoding literals. Their byte lengths, 16 KiB limits, and
SHA-256 values apply to decoded raw bytes, preserving arbitrary non-UTF-8 output without truncation. The
remeasured maximum result journal record is 44,965 bytes and the estimated complete run is 82,622 bytes,
both within the unchanged persistence limits.

**Likely files:**

- new `images/node24-check/` Eden-owned image source;
- one dependency-free Node wrapper and wrapper unit tests;
- an application-owned toolchain manifest and decoder;
- scripts that build, inspect, and verify an image candidate without making check dispatch build or pull.

**Public seam:** wrapper consumes one literal process request and emits one bounded result; application
code resolves one toolchain/platform identity.

**RED:** wrong wrapper version/hash, mutable tag without digest, missing platform, entrypoint/command drift,
shell attempt, stdout/stderr exact boundary and one-byte overflow, timeout, cancellation, child tree,
signal handling, malformed control/result, and result-identity mismatch.

**Independent oracle:** pinned base digest, image config/manifest inspection, literal wrapper protocol
fixtures, test-only stream hashes, child PIDs, and exact exit reasons.

**Permitted fakes:** clocks and signals in wrapper unit tests. The Linux integration lane uses the real
image and real child process.

**Matching surface:** doctor reports an absent or mismatched image as blocked with pull-never/manual
preparation guidance.

**Build evidence, 2026-07-30:** the dependency-free wrapper RED-to-GREEN covers closed request/result
decoding, raw non-UTF-8 output encoded as canonical Base64, exact 16 KiB boundaries and one-byte overflow,
check failure, timeout, cancellation, TERM-to-KILL process-group cleanup, and the 64 KiB internal result.
The image source pins the approved distroless index, creates the approved executable alias in an exec-form
Node build step with no shell or extra base, returns to `65532:65532`, and fixes all build timestamps to
epoch.

Two local `linux/amd64,linux/arm64` OCI builds with provenance disabled were byte-identical. The archive
SHA-256 is `89972d7166fa05810c62748c131b4ece36c3cd67bfe731f8898ef82fb649a82e`; the candidate
index is `sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f`.
Its amd64/arm64 manifests are
`sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2` and
`sha256:7977eb382ee08c4b3e2f6c32dbf47dec5fa38b2160bc46a3faf742171823d230`.
Independent OCI extraction verified the two exact configs, nonroot vector entrypoint, working directory,
epoch timestamps, alias type/target, and source-identical wrapper bytes. The amd64 source candidate was
loaded only under local tag `eden-node24-check:local-slice3`; it was not published.

The real-image fixture did not run and no container was created. Docker Desktop 4.45.0 / Engine 28.3.3
reported only `name=seccomp,profile=builtin` and `name=cgroupns`; it did not report user-namespace remap.
The accepted profile requires no host user namespace, so Build stopped rather than silently sharing the
backend host user namespace. The owner selected the recommended branch on 2026-07-30: preserve the
accepted containment claim and continue only on a compatible user-namespaced backend.

The follow-up read-only audit found WSL 2.7.10, which satisfies Docker Desktop Enhanced Container
Isolation's documented WSL 2.6-or-newer prerequisite. The current Desktop configuration uses the
containerd image store and contains no evidence that Enhanced Container Isolation is enabled. Standard
daemon-wide `userns-remap` is not the selected path on this existing Desktop instance because Docker does
not support it with the containerd image store and enabling it would also mask existing daemon objects.
The preferred next backend is Docker Desktop Enhanced Container Isolation when the installation has the
required Docker Business entitlement. If that feature is unavailable, use a separate fresh Docker Engine
configured with `userns-remap`, rather than weakening Freeze or mutating this existing Desktop store.

Enabling Enhanced Container Isolation and restarting Docker Desktop are external machine-state changes,
not implicit Build authority. Build pauses before those actions. After exact owner authorization and the
restart, a repository-independent probe must prove a container-private user namespace before the real
image fixture may create a container. The machine-readable record is
`docs/benchmark-results/2026-07-30-r2-docker-slice3-linux-x64.json`.

**Compatible-backend closure, 2026-07-30:** Enhanced Container Isolation was unavailable, so the owner
selected the separate fresh `userns-remap` branch. Build used an official Docker Engine 29.6.2 static
bundle at archive SHA-256
`d6204aea92238e2453d5445c885b9d2e5eb8f82915568ec50edf9dbe12a3ac74` to start one ephemeral
independent daemon. It used only isolated temporary data, exec, PID, and Unix-socket paths; it did not
register a service, enable automatic start, change Docker Desktop, replace the default Docker context, or
write daemon configuration. The daemon used `userns-remap=eden:eden`, classic `overlay2`, no bridge,
iptables, IP forwarding, or masquerade. Its empty-state security options reported built-in seccomp,
`userns`, and private cgroup namespaces.

A repository-independent probe proved a distinct container user namespace
(`user:[4026532530]` versus backend host `user:[4026531837]`), UID/GID maps
`0 100000 65536`, numeric process user `65532:65532`, zero effective capabilities,
`NoNewPrivs=1`, and active seccomp. The probe container was then removed.

The real image fixture used the exact fixed profile, read-only workspace/control mounts, one writable
result file, and the previously approved local amd64 image candidate. The wrapper executed the sole
deterministic fixture source and returned `passed/process_exited/0`. Its four raw stdout bytes encoded as
`/wCACg==` with SHA-256
`2f2e272d087efb57e3a8964f71e382d401c15c42b7a3daf3655a0861ef1754f9`; its 15 stderr bytes
encoded as `Zml4dHVyZS1zdGRlcnIK` with SHA-256
`f921a264caca8ec79f8bd9b36de3b488aefdaf7aef458dcfcbcd02d1817a5557`. Independent raw-byte
oracles matched. The exact fixture container and staging tree were removed, leaving zero containers on
the independent daemon. Build then stopped the daemon, confirmed its managed containerd exited, and
removed the exact temporary socket, data, executable, and archive directory. No persistent daemon service
or state remains.

The no-host-user-namespace stop condition is therefore cleared for this local candidate.

**Publication closure, 2026-07-30:** exact owner authority permitted publication only to
`ghcr.io/ai-eden/eden-node24-check` and temporary use of a GHCR credential for that publication. A direct
import of the byte-verified OCI archive published display tag `eden-node24-check-v1`. Authenticated remote
readback verified the frozen index
`sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f`, amd64/arm64 manifests
`sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2` and
`sha256:7977eb382ee08c4b3e2f6c32dbf47dec5fa38b2160bc46a3faf742171823d230`, and configs
`sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443` and
`sha256:31b5c699e50ea674594f825c59f65c7b3f84d3f73ea0fdcd47a3cb4fb4b8566f`. The package remains
private; no visibility change was made.

The temporary Docker registry login and temporary `write:packages` scope were removed and verified after
publication. The application-owned toolchain manifest now records the reviewed immutable identities
locally. It is intentionally uncommitted because repository commit and push remain unauthorized. Check
execution remains blocked: the accepted contract requires the immutable manifest to be reviewed and
committed, and later slices must still implement the doctor, lifecycle, and effect host. No provider
credential, repository check, repository commit, Git push, or public package-visibility change was used.

**Repository-write checkpoint:** the registry-publication checkpoint is closed. Do not execute a
repository check until the reviewed application manifest is committed under separate exact repository
commit authority and the later dispatch slices have passed their gates.

### Slice 4: Read-only doctor and explicit diagnostic probe

**Likely files:**

- new focused Docker CLI/doctor modules in `packages/coding-runtime/src/`;
- `apps/eden/src/args.ts`, `apps/eden/src/index.ts`, and doctor renderers;
- focused CLI, JSON, parser, and real-backend tests.

**Public seam:** invoke `eden doctor`, `eden doctor --json`, and the explicit probe command.

**RED:** missing client, unreachable daemon, wrong context, native Windows mode, incompatible API, missing
image, wrong index/platform manifest, missing resource/security feature, unsafe state permissions,
exact/mismatched orphan labels, JSON/prose separation, probe approval stop, probe constraint mismatch,
timeout, crash, result reconstruction, and cleanup failure.

**Independent oracle:** fixed Docker CLI JSON fixtures for parser failures; process write counters proving
default doctor executes no mutating Docker command; real inspect/probe/object absence in the Linux lane.

**Permitted fakes:** Docker CLI port for unavailable/malformed/platform matrices. At least one read-only
inspection and every probe enforcement row use a real backend in the authoritative lane.

**Matching surface:** plain doctor and closed JSON agree; explicit probe presents exact authority and
returns a machine-readable receipt without repository or provider data.

**Build evidence, 2026-07-30:** the read-only half of Slice 4 is complete. `eden doctor` and
`eden doctor --json` project the same 12 closed rows through one bounded Docker CLI port. The production
adapter uses only version, context show/inspect, info, exact image inspect, and exact-label container-list
reads; the default command has no Docker, repository, provider, state, or remediation mutation authority.
The parser and service fail closed for missing, unreachable, malformed, timed-out, unsupported-platform,
API-floor/negotiation, image, security, resource, state-permission, and orphan-identity failures.

One real Docker Desktop read-only inspection reported the expected current blockers: the exact immutable
image is not prepared in the active local store and the backend does not expose user-namespace isolation.
The command retained pull-never behavior, found zero exactly attributed containers, and left the missing
test state path absent. Plain and JSON surfaces agreed. Focused and full workspace tests, typecheck, build,
code, Markdown, and diff checks passed. The machine-readable record is
`docs/benchmark-results/2026-07-30-r2-docker-slice4-linux-x64.json`.

At the Slice 4 Build-discovery checkpoint, the explicit probe was not implemented and remained rejected by
the CLI. The original accepted Freeze required one exact canonical diagnostic action and approval,
receipt, cleanup, and recovery facts, but the closed public contracts then defined only the
repository-check action/lifecycle. Build therefore stopped for a Freeze amendment that closed the
diagnostic action, canonical bytes/digest, approval command, ownership labels, lifecycle, receipt, cleanup,
and product projections before any probe container could be created.

**Accepted Freeze amendment, 2026-07-31:** the owner approved deterministic contract Build, not real
Docker execution. The accepted amendment is
`docs/research/2026-07-31-r2-docker-diagnostic-probe-freeze-amendment.md`. It defines one standalone
`docker_diagnostic_probe_v1` transaction outside repository runs, using the existing canonical action
domain with a dedicated always-ask policy, no repository/workspace/provider identity, one private bounded
diagnostic journal, one exact labelled container, receipt-before-cleanup ordering, and standalone
command/event/view contracts.

The amended profile preserves the accepted 64 MiB memory, 0.5 CPU, 16 PID, 64 file-descriptor, 1 MiB
tmpfs, 4 KiB-per-stream, and 10-second limits. It fixes the application-owned Node program identity,
backend/image/platform revalidation, exact labels, nine semantic enforcement rows, stable recovery, and
strict CLI grammar. Default Doctor remains unchanged. Non-interactive probe JSON is preview-only, exits 2,
and creates no journal, lock, or Docker object. Deterministic Build reached a clarification checkpoint for
Docker `MemorySwap` semantics and pre-effect durable `effectId` recovery. The owner approved the
recommended no-swap interpretation and durable pre-first-write effect identity on 2026-07-31, authorizing
deterministic CLI integration. That integration is complete: the production dispatcher performs only
read-only preflight before preview, non-interactive JSON never prompts or writes state, and unresolved
recovery performs neither Docker inspection nor journal mutation. The owner later authorized the exact
create/start/receipt-before-cleanup runner and one real probe on a fresh independent `userns-remap`
daemon. The deterministic runner and active recovery are complete: pre-create absence closes as
`not_started`; exact created/running/exited objects reconcile without duplicate create; timeout applies the
frozen stop-then-kill path; and receipt/cleanup/terminal crash points finish from a durable terminal draft.
Ambiguous state remains `unknown`. A later authorized preparation created a fresh independent daemon and
loaded the exact image, then stopped before the probe when production-path review found that Doctor and
execution could not select the same backend. The owner approved a named-context amendment; its exact CLI
grammar, common adapter selection, default-context preservation, and rejection matrix are deterministic
and complete. The temporary daemon, image, credentials, mount, and directory were removed. The real probe
still requires fresh matching-surface preparation.
The next prepared attempt reached that production named-context surface but stopped before approval
because classic `overlay2` omitted `.Descriptor`. The owner approved the exact config-digest platform
mapping fallback on 2026-08-01. Doctor and preflight now require the frozen index, config digest,
OS/architecture, entrypoint, user, and working directory; direct descriptors remain mandatory when
present, while malformed or contradictory evidence blocks. The attempt created zero containers and
removed its daemon, image, context, credentials, scope, mount, and temporary directory.
The following authorized attempt reached approval and created one exact labelled container. Docker inspect
then exposed the immutable image's fixed `SSL_CERT_FILE` plus non-semantic environment reordering, so the
runner failed closed before start. The container never ran and was removed by exact full ID; the daemon
returned to zero objects and the temporary context and credential scope were removed. The owner approved a
minimal closed-environment amendment on 2026-08-01: the action and create arguments bind the fixed
certificate path, while inspection accepts only the exact unique four-value environment set independent of
order. The next authorized attempt found one final application-owned normalization defect: real Docker
inspect reports the frozen ownership labels under their `eden.*` keys, while the parser compared them to
the internal camel-case field names used by an unrealistic fixture. A focused RED changed the fixtures to
real Docker keys and added extra-label rejection; the minimal GREEN maps those exact external keys back to
the closed internal label record.

The packaged CLI then reopened the same durable `effect_intent` transaction. It recovered container
`cc867ab80b9c359d0ae055288939321c681052165931fe1db55f09c826254e9e`, started that exact object without a
second create or approval, recorded a passing receipt before cleanup, removed the container by exact
identity, and reached terminal sequence 8. All nine semantic enforcement rows passed. The independent
daemon returned to zero containers while retaining only the pinned image; the journal SHA-256 is
`a19cbd681e997e4767e7235ab04708137f195fb9785aa4235b54db5ade2641f6`. This closes Slice 4. Slice 5 begins
from the immutable public baseline after its required review, commit, and remote proof.
The machine-readable Freeze-amendment record is
`docs/benchmark-results/2026-07-31-r2-docker-probe-freeze-amendment.json`.

### Slice 5: Docker create/start runner, stable receipts, and crash recovery

**Likely files:**

- new Docker runner/lifecycle modules in `packages/coding-runtime/src/`;
- `packages/coding-runtime/src/run-effect-host.ts`;
- receipt/state-path integration and focused crash tests.

**Public seam:** execute and reopen one stable repository-check effect through the real journal and Docker
adapter.

**RED:** absent/not-started, matching created, running, exited-valid-result, exited-missing-result,
mismatched name/labels/config/image/platform/profile, daemon loss, create failure, start ambiguity, wait
failure, timeout, cancel, OOM, overflow, engine failure, result corruption, receipt-before-cleanup crash,
cleanup crash, staging orphan, and zero duplicate execution.

**Independent oracle:** exact journal sequence, Docker inspect JSON, container ID, label/config digests,
wrapper result bytes, host staging tree, child-side execution counter, and object absence after cleanup.

**Permitted fakes:** named crash barriers and Docker CLI failures that cannot be forced portably. Real
create/start/wait/stop/remove happy, failure, and recovery paths run on Linux.

**Matching surface:** relaunch reconstructs created/running/exited truth and next safe action without
public general resume or a second container.

**Accepted Option A amendment, 2026-08-01:** Slice 5 and Slice 6 review found that the original action
shape did not bind the selected Docker backend observations to the approval digest, and that
`cleanup_failed` could not retain a non-`process_exited` wrapper reason. The owner approved
`docs/research/2026-08-01-r2-docker-build-contract-gap-decision-brief.md`. Build must add the closed
`dockerCompatibility` object described there, show its bounded facts at approval, and require exact
re-observation before create/start. The result amendment preserves the original closed wrapper reason
when cleanup fails. This adds no image, credential, provider, network, cleanup-action, or release
authority.

### Slice 6: Policy, approval, kernel lifecycle, and provider-loop boundary

**Build evidence, 2026-08-01:** Slice 5 and the accepted Option A amendment are locally complete. The
closed action digest now binds the safe named context, hashed endpoint, client/daemon/API facts, required
namespace/security/resource features, and exact local image identities. Preparation and dispatch use the
same selected context and re-observe the complete object before staging and before Docker mutation.
Deterministic runner tests cover exact pull-never creation, strict inspect identity, ordinary child
failure with a successful wrapper receipt, created/running/exited recovery, ambiguity, timeout, OOM,
cleanup failure, no duplicate execution, and newly staged-byte cleanup on pre-create compatibility drift.
One real named-context test completed the exact create/start/receipt/cleanup path on Engine 29.6.2 with
`userns-remap`, built-in seccomp, private cgroup namespaces, and zero remaining containers.

**Likely files:**

- `packages/kernel/src/model.ts`
- `packages/kernel/src/schema.ts`
- `packages/kernel/src/reducer.ts`
- `packages/kernel/src/decide.ts`
- `packages/coding-runtime/src/policy/index.ts`
- `packages/coding-runtime/src/runtime.ts`
- focused policy, canonical-action, round-trip, and recovery tests

**Public seam:** model selects a catalog name; `AgentClient` exposes one exact approval and dispatches only
after a matching product command.

**RED:** model-written process, name not in catalog, action/display drift, changed catalog/input/image/
platform/profile/policy, stale revision, reused approval, previous catalog approval, attempted allow rule,
dispatch before durable consume, cancellation at each safe boundary, output fed to provider, automatic
second check, and forged success.

**Independent oracle:** literal policy tables, independent action bytes/digest, journal order, provider
request counter, Docker execution counter, and final terminal outcome.

**Permitted fakes:** deterministic model selection, clock, and IDs. Policy, canonical encoding, reducer,
journal, approval consumption, and one real Docker dispatch are not mocked.

**Matching surface:** TUI approval shows every frozen authority fact; denial/stale/cancel disable execution
and name recovery. Headless stops at the same approval with no bypass.

### Slice 7: Local output, review, TUI/headless parity, and lifecycle UX

**Build evidence, 2026-08-01:** Slice 6 is locally complete. The model can select only one catalog name;
the runtime resolves repository-owned process details, produces the always-ask canonical action, consumes
one matching approval before dispatch, and records the ordered lifecycle through non-success `completed`
review. Repository output remains available in the local projection but is absent from the second model
request. A passing check cannot emit verifier-owned `succeeded`. Option A compatibility changes alter the
approval digest and drift blocks before create/start. Focused policy, provider-loop, reducer, journal, and
projection tests are green.

**Likely files:**

- product projections in `packages/coding-runtime`;
- `apps/eden/src/tui.tsx`, focus/layout/text modules, and headless projection;
- focused contract, component, headless, and PTY tests.

**Public seam:** one journal produces the TUI and headless repository-check projections.

**RED:** pass, ordinary fail, timeout, cancel, OOM, overflow, unknown, engine failure, cleanup failure,
control characters, CJK, exact stream boundaries, large review scrolling, raw output in provider request,
raw output in default diagnostic, stale approval after resize, forged Docker command, and a passing check
mislabelled as verification/success.

**Independent oracle:** journal-derived product values, literal sanitized frames, raw byte/hash fixtures,
provider/diagnostic canary counters, and identical decoded fields across surfaces.

**Permitted fakes:** static ProductView fixtures for component states and scripted terminal input. The
matching flow uses the real kernel, journal, projection, Docker result, and AgentClient.

**Matching surface:** keyboard-only `60x20`, `80x24`, and `100x30` flows cover approval, lifecycle,
output expansion, failed check, unknown recovery, cleanup warning, resize, CJK, and terminal restore.

### Slice 8: Deterministic fixture journey and adversarial acceptance driver

**Build evidence, 2026-08-01:** Slice 7 is locally complete. The TUI approval exposes the exact process,
snapshot/image/profile identity, selected safe context, user-namespace truth, network-none authority,
budgets, policy, and single-use lifetime without exposing a raw Docker command. Journal-derived lifecycle,
receipt, cleanup, separate Base64 streams, and untrusted local result remain visible in review. Static
repository-check cards remain legible at widths 60, 80, and 100; headless execution recognizes the same
Docker-bound approval and stops without a broad approval bypass.

**Likely files:**

- one standalone dependency-free fixture repository or reproducible fixture generator;
- scripted non-provider operation/model oracle;
- a new Docker repository-check acceptance driver and evidence schema;
- package scripts and driver self-tests.

**Public seam:** copied Bun archive plus exact prepared image in a temporary real fixture repository.

**RED:** original snapshot must fail; correct existing-file AnchorEdit must pass; wrong edit must fail.
Driver validation must reject missing trust/catalog/action/approval/snapshot/image/profile/result/recovery/
cleanup rows, secret canary exposure, duplicate execution, raw provider output, success claim, stale SHA,
or `not-run` presented as pass.

**Independent oracle:** fixture source/test bytes, direct `node --test` expectation inside the exact image,
Git hashes/status, action/manifest/image hashes, journal sequence, execution counter, Docker object census,
and zero provider calls.

**Permitted fakes:** deterministic model and operation selection only. Git, filesystem, catalog, staging,
Docker, wrapper, journal, TUI/headless projection, and cleanup are real.

**Matching surface:** copied archive completes trust, edit approval, changed review, check approval, Docker
execution, bounded review, and terminal restoration in the fixture. Crash at created/running/exited
checkpoints reopens the exact run internally without duplicate execution.

### Slice 9: Candidate, real-host matrix, and independent external-user gate

**Local Build evidence, 2026-08-01:** Slice 8 is locally complete. The copied Bun archive and a separately
compiled deterministic harness exercised three real temporary Git repositories against the exact
immutable amd64 image: the original snapshot failed, one correct AnchorEdit produced a passing immutable
snapshot, and one wrong AnchorEdit remained failing. Independent pull-never image oracles agreed with all
three outcomes. Each product run consumed one approval, recorded receipt before cleanup, retained local
raw output while withholding it from the deterministic provider boundary, captured no credential or
secret canary, produced no verifier success, and left zero Docker objects. The three snapshot digests were
distinct. The evidence validator rejects missing rows, open nested records, wrong exact source SHA,
stale image/platform identity, unsupported namespace truth, credential capture, verifier success,
incomplete cleanup, and secret exposure.

The pre-commit local driver used source baseline `71e0a19b14784af3ed8fde7b01098417a8d504a0`; it is
development evidence, not the Slice 9 exact-SHA artifact. Full tests, typecheck, build, Biome, Markdown,
and diff gates are green. Slice 9 must still publish the implementation commit and obtain a green hosted
Ubuntu x64 Docker artifact at that exact SHA. Real macOS Docker Desktop, Windows Docker Desktop WSL2, and
the independent external-user journey remain `not-run`, so whole R2 and release support remain open.

**Likely files:**

- `.github/workflows/ci.yml` only for accepted hosted lanes;
- acceptance/evidence scripts;
- `docs/product/release-support-matrix.md`, `CONTEXT.md`, and plan closeout facts.

**Public seam:** exact-SHA package and evidence artifacts plus one independent external-user Quickstart.

**RED:** evidence aggregation rejects a missing required row, wrong SHA/image/platform manifest, unsupported
backend, stale artifact, absent cleanup, secret canary, native-Windows inference, provider credential
capture, or release-support overclaim.

**Independent oracle:** exact commit and archive hashes; image index/platform manifests; host/backend/client/
daemon versions; real Docker object state; fixture hashes; automated driver artifact; external-user
commands/keystrokes and visible results; secret-canary absence.

**Permitted fakes:** deterministic provider/model driver for hosted and real-host automated rows. The
external-user journey uses that user's own configured provider, but evidence records only profile identity
and closed product observations, never credential value.

**Matching surfaces and claim gates:**

1. hosted Ubuntu x64: authoritative automated Docker lane;
2. hosted macOS arm64 and Windows x64: contract/package/TUI/negative-doctor only;
3. real Linux/WSL2 Engine or Desktop: matching Docker driver;
4. real macOS arm64 Docker Desktop Linux containers: matching Docker driver;
5. real Windows x64 Docker Desktop WSL2/Linux containers: matching Docker driver;
6. one non-implementer external user: complete failing-test Quickstart.

An Ubuntu-green exact-SHA may close the implementation candidate only. Missing real Mac, Windows/WSL2, or
external-user evidence remains `not-run` and keeps whole R2 incomplete. No row creates release support.

## Likely files and boundaries

The expected production change set is:

- `packages/contracts`: catalog/action/manifest/image/profile/doctor/result/receipt/cleanup/product shapes;
- `packages/kernel`: pure named-check proposal, approval, Docker effect/lifecycle facts, review transition,
  and rejection of forged success;
- `packages/coding-runtime`: catalog and Git snapshot services, Docker CLI/doctor/runner ports, canonical
  action, policy, staging, receipts, reconciliation, projections, and exact cleanup;
- `packages/providers`: only a closed repository-check name in the normalized tool proposal if the current
  provider-independent tool-call union requires it; no Docker or raw output details;
- `apps/eden`: doctor CLI, exact approval, lifecycle/review rendering, focus/actions, and equivalent
  headless projection;
- `images/node24-check`: Eden-owned pinned image source and dependency-free wrapper;
- `scripts`: deterministic fixture, Docker acceptance, PTY, evidence validation, and platform drivers;
- `.github/workflows/ci.yml`: authoritative Ubuntu Docker plus non-Docker hosted rows only;
- focused public docs and context closeout after matching evidence exists.

Do not implement this slice in `goals`, `planning`, or `verification`. Do not generalize
`NativeProcessRunner` into a model command service. Do not place repository, provider, Docker, or image
authority in `apps/eden`.

## Verification commands

Build adds focused commands whose final names may follow the current package naming convention:

```sh
pnpm --filter @eden/contracts test
pnpm --filter @eden/kernel test
pnpm --filter @eden/coding-runtime test
pnpm --filter @eden/cli test
pnpm test:r2-process
pnpm test:r2-provider-fixtures
pnpm test:r2-secret-canaries
pnpm test:r2-safe-actuation
pnpm test:r2-docker-contracts
pnpm test:r2-docker-fixture
pnpm test:r2-docker-recovery
pnpm test:r2-doctor
pnpm test:r2-docker-evidence
pnpm test
pnpm typecheck
pnpm code:check
pnpm build
pnpm --filter @eden/cli package:bun
node scripts/smoke-standalone.mjs apps/eden/dist/eden
pnpm test:r2-native-archive
pnpm test:r2-tui-pty
pnpm test:r2-docker-pty
pnpm markdown:check
git diff --check
```

Docker-focused commands must fail closed with a structured skipped/unavailable result when the exact image
or backend is absent. Evidence aggregation must preserve that state as `not-run`; it may not turn skipped
execution into a pass.

## Acceptance ledger

| Area | Required evidence |
| --- | --- |
| Catalog | fixed path/schema; tracked clean/dirty; stale; no shell/include/parameter; closed decoder |
| Snapshot | complete manifest/digest; tracked current bytes; mode; budget; secret/link/gitlink exclusion |
| Image | Eden-owned source; pinned base/index/platform/wrapper identities; pull-never dispatch |
| Action | independent canonical bytes/digest; exact process/input/image/profile/policy/lifetime |
| Policy | repository check always ask; default deny; no trust/catalog/past-approval grant |
| Approval | exact digest/revision; durable consume; full revalidation; stale/replay rejection |
| Containment | read-only root/workspace; network none; env closed; non-root; caps/seccomp/resources |
| Lifecycle | stable create/start/wait/inspect; created/running/exited recovery; zero duplicate execution |
| Result | separate complete streams; pass/fail/timeout/cancel/OOM/overflow/unknown; hashes and receipt |
| Cleanup | exact owned objects only; durable receipt first; visible orphan/cleanup failure |
| Doctor | read-only default; closed JSON parity; explicit probe; no remediation or credential value |
| Completion | basic observation in `completed`; no provider raw output, repair, Evidence Pack, or success |
| Surfaces | equivalent TUI/headless facts; TUI approval/execution; headless structured stop |
| Fixture | deterministic fail/correct-pass/wrong-fail oracle; no dependency install or network |
| Platforms | Ubuntu Docker authoritative; real Mac and Windows/WSL2 matching; missing stays `not-run` |
| External user | non-implementer completes pinned journey; own provider; no credential capture |
| Claims | implementation candidate, whole R2, and release support remain separately stated |

## Risks and mitigations

| Risk | Mitigation or stop condition |
| --- | --- |
| Repository catalog hides broad execution | Literal process display, no shell grammar, complete action digest, always ask |
| Snapshot exposes ignored secrets | Git-tracked allowlist, explicit exclusions, secret canaries, no live bind |
| Approval runs changed bytes | Complete manifest plus pre-create revalidation; any drift is stale |
| Image tag or platform drifts | Immutable index and resolved platform manifests; tag non-authoritative |
| Docker daemon has host authority | State the residual; no socket in container; exact owned objects only |
| Wrapper/result is influenced by repository code | Treat all output/result as untrusted basic evidence; never verifier success |
| Runtime crash duplicates execution | Stable name/labels, create/start split, dispatch fact, inspect/reconcile matrix |
| Output overflows journal | 16 KiB per stream and 64 KiB result cap with independent byte fixtures; stop if it cannot fit |
| Staging cleanup removes wrong data | Private validated state path and exact effect ownership; no glob or fuzzy label |
| Doctor becomes an administrator | Read-only default and separately confirmed probe; explicit no-remediation tests |
| Hosted lanes overclaim Docker Desktop | Separate hosted non-Docker and real-host matching rows |
| External-user evidence leaks credentials | User-owned configuration; evidence records identity/presence only; canary audit |
| Image publication broadens external writes | Mandatory stop and separate exact owner authorization before registry push |

## Rollback and amendment policy

Before release, product rollback may remove catalog discovery, doctor probe, and repository-check dispatch
while preserving journals, receipts, user repositories, and any exact Docker objects that cannot be safely
attributed. It never deletes a user repository file, prunes Docker globally, removes a shared image, or
retries an unknown check.

Old code must fail visibly on new journal facts or use an explicit pre-release compatibility rule. It may
not reinterpret Docker events as trusted-host actions or silently omit unresolved objects.

Stop and amend this plan if implementation needs:

- model-authored executable/arguments, shell, parameters, persistent approval, or automatic recheck;
- untracked/ignored/link/gitlink input, live mount, writable repository workspace, cache, or artifact export;
- repository-selected image, Dockerfile, build/pull/import/install, registry credential, or network;
- host environment values, additional mounts/devices/sockets/capabilities, privileged or host namespaces;
- a new artifact store, output truncation/pagination, larger journal, or output sent to a provider;
- broad headless approval, public resume/continuation, standalone task-runner semantics, or concurrent
  execution ownership;
- automatic remediation, daemon administration, broad cleanup, native Windows containers, or weaker
  platform evidence;
- GoalSpec, repair, Evidence Pack, verifier implementation, `succeeded`, or release-support language.

Routine file placement, internal type names, use of a dedicated Docker CLI port, and smaller measured
limits do not reopen owner decisions when all public invariants and independent oracles remain intact.

## Explicit non-goals

- general shell, arbitrary command execution, model-authored process, appended argv, catalog parameters,
  persistent grants, or automatic repeated checks;
- repository images/Dockerfiles, check-time build/pull/import/install, package managers, dependency caches,
  registry authentication, or networked checks;
- untracked/ignored inputs, symlinks, submodules, Git LFS, live binds, writable workspaces, output artifacts,
  or host worktree mutation by repository code;
- host/provider/credential environment, ports, devices, Docker/agent sockets, privileged mode, host
  namespaces, or daemon-isolation claims;
- provider raw-output projection, explanation, repair, recheck, GoalSpec, Evidence Pack, verifier, or
  success;
- broad headless approval, public durable resume, native Windows containers, rootless support guarantees,
  or inferred cross-platform evidence;
- automatic doctor remediation, image preparation, orphan cleanup, daemon configuration, release, signing,
  installer, update, or package-manager publication.

## Human approval

The owner approved the 17 Explore decisions, confirmed shared understanding, and accepted this plan,
decision brief, ADR 0017, and the focused public contract updates as one Freeze packet on 2026-07-29.

The owner separately authorized Build on 2026-07-30. Image publication, real provider use, external-user
evidence, commit, push, and release remain separate authority boundaries.

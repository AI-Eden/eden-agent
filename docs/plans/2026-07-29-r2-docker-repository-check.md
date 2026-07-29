# R2 Docker Repository Check Plan

- Status: Accepted Freeze input; Build not authorized
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

- `packages/contracts/src/safe-actuation.ts` has a closed `ActionEnvelopeV1`, but only for AnchorEdit and
  runtime-owned Git operations. Execution mode is fixed to `trusted_host_policy_only`.
- ADR 0015 already fixes canonical JSON, SHA-256 action identity, policy revision, single-use approval,
  consume-before-dispatch, stable effect identity, and effect-kind reconciliation.
- `packages/kernel` has no repository-check, Docker lifecycle, doctor, or cleanup fact.
- `packages/coding-runtime/src/run-effect-host.ts` routes fake and safe-actuation effects only.
- `packages/coding-runtime/src/native-process.ts` already provides exact `shell: false` process requests,
  separate output caps, timeout, cancellation, and process-tree termination. It must remain a mechanism,
  not policy or model command authority.
- `InProcessAgentClient.open({ runId })` can reopen one exact execution journal and drive kind-specific
  reconciliation. `run.resume` remains an unsupported public command.
- The TUI already presents digest-bound safe-actuation approval and attributed review. Headless NDJSON
  projects the same journal-derived facts and stops at real approval.
- `apps/eden/src/args.ts` and `apps/eden/src/index.ts` have no doctor command.
- The archive currently contains `eden`, `rg`, notices, and `eden-assets.json`; it contains no Docker image.
- The repository has no Docker CLI adapter, toolchain manifest, image wrapper, repository-check catalog
  decoder, tracked snapshot builder, or Docker evidence driver.
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

`eden doctor --probe-docker` first presents one exact diagnostic action. Interactive confirmation is
required. `--json` projects the approval requirement and stops; there is no `--yes` equivalent. The probe
has no repository mount, provider, or network; uses one existing exact image, 64 MiB memory, 0.5 CPU,
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

### Slice 3: Eden image source, immutable toolchain manifest, and wrapper protocol

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

**External-write checkpoint:** stop before registry publication. Record reproducible local image/config/
platform evidence and request exact owner authority for any push. After publication, review and commit the
immutable index and platform digests before any check action can execute.

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

### Slice 6: Policy, approval, kernel lifecycle, and provider-loop boundary

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

Build remains blocked until the owner separately authorizes it. Image publication, real provider use,
external-user evidence, commit, push, and release remain separate authority boundaries.

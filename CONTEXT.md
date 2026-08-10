# Project Context

## Current stage

R0 and R1 are complete, and both exit reviews are accepted. The owner accepted the R1 exit on 2026-07-17
after the final exact-SHA local, hosted, artifact, and single-agent review evidence passed. The owner
approved the first R2 provider/repository-understanding Freeze packet on 2026-07-19; Slices 0-8 and that
accepted plan are complete. On 2026-08-01 the owner accepted ADR 0018's portfolio-first amendment. R2 is
complete for the declared Linux/WSL2 reference platform, with hosted Ubuntu, macOS, and Windows
portability regression. This is not release support.

The next R2 safe-actuation Explore frontier became empty on 2026-07-28 after the owner approved the
recommended branches and confirmed shared understanding. The owner then accepted the complete Freeze
packet, ADR 0015, ADR 0016, and the test-first plan and separately authorized Build on 2026-07-28.
The accepted safe-actuation Build and its hosted implementation-candidate closure are complete. Exact
public candidate `3c23446db471eead735a0ac971551c43ecb55759` passed the Ubuntu, macOS, and Windows R2
matrix in run 30382567704. This closes the accepted safe-actuation packet, not all of R2 and not release
support.

On 2026-08-10 the owner accepted the accelerated R3 decisions with one amendment: R3-D remains a bounded read-only ExploreAgent plus web-tools direction but is non-blocking and requires separate activation. The blocking path is R3-A usable coding loop, R3-B TUI product-shell reconstruction, R3-C Plan plus verified Goal, and R3-E resume-ready release. The owner then accepted ADR 0019 and the executable plan and separately authorized the blocking Build plan. Slice 0 stopped before capability activation because the inherited one-call contract could not reach 16 tool calls within a completed 12-step run and the 1 MiB journal estimate had no credible R3 lifecycle headroom. On 2026-08-11 the owner accepted the Freeze amendment: `usable_coding_v1` separates policy maxima, a durable per-run grant, and usage; one step may carry up to four preflighted read-only calls with concurrency at most four; effectful and approval-bearing calls remain singleton; step 12 is final-answer-only; and the profile run-journal ceiling becomes 2 MiB while 64 KiB record and 4096-record limits remain. The owner then approved the amended Freeze, freshly reauthorized Build, authorized public-first commits and pushes, accepted the deterministic candidate, authorized the copied packaged TUI journey, and authorized exactly one matching real-provider/network fixture. Candidate `092f9a107e93112b401a1c9e48dcad04ff064529` covers the amended budgets and scheduler, model-visible Git diff, exclusive new-file creation, structured host commands, exact approval/recovery, real temporary-Git/process behavior, replay, ProductView, and TUI command/diff cards. Its copied package passed the complete deterministic coding journey at `60x20`, `80x24`, and `100x30`, and hosted R2 run [`31428717990`](https://github.com/AI-Eden/eden-agent/actions/runs/31428717990) passed Ubuntu, macOS, Windows, and Docker. The single `deepseek-v4-pro` attempt stopped at the explicit `network` retry boundary before terminal completion and was not retried. The R3-A milestone review therefore recommends no acceptance or closure. A later owner-authorized bounded offline repair made failures persist sanitized artifacts before cleanup and removed inherited `NODE_TLS_REJECT_UNAUTHORIZED=0` from the copied-package environment; the old attempt cannot prove normal TLS because the previous driver forwarded that variable. No diagnostic network call occurred, the old raw cause is unavailable, and a fresh owner-authorized matching fixture is still required. R3-B has not begun. R3-D, package publication, and release remain unauthorized.

On 2026-07-29 the owner accepted all 17 Docker repository-check Explore decisions and confirmed shared
understanding. The decision frontier is empty. The owner then accepted ADR 0017, the focused public
contracts, decision brief, and `docs/plans/2026-07-29-r2-docker-repository-check.md` as one Freeze packet.
On 2026-07-30 the owner separately authorized Build. Slices 0-3 are complete, including exact authorized
image publication and credential cleanup. The read-only half of Slice 4 is complete. On 2026-07-31 the
owner accepted the Docker-probe Freeze amendment, approved its two deterministic clarifications, and
authorized deterministic CLI integration. That integration and deterministic active recovery are
complete. The owner later authorized one exact matching-surface probe and the required fresh-daemon and
immutable-image preparation. Preparation succeeded, but a production-path audit stopped before the probe
because Doctor and execution could not select the same independent backend. The owner approved a narrow
named-context amendment, and its deterministic CLI/adapter binding is complete.
On 2026-08-01 a second prepared attempt proved that the classic `overlay2` store omits the local
`.Descriptor` used by Doctor. The owner approved the exact config-digest platform-mapping fallback, and
its deterministic Doctor/preflight implementation is complete. A third authorized attempt reached create
but failed closed before start because the immutable image certificate environment and Docker's
environment ordering were not yet represented by the exact inspection contract. The never-started
container was removed by exact ID. The owner approved the fixed four-value, order-independent closed
environment amendment, and its deterministic implementation is complete. The next attempt exposed and
fixed one application-owned external-label normalization defect, then reopened the same journal and exact
created container. The real probe passed all nine enforcement rows, wrote its receipt before exact
cleanup, performed no duplicate create or second approval, and returned the daemon to zero containers.
Slice 4 is complete. On 2026-08-01 the owner approved the narrow Option A contract amendment binding
Docker compatibility observations into the canonical repository-check action. Slices 5-8 are now locally
complete. The implementation, fixed failing fixture, deterministic provider boundary, packaged three-
scenario TUI driver, and closed evidence validator pass on the fresh independent `userns-remap` daemon.
Slice 9's implementation candidate is complete at exact reviewed code commit
`8c37f7939e384eaada13582a8f0ac71668eb9a98`. A completion audit superseded the earlier candidate after
finding dispatch-journal/recovery and cancellation gaps: dispatch is now journaled after durable create
and before start, pre-create failure is proven retryable, and cancellation performs stop/kill fallback
before recording a cancelled receipt and completing cleanup. Hosted R2 run
[`30698539397`](https://github.com/AI-Eden/eden-agent/actions/runs/30698539397) passed the authoritative
Ubuntu x64 Docker lane plus the Ubuntu, macOS, and Windows non-Docker acceptance lanes; companion R1 run
[`30698539398`](https://github.com/AI-Eden/eden-agent/actions/runs/30698539398) also passed all three hosted
platforms.
Slice 0 preserved the
safe-actuation surface, exact package hashes, Docker no-authority guards, and measured journal budget
ledger. Slice 1 added closed catalog, snapshot, toolchain, action, result, receipt, cleanup, doctor, kernel
fact, ProductEvent, ProductView, and static TUI contracts. Slice 2 added tracked catalog selection and
immutable current-byte snapshot staging outside the workspace. Later slices activated the default-denied,
always-ask repository-check dispatch path. The owner approved Slice 3's exact distroless Node 24 Debian 13
OCI identities,
the image-level `/usr/local/bin/node` alias, and canonical Base64 stream fields whose lengths and hashes
cover decoded raw bytes. The one exact image publication is complete and its credential was removed;
further image publication and real provider use remain
unauthorized.

## Current truth

- The public product is English-only.
- The amended R3 Freeze packet is fixed implementation input. Fresh Build and public-first commit/push authority were granted on 2026-08-11. The deterministic and copied packaged TUI R3-A rows are green at `092f9a107e93112b401a1c9e48dcad04ff064529`; the one authorized matching real-provider row failed at an explicit `network` retry boundary. R3-A remains open, the current accepted production surface remains R2, and any new provider/network attempt requires fresh owner authority.
- The terminal product is part of the first vertical slice, not post-harness decoration.
- The runtime is TypeScript-first and event-sourced.
- The first provider is fake; the first real provider arrives after deterministic foundations.
- Eden owns its loop. External frameworks may be adapters or comparison baselines.
- The desktop goal is explicit but gated behind R4 evidence and an R5 local-service spike.
- The terminal spike is complete. ADR 0008 selects Bun and OpenTUI for the first terminal product, with the named residual platform-evidence risks accepted for R0.
- Node.js and pnpm remain the development baseline; Bun, OpenTUI, React, keymap, and native renderer types stay inside the terminal application boundary.
- TypeBox 1.x is the runtime-schema library for product contracts on TypeScript 7. Node's built-in test runner remains the initial runner; add property testing only when a concrete invariant requires it.
- The version 1 product boundary now has executable schemas, non-throwing decoders, and deterministic awaiting-approval, executing, and review fixtures. Renderer and runtime authority remain outside the contracts package.
- One fake task now traverses the deterministic kernel, JSONL journal, replay, explicit effect
  reconciliation, in-process `AgentClient`, headless NDJSON, and Bun/OpenTUI surfaces.
- A fresh exact canonical workspace now starts restricted. Runtime-owned trust is stored outside the
  workspace, can be explicitly granted or revoked, gates run creation, and never substitutes for action
  approval, network authority, or sandbox evidence.
- `run.started` owns an immutable trusted workspace snapshot, so later revocation cannot rewrite replayed
  product history. TUI and headless trust operations use the same versioned `AgentClient` boundary.
- ADR 0010 freezes exact-workspace run history, read-only historical inspection, the
  `eden run list/show --json` surface, visible corrupt-run recovery, and the pre-release
  workspace-partitioned state layout. Public run IDs use a path-safe `run-` prefix. It does not authorize
  resume.
- The approved history slice now has closed catalog/inspection contracts, workspace-partitioned run state,
  read-only journal discovery, strict headless list/show, restricted/trusted TUI history, corrupt-run
  recovery, and an R1 Quickstart. Inspection cannot approve, resume, dispatch, or change trust.
- The accepted history implementation passed its original local suites, package smoke, 100x30 product
  flow, and small-catalog 60x20 review. The R1 exit review then reproduced a blocking many-row 60x20
  viewport failure and additional contract, async, bounded-work, no-write, and redaction defects. Those
  claims now belong to the exit-closure plan; the earlier evidence is not treated as final R1 proof.
- Final local crash, renderer, standalone artifact, trust-failure, and full-workspace evidence is green.
  Hosted Ubuntu, Windows, and macOS frozen install, test, build, package, copied-artifact, and production
  PTY evidence is green in R1 run 29513232236 at
  `c95596ed231a3493e72674cb61229f2aa9089907`. All three machine-readable evidence artifacts passed their
  required rows and retained the explicit not-run support rows.
- The shared terminal packaging workflow is green on macOS 15, Ubuntu 24.04, and Windows 2025 in run
  29372727708 at `594e9f7`; historical R0 measurement versions remain frozen independently.

## Completed provider and repository-understanding execution

The accepted `docs/plans/2026-07-19-r2-provider-onboarding-repository-understanding.md` plan is complete.
Slice 0 reproduced the
unchanged R1 package and PTY surfaces, recorded the first Linux/WSL performance baseline, and closed the R2
fixture budgets under the existing journal limits. Slice 1 added strict host-side provider profiles, masked
renderer-neutral CRUD, direct-file reload and recovery, headless inspection, and onboarding at the three
frozen viewports without making a provider request.
Slice 2 is complete. The pinned official SDK, closed readiness/error projections, salted host fingerprint,
explicit possible-charge confirmation, local SSE fixtures, and TUI recovery are implemented. The real
DeepSeek V4 Pro row reached `completion_ready` after the adapter explicitly selected non-thinking mode; real
invalid-key authentication and local network-reset recovery remained closed and redacted. Kimi is
`not-run` because the owner has no subscription credential, so no Kimi support claim is made.
Slice 3 added complete root-to-leaf `AGENTS.md` snapshots, exact scope/hash/precedence/activation
provenance, deterministic P0/P1/P2 admission, and closed pre-network blocks. Restricted workspaces do not
read instructions. Trusted workspace review and TUI projections expose the context state and exact used
sources without exposing instruction content.
Slice 4 added closed `list_files` and `read_file` calls, real bounded filesystem adapters, one fake-model
tool round trip, durable tool observations, replay-only reconstruction, and requested/completed product
activity. Paths remain inside the captured workspace identity; links, binary data, invalid UTF-8 offsets,
limit overflow, cancellation, and stale workspace identity fail closed. The TUI shows complete bounded
results, source/hash/continuation provenance, and read-only authority while preserving zero write or process
authority.
Slice 5 added closed `search_repository` and `git_status` calls behind one bounded native-process port.
Search verifies the application-local ripgrep 15.0.0 asset by SHA-256 and never falls back to `PATH`; Git
status probes host Git 2.31.0 or newer and uses fixed porcelain-v2/NUL arguments with a scrubbed,
non-interactive environment. The complete Bun archive now contains `eden`, `rg`,
`THIRD_PARTY_NOTICES.txt`, and `eden-assets.json`. Local Node, Bun, copied-archive, missing-prerequisite,
pagination, zero-write, cancellation, process-tree, TUI, and full-workspace evidence is green.
Slice 6 connected the real OpenAI-compatible streamed model step to the same four closed repository tools.
The runtime owns the ordered conversation, stable attempt identities, four-step/four-tool budgets, exact or
unknown usage, one automatic retry only for proven `not_started`, explicit retry after ambiguous attempts,
and replay without provider or tool dispatch. Live deltas remain ephemeral; only closed terminal model
observations and bounded context are durable. A model answer reaches `completed` review, never verifier-
owned `succeeded`. The authorized local DeepSeek V4 Pro matching run completed one pinned-ripgrep tool round
trip and returned a sourced answer; Kimi remains `not-run`.
Slice 7 completed the conversation-centered responsive TUI integration. One focus graph owns keyboard
navigation, command palette/help, disabled and awaiting actions, and focus reconciliation across narrow,
medium, and wide layouts. The full answer remains primary; context, tool, attempt, interruption, approval,
and recovery evidence stay structured. Real Linux x64 WSL2 PTY evidence at exact public commit `8c679fd`
passed `60x20`, `80x24`, and `100x30`, rapid resize, CJK bracketed paste, missing-Git recovery, terminal
restoration, and the frozen latency gates. Earlier samples exposed cold-start scheduling variance, so the
passing record is not a cross-platform or variance-free performance claim.

- Slice 8 code candidate `0c83048`, provider-evidence head `abf5f01`, and final hosted-closure head `c9cf7d9`
  pass the complete local gate and hosted Ubuntu/macOS/Windows R1 plus R2 matrices. The reproduced copied
  archive retained the exact hosted hashes, reached DeepSeek readiness under normal TLS, completed one
  pinned-ripgrep tool round trip, and returned a sourced `completed` answer at budget 3/16. The final closure
  also retained and repaired two Windows history-driver timeouts without changing product bytes. The
  single-agent diff/spec review has no unresolved code or contract finding; the retained first provider
  failure remains visible evidence.

## Completed safe-actuation implementation slice

The accepted `docs/plans/2026-07-28-r2-safe-actuation-and-review.md` is implemented through its bounded
Slice 8 closure. One trusted-host, policy-contained, digest-approved, modify-only AnchorEdit path now
reaches attributed review and the fixed `git diff --check` template. Durable approval consumption,
dispatch ordering, base/desired/other recovery, denial narrowing, complete-or-blocked patches, HEAD drift,
and equivalent AgentClient/TUI/headless projections are covered by focused and full tests.

R2 run 30382567704 at `3c23446db471eead735a0ac971551c43ecb55759` passed frozen install, peers,
full and focused tests, typecheck, build, code and Markdown checks, Bun packaging, native archive checks,
copied-archive safe-actuation evidence, production PTY evidence, and artifact upload on Ubuntu, macOS, and
Windows. The copied archive covers approval, denial/narrower reproposal, stale concurrent bytes,
pre-existing dirty work, check failure, and narrow review in temporary real Git repositories without
provider network access. The three artifacts are `r2-acceptance-Linux-X64` (ID 8697700721, digest
`sha256:978eab5e2652fd80776dceea68fc5fbaa0acb30a64b7c20925eb3a5849254e61`),
`r2-acceptance-macOS-ARM64` (ID 8697708591, digest
`sha256:3bfaa17d9740efb28b3ab478ed7deae1c593c1be5719e8f68458c36fced55f13`), and
`r2-acceptance-Windows-X64` (ID 8697805419, digest
`sha256:fb90c1d4c864203f87d4dc61e952887376c93060172f3c6a2b458f1ce460782d`).

The slice ends in non-success `completed` review. Packaged crash-restart remains explicitly
`covered-by-real-runtime-test-not-run-in-packaged-pty`; Docker and repository-code checks remain
`not-run`. General shell, repository code execution, Docker execution, create/delete/rename, repair loops,
verifier-owned success, release support, signing, and installers remain outside this Freeze packet.

## Completed Docker Build slice

The accepted Docker repository-check packet includes ADR 0017, the 2026-07-29 decision brief, focused
PRODUCT/SPEC/architecture/event/product-contract/threat/UX/support changes, and the ordered test-first plan.
It freezes one tracked catalog, one exact always-ask check action, one immutable tracked-file snapshot, one
Eden Node 24 image, a fixed network-none/container profile, stable Docker reconciliation, bounded local
output, read-only doctor plus explicit probe, and layered platform/external-user evidence.

Slice 0 ran at exact accepted Freeze SHA `a99718f3d091fe90e031e90b6259fb0e5bdf4b49`. The maximum
action/result journal fixtures use 29,931/44,965 bytes, and the estimated complete run uses 82,622 bytes
under the unchanged 64 KiB record and 1 MiB run limits. The Bun archive, safe-actuation acceptance journey,
and `60x20`/`80x24`/`100x30` authority surfaces remain green. Docker execution, repository code, provider
network, and image publication were not requested.

Slice 1's closed contract matrices are green. They reject unknown/wider catalog and action fields,
manifest order/count/digest drift, mutable or mismatched toolchain identity, incomplete or unhashed output,
forged cleanup completion, doctor mutation authority, hidden Docker commands, run mismatch, and a
repository check projected as generic `succeeded`. The static repository-check and doctor cards preserve
the same renderer-neutral fields at `60x24`, `80x24`, and `100x24`. Kernel lifecycle facts decode but the
reducer and journal projection reject them until the later lifecycle slice; the existing host policy also
default-denies `repository_check_v1`.

Slice 2's real temporary-Git matrix is green. The runtime selects one current tracked catalog, records
clean/dirty truth and HEAD, stages only current Git-tracked regular files outside the workspace, maps index
execute bits to `0444`/`0555`, independently rehashes copied bytes, freezes directories to `0555`, and
removes only its deterministic staging tree. Untracked secret canaries remain absent. Untracked,
hardlinked, invalid-UTF8, missing, symlink/gitlink-shaped, over-count, stale-HEAD/catalog, and concurrent
source drift fail closed and leave no staging residue.

Slice 3's approved amendment pins
`gcr.io/distroless/nodejs24-debian13:nonroot` to image index
`sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212`, with exact
`linux/amd64` and `linux/arm64` base manifests recorded in the machine-readable evidence. The image
must provide `/usr/local/bin/node` as an alias to distroless `/nodejs/bin/node`; the wrapper may not
translate the frozen catalog executable. Result streams use canonical Base64 so arbitrary bytes survive
durably; byte lengths, 16 KiB limits, and SHA-256 values cover the decoded raw bytes.

The dependency-free wrapper and image-source matrices are green. Two frozen-time, provenance-disabled
local multi-platform OCI builds were byte-identical at candidate index
`sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f`.
Independent extraction verified exact nonroot config, entrypoint, alias, and wrapper bytes on both
platforms. The same byte-identical OCI candidate was later published and verified at
`ghcr.io/ai-eden/eden-node24-check@sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f`;
the display-only tag is `eden-node24-check-v1` and the package remains private.

At the initial Slice 3 checkpoint, the real-image fixture had not run. Docker Desktop 4.45.0 / Engine
28.3.3 exposed built-in seccomp and a cgroup namespace but no user-namespace remap, while the accepted
profile forbids sharing the backend host user namespace. No container was created and Build stopped rather
than weakening the profile. The owner
selected the recommended compatible-backend branch: preserve Freeze and prefer Docker Desktop Enhanced
Container Isolation, with a separate fresh `userns-remap` Docker Engine only if ECI is unavailable. WSL
2.7.10 satisfies ECI's documented WSL 2.6-or-newer prerequisite, but ECI was unavailable. The owner
selected the separate fresh `userns-remap` fallback instead of weakening Freeze or changing Docker
Desktop.

An official Docker Engine 29.6.2 static bundle started one ephemeral independent daemon with isolated
temporary state/socket paths, classic `overlay2`, no bridge/iptables/IP forwarding, and
`userns-remap=eden:eden`. It did not register a service, change Desktop, or replace the default Docker
context. A repository-independent probe proved a container-private user namespace, mapping
`0 → 100000`, numeric process user `65532:65532`, zero effective capabilities, `NoNewPrivs=1`, and
active seccomp. The real image fixture then passed under the fixed network-none/read-only/resource profile;
its arbitrary-byte Base64 streams and hashes matched independent oracles. The probe, fixture container,
and fixture staging were removed, leaving zero containers. The independent daemon and its managed
containerd were then stopped, and the exact temporary socket/data/binary/archive directory was removed.

Exact owner authority permitted the one GHCR publication and temporary registry credential. Remote
readback matched the frozen index, amd64/arm64 manifests, and configs byte-for-byte. The temporary Docker
login and temporary `write:packages` scope were removed and verified immediately after publication. The
application-owned toolchain manifest records those reviewed identities, and the accepted runner keeps
check dispatch pull-never: it never builds, pulls, imports, logs in, or installs. Real macOS Docker
Desktop, real Windows Docker Desktop WSL2, and independent external-user evidence remain optional
`not-run` rows. They cannot become platform-support evidence until exercised, but they no longer block the
R2 reference-platform milestone under ADR 0018.

The read-only Doctor now projects the same 12 closed rows through plain and JSON surfaces using only
bounded Docker version, context, info, exact-image inspect, and exact-label container-list reads. Its
failure matrix covers unavailable/malformed/timed-out Docker reads, API floor and negotiation, unsupported
backend/platform, image identity, required isolation/resources, unsafe state permissions, and bounded
orphan identity reporting. A real Docker Desktop inspection preserved pull-never behavior, found zero
exactly attributed containers, and left the missing state path absent. It truthfully blocked on the exact
image being absent from the active local store and on the backend lacking user-namespace isolation.

The explicit `eden doctor --probe-docker` surface now accepts only its frozen plain and JSON grammar,
optionally followed by `--context <safe-name>` before `--json`. A named selection is passed to every
Doctor and execution Docker call without changing the default context; raw hosts and socket paths remain
rejected. The accepted standalone amendment closes its deterministic action, approval, receipt, cleanup,
recovery, and product contracts without joining run-bound product unions.

The accepted amendment is
`docs/research/2026-07-31-r2-docker-diagnostic-probe-freeze-amendment.md`. It defines a standalone
`docker_diagnostic_probe_v1` transaction outside repository runs, reuses the `eden.action.v1` canonical
domain, and adds a dedicated always-ask policy, private bounded diagnostic journal, standalone product
command/event/view, exact labels, receipt-before-cleanup ordering, and created/running/exited recovery. It
contains no workspace, catalog, snapshot, provider, credential, repository mount, or public continuation
authority. Default Doctor and JSON preview stay zero-mutation. Closed schemas, canonical bytes, policy,
strict CLI grammar/preview, private journal/replay, fixed program, output/inspect parsers, and read-only
preflight are implemented. The owner approved both deterministic clarifications: Docker
`MemorySwap=64 MiB` means a 64 MiB total memory-plus-swap ceiling with effective swap disabled, and the
stable `effectId` is durable in the first action-prepared record before any effect intent. The production
dispatcher, exact Docker adapter, and create/start/receipt-before-cleanup runner are deterministic and
covered by focused tests. JSON preview creates no state inode, unresolved recovery performs no Docker
inspection or journal mutation, and interactive approval exits 0 only for a closed passed result with
complete cleanup. Interactive active recovery now closes proven pre-create absence as `not_started`,
adopts only an exact intent-owned created object, resumes exact created/running/exited objects without
duplicate create, applies the frozen stop-then-kill timeout path, and finishes receipt/cleanup/terminal
crash points from a durable terminal draft. Mismatched, malformed, multiple, or otherwise ambiguous state
remains fail-closed `unknown`; JSON recovery stays projection-only.

The owner authorized one real probe on a fresh independent `userns-remap` daemon and later authorized the
exact daemon/image/GHCR preparation. The clean Engine 29.6.2 surface and exact immutable image were
prepared, but the packaged production path could not bind both read-only preflight and execution to that
daemon without an unapproved raw-host, environment, wrapper, or default-context workaround. Execution
stopped before approval or container create. The daemon, image, temporary credential scope/configuration,
mount, and directory were removed. The approved safe named-context grammar and common adapter binding are
was then implemented deterministically; at that checkpoint real probe evidence was still `not-run` and
required fresh preparation.

The next authorized preparation used that named context, loaded the exact amd64 image, and stopped before
approval because the fresh `userns-remap` daemon's classic `overlay2` store exposed no local
`.Descriptor`. The owner approved a fail-closed evidence fallback: exact index RepoDigest, platform config
digest, OS/architecture, entrypoint, user, and working directory select the already frozen platform
manifest mapping only when the descriptor is absent. A present descriptor must still match directly;
malformed or contradictory evidence never falls back. Doctor and post-approval preflight now apply the
same rule without registry lookup or network. The second attempt also ended with zero containers and full
daemon/image/context/credential/scope/directory cleanup.

Slices 5-8 added the exact pull-never repository-check runner, stable state/receipt/recovery, Option A
compatibility binding and revalidation, always-ask policy and approval consumption, ordered kernel and
product lifecycle, local-only untrusted output, TUI/headless authority projection, and a dependency-free
failing fixture. The packaged driver completed initial-fail, correct-edit/pass, and wrong-edit/fail against
three distinct immutable snapshots with independent exact-image oracles, zero provider network calls,
receipt-before-cleanup ordering, zero secret-canary capture, and zero remaining containers. This was a
pre-commit local run at baseline `71e0a19`; it is not the exact-SHA hosted implementation artifact.

Focused deterministic tests, the full workspace suite, typecheck, build, code, Markdown, and diff gates
are green for the Build packet. Slice 3 evidence remains in
`docs/benchmark-results/2026-07-30-r2-docker-slice3-linux-x64.json`; the read-only Slice 4 record is
`docs/benchmark-results/2026-07-30-r2-docker-slice4-linux-x64.json`; the amendment record is
`docs/benchmark-results/2026-07-31-r2-docker-probe-freeze-amendment.json`. At exact reviewed code commit
`8c37f7939e384eaada13582a8f0ac71668eb9a98`, hosted R2 run
[`30698539397`](https://github.com/AI-Eden/eden-agent/actions/runs/30698539397) produced the passed
`r2-docker-repository-check-Linux-X64` artifact. The downloaded artifact has SHA-256
`a1cafe64fa9aa9a1c6fbe61d387645ac6d29215eea36c2caa82ce77b6598873e`; its closed evidence records the
immutable image index `sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f`,
all 12 required rows passed across the fixed initial-fail, correct-edit/pass, and wrong-edit/fail
scenarios, zero provider calls, zero duplicate executions, receipt-before-cleanup ordering, and zero
Docker objects after each scenario. Together with the accepted provider, safe-actuation, fresh Linux/WSL2
backend, and hosted cross-platform regression evidence, this closes R2 for the declared reference
platform under ADR 0018. Real macOS Docker Desktop, real Windows Docker Desktop WSL2, and independent
external-user rows remain optional `not-run` evidence. Release support remains incomplete and unclaimed.

## Known open questions

- Hosted action dependencies emit Node.js 20 deprecation annotations while GitHub forces them onto Node.js
  24; the current lanes are green, but the action-version migration remains maintenance work.
- Kimi remains `not-run` because no subscription credential is available; this is not evidence about Kimi
  compatibility and does not support a Kimi subscription claim.
- The first exact-head matching prompt failed closed as `protocol_incompatibility` and remained
  `awaiting-retry`; a second bounded run with the complete closed search argument shape passed. This retained
  variance does not support a universal provider-output reliability claim.
- The exact-head readiness and matching row passed normal TLS verification. The disabled-TLS proxy limit
  belongs only to earlier historical matching evidence and is not a release-support claim.
- Malicious same-user concurrent local-state substitution remains outside the R1 guarantee and is tracked
  in `docs/future-works/adversarial-local-state-filesystem-hardening.md`.

## Update rule

Keep this file short. Update it at the end of meaningful work so a new session can orient without treating chat history as durable memory.

# Adversarial Local-State Filesystem Hardening

- Status: Deferred architecture decision
- Recorded: 2026-07-16
- Earliest decision gate: when one of the triggers below becomes true
- Current owner decision: keep this threat outside the R1 guarantee and preserve a concrete construction
  path
- Related decisions: ADR 0007, ADR 0009, ADR 0010, ADR 0012

## Problem

Eden stores workspace trust, journals, effect receipts, and current-workspace history beneath its local
state directory. R1 treats that directory as current-user-controlled application state on an ordinary
local filesystem. It defends against malformed bytes, partial writes, direct symlinks, hardlinks at named
boundaries, resource exhaustion, path-like public identities, accidental replacement, and cooperating
Eden processes.

Those controls do not establish integrity against a malicious process running with the same operating-
system user authority. Such a process can race pathname resolution, replace a checked ancestor, create a
junction or reparse point, alter mounts, forge otherwise valid state, remove a coordination lock, or
replace an entry between identity checks. Canonicalizing or calling `lstat` before a later path-based open
cannot close every concurrent substitution window.

## R1 Guarantee and Explicit Non-Guarantee

R1 must:

- keep the state directory outside the trusted workspace;
- derive child paths from runtime-owned, path-safe identities;
- reject direct symlinks, hardlinked trust records and journals, malformed state, and identity changes
  observed at defined checkpoints;
- bound directory visits, bytes, records, line length, cumulative work, and lock wait;
- sanitize filesystem errors before they enter product values;
- serialize cooperating Eden trust mutations and run starts;
- keep history inspection free of intentional writes, reconciliation, dispatch, and approval changes.

R1 does not claim:

- authenticity or tamper evidence for trust records, journals, receipts, or timestamps;
- resistance to a malicious same-user process racing every filesystem operation;
- stable snapshot semantics while an adversarial writer changes the state tree;
- equivalent owner-only ACL behavior across local, removable, network, and synchronized filesystems;
- protection from an administrator, root process, injected code, or a compromised Eden process.

`read-only history` describes Eden's authority and behavior. It does not mean the underlying bytes are
immutable in the presence of another writer.

## Cost of Deferral

Deferral leaves several risks that grow as Eden gains authority:

1. A same-user process can forge a schema-valid trusted record and make a later start appear authorized.
2. A concurrent ancestor, symlink, junction, reparse-point, mount, or leaf replacement can redirect a
   pathname after validation.
3. Coordination locks can be deleted, forged, or held indefinitely by a same-user process.
4. A schema-valid journal can be replaced with different schema-valid history, so replay is not audit-
   grade provenance.
5. Resume, durable approvals, provider profiles, or effect reconciliation would let persisted state regain
   execution authority and increase the consequence of forgery.
6. Network, synchronized, removable, or shared state roots introduce filesystem semantics that the local
   R1 evidence does not qualify.
7. Documentation may drift into words such as `tamper-proof`, `authentic`, or `integrity-protected` unless
   the current boundary remains explicit.

The current R1 threat model remains acceptable only while persisted state controls the deterministic fake
walking skeleton and the product makes none of the stronger claims above.

R1 accepts `EDEN_STATE_DIR` as a path override, but it currently validates only that the resolved state
root is a directory outside the workspace and that the state shapes used by each operation pass their
bounded checks. The evidence qualifies a private local state root used by one OS account and cooperating
Eden processes. Group- or world-writable, network-mounted, synchronized, imported, or restored roots are
not evidence-qualified configurations, even though R1 does not proactively classify their permissions or
mount type. Allowing a path override does not add an integrity claim for that storage.

## Decision Triggers

Reopen this decision before Eden claims support or a stronger security property for any of these changes:

- malicious same-user processes become an explicit threat actor;
- group-writable, world-writable, network-mounted, synchronized, imported, or untrusted restored
  `EDEN_STATE_DIR` roots become evidence-qualified configurations;
- a daemon, local IPC service, filesystem watcher, mutable history index, or general multi-process writer
  enters the architecture;
- resume, durable approval, provider credentials, capabilities, policy, or authority-bearing effect
  recovery beyond the current deterministic-fake receipt replay trusts this persisted state;
- a release promises tamper evidence, audit-grade journal integrity, or cross-platform ACL equivalence;
- a measured incident or adversarial test demonstrates material path-substitution risk in a supported
  environment.

This work has no automatic assignment to R2 or R4. A trigger opens a fresh product, threat, and
architecture decision.

## Architecture Family A: Descriptor- or Handle-Anchored Access

Open a trusted state root once, retain its descriptor or handle, resolve each child relative to that
anchor, and perform content and metadata operations through retained object handles. Absolute paths must
not be re-opened after validation.

This descriptor-relative or handle-relative boundary is the primary construction to evaluate before Eden
makes a stronger local-state integrity claim.

### Linux

Evaluate `openat2` with `RESOLVE_BENEATH` or `RESOLVE_IN_ROOT`, `RESOLVE_NO_MAGICLINKS`, normally
`RESOLVE_NO_SYMLINKS`, and `RESOLVE_NO_XDEV` when mount crossings are outside support. `openat2` is
Linux-specific and requires a native wrapper on the current Node surface.

Primary references:

- [Linux `openat2(2)`](https://man7.org/linux/man-pages/man2/openat2.2.html)
- [Linux pathname lookup](https://www.kernel.org/doc/html/latest/filesystems/path-lookup.html)
- [Linux `unlinkat(2)`](https://man7.org/linux/man-pages/man2/unlinkat.2.html)

The spike must separately test hardlinks and destructive leaf operations. Anchoring a parent prevents
ancestor escape; it does not automatically bind a later name-based deletion to an earlier leaf inode.

### macOS

Evaluate `openat` with the available `O_NOFOLLOW_ANY`, `O_RESOLVE_BENEATH`, and `O_UNIQUE` semantics,
subject to compile-time and runtime feature probes for the minimum supported macOS version. Older targets
may require component-by-component `openat` plus `O_NOFOLLOW` traversal and a narrower support claim.

Primary references:

- [Apple XNU `open(2)` source](https://github.com/apple-oss-distributions/xnu/blob/xnu-12377.1.9/bsd/man/man2/open.2)
- [Apple `open(2)` manual](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/open.2.html)

The spike must qualify APFS, removable volumes, network filesystems, hardlinks, and mount or volume
crossings independently.

### Windows

Open the state root as a directory handle, resolve components relative to retained directory handles,
open reparse points themselves for inspection, reject unsupported tags, and compare handle-derived file
identity. Evaluate denying delete sharing while sensitive handles remain open and using handle-based
disposition for destructive operations.

Primary references:

- [Microsoft `CreateFile`](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-createfilea)
- [Microsoft `NtCreateFile`](https://learn.microsoft.com/en-us/windows/win32/api/winternl/nf-winternl-ntcreatefile)
- [Microsoft `GetFileInformationByHandleEx`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-getfileinformationbyhandleex)
- [Microsoft `FILE_ID_INFO`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/ns-winbase-file_id_info)

The spike must treat NTFS, ReFS, removable filesystems, SMB, junctions, reparse points, file-ID reuse, and
share-mode contention as separate evidence rows.

### Family A Costs

- native bindings or a narrowly scoped native helper;
- platform-specific capability detection and failure policy;
- handle lifetime, cancellation, cleanup, and contention rules;
- a TypeScript fallback or explicit unsupported-platform policy as required by ADR 0007;
- distribution, signing, and hosted test coverage for every native artifact.

## Architecture Family B: Protected Local Broker

Move authoritative state behind a narrowly scoped local service running under a different operating-
system security principal. The interactive client sends typed semantic operations and opaque identities
over authenticated local IPC. The broker owns its state root and still applies descriptor- or handle-
anchored access internally.

This family becomes preferable when the interactive user must retain write access to nearby directories,
same-user hardlink or entry substitution is in scope, exact-object destructive operations need one
cross-platform guarantee, or supported filesystems cannot provide a fail-closed Family A implementation.

Prerequisites include:

- an installer or administrator-authorized setup path;
- service lifecycle, update, uninstall, and crash recovery;
- least-privilege ownership and ACL rules;
- authenticated and authorized local IPC with no raw path operations;
- state migration and rollback policy;
- explicit non-protection from administrator/root or broker compromise.

This family aligns with the later local-service gate. It must not be pulled into R1 as an incidental
history or trust fix.

## Required Explore and Benchmark Program

Before selecting either family:

1. Freeze the attacker capabilities, sensitive operations, destructive-operation requirements, supported
   OS versions, filesystems, network shares, and administrative-install tolerance.
2. Build disposable platform spikes. Do not add `crates/eden-native` or a service package to production
   before ADR 0007's profile and benchmark gate passes.
3. Create a deterministic adversarial harness with barriers around lookup, validation, open, read, rename,
   replace, and delete. Avoid probabilistic sleep-based races.
4. Repeatedly attempt symlink, junction, reparse-point, hardlink, mount, ancestor, and leaf substitution.
   Place canaries outside the allowed root and prove they are never opened, changed, renamed, or deleted.
5. Record handle identity before and after every sensitive operation. Unsupported or ambiguous cases must
   fail closed.
6. Run the support matrix on the minimum OS and filesystem set. Record feature probes, artifact size,
   startup cost, operation latency, failure behavior, and packaging impact.
7. Compare Family A, Family B, and the current narrower threat boundary. Select a production boundary only
   through a new ADR and executable plan.

## Future Acceptance Gate

A stronger public claim is allowed only when:

- the threat actor and supported storage environments are explicit;
- every sensitive operation stays anchored to a retained descriptor or handle, or crosses authenticated
  IPC to a principal that owns the protected namespace;
- the deterministic adversarial harness passes on every supported OS/filesystem row;
- canaries outside the state root remain untouched under high-iteration and barrier-controlled attacks;
- unsupported primitives and filesystems fail closed with product-visible recovery;
- benchmarks and package evidence satisfy ADR 0007;
- an accepted ADR defines remaining limitations and supersedes this deferred record.

## Non-Goals of This Record

- authorizing native code, a daemon, IPC, an installer, or a new dependency;
- assigning the work to a roadmap release without trigger evidence;
- claiming cryptographic journal provenance, secret storage, or administrator resistance;
- weakening the R1 static-corruption, bounded-read, hardlink, identity-check, or cooperative-lock controls.

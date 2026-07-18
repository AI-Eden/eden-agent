# Provider Credential Storage Evolution

## Status

Deferred beyond the minimal R2 host-config direction. This record does not approve implementation or a
public support claim.

## Current boundary under Freeze

The R2 direction is a versioned host-side `config.toml`, stored outside the workspace, with local provider
profile and credential create, read, update, and delete. The exact schema, path, precedence, permission
checks, and product flow remain subject to the R2 plan and any required architecture decision.

Plaintext host configuration does not make secret handling optional. The minimum R2 contract must keep
credentials out of prompts, tool environments, journals, product events, TUI copy, logs, diagnostics, and
workspace-controlled files. It must provide sanitized connection errors, local deletion, safe replacement,
and fail-closed permission checks wherever the target platform can support them honestly.

R2 does not claim protection from a malicious process running as the same operating-system user. The
separate adversarial local-state record owns that stronger filesystem threat.

This record owns how credentials are stored and managed. The separate provider access and subscription
record owns which provider authentication mechanisms Eden may claim to support.

## Deferred problems

- OS-backed keychain or credential-manager integration across Windows, macOS, and Linux;
- encrypted local vaults or external secret-store integrations;
- backup, synchronization, import, export, and cross-device provider-profile behavior;
- a general migration framework for credential schema, provider renames, rotation, and legacy cleanup;
- stronger platform-specific ownership, ACL, secure-deletion, and recovery guarantees beyond the minimum
  supported local config contract;
- enterprise workload identity, hardware-backed credentials, and centrally managed provider policy.

## Cost of deferral

Environment-independent onboarding can remain less secure and less convenient than a native keychain
flow. Users must understand that a local plaintext config is accessible to their operating-system account
and may be copied by external backup or synchronization software. Eden cannot claim hardware-backed,
cross-device, enterprise-managed, or malicious-same-user credential protection.

## Decision triggers

Re-enter Explore when one of these becomes true:

- R5 begins the desktop host and keychain architecture gate;
- user evidence shows plaintext config materially blocks adoption or safe operation;
- a second provider exposes incompatible credential lifecycle requirements;
- release targets require managed identity, enterprise policy, or non-exportable credentials;
- a supported platform cannot meet the minimum R2 config permission and replacement contract.

## Viable architecture families

1. Native OS stores: Windows Credential Manager, macOS Keychain, and Linux Secret Service behind one
   host-side credential port with explicit platform support rows.
2. Encrypted local vault: a versioned encrypted store whose key source, unlock flow, recovery, and backup
   semantics are independently specified.
3. External secret providers: workload identity, environment brokers, or enterprise vault adapters that
   return short-lived credentials without placing long-lived keys in Eden state.

No family may place provider credentials in the renderer, workspace, journal, tool environment, or
diagnostic bundle.

## Required evidence before changing claims

- create, update, use, revoke, delete, corrupt-store, locked-store, and interrupted-write scenarios;
- secret canaries across prompts, journals, logs, traces, product events, diagnostics, crash reports, and
  packaged artifacts;
- platform-native permission and lifecycle evidence on every claimed operating system;
- migration and rollback evidence for every previously released credential schema;
- negative tests showing renderer, repository content, tools, and sandboxed commands cannot retrieve the
  credential;
- explicit backup, sync, recovery, and same-user threat statements in product and support documentation.

# Model-Generated General Shell

## Status

Deferred beyond the accepted R2 execution boundary. This record does not approve a general shell tool,
command grammar, sandbox claim, approval bypass, or implementation stage.

## Current R2 boundary

R2 exposes Eden-owned semantic repository tools and closed command or check templates. The model may
request a typed operation, while the runtime owns the executable, canonical argument shape, working
directory, environment policy, budgets, output parser, approval presentation, effect, and receipt.

The first read-only repository slice uses typed list, bounded-read, search, and Git-status tools. Search
uses a pinned application-local ripgrep binary. Git status uses a compatible host Git after an explicit
startup or workspace-attach probe. Missing Git produces a visible blocked prerequisite with installation
guidance and recheck; Eden does not silently fall back or mutate system packages.

R2 still delivers the `SPEC.md` commitment to policy-controlled command execution. That commitment does
not require accepting arbitrary model-authored shell text. Closed verification and command templates can
exercise exact approval, cancellation, receipts, trusted-host policy containment, and Docker isolation
without granting a general-purpose shell language.

## Deferred product problem

A mature coding agent eventually benefits from proposing commands that are not known when Eden is built.
Examples include repository-specific test runners, build systems, diagnostics, and carefully scoped
maintenance commands. A general shell can reduce tool round trips and support unfamiliar repositories,
but it also lets one model-authored string compose subprocesses, redirections, interpreters, hooks,
network clients, and filesystem effects.

Codex-like approval UX is only one layer of this problem. Approval records user authority for the exact
presented action; it does not determine whether the action stays inside an intended filesystem, process,
or network boundary. A future design must keep command policy, operating-system containment, and user
approval as separate controls and describe their guarantees separately.

## Current guarantees and non-claims

R2 guarantees only the capabilities and fixed command shapes named by its accepted plan. The runtime can
attribute their requests, approvals, effects, receipts, cancellation, and durable outcomes.

R2 does not claim that:

- a model can execute arbitrary shell commands;
- a string allowlist can prove that a command is read-only;
- user approval provides filesystem, process, or network isolation;
- trusted-host policy is equivalent to Docker or a native operating-system sandbox;
- an executable prefix rule constrains interpreters, child processes, hooks, or redirected effects;
- commands approved on one operating system have identical effects on another.

## Cost of deferral

Repositories whose build or diagnostic workflow is not represented by an R2 closed template require a
new Eden-owned template or a user-run command outside Eden. The model has less exploratory flexibility and
may require more semantic tool turns. Eden avoids making a broad command-authority promise before its
policy, runner, journal, approval, cancellation, and isolation evidence can support that promise.

## Decision triggers

Re-enter Explore when all of the following foundations exist and a concrete user story still requires a
general shell:

- R2 semantic repository tools and closed command/check templates pass their matching-surface evidence;
- trusted-host execution reports policy containment without implying isolation;
- the Docker runner passes its filesystem, process, network, cancellation, and cleanup matrix;
- exact approval presentation, durable receipts, crash recovery, and stale-action rejection are proven;
- a measured repository corpus shows closed templates are the limiting factor rather than provider,
  context, search, edit, or verification quality;
- Windows, macOS, and Linux command construction and process-tree semantics have named owners and fixtures.

## Viable architecture families

1. **Structured process request:** the model supplies an executable identity and an argument array through
   a closed schema. Eden rejects shell metacharacter interpretation and applies policy to canonical argv,
   cwd, environment, capabilities, and budgets.
2. **Shell-language request inside Docker:** the model supplies shell text only to a pinned container
   image with explicit mounts, network policy, resource budgets, process-tree ownership, and output caps.
3. **Trusted-host general shell with layered policy:** considered only with truthful non-isolation copy,
   command rules, exact approval, environment scrubbing, hook/interpreter analysis, and strong receipts.
4. **Repository-declared task catalog:** a versioned workspace file exposes named tasks whose definitions
   are reviewed separately; the model chooses a task and bounded parameters rather than writing shell text.

These families are not interchangeable. A future Explore phase must select one public authority contract
instead of combining their strongest-sounding claims.

## Required evidence before changing claims

- canonical action bytes covering executable or shell identity, argv/text, cwd, environment policy,
  mounts, network, timeout, output cap, and approval scope;
- allow, ask, deny, stale approval, changed action, rejection, cancellation, timeout, and crash-recovery
  scenarios with durable request/effect/receipt attribution;
- adversarial fixtures for compound commands, redirection, substitution, interpreters, scripts, Git hooks,
  package-manager hooks, symlinks, child processes, background processes, and network clients;
- process-tree termination and cleanup evidence after success, denial, cancellation, timeout, renderer
  failure, runtime crash, and forced host termination;
- trusted-host and Docker rows that use the same product vocabulary while preserving different isolation
  claims;
- exact TUI and headless matching surfaces showing the command, cwd, reason, scope, policy decision,
  approval state, bounded output, receipt, and recovery path;
- release-current negative evidence proving no credential, unrestricted environment, host path, or raw
  diagnostic escapes through model content, product events, journals, logs, or artifacts.

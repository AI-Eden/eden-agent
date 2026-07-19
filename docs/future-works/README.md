# Future Work

This directory records deferred engineering decisions whose risks, triggers, and evidence gates are
already understood, while their implementation stage remains intentionally unassigned.

Each topic has its own file. A future-work record must state:

- the deferred threat or product problem;
- the guarantee the current product does and does not make;
- the cost of continuing to defer the work;
- the evidence or roadmap change that triggers a new decision;
- viable architecture families and their prerequisites;
- the verification needed before a public support or security claim changes.

A future-work record is not an approved implementation plan. Moving one into Build requires fresh
Explore evidence, an accepted ADR when architecture changes, and an executable plan under `docs/plans/`.

## Topics

- [Adversarial local-state filesystem hardening](adversarial-local-state-filesystem-hardening.md):
  descriptor- or handle-anchored access and stronger state isolation against a malicious process running
  as the same operating-system user.
- [Provider credential storage evolution](provider-credential-storage-evolution.md): native keychains,
  encrypted or external secret stores, profile migration, backup and synchronization semantics, and
  stronger lifecycle guarantees beyond the minimal host-side R2 config direction.
- [Provider access and subscription evolution](provider-access-and-subscription-evolution.md): approved
  consumer-subscription OAuth, additional subscription-plan presets, provider families, and the evidence
  required before Eden expands its provider support claims.
- [Model-generated general shell](model-generated-general-shell.md): arbitrary model-authored command
  execution beyond R2 semantic tools and closed command/check templates, including the policy, approval,
  runner, isolation, and matching-surface evidence required before that authority can be exposed.
- [Durable streaming checkpoints](durable-streaming-checkpoints.md): optional preservation of visible
  partial model text across hard process or host failure, including the product evidence, journal protocol,
  and performance gates required before R2's terminal-snapshot boundary should change.

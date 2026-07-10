# Evaluation Methodology

## Principle

Measure outcomes before interpreting transcripts. Every important harness claim should map to a reproducible scenario, and every product claim should map to a user journey or quality gate.

## Scenario families

- kernel transition, replay, and crash-boundary scenarios;
- snapshot-safe edit and concurrent-drift scenarios;
- policy denial, approval digest, and recovery scenarios;
- false-completion, verifier, and repair-budget scenarios;
- context provenance and compaction-invariant scenarios;
- install, onboarding, terminal responsiveness, resume, and redaction scenarios.

## Experimental design

Keep model, prompt, tools, policy, and environment metadata explicit. Use multiple trials for stochastic systems. Report numerator and denominator, uncertainty, failures, cost, tokens, latency, and infrastructure version. Do not select only successful transcripts.

## Graders

Prefer deterministic graders for repository state, tests, policy, journal invariants, and product contracts. Use model graders only where human judgment is genuinely required, and calibrate them against labeled examples.

## Baselines and ablations

Compare against a minimal baseline harness and remove one scaffold at a time when testing a claimed improvement. Useful early experiments include AnchorEdit versus raw replacement, verifier-owned completion versus model self-report, and progressive tool disclosure versus an always-on tool catalog.

## Regression loop

Dogfood failure becomes a sanitized fixture when reproducible. The fixture captures initial state, task, allowed authority, expected evidence, and failure classification. A fix is not complete until the fixture passes and the relevant broader suite remains stable.

## Reporting

Reports must link to scenario definitions and commit identifiers. Product metrics and agent-task metrics remain separate so a benchmark improvement cannot hide a worse approval, recovery, or review experience.

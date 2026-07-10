# eden-agent

eden-agent is a product-grade, evidence-driven coding agent: a replayable TypeScript harness beneath a trustworthy terminal product and, later, a cross-platform desktop control plane.

The project is intentionally not a thin wrapper around an agent framework. Its portfolio value comes from owning and testing the difficult boundaries: event-sourced execution, snapshot-safe editing, monotonic capabilities, durable approval, verifier-owned completion, and a product interface that makes those facts legible to users.

## Status

This repository is an architecture-first scaffold at roadmap stage R0. It contains the initial product contracts, architecture decisions, package boundaries, and a tiny executable skeleton. It does not yet claim to be a usable coding agent.

## Intended product

The first complete release target is an installable terminal product:

- `eden` opens the interactive TUI;
- `eden exec --json` supports automation and evaluations;
- both surfaces drive one runtime and one journal;
- completion is backed by diff, checks, artifacts, and an Evidence Pack;
- denial, interruption, stale edits, and restart have explicit recovery paths.

Eden Studio is a later architecture-gated desktop control plane, not an embedded IDE.

## Repository map

- `apps/eden`: composition root for the TUI and headless CLI.
- `packages/contracts`: versioned product commands, events, views, and errors.
- `packages/kernel`: pure state transitions and effects; no real I/O.
- `packages/coding-runtime`: context, tools, policy, journal, goals, and verification.
- `packages/providers`: model-driver adapters.
- `packages/lab`: deterministic scenarios, replay, graders, and reports.
- `docs`: product, architecture, security, evaluation, research, and ADRs.

## Getting started

Requirements: Node.js 24 or newer and pnpm 10 or newer.

```sh
pnpm install
pnpm hooks:install
pnpm typecheck
pnpm test
pnpm markdown:check
```

The initial CLI only prints a scaffold status message. See `docs/plans/README.md` for the first real implementation plan.

## Design principles

- Trust before autonomy.
- Progress over prose.
- Review outcomes; inspect trajectories.
- Recovery is a primary flow.
- One runtime, many surfaces.
- Local by default; explicit when remote.
- Native ports require benchmark evidence.

## Contributing

Read `AGENTS.md` and `WORKFLOW.md` before making changes. Public project communication is English-only. Architecture changes require an ADR; behavior changes require tests or deterministic scenarios.

## License

Apache-2.0. See `LICENSE`.

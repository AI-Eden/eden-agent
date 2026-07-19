# eden-agent

eden-agent is a product-grade, evidence-driven coding agent: a replayable TypeScript harness beneath a trustworthy terminal product and, later, a cross-platform desktop control plane.

The project is intentionally not a thin wrapper around an agent framework. Its portfolio value comes from owning and testing the difficult boundaries: event-sourced execution, snapshot-safe editing, monotonic capabilities, durable approval, verifier-owned completion, and a product interface that makes those facts legible to users.

## Status

This repository completed roadmap stage R1 on 2026-07-17. It builds a standalone walking-skeleton terminal
artifact with explicit workspace trust, separate fake-action approval, a deterministic fake-model step and
fake task, durable JSONL replay, and current-workspace read-only run history. It is not yet a real coding
agent: the R1 runtime uses no provider credential, does not read or change repository files, executes no
real process, has no network authority, and does not resume historical execution.

R2 Build is in progress. The current public source adds host-side provider onboarding, explicit DeepSeek
readiness, scoped instruction/context admission, bounded list/read/search/Git-status tools, a verified
application-local ripgrep archive, and an Eden-owned real model/tool loop with durable attempt recovery.
A model-produced final answer ends in review as `completed`; it cannot claim verifier-owned `succeeded`.
The product still does not edit repository files, expose a shell, resume a historical run, or claim R2
release support.

## Intended product

The first complete release target is an installable terminal product:

- `eden` opens the interactive TUI;
- `eden exec --json` supports automation and evaluations;
- `eden run list --json` lists read-only history for the exact canonical workspace;
- `eden run show --json <run-id>` inspects one available run without continuing it;
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

## R1 Quickstart

Requirements: Node.js 24 or newer, Corepack, and the pnpm version frozen in `package.json`. Bun is installed
as a development dependency for the standalone package step. This repository has not published a
package-manager release or installer.

Install, verify, and build from the repository root:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm hooks:install
pnpm peers check
pnpm typecheck
pnpm test
pnpm build
pnpm code:check
pnpm markdown:check
pnpm --filter @eden/cli package:bun
```

The complete R2 application archive is the `apps/eden/dist/` directory. It contains `eden`/`eden.exe`,
`rg`/`rg.exe`, `THIRD_PARTY_NOTICES.txt`, and `eden-assets.json`. Copy all four files together to exercise
repository search; runtime does not need checkout source or `node_modules` and never falls back to a host
`rg`. A compatible host Git 2.31.0 or newer remains an explicit prerequisite for Git status.

Use a disposable workspace and state root. On Linux/macOS:

```sh
mkdir -p /tmp/eden-r1-demo/workspace /tmp/eden-r1-demo/bin
cp apps/eden/dist/eden apps/eden/dist/rg apps/eden/dist/THIRD_PARTY_NOTICES.txt \
  apps/eden/dist/eden-assets.json /tmp/eden-r1-demo/bin/
cd /tmp/eden-r1-demo/workspace
export EDEN_STATE_DIR=/tmp/eden-r1-demo/state
../bin/eden --help
../bin/eden
```

The first TUI launch is restricted. Review the exact workspace path, press `t` to trust that workspace,
press Enter to focus the task field, type a deterministic fake task, press Enter to start it, and press
`a` only after reviewing the separately presented fake action. Trust never approves the action. Press `h`
from workspace review to list current-workspace history; Enter opens an available run as `read-only
history`, and `b` returns. Historical approval cards are evidence only and expose no approval, retry,
cancel, or continuation control.

The same fake flow is available headlessly:

```sh
../bin/eden exec --json --trust-workspace --approve-fake-action "Index the fake workspace"
../bin/eden run list --json
../bin/eden run show --json run-<id-from-list>
```

`exec --json` emits one `ProductEvent` object per line. `run list --json` emits one `RunCatalog` object;
`run show --json` emits one `RunInspection` object. Both history commands are read-only and remain
available after workspace trust is revoked. They ignore the old unpartitioned pre-release development
layout and never migrate it.

In PowerShell, use `$env:EDEN_STATE_DIR = '<absolute-state-path>'` and the `.exe` artifact. The accepted
[R1 hosted evidence](https://github.com/AI-Eden/eden-agent/actions/runs/29513232236) proves the frozen install,
tests, build, package, copied-artifact smoke, and production PTY process boundary on hosted Ubuntu, Windows,
and macOS. It does not establish Terminal.app, Windows Terminal, PowerShell IME, signing, installer, or
release support.

## R2 DeepSeek matching setup

Provider credentials are host state, not repository configuration. Do not add a workspace `.env` or
`properties.env`. Export the credential under an explicit environment name, keep the value out of shell
history and captured output, and let `config.toml` store only the reference. For example:

```sh
export EDEN_DEEPSEEK_KEY='<private value>'
export EDEN_STATE_DIR=/tmp/eden-r2-state
./apps/eden/dist/eden
```

From workspace review, press `p` and save this pipe-delimited profile:

```text
deepseek-v4|https://api.deepseek.com|deepseek-v4-pro|pay_as_you_go|1000000|393216|env:EDEN_DEEPSEEK_KEY
```

`deepseek-v4-flash` is the other currently admitted DeepSeek V4 model name. Outside the editor, press `c`
and then `y` to authorize the minimal streamed readiness request, which uses the network and may incur a
small charge. `eden profile list --json` and `eden profile check --json` expose masked configuration and
readiness only. A configured active profile makes normal TUI and `eden exec --json` tasks use the real
provider loop; explicit fake-action approval retains the deterministic R1 fake path.

This setup is matching guidance, not a support or security certification. Use a private local state root;
provider secrets never belong in prompts, journals, events, diagnostics, or repository files.

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

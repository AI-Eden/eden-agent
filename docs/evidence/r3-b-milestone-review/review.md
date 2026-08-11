# R3-B Milestone Review

- Review date: 2026-08-11
- Final evidence source: `f98e8b3d87b530d46aa7e33664290a02a75ad1a5`
- Decision: R3-B is owner-accepted and closed
- Next blocking milestone: R3-C remains not started

## Decision

The accepted conversation-spine implementation, typed steering and queue contract, copied-package TUI journeys, exact product-fix R1 regression, and final-evidence R2 regression pass their declared surfaces. The owner reviewed this closure chain and authorized R3-B complete closeout on 2026-08-11. R3-B is owner-accepted and closed.

This decision closes only R3-B. It does not start R3-C, activate R3-D, authorize another provider or network call, publish a package, establish release support, or make verifier-owned `succeeded` available.

## Evidence

| Row | Exact surface | Result | Review note |
| --- | --- | --- | --- |
| Implementation and contract | Implementation candidate `9dd9e0d9fa8fa3696bfc0e25c129d0e93cb3a8c0`, retained by final evidence source `f98e8b3d87b530d46aa7e33664290a02a75ad1a5` | Passed and owner accepted | The closed steer/queue lifecycle, provider ordering, reservations, replay, persistent multiline composer, typed activity, evidence lens, urgent narrow-mode authority, responsive containment, and terminal-focus fixes are covered by focused and full-workspace tests. Later source changes hardened the active-composer escape path and acceptance driver without widening the frozen product contract. |
| Copied packaged TUI | Linux x64 copied package built from `f98e8b3d87b530d46aa7e33664290a02a75ad1a5`; `60x20`, `80x24`, and `100x30` | Passed | Every journey delivered one multiline CJK steering input and one queued follow-up in exact order, used eight model attempts, executed the six expected tools with three approvals, passed the independent repository oracle, exited zero, and restored the terminal. The wide row also passed rapid narrow-medium-wide resize. The retained machine-readable record is [`2026-08-11-r3-b-packaged-tui-local.json`](../../benchmark-results/2026-08-11-r3-b-packaged-tui-local.json). |
| Hosted R1 regression | Last product change `b0c5d0d75f761a98f96b2d48afd00a45262f63c9`, run [31498375172](https://github.com/AI-Eden/eden-agent/actions/runs/31498375172) | Passed | Ubuntu, macOS, and Windows standalone jobs passed after the active-composer escape fix. |
| Hosted R2 regression | Final evidence source `f98e8b3d87b530d46aa7e33664290a02a75ad1a5`, run [31501285574](https://github.com/AI-Eden/eden-agent/actions/runs/31501285574) | Passed | Ubuntu, macOS, Windows, and the Ubuntu Docker repository-check job passed after the retained acceptance-driver hardening. |

## Retained limits and failure history

The copied-package journeys use a deterministic local OpenAI-compatible provider fixture. They make no external network request, expose no credential canary, and end in non-success `completed`; they do not prove provider reliability or verifier-owned success. The earlier R2 workflow failures at runs 31498375115, 31500103430, and 31500719977 remain regression history rather than passing evidence. A transient Windows `node-pty` attach failure did not repeat on the unchanged source and does not establish broader platform or release support.

R3-C may begin only through its own re-entry and authority check. This review performs no R3-C Build work and does not change the accepted production claim, which remains R2 until a later release gate.

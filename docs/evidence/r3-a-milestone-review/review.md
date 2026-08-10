# R3-A Milestone Review

- Review date: 2026-08-11
- Candidate: `092f9a107e93112b401a1c9e48dcad04ff064529`
- Recommendation: do not accept or close R3-A
- Next blocking milestone: R3-B remains not started

## Decision

The deterministic R3-A candidate and copied packaged TUI journey are accepted evidence, but the required matching real-provider/network journey failed. R3-A therefore remains open at its human milestone checkpoint. `completed` remains the highest available outcome, verifier-owned `succeeded` remains unavailable, and no R3-B work is authorized by this review.

## Evidence

| Row | Exact surface | Result | Review note |
| --- | --- | --- | --- |
| Deterministic implementation | Public candidate `092f9a107e93112b401a1c9e48dcad04ff064529` | Passed and owner accepted | Full local tests, focused R3 tests, typecheck, build, code and Markdown checks, repository review, temporary-Git/process integration, replay, ProductView, and TUI contract evidence were green before matching-surface review. |
| Copied packaged TUI | Linux x64 copied package, local OpenAI-compatible fixture, `60x20`, `80x24`, and `100x30` | Passed | Each journey ended non-success `completed`, restored the terminal, passed the independent repository oracle, used 7 model attempts, 6 tool calls, and 3 action proposals, exposed no secret canary, and made no external network call. The retained machine-readable record is [`2026-08-11-r3-a-packaged-tui-local.json`](../../benchmark-results/2026-08-11-r3-a-packaged-tui-local.json). |
| Matching real provider | Linux x64 copied package, `https://api.deepseek.com`, `deepseek-v4-pro`, normal TLS, one owner-authorized attempt | Failed | The TUI stopped before terminal completion at the explicit `network` retry boundary. The runtime did not retry automatically. The acceptance driver threw `Real provider stopped at explicit retry boundary: network.` and cleaned its temporary directory without emitting a passing JSON record. This row is failed, not `not-run`, and previous R2 provider evidence cannot substitute for the R3-A coding journey. |
| Hosted R1 regression | Commit `eea4864fb9897fba6e35a32d9c4e13991518765c`, run [31427905989](https://github.com/AI-Eden/eden-agent/actions/runs/31427905989) | Passed | Ubuntu, macOS, and Windows standalone jobs passed. The later `092f9a1` acceptance-driver-only change was outside the R1 path filter. |
| Hosted R2 regression | Exact candidate `092f9a107e93112b401a1c9e48dcad04ff064529`, run [31428717990](https://github.com/AI-Eden/eden-agent/actions/runs/31428717990) | Passed | Ubuntu, macOS, Windows, and the Ubuntu Docker repository-check job all passed, including packaged safe-actuation and process evidence. |

## Required follow-up before another acceptance recommendation

Diagnose the normal-TLS provider path without weakening certificate verification, make the real-provider acceptance driver retain a sanitized failure artifact before temporary cleanup, obtain fresh owner authority for another provider/network attempt, and rerun the exact matching journey against the then-current public candidate. A deterministic or hosted-only pass cannot close this row.

This review stops at R3-A. It does not activate R3-B, R3-D, package publication, or release work.

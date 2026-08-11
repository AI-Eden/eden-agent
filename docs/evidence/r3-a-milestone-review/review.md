# R3-A Milestone Review

- Review date: 2026-08-11
- Candidate: `468c4ba0f726715c2f190b3c2842f798992e8543`
- Recommendation: accept and close R3-A
- Next blocking milestone: R3-B remains not started

## Decision

The accepted deterministic implementation, copied packaged TUI journey, exact-candidate hosted regressions, and newly authorized matching real-provider journey now pass their declared surfaces. This review recommends that the owner accept and close R3-A. The recommendation is not owner acceptance: R3-A remains at its human checkpoint and R3-B remains not started until the owner explicitly decides. `completed` remains the highest available outcome and verifier-owned `succeeded` remains unavailable.

## Evidence

| Row | Exact surface | Result | Review note |
| --- | --- | --- | --- |
| Deterministic implementation | Owner-accepted implementation candidate `092f9a107e93112b401a1c9e48dcad04ff064529`, retained by exact review candidate `468c4ba0f726715c2f190b3c2842f798992e8543` | Passed and owner accepted | Full local tests, focused R3 tests, typecheck, build, code and Markdown checks, repository review, temporary-Git/process integration, replay, ProductView, and TUI contract evidence were green. The later candidate changes only harden the acceptance driver and its CI fixture. |
| Copied packaged TUI | Linux x64 copied package, local OpenAI-compatible fixture, `60x20`, `80x24`, and `100x30` | Passed | Each journey ended non-success `completed`, restored the terminal, passed the independent repository oracle, used 7 model attempts, 6 tool calls, and 3 action proposals, exposed no secret canary, and made no external network call. The retained machine-readable record is [`2026-08-11-r3-a-packaged-tui-local.json`](../../benchmark-results/2026-08-11-r3-a-packaged-tui-local.json). |
| Matching real provider | Exact candidate `468c4ba0f726715c2f190b3c2842f798992e8543`; Linux x64 copied package; `https://api.deepseek.com`; `deepseek-v4-pro`; one owner-authorized fixture invocation | Passed | The one fixture invocation used normal TLS without forwarding `NODE_TLS_REJECT_UNAUTHORIZED`, made no automatic fixture retry, and ended non-success `completed`. All 6 model attempts reported exact usage; the expected `read_file`, `anchor_edit`, `write_file`, `run_command`, and `git_diff` sequence completed with 3 approvals, a passing independent repository oracle, terminal restoration, and no credential-canary exposure. The retained machine-readable record is [`2026-08-11-r3-a-real-provider.json`](../../benchmark-results/2026-08-11-r3-a-real-provider.json). The six model attempts are steps within this single coding journey, not six fixture retries. |
| Hosted R1 regression | Exact candidate `468c4ba0f726715c2f190b3c2842f798992e8543`, run [31432887990](https://github.com/AI-Eden/eden-agent/actions/runs/31432887990) | Passed | Ubuntu, macOS, and Windows standalone jobs passed. |
| Hosted R2 regression | Exact candidate `468c4ba0f726715c2f190b3c2842f798992e8543`, run [31432755164](https://github.com/AI-Eden/eden-agent/actions/runs/31432755164), attempt 2 | Passed | Ubuntu, macOS, Windows, and the Ubuntu Docker repository-check job all passed, including packaged safe-actuation and process evidence. Attempt 1 had a Windows `node-pty` attach failure; rerunning failed jobs passed the unchanged exact SHA. |

## Prior failure and repaired follow-up

The earlier owner-authorized attempt at `092f9a107e93112b401a1c9e48dcad04ff064529` remains a failed historical row. It stopped at the explicit `network` retry boundary without an automatic retry, and the old driver deleted its raw temporary diagnostics. The bounded repair retained sanitized future failures and removed inherited `NODE_TLS_REJECT_UNAUTHORIZED` from the copied-package environment. Exact offline findings and limitations remain in [`offline-tls-diagnosis.md`](offline-tls-diagnosis.md); the new passing row does not erase that earlier failure or establish universal provider reliability.

The owner granted one fresh matching-provider authority for exact candidate `468c4ba0f726715c2f190b3c2842f798992e8543`. That authority was consumed by the passing row above and does not authorize another provider call. The repository-external credential was not copied into either repository or the retained evidence.

This review stops at the R3-A human checkpoint. It recommends acceptance and closure but does not itself activate R3-B, R3-D, package publication, or release work.

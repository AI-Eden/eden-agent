# R2 Slice 8 Packaged Acceptance and Single-Agent Review

- Date: 2026-07-20
- Closed: 2026-07-21
- Fixed point: `978bb78f6b67f8410ad3dbbc688dfe0622f4a987`
- Reviewed code candidate: `0c83048f11df712a38960e07bfb994bac7cdcb97`
- Exact provider-evidence head: `abf5f01c154fb1bc10c41bf5c52f92f6a73ca4a3`
- Final hosted-closure head: `c9cf7d99963cb503672d90107f4ded87e8e56932`
- Review scope: 102 files, 17,580 insertions, 363 deletions
- Status: complete; automated, packaged, hosted, terminal, real-provider, and diff/spec evidence green

## Local acceptance

The final code candidate passed the complete workspace suite, the named R2 process/provider/secret/budget
suites, typecheck, build, code check, Markdown check, native archive verification, standalone smoke,
production PTY, and the controlled responsive PTY driver. The official archive order is package first and
then archive verification; an earlier invocation after the generic workspace build correctly rejected the
expanded development `dist/` tree and was not treated as a product failure.

The local Linux x64 archive contained exactly the application, pinned ripgrep, notices, and manifest. The
application SHA-256 was
`b358c67c824eaf060c7e37e6ed89c50d9015d21b98c09c20f915560bc40db117`; ripgrep 15.0.0 was
`193906679498de4d939345b937fa24e0e69a03c244bd70c859f5e41232713f21`; host Git was 2.43.0.

## Hosted exact-SHA acceptance

[R2 workflow 29746955645](https://github.com/AI-Eden/eden-agent/actions/runs/29746955645) completed at the
reviewed code candidate on Ubuntu, macOS, and Windows. Every lane passed frozen install, all workspace and
named R2 tests, typecheck, build, code and Markdown checks, complete archive packaging, native archive
verification, copied-archive smoke, production PTY, and artifact upload. Linux also passed the responsive
R2 PTY journey; non-Linux performance and responsive-layout timing remain `not-run`.

| Runner | Application SHA-256 | ripgrep SHA-256 | Git | Uploaded artifact SHA-256 | Result |
| --- | --- | --- | --- | --- | --- |
| Linux x64 | `b358c67c824eaf060c7e37e6ed89c50d9015d21b98c09c20f915560bc40db117` | `193906679498de4d939345b937fa24e0e69a03c244bd70c859f5e41232713f21` | 2.54.0 | `0ed5c4008f39b8d21f9fa613563f798d864c9eb6d885c918b0432d3662fa046d` | passed |
| macOS arm64 | `ae4dbabffb492fb85f060bce0e03ae819ecfc78cc383fda1caf2412ffe662d43` | `6ef40346bf31fcce79d9614c7745c198542925a0c7d4911e1ffe794c53392ac1` | 2.55.0 | `afdb3f2d94942e4bd4ef65488c2f390242c4ed2b5a430441cc9f53989dc94d61` | passed |
| Windows x64 | `01ca84e809f3ccdbfad349a5155264d6ee65143407237c1356da0261d1fecdac` | `f9dde63498b3193f098355dbec97af99dc4f6b8fa0df5ed04114a03012c042cb` | 2.55.0 | `18e23baf918af020a6c74872d65b50811a04e42991c97b257a8d2b7ae23a63b5` | passed |

The independent R1 workflow
[29746955376](https://github.com/AI-Eden/eden-agent/actions/runs/29746955376) also passed its full Ubuntu,
macOS, and Windows matrix at the same candidate, protecting the accepted R1 product boundary.

## Performance and terminal evidence

The exact-candidate controlled Linux x64 WSL2 record is
[`docs/benchmark-results/2026-07-20-r2-tui-linux-x64.json`](../../benchmark-results/2026-07-20-r2-tui-linux-x64.json).
All `60x20`, `80x24`, and `100x30` keyboard journeys, rapid resize, CJK bracketed paste, missing-Git
recovery, terminal restoration, and parent-shell recovery passed. Cold startup p95 was 234.82 ms against
244 ms, input-to-render p95 was 17.86 ms against 100 ms, and durable trust p95 was 50.71 ms against 357 ms.

Earlier Slice 8 samples are intentionally not rewritten: two pre-optimization controlled samples reached
248.86 ms and 338.40 ms, and one exact optimized-artifact sample reached 273.69 ms before the retained
passing run. These observations prohibit a variance-free or cross-machine performance claim.

## Provider matching status

The earlier authorized DeepSeek run `run-9369765f-6361-48b3-a257-6a90ffd98eec` remains valid supporting
Slice 6 evidence: two exact-usage streamed attempts surrounded one verified application-local ripgrep
search and ended with a sourced `completed` review answer. It predates the exact Slice 8 candidate and is
therefore not substituted for the required final-candidate matching row.

After the owner placed the credential in a private `0600` host file and renewed the request authority, the
complete archive was reproduced from public head `abf5f01`. Its application and ripgrep hashes remained
identical to the hosted candidate. The copied archive loaded only the named environment reference from a
private `0700` state root and displayed the possible-charge confirmation before the owner-authorized TUI
action. Readiness reached `completion_ready` at `2026-07-20T20:22:57.302Z` under normal TLS verification;
the earlier proxy-only disabled-TLS limitation is not inherited by this exact-head row.

The first exact-head repository run, `run-e1efa98d-15f9-4f7c-bb65-fe105def6fa4`, is retained as failure
evidence. Its initial attempt ended `unknown` with `protocol_incompatibility`, dispatched no tool, exposed
no provider body, and remained visibly `awaiting-retry`. Because R2 intentionally provides no cross-process
resume, the failed headless run was not rewritten or represented as retried.

The final bounded run, `run-06b22aa8-e5f1-49e7-ada0-c9428a553d01`, made the closed search arguments
explicit. It completed two streamed model attempts with exact usage of 1,477 and 1,921 tokens around
exactly one application-local ripgrep 15.0.0 `search_repository` call. The tool returned source paths
including `packages/coding-runtime/src/tools/index.ts`; the final 802-character answer cited that source and
ended in durable `completed` review, never `succeeded`. The owner-approved budget B projected 3 of 16
actions: two dispatched attempts plus one accepted tool call.

The closed readiness, state, journal, stdout, and stderr surfaces retained zero credential matches across
13 scanned host evidence files. Matching stderr was empty. No credential value entered the checkout,
config, journal, event, diagnostic, evidence text, or command argument. Kimi remains `not-run` because the
owner has no subscription credential, so no Kimi or release-support claim is made.

The first documentation-only closure head `0c2fea1` exposed a final hosted reliability defect without
changing the packaged application bytes. Its Windows R1 production-PTY history driver timed out waiting for
`History task 27`; a failed-job rerun repeated the same class at `History task 28`. Standalone smoke passed
both times, and the R2 matrix passed all three platforms. The retained failures showed that the evidence
driver could resend an already accepted arrow before a delayed Windows redraw, skipping the intended row.

Commit `c9cf7d9` split bounded focus cycling from acknowledged single-step history navigation. Three driver
self-tests cover delayed redraw, pre-input terminal settling, and retry only when an input produces no
terminal activity. The full packaged production-PTY journey then passed locally with the unchanged
application hash. Hosted R1 workflow
[29778816952](https://github.com/AI-Eden/eden-agent/actions/runs/29778816952) and R2 workflow
[29778816881](https://github.com/AI-Eden/eden-agent/actions/runs/29778816881) passed the exact fix on Ubuntu,
macOS, and Windows, including production PTY and artifact upload.

## Single-agent diff and spec review

The accepted plan requires one evidence-backed single-agent review. The review compared the non-empty diff
from the fixed point against `AGENTS.md`, `WORKFLOW.md`, `PRODUCT.md`, `SPEC.md`, ADR 0013, ADR 0014,
`docs/architecture.md`, `docs/threat-model.md`, and the accepted R2 plan. `git diff --check` passed. The
kernel contains no provider SDK, filesystem, or process imports; provider dialect stays in
`packages/providers`; filesystem and native process authority stay in the coding-runtime adapters. No
workspace credential file or credential value exists in the review diff.

| Severity | Finding | Repair | Result |
| --- | --- | --- | --- |
| Blocking | The legacy budget projection counted revisions and could emit `used > total`. | Owner-approved budget B counts dispatched attempts plus accepted tool calls under a 16-action ceiling; every closed projection rejects invalid summaries. | resolved in `36d8e64` |
| High | Hosted acceptance initially left portability gaps in hook resolution, PTY assertions, evidence modes, and fixture isolation. | Resolve the toolchain through Node, separate functional PTY evidence from controlled WSL timing, and isolate cross-platform fixtures. | resolved in `73b2105`, `e3dba3f`, and `7b85a7a` |
| High | Real Windows ripgrep returned native separators that violated the closed product path contract. | Normalize Windows search-result paths at the native adapter boundary and retain a platform-native regression. | resolved in `0c83048` |
| Medium | The exact candidate initially exceeded the frozen 244 ms controlled startup threshold. | Defer rare run-inspection contracts and overlap independent TUI/runtime initialization; retain failed samples and rerun the exact artifact. | resolved in `98ea7fb`; final record passed |
| Medium | The final documentation-only head repeated accepted Windows history arrows before delayed redraws, skipping the expected row. | Separate focus cycling from quiet-boundary, activity-acknowledged single-step navigation and retain delayed/ignored-input self-tests. | resolved in `c9cf7d9`; exact hosted R1/R2 passed |

No unresolved Standards or Spec finding remains, and every required DeepSeek Slice 8 row is closed. This
record does not authorize release and does not add writes, general shell, Docker execution, changed-file
review, checks, or verifier success.

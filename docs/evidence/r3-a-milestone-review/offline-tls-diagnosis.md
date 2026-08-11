# R3-A Offline TLS Diagnosis

- Date: 2026-08-11
- Scope: bounded failure-artifact and TLS-environment diagnosis after the failed R3-A matching-provider row
- Network activity: none
- Provider retry authority: not granted
- Milestone effect: superseded as the current matching row by one separately authorized passing fixture; retained as failure history

## Confirmed findings

The acceptance process inherited `NODE_TLS_REJECT_UNAUTHORIZED=0`. The previous driver copied the complete parent environment into the packaged TUI process, so its HTTPS-only base-URL check could not prove normal certificate verification. This is a harness defect even though the failed attempt still ended at the product's explicit `network` retry boundary.

The same environment had no configured `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, `NODE_EXTRA_CA_CERTS`, `NODE_USE_SYSTEM_CA`, `NODE_USE_ENV_PROXY`, `SSL_CERT_FILE`, or `SSL_CERT_DIR`. A bounded search of the user's standard shell startup files and the system environment/profile directories found no repository or shell configuration that sets `NODE_TLS_REJECT_UNAUTHORIZED`; the value is therefore session-provided or otherwise outside those inspected configuration files.

The host `/etc/ssl/certs/ca-certificates.crt` was a regular `0644` file containing 121 PEM certificates, no private key, and SHA-256 `ecd9dc38bc3efb7dbd6431f57e29d2f8d6a0f0d211e1464b3fef2cbfe266fcd2`. Node 24.15.0 reported 145 default/bundled, 363 system, and zero extra CA certificates. npm reported `strict-ssl=true` and no custom `cafile`; Git reported no global or system `http.sslCAInfo`. These are trust-store inventory facts, not proof that the copied Bun executable can reach or validate the provider.

## Repair

The real-provider acceptance driver now removes `NODE_TLS_REJECT_UNAUTHORIZED` from the child environment before spawning the copied package. Passing evidence must declare `tlsVerification=normal` and `tlsDisableEnvironmentForwarded=false`.

Every post-preflight driver failure now writes `<requested-output>.failure.json` before temporary cleanup and exits non-zero. The schema records only the exact source SHA, copied-package state, public provider origin/model/profile, whether network dispatch had begun, a closed failure kind/code/stage, a diagnostic hash, no-retry truth, platform identity, and negative safety claims. It excludes credential values, raw provider errors, and transcripts. Product retry boundaries use a typed error with a closed code rather than parsing or persisting an SDK error message.

The offline CLI test sets a credential canary and `NODE_TLS_REJECT_UNAUTHORIZED=0`, forces a pre-network missing-package failure, and proves the non-zero exit plus sanitized artifact. It also proves that the artifact and process output contain neither the credential, `ENOENT`, nor the missing source path. The existing passing-evidence mutation tests remain green.

## What remains unknown

The failed live attempt's temporary workspace and raw SDK cause were intentionally cleaned by the old driver, so offline inspection cannot distinguish DNS, egress, transparent-proxy, TCP, or TLS-handshake failure. No DNS lookup, HTTPS probe, readiness request, or provider retry was performed during this diagnosis. A future matching fixture is the only accepted way to test the repaired copied-package path, and it requires fresh owner network authority.

The owner later authorized exactly one new fixture at public candidate `468c4ba0f726715c2f190b3c2842f798992e8543`. It passed against `https://api.deepseek.com` with `deepseek-v4-pro`, retained machine-readable evidence, kept normal TLS verification, did not forward the TLS-disable variable, and made no automatic fixture retry. The updated milestone review therefore recommends accepting and closing R3-A while retaining this document and the earlier failed row as historical evidence.

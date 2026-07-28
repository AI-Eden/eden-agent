import { deepStrictEqual, throws } from "node:assert";
import { test } from "node:test";

import { validateSafeActuationEvidence } from "./r2-safe-actuation-evidence.mjs";

const hash = `sha256:${"a".repeat(64)}`;

function scenario(name) {
  const blocked = name === "deny-narrow" || name === "stale";
  return {
    approvalSurface: {
      base: true,
      digest: true,
      isolation: true,
      lifetime: true,
      network: true,
      policy: true,
      reason: true,
      scope: true,
    },
    changedFileRows: [],
    checks: [],
    fileSha256: hash,
    gitDiffSha256: hash,
    head: "b".repeat(40),
    outcome: blocked ? "blocked" : "completed",
    reviewHashes: blocked
      ? null
      : {
          eden: { byteLength: 1, content: "x", contentHash: hash, state: "complete" },
          status: hash,
          tracked: { byteLength: 1, content: "x", contentHash: hash, state: "complete" },
        },
    runId: `run-${name}`,
    status: "passed",
    transcriptSha256: hash,
    ...(blocked
      ? {}
      : {
          reviewAuthority: {
            actionDigest: "c".repeat(64),
            approval: {
              approvalId: "approval",
              expectedRevision: 1,
              proposalRevision: 1,
              state: "consumed",
            },
            executionMode: "trusted_host_policy_only",
            isolation: "none",
            network: "not_requested",
            policy: {
              decision: "ask",
              evaluatedAt: "2026-07-28T00:00:00.000Z",
              reason: "fixture",
              ruleId: "rule",
              ruleSetRevision: "revision",
            },
            residualRisk: "No verifier success.",
          },
        }),
  };
}

const valid = {
  archive: {
    applicationHash: hash,
    harnessHash: hash,
    noticesHash: hash,
    ripgrepHash: hash,
    sourceDirectory: "dist",
    sourceTreeRequiredAtRuntime: false,
  },
  execution: {
    isolation: "none",
    mode: "trusted_host_policy_only",
    network: "not_requested",
    verifierSuccessClaimed: false,
  },
  platform: { architecture: "x64", os: "linux" },
  provider: { credential: "non-secret-fixture-only", externalNetwork: "not_requested" },
  rows: {
    crashRecovery: "covered-by-real-runtime-test-not-run-in-packaged-pty",
    docker: "not-run",
    repositoryCodeChecks: "not-run",
  },
  scenarios: Object.fromEntries(
    ["approve", "deny-narrow", "stale", "pre-existing", "check-failure", "narrow-review"].map(
      (name) => [name, scenario(name)],
    ),
  ),
  sourceSha: "d".repeat(40),
  status: "passed",
};

test("safe-actuation evidence retains every authority, review, and not-run row", () => {
  deepStrictEqual(validateSafeActuationEvidence(valid), valid);
});

test("safe-actuation evidence rejects missing rows, stale hashes, and success claims", () => {
  for (const invalid of [
    { ...valid, scenarios: { ...valid.scenarios, approve: undefined } },
    { ...valid, archive: { ...valid.archive, applicationHash: "stale" } },
    { ...valid, execution: { ...valid.execution, verifierSuccessClaimed: true } },
    { ...valid, rows: { ...valid.rows, docker: "passed" } },
    {
      ...valid,
      scenarios: {
        ...valid.scenarios,
        approve: { ...valid.scenarios.approve, reviewHashes: null },
      },
    },
  ]) {
    throws(() => validateSafeActuationEvidence(invalid));
  }
});

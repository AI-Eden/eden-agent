import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("R3 real-provider evidence rejects fake, secret-bearing, or incomplete results", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/r3-real-provider-acceptance.mjs", "--self-test"],
    { encoding: "utf8" },
  );
  strictEqual(result.status, 0, result.stderr || result.stdout);
});

test("R3 real-provider failure writes a sanitized artifact before cleanup", () => {
  const directory = mkdtempSync(join(tmpdir(), "eden-r3-real-provider-failure-test-"));
  const output = join(directory, "evidence.json");
  const credential = "SECRET_CANARY_R3_FAILURE_ARTIFACT";
  try {
    const result = spawnSync(
      process.execPath,
      [
        "scripts/r3-real-provider-acceptance.mjs",
        join(directory, "missing-package"),
        output,
        "a".repeat(40),
        "https://api.deepseek.com",
        "deepseek-v4-pro",
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          EDEN_R3_REAL_PROVIDER_KEY: credential,
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
        },
      },
    );
    strictEqual(result.status, 1, result.stderr || result.stdout);
    const serialized = readFileSync(`${output}.failure.json`, "utf8");
    const evidence = JSON.parse(serialized);
    strictEqual(evidence.status, "failed");
    strictEqual(evidence.sourceSha, "a".repeat(40));
    strictEqual(evidence.failure.kind, "acceptance_harness");
    strictEqual(evidence.failure.stage, "package_copy");
    strictEqual(evidence.failure.code, "harness_error");
    strictEqual(evidence.failure.retryPerformed, false);
    strictEqual(evidence.provider.tlsVerification, "normal");
    strictEqual(evidence.safety.credentialIncluded, false);
    strictEqual(evidence.safety.rawProviderErrorIncluded, false);
    strictEqual(evidence.safety.tlsDisableEnvironmentForwarded, false);
    strictEqual(evidence.safety.transcriptIncluded, false);
    strictEqual(serialized.includes(credential), false);
    strictEqual(serialized.includes("ENOENT"), false);
    strictEqual(serialized.includes("missing-package"), false);
    strictEqual(`${result.stdout}${result.stderr}`.includes(credential), false);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

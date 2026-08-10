import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("R3 real-provider evidence rejects fake, secret-bearing, or incomplete results", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/r3-real-provider-acceptance.mjs", "--self-test"],
    { encoding: "utf8" },
  );
  strictEqual(result.status, 0, result.stderr || result.stdout);
});

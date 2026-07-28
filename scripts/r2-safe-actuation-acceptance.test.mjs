import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("safe-actuation acceptance uses a shell-independent package-manager invocation", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/r2-safe-actuation-acceptance.mjs", "--self-test"],
    {
      encoding: "utf8",
    },
  );
  strictEqual(result.status, 0, result.stderr || result.stdout);
});

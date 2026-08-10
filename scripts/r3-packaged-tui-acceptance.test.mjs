import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("R3 packaged TUI evidence rejects incomplete or overclaimed journeys", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/r3-packaged-tui-acceptance.mjs", "--self-test"],
    { encoding: "utf8" },
  );
  strictEqual(result.status, 0, result.stderr || result.stdout);
});

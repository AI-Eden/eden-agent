import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

test("R2 PTY evidence rejects missing surfaces and latency regressions", () => {
  const result = spawnSync(process.execPath, ["scripts/r2-tui-pty.mjs", "--self-test"], {
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
});

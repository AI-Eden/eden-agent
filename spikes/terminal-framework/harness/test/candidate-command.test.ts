import assert from "node:assert/strict";
import { it } from "node:test";
import { resolveBunExecutable } from "../src/candidate-command.ts";

it("resolves the native Bun executable instead of a Windows command shim", () => {
  assert.equal(
    resolveBunExecutable("C:\\repo\\ink", "win32"),
    "C:\\repo\\ink/node_modules/bun/bin/bun.exe",
  );
  assert.equal(resolveBunExecutable("/repo/ink", "linux"), "/repo/ink/node_modules/.bin/bun");
});

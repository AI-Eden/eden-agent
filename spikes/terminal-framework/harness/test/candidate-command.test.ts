import assert from "node:assert/strict";
import { posix, win32 } from "node:path";
import { it } from "node:test";
import { resolveBunExecutable } from "../src/candidate-command.ts";

it("resolves the native Bun executable instead of a Windows command shim", () => {
  assert.equal(
    resolveBunExecutable("C:\\repo\\ink", "win32"),
    win32.join("C:\\repo\\ink", "node_modules", "bun", "bin", "bun.exe"),
  );
  assert.equal(
    resolveBunExecutable("/repo/ink", "linux"),
    posix.join("/repo/ink", "node_modules", ".bin", "bun"),
  );
});

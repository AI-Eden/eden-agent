import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { it } from "node:test";
import { captureTerminalModeFingerprint } from "../src/terminal-mode.ts";

it("captures Windows console mode through inherited PTY handles", () => {
  // Given a Windows PTY whose child must retain console-backed standard handles.
  const invocations: Array<{
    arguments: readonly string[];
    command: string;
    snapshotPath: string;
    stdio: readonly string[];
  }> = [];

  // When the probe captures the console mode through PowerShell.
  const fingerprint = captureTerminalModeFingerprint("win32", (command, arguments_, options) => {
    const snapshotPath = options.env.EDEN_CONSOLE_MODE_PATH;
    assert.ok(snapshotPath !== undefined);
    writeFileSync(snapshotPath, "3:7\n", "utf8");
    invocations.push({ command, arguments: arguments_, snapshotPath, stdio: options.stdio });
    return { error: undefined, status: 0, stderr: "", stdout: "" };
  });

  // Then PowerShell reads its inherited ConPTY handles and the temporary evidence is removed.
  assert.match(fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(invocations[0]?.command, "powershell.exe");
  assert.match(invocations[0]?.arguments.at(-1) ?? "", /GetStdHandle/u);
  assert.deepEqual(invocations[0]?.stdio, ["inherit", "inherit", "pipe"]);
  assert.equal(existsSync(invocations[0]?.snapshotPath ?? "missing"), false);
});

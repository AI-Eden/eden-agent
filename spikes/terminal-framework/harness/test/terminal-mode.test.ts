import assert from "node:assert/strict";
import { it } from "node:test";
import { captureTerminalModeFingerprint } from "../src/terminal-mode.ts";

it("captures Windows console devices without inheriting redirected standard handles", () => {
  // Given a Windows PTY whose test runner redirects standard output.
  const invocations: Array<{
    arguments: readonly string[];
    command: string;
    stdio: readonly string[];
  }> = [];

  // When the probe captures the console mode through PowerShell.
  const fingerprint = captureTerminalModeFingerprint("win32", (command, arguments_, options) => {
    invocations.push({ command, arguments: arguments_, stdio: options.stdio });
    return { error: undefined, status: 0, stderr: "", stdout: "3:7\n" };
  });

  // Then the script opens the console devices directly and cannot block on PTY stdin.
  assert.match(fingerprint, /^[a-f0-9]{64}$/u);
  assert.equal(invocations[0]?.command, "powershell.exe");
  assert.match(invocations[0]?.arguments.at(-1) ?? "", /CONIN\$/u);
  assert.match(invocations[0]?.arguments.at(-1) ?? "", /CONOUT\$/u);
  assert.equal(
    invocations[0]?.arguments.at(-1)?.match(/TryRead\('[^']+', 2147483648/gu)?.length,
    2,
  );
  assert.deepEqual(invocations[0]?.stdio, ["ignore", "pipe", "pipe"]);
});

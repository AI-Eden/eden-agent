import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createShellSession } from "../src/shell-session.ts";

describe("parent shell session", () => {
  it("keeps a POSIX shell alive until it answers the unique challenge", () => {
    const session = createShellSession({
      candidateId: "ink-node",
      challenge: "abc123",
      nodeExecutable: "/path with spaces/node",
      platform: "linux",
      probePath: "/repo/harness/probe.ts",
      scenario: "primary",
    });

    assert.equal(session.command, "/bin/sh");
    assert.equal(session.arguments[0], "-c");
    assert.match(session.arguments[1] ?? "", /IFS= read -r eden_challenge/u);
    assert.equal(session.challengeInput, "abc123\n");
    assert.equal(session.expectedResponse, "EDEN_TUI_RESTORED_abc123");
    assert.equal(session.readyMarker, "__EDEN_PARENT_SHELL_READY__");
  });

  it("keeps cmd alive until it answers the unique challenge", () => {
    const session = createShellSession({
      candidateId: "ink-bun",
      challenge: "def456",
      commandInterpreter: "C:\\Windows\\System32\\cmd.exe",
      nodeExecutable: "C:\\Program Files\\nodejs\\node.exe",
      platform: "win32",
      probePath: "C:\\repo\\harness\\probe.ts",
      scenario: "cancel",
    });

    assert.equal(session.command, "C:\\Windows\\System32\\cmd.exe");
    assert.deepEqual(session.arguments.slice(0, 5), ["/D", "/Q", "/V:ON", "/S", "/C"]);
    assert.match(session.arguments[5] ?? "", /set \/p "eden_challenge="/u);
    assert.equal(session.challengeInput, "def456\r");
    assert.equal(session.expectedResponse, "EDEN_TUI_RESTORED_def456");
    assert.equal(session.readyMarker, "__EDEN_PARENT_SHELL_READY__");
  });
});

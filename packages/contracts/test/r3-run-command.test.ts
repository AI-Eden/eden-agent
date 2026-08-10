import { strictEqual } from "node:assert";
import { test } from "node:test";

import { decodeRepositoryToolCall, decodeRepositoryToolResult } from "../src/index.ts";

const hash = (character: string) => `sha256:${character.repeat(64)}`;

const call = {
  arguments: {
    args: ["--version"],
    cwd: ".",
    network: "host_unrestricted",
    program: "node",
    reason: "Verify the repository runtime.",
    timeoutMs: 5_000,
  },
  name: "run_command",
  toolCallId: "call-command",
} as const;

test("run-command calls reject shell, environment, stdin, path escape, and implicit authority", () => {
  strictEqual(decodeRepositoryToolCall(call).ok, true);

  for (const hostile of [
    { ...call, arguments: { ...call.arguments, command: "node --version" } },
    { ...call, arguments: { ...call.arguments, env: { TOKEN: "secret" } } },
    { ...call, arguments: { ...call.arguments, stdin: "yes" } },
    { ...call, arguments: { ...call.arguments, program: "/usr/bin/node" } },
    { ...call, arguments: { ...call.arguments, cwd: "../outside" } },
    { ...call, arguments: { ...call.arguments, args: ["bad\0argument"] } },
    { ...call, arguments: { ...call.arguments, network: "none" } },
  ]) {
    strictEqual(decodeRepositoryToolCall(hostile).ok, false);
  }
});

test("run-command results bind split UTF-8 output, byte counts, timing, and outcome", () => {
  const result = {
    data: {
      actionId: "action-command",
      cleanupStatus: "complete",
      completedAt: "2026-08-11T00:00:01.000Z",
      cwd: ".",
      executablePath: "/usr/bin/node",
      exitCode: 0,
      outcome: "exited",
      startedAt: "2026-08-11T00:00:00.000Z",
      stderr: "警告\n",
      stderrBytes: 7,
      stderrSha256: hash("a"),
      stdout: "ok\n",
      stdoutBytes: 3,
      stdoutSha256: hash("b"),
    },
    name: "run_command",
    status: "completed",
    toolCallId: "call-command",
  } as const;
  strictEqual(decodeRepositoryToolResult(result).ok, true);
  strictEqual(
    decodeRepositoryToolResult({ ...result, data: { ...result.data, stdoutBytes: 2 } }).ok,
    false,
  );
  strictEqual(
    decodeRepositoryToolResult({ ...result, data: { ...result.data, outcome: "timed_out" } }).ok,
    false,
  );
  strictEqual(
    decodeRepositoryToolResult({
      ...result,
      data: {
        ...result.data,
        completedAt: "2026-08-10T23:59:59.000Z",
      },
    }).ok,
    false,
  );
});

import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { NativeProcessRunner, terminateNativeProcessTree } from "../src/native-process.ts";

function request(code: string, overrides: Record<string, unknown> = {}) {
  return {
    arguments: ["-e", code],
    cwd: process.cwd(),
    environment: { EDEN_FIXED: "yes" },
    executable: process.execPath,
    maxStderrBytes: 1_024,
    maxStdoutBytes: 1_024,
    timeoutMs: 5_000,
    ...overrides,
  };
}

test("the native runner uses exact argv/env and returns bounded semantic status", async () => {
  const runner = new NativeProcessRunner();
  const result = await runner.run(
    request(
      "process.stdout.write(JSON.stringify({argv:process.argv.slice(1),fixed:process.env.EDEN_FIXED,secret:process.env.SECRET_NATIVE_CANARY??null}))",
    ),
  );

  assert.equal(result.status, "exited");
  if (result.status !== "exited") return;
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(result.stdout)), {
    argv: [],
    fixed: "yes",
    secret: null,
  });
  assert.equal(result.stderr.byteLength, 0);
});

test("the native runner fails closed on stdout overflow, timeout, cancel, and spawn failure", async () => {
  const runner = new NativeProcessRunner();
  assert.equal(
    (await runner.run(request("process.stdout.write('x'.repeat(2048))"))).status,
    "output-overflow",
  );
  assert.equal(
    (
      await runner.run(
        request("setInterval(()=>{},1000)", {
          timeoutMs: 20,
        }),
      )
    ).status,
    "timed-out",
  );
  const controller = new AbortController();
  const pending = runner.run(request("setInterval(()=>{},1000)"), controller.signal);
  controller.abort();
  assert.equal((await pending).status, "aborted");
  assert.equal(
    (
      await runner.run(
        request("", {
          cwd: await mkdtemp(join(tmpdir(), "eden-native-missing-")),
          executable: join(tmpdir(), "eden-command-that-does-not-exist"),
        }),
      )
    ).status,
    "spawn-failed",
  );
});

test("timeout terminates the complete native process group", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-native-tree-"));
  const marker = join(root, "grandchild-survived");
  const grandchild = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'bad'),200)`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000)`;

  const result = await new NativeProcessRunner().run(request(parent, { timeoutMs: 20 }));
  assert.equal(result.status, "timed-out");
  await new Promise((resolve) => setTimeout(resolve, 300));
  await assert.rejects(access(marker));
});

test("Windows cleanup uses bounded taskkill and fails closed when descendants may survive", () => {
  let command = "";
  let arguments_: readonly string[] = [];
  let timeout = 0;
  let directKills = 0;
  const child = {
    kill: () => {
      directKills += 1;
      return true;
    },
    pid: 321,
  };
  const failed = terminateNativeProcessTree(
    child,
    "win32",
    (nextCommand, nextArguments, options) => {
      command = nextCommand;
      arguments_ = nextArguments;
      timeout = options.timeout;
      return { status: 1 };
    },
    () => true,
  );

  assert.equal(command.endsWith("taskkill.exe"), true);
  assert.deepEqual(arguments_, ["/PID", "321", "/T", "/F"]);
  assert.equal(timeout, 5_000);
  assert.equal(failed, false);
  assert.equal(directKills, 1);
});

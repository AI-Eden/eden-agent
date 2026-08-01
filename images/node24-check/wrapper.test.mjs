import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, test } from "node:test";

import { decodeWrapperRequest, runRepositoryCheck, writeInternalResult } from "./wrapper.mjs";

const workspaces = [];
const fixedDigest = (character) => `sha256:${character.repeat(64)}`;
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

async function workspace() {
  const path = await mkdtemp(join(tmpdir(), "eden-wrapper-test-"));
  workspaces.push(path);
  return path;
}

function request(processArguments, overrides = {}) {
  return {
    actionId: "action-repository-check-1",
    budgets: {
      stderrBytes: 16_384,
      stdoutBytes: 16_384,
      stopGraceMs: 2_000,
      timeoutMs: 30_000,
    },
    checkName: "test",
    effectId: "effect-repository-check-1",
    inputManifestDigest: fixedDigest("1"),
    process: {
      arguments: processArguments,
      cwd: ".",
      executable: process.execPath,
    },
    requestVersion: 1,
    wrapperProtocolVersion: 1,
    ...overrides,
  };
}

function result(overrides = {}) {
  const stdout = Buffer.from("ok");
  const stderr = Buffer.alloc(0);
  return {
    actionId: "action-repository-check-1",
    checkName: "test",
    effectId: "effect-repository-check-1",
    endedAt: "2026-07-30T00:00:01.000Z",
    exitCode: 0,
    inputManifestDigest: fixedDigest("1"),
    outcome: "passed",
    resultVersion: 1,
    startedAt: "2026-07-30T00:00:00.000Z",
    stderr: stderr.toString("base64"),
    stderrByteLength: stderr.byteLength,
    stderrEncoding: "base64",
    stderrSha256: hash(stderr),
    stdout: stdout.toString("base64"),
    stdoutByteLength: stdout.byteLength,
    stdoutEncoding: "base64",
    stdoutSha256: hash(stdout),
    wrapperProtocolVersion: 1,
    wrapperReason: "process_exited",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(workspaces.splice(0).map((path) => rm(path, { force: true, recursive: true })));
});

describe("Eden Node 24 repository-check wrapper", () => {
  test("accepts only the closed literal request and never accepts shell authority", () => {
    const value = request(["--version"], {
      process: {
        arguments: ["--version"],
        cwd: ".",
        executable: "/usr/local/bin/node",
      },
    });
    deepStrictEqual(decodeWrapperRequest(value), value);
    for (const invalid of [
      { ...value, shell: true },
      { ...value, requestVersion: 2 },
      { ...value, wrapperProtocolVersion: 2 },
      { ...value, budgets: { ...value.budgets, timeoutMs: 1 } },
      { ...value, process: { ...value.process, executable: "node" } },
      {
        ...value,
        process: { ...value.process, executable: "C:\\Program Files\\nodejs\\node.exe" },
      },
      { ...value, process: { ...value.process, cwd: "../outside" } },
      { ...value, process: { ...value.process, arguments: ["has\u0000nul"] } },
    ]) {
      strictEqual(decodeWrapperRequest(invalid), null);
    }
  });

  const posixTest = process.platform === "win32" ? test.skip : test;

  posixTest("preserves arbitrary stdout and stderr bytes as canonical Base64", async () => {
    const root = await workspace();
    const stdout = Uint8Array.of(0xff, 0x00, 0x80, 0x0a);
    const stderr = Uint8Array.of(0xfe, 0x01, 0x81);
    const result = await runRepositoryCheck(
      request([
        "-e",
        `process.stdout.write(Buffer.from([${stdout.join(",")}]));process.stderr.write(Buffer.from([${stderr.join(",")}]))`,
      ]),
      { workspaceRoot: root },
    );

    strictEqual(result.outcome, "passed");
    strictEqual(result.wrapperReason, "process_exited");
    strictEqual(result.exitCode, 0);
    strictEqual(result.stdout, Buffer.from(stdout).toString("base64"));
    strictEqual(result.stderr, Buffer.from(stderr).toString("base64"));
    strictEqual(result.stdoutEncoding, "base64");
    strictEqual(result.stderrEncoding, "base64");
    strictEqual(result.stdoutByteLength, stdout.byteLength);
    strictEqual(result.stderrByteLength, stderr.byteLength);
    strictEqual(result.stdoutSha256, hash(stdout));
    strictEqual(result.stderrSha256, hash(stderr));
  });

  posixTest("accepts the exact stream boundary and fails closed on one-byte overflow", async () => {
    const root = await workspace();
    const exact = await runRepositoryCheck(
      request(["-e", "process.stdout.write(Buffer.alloc(16384, 120))"]),
      { workspaceRoot: root },
    );
    strictEqual(exact.outcome, "passed");
    strictEqual(exact.stdoutByteLength, 16_384);

    const overflow = await runRepositoryCheck(
      request(["-e", "process.stdout.write(Buffer.alloc(16385, 120))"]),
      { workspaceRoot: root },
    );
    strictEqual(overflow.outcome, "output_overflow");
    strictEqual(overflow.wrapperReason, "stdout_overflow");
    strictEqual(overflow.exitCode, null);
    strictEqual(overflow.stdout, "");
    strictEqual(overflow.stderr, "");
    strictEqual(overflow.stdoutByteLength, 0);
    strictEqual(overflow.stderrByteLength, 0);
  });

  posixTest("distinguishes check failure, timeout, and cancellation", async () => {
    const root = await workspace();
    const failed = await runRepositoryCheck(request(["-e", "process.exit(7)"]), {
      workspaceRoot: root,
    });
    strictEqual(failed.outcome, "failed");
    strictEqual(failed.exitCode, 7);

    const timedOut = await runRepositoryCheck(request(["-e", "setInterval(() => {}, 1000)"]), {
      stopGraceMs: 20,
      timeoutMs: 20,
      workspaceRoot: root,
    });
    strictEqual(timedOut.outcome, "timed_out");
    strictEqual(timedOut.wrapperReason, "wall_clock_exceeded");

    const controller = new AbortController();
    const cancelledPromise = runRepositoryCheck(request(["-e", "setInterval(() => {}, 1000)"]), {
      signal: controller.signal,
      stopGraceMs: 20,
      workspaceRoot: root,
    });
    controller.abort();
    const cancelled = await cancelledPromise;
    strictEqual(cancelled.outcome, "cancelled");
    strictEqual(cancelled.wrapperReason, "cancel_requested");
  });

  posixTest("terminates the owned child process group after the fixed grace", async () => {
    const root = await workspace();
    const source = [
      "const{spawn:s}=require('child_process'),{writeFileSync:w}=require('fs')",
      "const c=s(process.execPath,['-e','process.on(\"SIGTERM\",()=>{});setInterval(()=>{},1e3)'])",
      "w('grandchild.pid',''+c.pid)",
      "process.on('SIGTERM',()=>{})",
      "setInterval(()=>{},1e3)",
    ].join(";");
    const result = await runRepositoryCheck(request(["-e", source]), {
      stopGraceMs: 20,
      timeoutMs: 100,
      workspaceRoot: root,
    });
    strictEqual(result.outcome, "timed_out");
    const grandchildPid = Number(await readFile(join(root, "grandchild.pid"), "utf8"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await rejects(
      async () => process.kill(grandchildPid, 0),
      (error) => error?.code === "ESRCH",
    );
  });

  test("writes one bounded closed internal result without executing repository code", async () => {
    const root = await workspace();
    const path = join(root, "result.json");
    await writeFile(path, "");
    const value = result();
    await writeInternalResult(path, value);
    const bytes = await readFile(path);
    strictEqual(bytes.byteLength <= 65_536, true);
    deepStrictEqual(JSON.parse(bytes.toString("utf8")), value);
    await rejects(() =>
      writeInternalResult(join(root, "invalid.json"), { ...value, unexpected: true }),
    );
  });
});

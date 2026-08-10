import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";

import type { NativeProcessPort } from "../src/native-process.ts";
import { RunCommandError, RunCommandService } from "../src/run-command.ts";

function canonicalRootHash(root: string): string {
  return `sha256:${createHash("sha256").update(`eden-canonical-root-v1\0${root}`).digest("hex")}`;
}

async function fixture(nativeProcess?: NativeProcessPort) {
  const root = await mkdtemp(join(tmpdir(), "eden-run-command-"));
  await mkdir(join(root, "sub"));
  const service = new RunCommandService({
    ...(nativeProcess === undefined ? {} : { nativeProcess }),
    now: (() => {
      let tick = 0;
      return () => `2026-08-11T00:00:0${tick++}.000Z`;
    })(),
    path: dirname(process.execPath),
    workspaceRoot: root,
  });
  return { root, service };
}

async function prepare(
  service: RunCommandService,
  root: string,
  overrides: Record<string, unknown> = {},
) {
  return service.prepare({
    actionId: "action-command",
    args: ["--version"],
    canonicalRootHash: canonicalRootHash(root),
    cwd: ".",
    network: "host_unrestricted",
    program: basename(process.execPath),
    proposalRevision: 1,
    reason: "Verify the repository runtime.",
    runId: "run-command",
    timeoutMs: 5_000,
    workspaceId: "workspace-command",
    ...overrides,
  });
}

describe("approved structured run command", () => {
  it("uses exact argv without a shell and durably separates stdout from stderr", async () => {
    const { root, service } = await fixture();
    const sentinel = join(root, "shell-injection");
    const envelope = await prepare(service, root, {
      args: [
        "-e",
        "process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write('warn')",
        `;touch ${sentinel}`,
      ],
    });
    const output: { content: string; index: number; stream: "stderr" | "stdout" }[] = [];
    let dispatches = 0;
    const observed = await service.execute(
      envelope,
      async (item) => {
        output.push(item);
      },
      async () => {
        dispatches += 1;
      },
    );

    assert.equal(dispatches, 1);
    assert.equal(observed.outcome, "exited");
    assert.equal(observed.exitCode, 0);
    assert.deepEqual(output, [
      { content: JSON.stringify([`;touch ${sentinel}`]), index: 0, stream: "stdout" },
      { content: "warn", index: 0, stream: "stderr" },
    ]);
    await assert.rejects(access(sentinel));
  });

  it("fails closed on linked or outside cwd and stale executable identity", async () => {
    const { root, service } = await fixture();
    await symlink(join(root, "sub"), join(root, "linked"), "dir");
    await assert.rejects(
      prepare(service, root, { cwd: "linked" }),
      (error) =>
        error instanceof RunCommandError && error.productError.code === "command_cwd_invalid",
    );
    await assert.rejects(
      prepare(service, root, { cwd: "../outside" }),
      (error) =>
        error instanceof RunCommandError &&
        error.productError.code === "command_cwd_outside_workspace",
    );

    const executableDirectory = await mkdtemp(join(tmpdir(), "eden-command-bin-"));
    const executable = join(executableDirectory, "eden-node");
    await copyFile(process.execPath, executable);
    const custom = new RunCommandService({ path: executableDirectory, workspaceRoot: root });
    const envelope = await custom.prepare({
      actionId: "action-stale",
      args: [],
      canonicalRootHash: canonicalRootHash(root),
      cwd: ".",
      network: "host_unrestricted",
      program: "eden-node",
      proposalRevision: 1,
      reason: "Prove executable identity binding.",
      runId: "run-command",
      timeoutMs: 5_000,
      workspaceId: "workspace-command",
    });
    await writeFile(executable, "changed");
    await assert.rejects(
      custom.execute(
        envelope,
        async () => undefined,
        async () => undefined,
      ),
      (error) =>
        error instanceof RunCommandError && error.productError.code === "command_executable_stale",
    );
  });

  it("closes overflow and malformed UTF-8 as bounded semantic outcomes", async () => {
    for (const [nativeObservation, expected] of [
      [{ status: "output-overflow" as const }, "output_overflow"],
      [
        {
          exitCode: 0,
          status: "exited" as const,
          stderr: new Uint8Array(),
          stdout: new Uint8Array([0xff]),
        },
        "invalid_output",
      ],
    ] as const) {
      const nativeProcess: NativeProcessPort = { run: async () => nativeObservation };
      const { root, service } = await fixture(nativeProcess);
      const envelope = await prepare(service, root);
      const output: unknown[] = [];
      const observed = await service.execute(
        envelope,
        async (item) => {
          output.push(item);
        },
        async () => undefined,
      );
      assert.equal(observed.outcome, expected);
      assert.deepEqual(output, []);
      assert.equal(observed.stdoutBytes, 0);
      assert.equal(observed.stderrBytes, 0);
    }
  });

  it("preserves real non-zero exit, timeout, cancellation, and resolution failure", async () => {
    const { root, service } = await fixture();
    const nonZero = await prepare(service, root, {
      args: ["-e", "process.stderr.write('failed');process.exit(7)"],
    });
    const nonZeroOutput: string[] = [];
    const exited = await service.execute(
      nonZero,
      async (item) => {
        nonZeroOutput.push(`${item.stream}:${item.content}`);
      },
      async () => undefined,
    );
    assert.equal(exited.outcome, "exited");
    assert.equal(exited.exitCode, 7);
    assert.deepEqual(nonZeroOutput, ["stderr:failed"]);

    const timed = await prepare(service, root, {
      args: ["-e", "setInterval(()=>{},1000)"],
      timeoutMs: 20,
    });
    assert.equal(
      (
        await service.execute(
          timed,
          async () => undefined,
          async () => undefined,
        )
      ).outcome,
      "timed_out",
    );

    const cancelled = await prepare(service, root, {
      args: ["-e", "setInterval(()=>{},1000)"],
    });
    const controller = new AbortController();
    assert.equal(
      (
        await service.execute(
          cancelled,
          async () => undefined,
          async () => controller.abort(),
          controller.signal,
        )
      ).outcome,
      "cancelled",
    );

    const unavailable = new RunCommandService({
      path: join(root, "missing-bin"),
      workspaceRoot: root,
    });
    await assert.rejects(
      prepare(unavailable, root),
      (error) =>
        error instanceof RunCommandError &&
        error.productError.code === "command_executable_unavailable",
    );
  });
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  link,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { RepositoryToolService } from "@eden/coding-runtime";
import type { RepositoryToolCall, RepositoryToolResult } from "@eden/contracts";

async function workspace(label: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `eden-tools-${label}-`));
}

function listCall(path = ".", continuation: string | null = null): RepositoryToolCall {
  return {
    arguments: { continuation, path },
    name: "list_files",
    toolCallId: `list-${continuation ?? "start"}`,
  };
}

function readCall(path: string, offset = 0, maxBytes = 24_576): RepositoryToolCall {
  return {
    arguments: { maxBytes, offset, path },
    name: "read_file",
    toolCallId: `read-${offset}`,
  };
}

function failureCode(result: RepositoryToolResult): string | null {
  return result.status === "failed" ? result.error.code : null;
}

async function execute(
  service: RepositoryToolService,
  call: RepositoryToolCall,
  signal?: AbortSignal,
): Promise<RepositoryToolResult> {
  return (await service.execute(call, signal)).productData;
}

async function snapshot(root: string): Promise<readonly string[]> {
  const values: string[] = [];
  const visit = async (directory: string, prefix: string): Promise<void> => {
    for (const name of (await readdir(directory)).sort()) {
      const path = join(directory, name);
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const metadata = await import("node:fs/promises").then(({ lstat }) => lstat(path));
      if (metadata.isDirectory()) await visit(path, relative);
      else
        values.push(
          `${relative}:${createHash("sha256")
            .update(await readFile(path))
            .digest("hex")}`,
        );
    }
  };
  await visit(root, "");
  return values;
}

describe("repository list/read tool service", () => {
  it("lists deterministic bounded pages with exact provenance and zero writes", async () => {
    const root = await workspace("list");
    await mkdir(join(root, "src"));
    await writeFile(join(root, "README.md"), "Eden\n", "utf8");
    await writeFile(join(root, "src", "index.ts"), "export {};\n", "utf8");
    const before = await snapshot(root);
    const service = await RepositoryToolService.open({ workspaceRoot: root });
    const execution = await service.execute(listCall());
    const result = execution.productData;

    assert.equal(result.status, "succeeded");
    if (result.status !== "succeeded" || result.name !== "list_files") return;
    assert.deepEqual(result.data.entries, [
      { kind: "file", path: "README.md", size: 5 },
      { kind: "directory", path: "src", size: null },
      { kind: "file", path: "src/index.ts", size: 11 },
    ]);
    assert.equal(result.data.sourcePath, ".");
    assert.equal(result.data.visited, 3);
    assert.equal(result.data.truncated, false);
    assert.equal(result.data.continuation, null);
    assert.equal(
      result.data.contentHash,
      `sha256:${createHash("sha256").update(JSON.stringify(result.data.entries)).digest("hex")}`,
    );
    assert.equal(execution.modelContent, JSON.stringify(result.data.entries));
    assert.deepEqual(execution.diagnostics, {
      name: "list_files",
      source: "trusted-workspace",
      status: "succeeded",
      toolCallId: "list-start",
    });
    assert.deepEqual(await snapshot(root), before);
  });

  it("paginates row and byte limits without losing the next path", async () => {
    const rowRoot = await workspace("row-limit");
    for (let index = 0; index < 300; index += 1) {
      await writeFile(join(rowRoot, `file-${index.toString().padStart(3, "0")}.txt`), "x", "utf8");
    }
    const rowService = await RepositoryToolService.open({ workspaceRoot: rowRoot });
    const first = await execute(rowService, listCall());
    assert.equal(first.status, "succeeded");
    if (first.status !== "succeeded" || first.name !== "list_files") return;
    assert.equal(first.data.entries.length, 256);
    assert.equal(first.data.truncated, true);
    assert.equal(first.data.continuation, "file-255.txt");
    const second = await execute(rowService, listCall(".", first.data.continuation));
    assert.equal(second.status, "succeeded");
    if (second.status !== "succeeded" || second.name !== "list_files") return;
    assert.equal(second.data.entries[0]?.path, "file-256.txt");
    assert.equal(second.data.entries.length, 44);
    assert.equal(second.data.continuation, null);

    const byteRoot = await workspace("byte-limit");
    for (let index = 0; index < 120; index += 1) {
      await writeFile(
        join(byteRoot, `${index.toString().padStart(3, "0")}-${"x".repeat(220)}`),
        "x",
        "utf8",
      );
    }
    const byteService = await RepositoryToolService.open({ workspaceRoot: byteRoot });
    const bounded = await execute(byteService, listCall());
    assert.equal(bounded.status, "succeeded");
    if (bounded.status !== "succeeded" || bounded.name !== "list_files") return;
    assert.equal(bounded.data.entries.length < 120, true);
    assert.equal(Buffer.byteLength(JSON.stringify(bounded.data.entries), "utf8") <= 24_576, true);
    assert.equal(bounded.data.truncated, true);
  });

  it("accepts exactly the visit ceiling and fails closed on the next entry", async () => {
    const root = await workspace("visit-limit");
    for (let index = 0; index < 4_096; index += 1) {
      await writeFile(join(root, `entry-${index.toString().padStart(4, "0")}`), "", "utf8");
    }
    const service = await RepositoryToolService.open({ workspaceRoot: root });
    const exact = await execute(service, listCall());
    assert.equal(exact.status, "succeeded");
    if (exact.status !== "succeeded" || exact.name !== "list_files") return;
    assert.equal(exact.data.visited, 4_096);
    assert.equal(exact.data.entries.length, 256);
    assert.equal(exact.data.truncated, true);

    await writeFile(join(root, "entry-over-limit"), "", "utf8");
    assert.equal(failureCode(await execute(service, listCall())), "tool_visit_limit");
  });

  it("reads UTF-8 at exact byte offsets with chunk hashes and continuation", async () => {
    const root = await workspace("read");
    const content = "A🙂B";
    await writeFile(join(root, "unicode.txt"), content, "utf8");
    const service = await RepositoryToolService.open({ workspaceRoot: root });

    const first = await execute(service, readCall("unicode.txt", 0, 3));
    assert.equal(first.status, "succeeded");
    if (first.status !== "succeeded" || first.name !== "read_file") return;
    assert.deepEqual(first.data, {
      bytesRead: 1,
      content: "A",
      contentHash: `sha256:${createHash("sha256").update("A").digest("hex")}`,
      nextOffset: 1,
      offset: 0,
      sourcePath: "unicode.txt",
      totalBytes: 6,
    });
    const second = await execute(service, readCall("unicode.txt", first.data.nextOffset ?? 0, 4));
    assert.equal(second.status, "succeeded");
    if (second.status !== "succeeded" || second.name !== "read_file") return;
    assert.equal(second.data.content, "🙂");
    assert.equal(second.data.nextOffset, 5);
    assert.equal(
      failureCode(await execute(service, readCall("unicode.txt", 1, 3))),
      "tool_read_chunk_too_small",
    );
  });

  it("fails closed for invalid, linked, binary, stale, and cancelled access", async () => {
    const root = await workspace("blocked");
    const outside = await workspace("outside");
    await writeFile(join(root, "plain.txt"), "plain\n", "utf8");
    await writeFile(join(root, "binary.bin"), Buffer.from([0xff, 0x00]), undefined);
    await writeFile(join(outside, "secret.txt"), "outside\n", "utf8");
    await symlink(join(outside, "secret.txt"), join(root, "linked.txt"));
    await link(join(outside, "secret.txt"), join(root, "hardlinked.txt"));
    const service = await RepositoryToolService.open({ workspaceRoot: root });

    for (const [call, code] of [
      [readCall("/etc/passwd"), "tool_call_invalid"],
      [readCall("../outside/secret.txt"), "tool_call_invalid"],
      [readCall("linked.txt"), "tool_path_linked"],
      [readCall("hardlinked.txt"), "tool_path_linked"],
      [readCall("binary.bin"), "tool_binary_unsupported"],
      [readCall("plain.txt", 99), "tool_read_offset_invalid"],
    ] as const) {
      assert.equal(failureCode(await execute(service, call)), code);
    }

    const controller = new AbortController();
    controller.abort();
    assert.equal(
      failureCode(await execute(service, listCall(), controller.signal)),
      "operation_aborted",
    );

    await rename(root, `${root}-moved`);
    await mkdir(root);
    assert.equal(failureCode(await execute(service, listCall())), "workspace_identity_changed");
  });

  it("fails closed when a listing encounters an unsupported filesystem object", {
    skip: process.platform === "win32",
  }, async () => {
    const root = await workspace("unsupported-type");
    const socketPath = join(root, "runtime.sock");
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(socketPath, resolve);
    });
    try {
      const service = await RepositoryToolService.open({ workspaceRoot: root });
      assert.equal(failureCode(await execute(service, listCall())), "tool_file_type_unsupported");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

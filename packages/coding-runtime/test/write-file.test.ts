import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { decodeActionEnvelope } from "@eden/contracts";

import { WriteFileError, WriteFileService } from "../src/write-file.ts";

function canonicalRootHash(root: string): string {
  return `sha256:${createHash("sha256").update(`eden-canonical-root-v1\0${root}`).digest("hex")}`;
}

async function fixture(beforeOpen?: () => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "eden-write-file-"));
  const stateDirectory = join(root, ".state");
  await mkdir(stateDirectory);
  await mkdir(join(root, "src"));
  return {
    root,
    service: new WriteFileService({
      ...(beforeOpen === undefined ? {} : { beforeOpen }),
      now: () => "2026-08-11T00:00:00.000Z",
      stateDirectory,
      workspaceRoot: root,
    }),
  };
}

async function prepare(
  service: WriteFileService,
  root: string,
  path = "src/new.ts",
  content = "export const answer = 42;\n",
) {
  return service.prepare({
    actionId: "action-write-1",
    canonicalRootHash: canonicalRootHash(root),
    content,
    path,
    proposalRevision: 1,
    runId: "run-write-1",
    workspaceId: "workspace-write-1",
  });
}

describe("exclusive write-file action", () => {
  it("binds absence, parent identity, complete bytes, hash, and fixed mode into one action", async () => {
    const { root, service } = await fixture();
    const envelope = await prepare(service, root);
    assert.equal(decodeActionEnvelope(envelope).ok, true);
    assert.equal(envelope.kind, "write_file");
    if (envelope.operation.type !== "write_file") return;
    assert.equal(envelope.operation.targetState, "absent");
    assert.equal(envelope.operation.parent.path, "src");
    assert.equal(envelope.operation.mode, 0o644);
    assert.equal(envelope.operation.byteLength, 26);
    assert.match(envelope.operation.sha256, /^sha256:[a-f0-9]{64}$/u);

    const observed = await service.execute(envelope);
    assert.deepEqual(observed, {
      byteLength: envelope.operation.byteLength,
      path: "src/new.ts",
      sha256: envelope.operation.sha256,
      state: "completed",
    });
    assert.equal(await readFile(join(root, "src/new.ts"), "utf8"), envelope.operation.content);
    const metadata = await lstat(join(root, "src/new.ts"));
    assert.equal(metadata.isFile(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.nlink, 1);
    if (process.platform !== "win32") assert.equal(metadata.mode & 0o777, 0o644);
    assert.deepEqual(await service.reconcile(envelope), { state: "completed" });
  });

  it("rejects existing, missing-parent, linked-parent, oversized, and cancelled proposals", async () => {
    const { root, service } = await fixture();
    await writeFile(join(root, "src/existing.ts"), "owned\n");
    await assert.rejects(
      prepare(service, root, "src/existing.ts"),
      (error) =>
        error instanceof WriteFileError && error.productError.code === "write_target_exists",
    );
    await assert.rejects(
      prepare(service, root, "missing/new.ts"),
      (error) =>
        error instanceof WriteFileError && error.productError.code === "write_parent_missing",
    );
    await symlink(join(root, "src"), join(root, "linked"), "dir");
    await assert.rejects(
      prepare(service, root, "linked/new.ts"),
      (error) =>
        error instanceof WriteFileError && error.productError.code === "write_parent_linked",
    );
    await assert.rejects(
      prepare(service, root, "src/large.txt", "x".repeat(32_769)),
      (error) =>
        error instanceof WriteFileError && error.productError.code === "write_content_too_large",
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      service.prepare(
        {
          actionId: "action-cancelled",
          canonicalRootHash: canonicalRootHash(root),
          content: "cancelled",
          path: "src/cancelled.txt",
          proposalRevision: 1,
          runId: "run-write-1",
          workspaceId: "workspace-write-1",
        },
        controller.signal,
      ),
      (error) => error instanceof WriteFileError && error.productError.code === "operation_aborted",
    );
  });

  it("accepts a workspace-root alias while rejecting a linked parent inside it", async () => {
    const actualRoot = await mkdtemp(join(tmpdir(), "eden-write-file-actual-"));
    const aliasParent = await mkdtemp(join(tmpdir(), "eden-write-file-alias-"));
    const aliasRoot = join(aliasParent, "workspace");
    const stateDirectory = join(actualRoot, ".state");
    await mkdir(stateDirectory);
    await mkdir(join(actualRoot, "src"));
    await symlink(actualRoot, aliasRoot, "dir");
    const service = new WriteFileService({ stateDirectory, workspaceRoot: aliasRoot });

    const envelope = await prepare(service, aliasRoot);
    assert.equal(envelope.kind, "write_file");

    await symlink(join(actualRoot, "src"), join(actualRoot, "linked"), "dir");
    await assert.rejects(
      prepare(service, aliasRoot, "linked/new.ts"),
      (error) =>
        error instanceof WriteFileError && error.productError.code === "write_parent_linked",
    );
  });

  it("never overwrites a competing file created after approval", async () => {
    let target = "";
    const { root, service } = await fixture(async () => {
      await writeFile(target, "competitor\n", { flag: "wx" });
    });
    target = join(root, "src/new.ts");
    const envelope = await prepare(service, root);
    await assert.rejects(
      service.execute(envelope),
      (error) => error instanceof Error && "code" in error && error.code === "EEXIST",
    );
    assert.equal(await readFile(target, "utf8"), "competitor\n");
    assert.deepEqual(await service.reconcile(envelope), { state: "unknown" });
  });

  it("blocks metadata drift without chmod, append, or replacement authority", async () => {
    const { root, service } = await fixture();
    const envelope = await prepare(service, root);
    if (envelope.operation.type !== "write_file") return;
    await chmod(join(root, "src"), 0o700);
    await writeFile(join(root, "src/new.ts"), envelope.operation.content);
    await chmod(join(root, "src/new.ts"), 0o600);
    assert.deepEqual(await service.reconcile(envelope), { state: "unknown" });
  });
});

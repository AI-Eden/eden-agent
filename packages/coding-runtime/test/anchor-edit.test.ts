import { strictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { AnchorEditError, AnchorEditService, NativeProcessRunner } from "../src/index.ts";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "eden-anchor-edit-"));
  const stateDirectory = `${root}-state`;
  mkdirSync(stateDirectory, { mode: 0o700 });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root });
  writeFileSync(join(root, "tracked.txt"), "user dirty\nold value\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "base"], { cwd: root });
  writeFileSync(join(root, "tracked.txt"), "user dirty local\nold value\n");
  chmodSync(join(root, "tracked.txt"), 0o640);
  const trackedMode = statSync(join(root, "tracked.txt")).mode & 0o777;
  return { root, stateDirectory, trackedMode };
}

describe("modify-only AnchorEdit", () => {
  it("preserves dirty user bytes and mode while replacing one unique anchor", async () => {
    const { root, stateDirectory, trackedMode } = fixture();
    try {
      const service = new AnchorEditService({
        workspaceRoot: root,
        stateDirectory,
        nativeProcess: new NativeProcessRunner(),
      });
      const envelope = await service.prepare({
        actionId: "action-edit-1",
        runId: "run-edit-1",
        proposalRevision: 3,
        workspaceId: "workspace-edit-1",
        canonicalRootHash: `sha256:${"a".repeat(64)}`,
        path: "tracked.txt",
        replacements: [{ oldText: "old value", newText: "new value", expectedOccurrences: 1 }],
      });
      const result = await service.execute(envelope);

      strictEqual(result.state, "completed");
      strictEqual(readFileSync(join(root, "tracked.txt"), "utf8"), "user dirty local\nnew value\n");
      strictEqual(statSync(join(root, "tracked.txt")).mode & 0o777, trackedMode);
      strictEqual((await service.reconcile(envelope)).state, "completed");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("rejects untracked, linked, stale, and ambiguous targets without writes", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const service = new AnchorEditService({
        workspaceRoot: root,
        stateDirectory,
        nativeProcess: new NativeProcessRunner(),
      });
      writeFileSync(join(root, "untracked.txt"), "old value\n");
      symlinkSync("tracked.txt", join(root, "linked.txt"));

      for (const [path, oldText] of [
        ["untracked.txt", "old value"],
        ["linked.txt", "old value"],
        ["tracked.txt", "l"],
      ] as const) {
        await assertAnchorError(() =>
          service.prepare({
            actionId: `action-${path}`,
            runId: "run-edit-1",
            proposalRevision: 3,
            workspaceId: "workspace-edit-1",
            canonicalRootHash: `sha256:${"a".repeat(64)}`,
            path,
            replacements: [{ oldText, newText: "changed", expectedOccurrences: 1 }],
          }),
        );
      }
      linkSync(join(root, "tracked.txt"), join(root, "hardlinked.txt"));
      await assertAnchorError(() =>
        service.prepare({
          actionId: "action-hardlink",
          runId: "run-edit-1",
          proposalRevision: 3,
          workspaceId: "workspace-edit-1",
          canonicalRootHash: `sha256:${"a".repeat(64)}`,
          path: "tracked.txt",
          replacements: [{ oldText: "old value", newText: "changed", expectedOccurrences: 1 }],
        }),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("reconciles base as not started and unrelated content as unknown", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const service = new AnchorEditService({
        workspaceRoot: root,
        stateDirectory,
        nativeProcess: new NativeProcessRunner(),
      });
      const envelope = await service.prepare({
        actionId: "action-edit-2",
        runId: "run-edit-2",
        proposalRevision: 1,
        workspaceId: "workspace-edit-1",
        canonicalRootHash: `sha256:${"a".repeat(64)}`,
        path: "tracked.txt",
        replacements: [{ oldText: "old value", newText: "new value", expectedOccurrences: 1 }],
      });
      strictEqual((await service.reconcile(envelope)).state, "not_started");
      writeFileSync(join(root, "tracked.txt"), "someone else changed it\n");
      strictEqual((await service.reconcile(envelope)).state, "unknown");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("accepts the exact 1 MiB and 16-anchor boundaries and rejects one-unit overflow", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const service = new AnchorEditService({
        workspaceRoot: root,
        stateDirectory,
        nativeProcess: new NativeProcessRunner(),
      });
      const exactBase = `${"x".repeat(1_048_576 - "old value".length)}old value`;
      writeFileSync(join(root, "tracked.txt"), exactBase);
      const exactEnvelope = await service.prepare({
        actionId: "action-edit-exact-mib",
        runId: "run-edit-exact-mib",
        proposalRevision: 1,
        workspaceId: "workspace-edit-1",
        canonicalRootHash: `sha256:${"a".repeat(64)}`,
        path: "tracked.txt",
        replacements: [{ oldText: "old value", newText: "new value", expectedOccurrences: 1 }],
      });
      strictEqual(exactEnvelope.operation.type, "anchor_edit");
      if (exactEnvelope.operation.type !== "anchor_edit") throw new Error("Expected AnchorEdit.");
      strictEqual(exactEnvelope.operation.baseByteLength, 1_048_576);
      strictEqual(exactEnvelope.operation.desiredByteLength, 1_048_576);
      await service.execute(exactEnvelope);
      strictEqual(statSync(join(root, "tracked.txt")).size, 1_048_576);

      writeFileSync(join(root, "tracked.txt"), exactBase);
      await assertAnchorError(() =>
        service.prepare({
          actionId: "action-edit-over-mib",
          runId: "run-edit-over-mib",
          proposalRevision: 1,
          workspaceId: "workspace-edit-1",
          canonicalRootHash: `sha256:${"a".repeat(64)}`,
          path: "tracked.txt",
          replacements: [{ oldText: "old value", newText: "new value!", expectedOccurrences: 1 }],
        }),
      );

      const anchors = Array.from(
        { length: 16 },
        (_, index) => `old-${String(index).padStart(2, "0")}`,
      );
      writeFileSync(join(root, "tracked.txt"), `${anchors.join("\n")}\n`);
      const replacements = anchors.map((oldText, index) => ({
        expectedOccurrences: 1 as const,
        newText: `new-${String(index).padStart(2, "0")}`,
        oldText,
      }));
      const sixteen = await service.prepare({
        actionId: "action-edit-sixteen",
        runId: "run-edit-sixteen",
        proposalRevision: 1,
        workspaceId: "workspace-edit-1",
        canonicalRootHash: `sha256:${"a".repeat(64)}`,
        path: "tracked.txt",
        replacements,
      });
      await service.execute(sixteen);
      strictEqual(
        readFileSync(join(root, "tracked.txt"), "utf8"),
        `${anchors.map((_, index) => `new-${String(index).padStart(2, "0")}`).join("\n")}\n`,
      );

      writeFileSync(join(root, "tracked.txt"), `${[...anchors, "old-16"].join("\n")}\n`);
      await assertAnchorError(() =>
        service.prepare({
          actionId: "action-edit-seventeen",
          runId: "run-edit-seventeen",
          proposalRevision: 1,
          workspaceId: "workspace-edit-1",
          canonicalRootHash: `sha256:${"a".repeat(64)}`,
          path: "tracked.txt",
          replacements: [
            ...replacements,
            { expectedOccurrences: 1, newText: "new-16", oldText: "old-16" },
          ],
        }),
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("rejects a stale prepared base without overwriting the concurrent bytes", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const service = new AnchorEditService({
        workspaceRoot: root,
        stateDirectory,
        nativeProcess: new NativeProcessRunner(),
      });
      const envelope = await service.prepare({
        actionId: "action-edit-concurrent",
        runId: "run-edit-concurrent",
        proposalRevision: 1,
        workspaceId: "workspace-edit-1",
        canonicalRootHash: `sha256:${"a".repeat(64)}`,
        path: "tracked.txt",
        replacements: [{ oldText: "old value", newText: "new value", expectedOccurrences: 1 }],
      });
      writeFileSync(join(root, "tracked.txt"), "concurrent user bytes\n");

      await assertAnchorError(() => service.execute(envelope));

      strictEqual(readFileSync(join(root, "tracked.txt"), "utf8"), "concurrent user bytes\n");
      strictEqual((await service.reconcile(envelope)).state, "unknown");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });
});

async function assertAnchorError(operation: () => Promise<unknown>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    strictEqual(error instanceof AnchorEditError, true);
    return;
  }
  throw new Error("Expected AnchorEditError.");
}

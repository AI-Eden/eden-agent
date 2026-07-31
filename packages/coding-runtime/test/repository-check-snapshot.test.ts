import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import {
  access,
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { RepositoryCheckSnapshotError, RepositoryCheckSnapshotService } from "../src/index.ts";

async function fixture(label: string) {
  const base = await mkdtemp(join(tmpdir(), `eden-repository-check-${label}-`));
  const workspace = join(base, "workspace");
  const state = join(base, "state");
  await mkdir(join(workspace, ".eden", "checks"), { recursive: true });
  await mkdir(join(workspace, "scripts"), { recursive: true });
  await writeFile(
    join(workspace, ".eden", "checks", "catalog.json"),
    `${JSON.stringify({
      checks: [
        {
          name: "test",
          process: { arguments: ["--test"], cwd: ".", executable: "/usr/local/bin/node" },
        },
      ],
      version: 1,
    })}\n`,
  );
  await writeFile(join(workspace, "package.json"), '{"type":"module"}\n');
  await writeFile(join(workspace, "scripts", "check.mjs"), "process.exit(1);\n");
  await chmod(join(workspace, "scripts", "check.mjs"), 0o755);
  execFileSync("git", ["init", "--quiet"], { cwd: workspace });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: workspace });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: workspace });
  execFileSync("git", ["add", "."], { cwd: workspace });
  execFileSync("git", ["commit", "--quiet", "-m", "base"], { cwd: workspace });
  return { state, workspace };
}

describe("tracked repository-check catalog and immutable snapshot staging", () => {
  it("uses current tracked bytes, excludes untracked canaries, and stages outside the workspace", async () => {
    const { state, workspace } = await fixture("current");
    await writeFile(join(workspace, "scripts", "check.mjs"), "process.exit(0);\n");
    await writeFile(join(workspace, "untracked-secret.txt"), "SECRET-CANARY");
    const service = new RepositoryCheckSnapshotService({
      stateDirectory: state,
      workspaceRoot: workspace,
    });

    const resolved = await service.resolve("test");
    strictEqual(resolved.catalog.dirty, false);
    strictEqual(resolved.process.executable, "/usr/local/bin/node");

    const staged = await service.stage({
      catalogSha256: resolved.catalog.sha256,
      effectId: "effect-repository-check-1",
      head: resolved.catalog.head,
    });
    deepStrictEqual(
      staged.manifest.files.map((file) => file.path),
      [".eden/checks/catalog.json", "package.json", "scripts/check.mjs"],
    );
    strictEqual(
      await readFile(join(staged.directory, "scripts", "check.mjs"), "utf8"),
      "process.exit(0);\n",
    );
    strictEqual((await stat(join(staged.directory, "scripts", "check.mjs"))).mode & 0o777, 0o555);
    strictEqual((await stat(join(staged.directory, "package.json"))).mode & 0o777, 0o444);
    await rejects(access(join(staged.directory, "untracked-secret.txt")));
    strictEqual(staged.directory.startsWith(workspace), false);
    strictEqual(await staged.validate(), true);
    await chmod(join(staged.directory, "package.json"), 0o644);
    strictEqual(await staged.validate(), false);
    await chmod(join(staged.directory, "package.json"), 0o444);

    await staged.cleanup();
    await rejects(access(staged.directory));
  });

  it("records dirty tracked catalog bytes and blocks untracked, linked, and invalid UTF-8 catalogs", async () => {
    const dirty = await fixture("dirty");
    const catalogPath = join(dirty.workspace, ".eden", "checks", "catalog.json");
    const current = await readFile(catalogPath, "utf8");
    await writeFile(catalogPath, current.replace('"--test"', '"--test=changed"'));
    const resolved = await new RepositoryCheckSnapshotService({
      stateDirectory: dirty.state,
      workspaceRoot: dirty.workspace,
    }).resolve("test");
    strictEqual(resolved.catalog.dirty, true);

    execFileSync("git", ["rm", "--cached", "--quiet", ".eden/checks/catalog.json"], {
      cwd: dirty.workspace,
    });
    await rejects(
      new RepositoryCheckSnapshotService({
        stateDirectory: dirty.state,
        workspaceRoot: dirty.workspace,
      }).resolve("test"),
      (error: unknown) =>
        error instanceof RepositoryCheckSnapshotError && error.code === "catalog_untracked",
    );

    const invalid = await fixture("invalid-utf8");
    await writeFile(
      join(invalid.workspace, ".eden", "checks", "catalog.json"),
      Uint8Array.of(0xff),
    );
    await rejects(
      new RepositoryCheckSnapshotService({
        stateDirectory: invalid.state,
        workspaceRoot: invalid.workspace,
      }).resolve("test"),
      (error: unknown) =>
        error instanceof RepositoryCheckSnapshotError && error.code === "catalog_invalid_utf8",
    );

    const linked = await fixture("linked");
    const linkedCatalog = join(linked.workspace, ".eden", "checks", "catalog.json");
    const linkedCopy = join(linked.workspace, "catalog-copy.json");
    await import("node:fs/promises").then(({ link }) => link(linkedCatalog, linkedCopy));
    strictEqual((await lstat(linkedCatalog)).nlink, 2);
    await rejects(
      new RepositoryCheckSnapshotService({
        stateDirectory: linked.state,
        workspaceRoot: linked.workspace,
      }).resolve("test"),
      (error: unknown) =>
        error instanceof RepositoryCheckSnapshotError && error.code === "catalog_unsafe_file",
    );
  });

  it("blocks unsupported tracked shapes and stale catalog identity before staging", async () => {
    const unsupported = await fixture("unsupported");
    const unsupportedService = new RepositoryCheckSnapshotService({
      stateDirectory: unsupported.state,
      workspaceRoot: unsupported.workspace,
    });
    const unsupportedSelection = await unsupportedService.resolve("test");
    await import("node:fs/promises").then(({ symlink }) =>
      symlink("package.json", join(unsupported.workspace, "tracked-link")),
    );
    execFileSync("git", ["add", "tracked-link"], { cwd: unsupported.workspace });
    await rejects(
      unsupportedService.stage({
        catalogSha256: unsupportedSelection.catalog.sha256,
        effectId: "effect-unsupported",
        head: unsupportedSelection.catalog.head,
      }),
      (error: unknown) =>
        error instanceof RepositoryCheckSnapshotError &&
        error.code === "snapshot_unsupported_entry",
    );

    const stale = await fixture("stale");
    const service = new RepositoryCheckSnapshotService({
      stateDirectory: stale.state,
      workspaceRoot: stale.workspace,
    });
    const selected = await service.resolve("test");
    await writeFile(join(stale.workspace, ".eden", "checks", "catalog.json"), '{"version":1}\n');
    await rejects(
      service.stage({
        catalogSha256: selected.catalog.sha256,
        effectId: "effect-stale",
        head: selected.catalog.head,
      }),
      (error: unknown) =>
        error instanceof RepositoryCheckSnapshotError && error.code === "catalog_stale",
    );
  });

  it("blocks missing files, file-count overflow, and concurrent source drift without residue", async () => {
    const missing = await fixture("missing");
    const missingService = new RepositoryCheckSnapshotService({
      stateDirectory: missing.state,
      workspaceRoot: missing.workspace,
    });
    const missingSelection = await missingService.resolve("test");
    await unlink(join(missing.workspace, "package.json"));
    await rejects(
      missingService.stage({
        catalogSha256: missingSelection.catalog.sha256,
        effectId: "effect-missing",
        head: missingSelection.catalog.head,
      }),
      (error: unknown) =>
        error instanceof RepositoryCheckSnapshotError &&
        error.code === "snapshot_unsupported_entry",
    );

    const overflow = await fixture("count-overflow");
    for (let index = 0; index < 62; index += 1) {
      await writeFile(
        join(overflow.workspace, `extra-${index.toString().padStart(2, "0")}.txt`),
        "",
      );
    }
    execFileSync("git", ["add", "."], { cwd: overflow.workspace });
    const overflowService = new RepositoryCheckSnapshotService({
      stateDirectory: overflow.state,
      workspaceRoot: overflow.workspace,
    });
    await rejects(
      overflowService.resolve("test"),
      (error: unknown) =>
        error instanceof RepositoryCheckSnapshotError && error.code === "snapshot_budget_exceeded",
    );

    const concurrent = await fixture("concurrent");
    let changed = false;
    const concurrentService = new RepositoryCheckSnapshotService({
      hooks: {
        afterSourceRead: async (path) => {
          if (path === "scripts/check.mjs" && !changed) {
            changed = true;
            await writeFile(join(concurrent.workspace, path), "process.exit(0);\n");
          }
        },
      },
      stateDirectory: concurrent.state,
      workspaceRoot: concurrent.workspace,
    });
    const concurrentSelection = await concurrentService.resolve("test");
    await rejects(
      concurrentService.stage({
        catalogSha256: concurrentSelection.catalog.sha256,
        effectId: "effect-concurrent",
        head: concurrentSelection.catalog.head,
      }),
      (error: unknown) =>
        error instanceof RepositoryCheckSnapshotError && error.code === "snapshot_stale",
    );
    await rejects(access(join(concurrent.state, "repository-check-staging", "effect-concurrent")));
  });
});

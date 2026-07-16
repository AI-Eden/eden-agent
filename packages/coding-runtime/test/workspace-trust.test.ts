import { deepStrictEqual, notStrictEqual, rejects, strictEqual } from "node:assert";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { WorkspaceTrustError, WorkspaceTrustService } from "../src/workspace/index.ts";
import { TrustRecordWriteError, writeTrustRecord } from "../src/workspace/trust-record.ts";

async function directories() {
  const base = await mkdtemp(join(tmpdir(), "eden-workspace-trust-"));
  const stateDirectory = join(base, "state");
  const workspaceDirectory = join(base, "workspace");
  await mkdir(workspaceDirectory);
  return { base, stateDirectory, workspaceDirectory };
}

function command(workspaceId: string, expectedRevision: number, decision: "trust" | "restrict") {
  return {
    commandId: `command-${decision}-${expectedRevision}`,
    decision,
    expectedRevision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId,
  } as const;
}

test("a new canonical workspace starts restricted without a trust record", async () => {
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });

  const review = service.getReview();
  strictEqual(review.workspace.trust, "restricted");
  strictEqual(review.authority.taskStart, "blocked");
  strictEqual(review.revision, 0);
  await rejects(lstat(fixture.stateDirectory), { code: "ENOENT" });
});

test("an exact-root trust decision persists and explicit revocation replaces it", async () => {
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const initial = service.getReview();
  const trusted = await service.resolve(command(initial.workspace.workspaceId, 0, "trust"));
  const reopened = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const persisted = reopened.getReview();
  const restricted = await reopened.resolve(command(initial.workspace.workspaceId, 1, "restrict"));

  strictEqual(trusted.workspace.trust, "trusted");
  strictEqual(trusted.revision, 1);
  strictEqual(persisted.workspace.trust, "trusted");
  strictEqual(restricted.workspace.trust, "restricted");
  strictEqual(restricted.revision, 2);
  deepStrictEqual({ ...initial.authority, taskStart: "allowed" }, trusted.authority);
});

test("repeating the current trust decision is an idempotent no-op", async () => {
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const workspaceId = service.identity.workspaceId;
  const trusted = await service.resolve(command(workspaceId, 0, "trust"));
  const recordDirectory = join(fixture.stateDirectory, "workspace-trust", "v1");
  const recordName = (await readdir(recordDirectory))[0];
  if (recordName === undefined) throw new Error("Expected a trust record.");
  const recordPath = join(recordDirectory, recordName);
  const before = await readFile(recordPath, "utf8");

  const repeated = await service.resolve(command(workspaceId, trusted.revision, "trust"));

  strictEqual(repeated.revision, trusted.revision);
  strictEqual(await readFile(recordPath, "utf8"), before);
});

test("an idempotent no-op leaves its revision available to a later state change", async () => {
  const fixture = await directories();
  const first = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const second = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const workspaceId = first.identity.workspaceId;

  const restricted = await first.resolve(command(workspaceId, 0, "restrict"));
  await rejects(lstat(fixture.stateDirectory), { code: "ENOENT" });
  const trusted = await second.resolve(command(workspaceId, 0, "trust"));

  strictEqual(restricted.revision, 0);
  strictEqual(restricted.workspace.trust, "restricted");
  strictEqual(trusted.revision, 1);
  strictEqual(trusted.workspace.trust, "trusted");
});

test("competing clients with one expected revision produce one durable trust change", async () => {
  const fixture = await directories();
  const first = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const second = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const workspaceId = first.identity.workspaceId;

  const results = await Promise.allSettled([
    first.resolve(command(workspaceId, 0, "trust")),
    second.resolve(command(workspaceId, 0, "trust")),
  ]);

  strictEqual(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  if (rejected?.status !== "rejected") throw new Error("Expected one stale command.");
  strictEqual(rejected.reason instanceof WorkspaceTrustError, true);
  strictEqual((rejected.reason as WorkspaceTrustError).productError.code, "stale_revision");
  const reopened = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  strictEqual(reopened.getReview().revision, 1);
});

test("canonical symlinks share trust while a retargeted link starts restricted", async () => {
  const fixture = await directories();
  const otherWorkspace = join(fixture.base, "other-workspace");
  const firstLink = join(fixture.base, "workspace-link");
  const secondLink = join(fixture.base, "workspace-link-2");
  await mkdir(otherWorkspace);
  await symlink(fixture.workspaceDirectory, firstLink, "dir");
  await symlink(fixture.workspaceDirectory, secondLink, "dir");
  const service = await WorkspaceTrustService.open({
    cwd: firstLink,
    stateDirectory: fixture.stateDirectory,
  });
  await service.resolve(command(service.identity.workspaceId, 0, "trust"));
  const sameTarget = await WorkspaceTrustService.open({
    cwd: secondLink,
    stateDirectory: fixture.stateDirectory,
  });

  await rm(firstLink);
  await symlink(otherWorkspace, firstLink, "dir");
  const retargeted = await WorkspaceTrustService.open({
    cwd: firstLink,
    stateDirectory: fixture.stateDirectory,
  });

  strictEqual(sameTarget.getReview().workspace.trust, "trusted");
  strictEqual(retargeted.getReview().workspace.trust, "restricted");
  notStrictEqual(retargeted.identity.workspaceId, service.identity.workspaceId);
});

test("a malformed trust record fails closed and can be replaced only by a new decision", async () => {
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  await service.resolve(command(service.identity.workspaceId, 0, "trust"));
  const recordDirectory = join(fixture.stateDirectory, "workspace-trust", "v1");
  const recordName = (await readdir(recordDirectory))[0];
  if (recordName === undefined) throw new Error("Expected a trust record.");
  await writeFile(join(recordDirectory, recordName), '{"version":', "utf8");

  const reopened = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const failedClosed = reopened.getReview();
  const replaced = await reopened.resolve(command(service.identity.workspaceId, 0, "trust"));

  strictEqual(failedClosed.workspace.trust, "restricted");
  strictEqual(failedClosed.notice?.code, "trust_state_invalid");
  strictEqual(replaced.workspace.trust, "trusted");
  strictEqual(replaced.revision, 1);
  strictEqual(replaced.notice, null);
});

test("malformed UTF-8 trust bytes fail closed before JSON decoding", async () => {
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  await service.resolve(command(service.identity.workspaceId, 0, "trust"));
  const recordDirectory = join(fixture.stateDirectory, "workspace-trust", "v1");
  const recordName = (await readdir(recordDirectory))[0];
  if (recordName === undefined) throw new Error("Expected a trust record.");
  const source = Buffer.from(
    `${JSON.stringify({
      canonicalRoot: service.identity.canonicalRoot,
      decidedAt: "x",
      decision: "trusted",
      revision: 1,
      version: 1,
      workspaceId: service.identity.workspaceId,
    })}\n`,
    "utf8",
  );
  const marker = Buffer.from('"decidedAt":"x"', "utf8");
  const markerOffset = source.indexOf(marker);
  if (markerOffset < 0) throw new Error("Expected decidedAt in the trust fixture.");
  source[markerOffset + marker.length - 2] = 0xff;
  await writeFile(join(recordDirectory, recordName), source);

  const reopened = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });

  strictEqual(reopened.getReview().workspace.trust, "restricted");
  strictEqual(reopened.getReview().notice?.code, "trust_state_invalid");
  strictEqual(reopened.getReview().authority.taskStart, "blocked");
});

test("unsafe revisions fail closed and an exhausted safe revision cannot change state", async () => {
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const trustDirectory = join(fixture.stateDirectory, "workspace-trust", "v1");
  const recordPath = join(trustDirectory, `${service.identity.workspaceId}.json`);
  await mkdir(trustDirectory, { recursive: true });
  const record = (revision: number) => ({
    canonicalRoot: service.identity.canonicalRoot,
    decidedAt: "2026-07-16T00:00:00.000Z",
    decision: "trusted",
    revision,
    version: 1,
    workspaceId: service.identity.workspaceId,
  });
  await writeFile(recordPath, `${JSON.stringify(record(1e100))}\n`, "utf8");

  const unsafe = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  strictEqual(unsafe.getReview().workspace.trust, "restricted");
  strictEqual(unsafe.getReview().notice?.code, "trust_state_invalid");

  await writeFile(recordPath, `${JSON.stringify(record(Number.MAX_SAFE_INTEGER))}\n`, "utf8");
  const exhausted = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const before = await readFile(recordPath, "utf8");
  await rejects(
    exhausted.resolve(command(service.identity.workspaceId, Number.MAX_SAFE_INTEGER, "restrict")),
    (error) =>
      error instanceof WorkspaceTrustError &&
      error.productError.code === "workspace_state_unavailable",
  );
  strictEqual(await readFile(recordPath, "utf8"), before);
  strictEqual(exhausted.getReview().workspace.trust, "trusted");
});

test("a symbolic-link trust record fails closed as non-regular state", async () => {
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  await service.resolve(command(service.identity.workspaceId, 0, "trust"));
  const recordDirectory = join(fixture.stateDirectory, "workspace-trust", "v1");
  const recordName = (await readdir(recordDirectory))[0];
  if (recordName === undefined) throw new Error("Expected a trust record.");
  const recordPath = join(recordDirectory, recordName);
  const targetPath = join(recordDirectory, "moved-record.json");
  await rename(recordPath, targetPath);
  await symlink(targetPath, recordPath, "file");

  const reopened = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });

  strictEqual(reopened.getReview().workspace.trust, "restricted");
  strictEqual(reopened.getReview().notice?.code, "trust_state_invalid");
  strictEqual(reopened.getReview().authority.taskStart, "blocked");
});

test("hardlinked and oversized trust records fail closed", async () => {
  for (const shape of ["hardlink", "oversized"] as const) {
    const fixture = await directories();
    const service = await WorkspaceTrustService.open({
      cwd: fixture.workspaceDirectory,
      stateDirectory: fixture.stateDirectory,
    });
    await service.resolve(command(service.identity.workspaceId, 0, "trust"));
    const recordDirectory = join(fixture.stateDirectory, "workspace-trust", "v1");
    const recordName = (await readdir(recordDirectory))[0];
    if (recordName === undefined) throw new Error("Expected a trust record.");
    const recordPath = join(recordDirectory, recordName);
    if (shape === "hardlink") {
      const moved = join(recordDirectory, "hardlink-source.json");
      await rename(recordPath, moved);
      await link(moved, recordPath);
    } else {
      await writeFile(recordPath, Buffer.alloc(4_097, 0x61));
    }

    const reopened = await WorkspaceTrustService.open({
      cwd: fixture.workspaceDirectory,
      stateDirectory: fixture.stateDirectory,
    });

    strictEqual(reopened.getReview().workspace.trust, "restricted");
    strictEqual(reopened.getReview().notice?.code, "trust_state_invalid");
  }
});

test("stale trust commands and state directories inside the workspace are rejected", async () => {
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });

  await rejects(
    service.resolve(command(service.identity.workspaceId, 1, "trust")),
    (error) => error instanceof WorkspaceTrustError && error.productError.code === "stale_revision",
  );
  await rejects(
    WorkspaceTrustService.open({
      cwd: fixture.workspaceDirectory,
      stateDirectory: join(fixture.workspaceDirectory, ".eden-agent"),
    }),
    (error) =>
      error instanceof WorkspaceTrustError && error.productError.code === "unsafe_state_directory",
  );
  strictEqual(service.getReview().workspace.trust, "restricted");
});

test("static symlinked trust and lock ancestors cannot redirect state writes", async () => {
  for (const ancestor of ["workspace-trust", "workspace-locks"] as const) {
    const fixture = await directories();
    const external = join(fixture.base, `external-${ancestor}`);
    await mkdir(fixture.stateDirectory);
    await mkdir(external);
    await symlink(external, join(fixture.stateDirectory, ancestor), "dir");
    const service = await WorkspaceTrustService.open({
      cwd: fixture.workspaceDirectory,
      stateDirectory: fixture.stateDirectory,
    });

    await rejects(
      service.resolve(command(service.identity.workspaceId, 0, "trust")),
      WorkspaceTrustError,
    );
    deepStrictEqual(await readdir(external), []);
  }
});

test("trust write failures return fixed state errors without path disclosure", async () => {
  const fixture = await directories();
  const trustDirectory = join(fixture.stateDirectory, "workspace-trust", "v1");
  await mkdir(trustDirectory, { recursive: true });
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  await mkdir(join(trustDirectory, `${service.identity.workspaceId}.json`));

  await rejects(
    service.resolve(command(service.identity.workspaceId, 0, "trust")),
    (error) =>
      error instanceof WorkspaceTrustError &&
      error.productError.code === "workspace_state_unavailable" &&
      !JSON.stringify(error.productError).includes(fixture.base),
  );
});

test("a missing state path through a workspace symlink is rejected before mkdir", async () => {
  const fixture = await directories();
  const stateLink = join(fixture.base, "state-link");
  const redirectedState = join(fixture.workspaceDirectory, "redirected-state");
  await symlink(fixture.workspaceDirectory, stateLink, "dir");

  await rejects(
    WorkspaceTrustService.open({
      cwd: fixture.workspaceDirectory,
      stateDirectory: join(stateLink, "redirected-state"),
    }),
    (error) =>
      error instanceof WorkspaceTrustError && error.productError.code === "unsafe_state_directory",
  );
  await rejects(lstat(redirectedState), { code: "ENOENT" });
});

test("trust serialization accepts the exact byte limit and rejects limit plus one", async () => {
  const fixture = await directories();
  await mkdir(fixture.stateDirectory);
  const recordPath = join(fixture.stateDirectory, "trust.json");
  const base = {
    canonicalRoot: "/",
    decidedAt: "2026-07-16T00:00:00.000Z",
    decision: "trusted" as const,
    revision: 1,
    version: 1 as const,
    workspaceId: "workspace-long-root",
  };
  const baseBytes = Buffer.byteLength(`${JSON.stringify(base)}\n`, "utf8");
  const exact = { ...base, canonicalRoot: `/${"w".repeat(4_096 - baseBytes)}` };

  await writeTrustRecord(recordPath, exact);
  strictEqual((await readFile(recordPath)).byteLength, 4_096);
  const before = await readFile(recordPath, "utf8");

  await rejects(
    writeTrustRecord(recordPath, { ...exact, canonicalRoot: `${exact.canonicalRoot}w` }),
    TrustRecordWriteError,
  );
  strictEqual(await readFile(recordPath, "utf8"), before);
});

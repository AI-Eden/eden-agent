import { deepStrictEqual, notStrictEqual, rejects, strictEqual } from "node:assert";
import {
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
  // Given: separate fresh workspace and state directories.
  const fixture = await directories();

  // When: the production service opens before any run.
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });

  // Then: task start is blocked and inspection writes no trust record.
  const review = service.getReview();
  strictEqual(review.workspace.trust, "restricted");
  strictEqual(review.authority.taskStart, "blocked");
  strictEqual(review.revision, 0);
  deepStrictEqual(await readdir(fixture.stateDirectory), []);
});

test("an exact-root trust decision persists and explicit revocation replaces it", async () => {
  // Given: a restricted workspace with a deterministic clock.
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    clock: { now: () => new Date("2026-07-15T00:00:00.000Z") },
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const initial = service.getReview();

  // When: trust is granted, reopened, and then explicitly revoked.
  const trusted = await service.resolve(command(initial.workspace.workspaceId, 0, "trust"));
  const reopened = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const persisted = reopened.getReview();
  const restricted = await reopened.resolve(command(initial.workspace.workspaceId, 1, "restrict"));

  // Then: both transitions are durable and authority changes only at task start.
  strictEqual(trusted.workspace.trust, "trusted");
  strictEqual(trusted.revision, 1);
  strictEqual(persisted.workspace.trust, "trusted");
  strictEqual(restricted.workspace.trust, "restricted");
  strictEqual(restricted.revision, 2);
  deepStrictEqual({ ...initial.authority, taskStart: "allowed" }, trusted.authority);
});

test("repeating the current trust decision is an idempotent no-op", async () => {
  // Given: one persisted trusted workspace.
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

  // When: the same current decision is submitted again.
  const repeated = await service.resolve(command(workspaceId, trusted.revision, "trust"));

  // Then: revision and durable bytes remain unchanged.
  strictEqual(repeated.revision, trusted.revision);
  strictEqual(await readFile(recordPath, "utf8"), before);
});

test("canonical symlinks share trust while a retargeted link starts restricted", async () => {
  // Given: two links initially resolving to one trusted target.
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

  // When: the original lexical path is retargeted to another canonical root.
  await rm(firstLink);
  await symlink(otherWorkspace, firstLink, "dir");
  const retargeted = await WorkspaceTrustService.open({
    cwd: firstLink,
    stateDirectory: fixture.stateDirectory,
  });

  // Then: the same target reuses trust and the new target receives a new restricted identity.
  strictEqual(sameTarget.getReview().workspace.trust, "trusted");
  strictEqual(retargeted.getReview().workspace.trust, "restricted");
  notStrictEqual(retargeted.identity.workspaceId, service.identity.workspaceId);
});

test("a malformed trust record fails closed and can be replaced only by a new decision", async () => {
  // Given: a persisted record whose bytes are no longer valid JSON.
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

  // When: the service reopens and the user explicitly grants trust again.
  const reopened = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });
  const failedClosed = reopened.getReview();
  const replaced = await reopened.resolve(command(service.identity.workspaceId, 0, "trust"));

  // Then: corrupt state was restricted with a notice before the replacement became trusted.
  strictEqual(failedClosed.workspace.trust, "restricted");
  strictEqual(failedClosed.notice?.code, "trust_state_invalid");
  strictEqual(replaced.workspace.trust, "trusted");
  strictEqual(replaced.revision, 1);
  strictEqual(replaced.notice, null);
});

test("a symbolic-link trust record fails closed as non-regular state", async () => {
  // Given: valid trust bytes moved behind a symbolic-link record path.
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

  // When: the production service reopens the exact workspace.
  const reopened = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });

  // Then: linked bytes never grant task-start authority.
  strictEqual(reopened.getReview().workspace.trust, "restricted");
  strictEqual(reopened.getReview().notice?.code, "trust_state_invalid");
  strictEqual(reopened.getReview().authority.taskStart, "blocked");
});

test("stale trust commands and state directories inside the workspace are rejected", async () => {
  // Given: a restricted workspace and two invalid boundary requests.
  const fixture = await directories();
  const service = await WorkspaceTrustService.open({
    cwd: fixture.workspaceDirectory,
    stateDirectory: fixture.stateDirectory,
  });

  // When and Then: neither stale concurrency nor repository-controlled state can grant trust.
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

import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { RepositoryCheckActionEnvelopeV1 } from "@eden/contracts";
import { DockerCliDoctorPort } from "../src/docker-doctor.ts";
import { NativeProcessRunner } from "../src/native-process.ts";
import { observeRepositoryCheckDockerCompatibility } from "../src/repository-check-compatibility.ts";
import { repositoryCheckStagingIdentity } from "../src/repository-check-identity.ts";
import {
  createRepositoryCheckExecutionPlan,
  DockerCliRepositoryCheckPort,
  executeRepositoryCheck,
} from "../src/repository-check-runner.ts";
import { RepositoryCheckSnapshotService } from "../src/repository-check-snapshot.ts";
import { prepareRepositoryCheckExecutionState } from "../src/repository-check-state.ts";
import { repositoryCheckToolchainManifest } from "../src/repository-check-toolchain.ts";

const dockerContext = process.env.EDEN_REPOSITORY_CHECK_DOCKER_CONTEXT;
const effectId = "effect-repository-check-real";

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function runGit(cwd: string, arguments_: readonly string[]): void {
  const result = spawnSync("git", arguments_, {
    cwd,
    encoding: "utf8",
    env: {
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH,
    },
  });
  strictEqual(result.status, 0, result.stderr);
}

test("repository-check runner completes one exact real Docker object and cleanup", {
  skip: dockerContext === undefined,
}, async () => {
  if (dockerContext === undefined) throw new Error("Docker context is required for this test.");
  const root = await mkdtemp(join(tmpdir(), "eden-repository-check-real-"));
  await chmod(root, 0o711);
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  await mkdir(join(workspace, ".eden/checks"), { recursive: true });
  await mkdir(join(workspace, "test"), { recursive: true });
  const catalogText = `${JSON.stringify({
    checks: [
      {
        name: "test",
        process: {
          arguments: ["--test", "test/check.test.js"],
          cwd: ".",
          executable: "/usr/local/bin/node",
        },
      },
    ],
    version: 1,
  })}\n`;
  await writeFile(join(workspace, ".eden/checks/catalog.json"), catalogText);
  await writeFile(join(workspace, "package.json"), '{"type":"module"}\n');
  await writeFile(
    join(workspace, "test/check.test.js"),
    'import test from "node:test";\nimport assert from "node:assert";\ntest("fixed", () => assert.equal(2 + 2, 4));\n',
  );
  runGit(workspace, ["init", "--quiet"]);
  runGit(workspace, ["config", "user.email", "fixture@example.invalid"]);
  runGit(workspace, ["config", "user.name", "Fixture"]);
  runGit(workspace, ["add", "."]);
  runGit(workspace, ["commit", "--quiet", "-m", "fixture"]);

  const snapshotService = new RepositoryCheckSnapshotService({
    stateDirectory,
    workspaceRoot: workspace,
  });
  const selection = await snapshotService.resolve("test");
  const staged = await snapshotService.stage({
    catalogSha256: selection.catalog.sha256,
    effectId,
    head: selection.catalog.head,
  });
  const runId = "run-repository-check-real";
  const platform = "linux/amd64" as const;
  const platformManifest = repositoryCheckToolchainManifest.platforms.find(
    (row) => row.platform === platform,
  );
  if (platformManifest === undefined) throw new Error("missing fixed platform manifest");
  const compatibility = observeRepositoryCheckDockerCompatibility(
    await new DockerCliDoctorPort({
      cwd: workspace,
      dockerContext,
      nativeProcess: new NativeProcessRunner(),
    }).inspect(),
  );
  strictEqual(compatibility.ok, true, compatibility.ok ? undefined : compatibility.error.message);
  if (!compatibility.ok) return;
  const action: RepositoryCheckActionEnvelopeV1 = {
    actionId: "action-repository-check-real",
    actionVersion: 1,
    authority: {
      environmentClass: "closed_non_secret",
      executionMode: "docker_container",
      isolation: "linux_container",
      network: "none",
      policyVersion: 1,
      ruleSetRevision: "r2-docker-repository-check-v1",
    },
    baseSnapshots: [],
    budgets: {
      cpuCount: 1,
      fileDescriptors: 256,
      fileSizeBytes: 16_777_216,
      internalResultBytes: 65_536,
      memoryBytes: 268_435_456,
      memorySwapBytes: 268_435_456,
      pids: 64,
      snapshotFileBytes: 1_048_576,
      snapshotFiles: 64,
      stagingBytes: 8_388_608,
      stderrBytes: 16_384,
      stopGraceMs: 2_000,
      stdoutBytes: 16_384,
      timeoutMs: 30_000,
      tmpfsBytes: 16_777_216,
    },
    cwd: ".",
    dockerCompatibility: compatibility.value,
    kind: "repository_check_v1",
    lifetime: { kind: "single_use_proposal_revision", revision: 1 },
    mounts: {
      control: {
        access: "read_only",
        containerPath: "/run/eden/request.json",
        source: "closed_process_request",
      },
      result: {
        access: "read_write",
        containerPath: "/run/eden/result.json",
        source: "result_file",
      },
      temporary: {
        access: "read_write_tmpfs",
        containerPath: "/tmp",
        source: "tmpfs",
      },
      workspace: {
        access: "read_only",
        containerPath: "/workspace",
        source: "repository_snapshot",
      },
    },
    operation: { ...selection, type: "repository_check_v1" },
    profile: {
      autoRemove: false,
      capabilities: "drop_all",
      environment: {
        CI: "1",
        HOME: "/tmp/eden-home",
        LANG: "C.UTF-8",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      },
      hostNamespaces: "none",
      linuxUser: 65_532,
      network: "none",
      noNewPrivileges: true,
      profileRevision: "r2-docker-profile-v1",
      restart: "disabled",
      rootFilesystem: "read_only",
      seccomp: "docker_default",
      sockets: "none",
      workspaceMount: "read_only",
    },
    proposalRevision: 1,
    repositorySnapshot: staged.manifest,
    runId,
    scope: { capability: "repository.execute.named_check", paths: ["."] },
    staging: {
      identity: repositoryCheckStagingIdentity({
        effectId,
        inputManifestDigest: staged.manifest.digest,
        runId,
      }),
    },
    toolchain: {
      imageIndexDigest: repositoryCheckToolchainManifest.imageIndexDigest,
      nodeMajor: 24,
      platformManifestDigest: platformManifest.manifestDigest,
      platforms: repositoryCheckToolchainManifest.platforms,
      profileRevision: "r2-docker-profile-v1",
      requestedPlatform: platform,
      toolchainId: "eden-node24-check-v1",
      wrapperContentHash: repositoryCheckToolchainManifest.wrapperContentHash,
      wrapperProtocolVersion: 1,
    },
    workspace: {
      canonicalRootHash: hash(`eden-canonical-root-v1\0${workspace}`),
      workspaceId: "workspace-repository-check-real",
    },
  };
  const planned = createRepositoryCheckExecutionPlan(action, effectId);
  strictEqual(planned.ok, true);
  if (!planned.ok) return;
  const state = await prepareRepositoryCheckExecutionState({
    cleanupStaging: staged.cleanup,
    effectId,
    plan: planned.plan,
    stateDirectory,
    validateStaging: staged.validate,
    workspace: staged.directory,
  });
  const port = new DockerCliRepositoryCheckPort({
    cwd: workspace,
    dockerContext,
  });
  try {
    const completed = await executeRepositoryCheck(
      { action, effectId },
      {
        clock: () => new Date().toISOString(),
        id: () => "receipt-repository-check-real",
        markDispatchStarted: async () => undefined,
        port,
        state,
      },
    );
    strictEqual(completed.ok, true, completed.ok ? undefined : completed.code);
    if (!completed.ok) return;
    strictEqual(completed.event.result.outcome, "passed");
    strictEqual(completed.event.result.cleanup.status, "complete");
    strictEqual((await port.locate(planned.plan)).status, "absent");
  } finally {
    const location = await port.locate(planned.plan);
    if (location.status === "found") await port.remove(location.id);
    try {
      await staged.cleanup();
    } catch {
      // The runner removes the exact staging tree on successful completion.
    }
    await rm(root, { force: true, recursive: true });
  }
});

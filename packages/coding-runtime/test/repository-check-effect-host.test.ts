import { deepStrictEqual, strictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";

import type { RepositoryCheckActionEnvelopeV1 } from "@eden/contracts";
import type { KernelEffect, KernelEvent } from "@eden/kernel";

import type { DockerDoctorObservation, DockerDoctorPort } from "../src/docker-doctor.ts";
import { RepositoryCheckEffectHost } from "../src/repository-check-effect-host.ts";
import type {
  RepositoryCheckExecutionPaths,
  RepositoryCheckExecutionPlan,
  RepositoryCheckExecutionPort,
} from "../src/repository-check-runner.ts";
import { RepositoryCheckSnapshotService } from "../src/repository-check-snapshot.ts";

const windowsTest = process.platform === "win32" ? test : test.skip;

function skipWithoutPosix(context: TestContext): boolean {
  if (process.platform !== "win32") return false;
  context.skip("requires POSIX filesystem permission semantics");
  return true;
}

const readyObservation = {
  client: {
    status: "ready",
    value: {
      apiVersion: "1.51",
      architecture: "amd64",
      operatingSystem: "linux",
      version: "29.6.2",
    },
  },
  context: {
    status: "ready",
    value: { endpoint: "unix:///tmp/eden-test.sock", name: "eden-test" },
  },
  daemon: {
    status: "ready",
    value: {
      apiVersion: "1.51",
      architecture: "amd64",
      cgroupVersion: "2",
      cpuCfsPeriod: true,
      cpuCfsQuota: true,
      memoryLimit: true,
      minApiVersion: "1.24",
      operatingSystem: "Docker Engine - Community",
      osType: "linux",
      pidsLimit: true,
      platformName: "Docker Engine - Community",
      securityOptions: ["name=seccomp,profile=builtin", "name=userns", "name=cgroupns"],
      serverVersion: "29.6.2",
      swapLimit: true,
    },
  },
  image: {
    status: "ready",
    value: {
      architecture: "amd64",
      configDigest: "sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443",
      entrypoint: ["/nodejs/bin/node", "/opt/eden/wrapper.mjs"],
      indexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
      manifestDigest: "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
      manifestEvidence: "frozen_config_mapping",
      operatingSystem: "linux",
      user: "65532:65532",
      workingDirectory: "/workspace",
    },
  },
  orphans: { status: "ready", value: [] },
} satisfies DockerDoctorObservation;

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "eden-repository-effect-"));
  await chmod(root, 0o711);
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  await mkdir(join(workspace, ".eden/checks"), { recursive: true });
  await writeFile(
    join(workspace, ".eden/checks/catalog.json"),
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
  for (const arguments_ of [
    ["init", "--quiet"],
    ["config", "user.email", "fixture@example.invalid"],
    ["config", "user.name", "Fixture"],
    ["add", "."],
    ["commit", "--quiet", "-m", "fixture"],
  ]) {
    execFileSync("git", arguments_, { cwd: workspace, stdio: "pipe" });
  }
  return { root, stateDirectory, workspace };
}

function prepareEffect(
  workspace: string,
): Extract<KernelEffect, { type: "repository_check.prepare" }> {
  return {
    effectId: "repository-check-run-effect-1-prepare",
    executionEffectId: "repository-check-run-effect-1",
    expectedRevision: 7,
    proposalRevision: 1,
    runId: "run-effect-1",
    toolCall: {
      arguments: { checkName: "test" },
      name: "repository_check",
      toolCallId: "tool-call-repository-check-1",
    },
    type: "repository_check.prepare",
    workspace: { name: "fixture", root: workspace, trust: "trusted", workspaceId: "workspace-1" },
  };
}

class PassingExecutionPort implements RepositoryCheckExecutionPort {
  readonly calls: string[] = [];
  #paths: RepositoryCheckExecutionPaths | null = null;
  #plan: RepositoryCheckExecutionPlan | null = null;
  #state: "absent" | "created" | "exited" | "running" = "absent";
  readonly containerId = "a".repeat(64);

  async create(plan: RepositoryCheckExecutionPlan, paths: RepositoryCheckExecutionPaths) {
    this.calls.push("create");
    this.#plan = plan;
    this.#paths = paths;
    this.#state = "created";
    return { id: this.containerId, name: plan.containerName };
  }

  async inspect(plan: RepositoryCheckExecutionPlan) {
    this.calls.push("inspect");
    return this.#state === "absent"
      ? ({ status: "absent" } as const)
      : ({
          inspection: {
            exitCode: 0,
            id: this.containerId,
            name: plan.containerName,
            oomKilled: false,
            state: this.#state,
          },
          status: "found",
        } as const);
  }

  async kill() {
    this.calls.push("kill");
    this.#state = "exited";
    return true;
  }

  async locate(plan: RepositoryCheckExecutionPlan) {
    this.calls.push("locate");
    return this.#state === "absent"
      ? ({ status: "absent" } as const)
      : ({ id: this.containerId, name: plan.containerName, status: "found" } as const);
  }

  async remove() {
    this.calls.push("remove");
    this.#state = "absent";
    return true;
  }

  async start() {
    this.calls.push("start");
    this.#state = "running";
    if (this.#paths === null || this.#plan === null) return false;
    const emptyHash = "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    await writeFile(
      this.#paths.result,
      `${JSON.stringify({
        actionId: this.#plan.action.actionId,
        checkName: this.#plan.action.operation.checkName,
        effectId: this.#plan.labels.effectId,
        endedAt: "2026-08-01T12:00:01.000Z",
        exitCode: 0,
        inputManifestDigest: this.#plan.action.repositorySnapshot.digest,
        outcome: "passed",
        resultVersion: 1,
        startedAt: "2026-08-01T12:00:00.000Z",
        stderr: "",
        stderrByteLength: 0,
        stderrEncoding: "base64",
        stderrSha256: emptyHash,
        stdout: "",
        stdoutByteLength: 0,
        stdoutEncoding: "base64",
        stdoutSha256: emptyHash,
        wrapperProtocolVersion: 1,
        wrapperReason: "process_exited",
      })}\n`,
    );
    return true;
  }

  async stop() {
    this.calls.push("stop");
    this.#state = "exited";
    return true;
  }

  async wait() {
    this.calls.push("wait");
    this.#state = "exited";
    return { exitCode: 0, status: "exited" as const };
  }
}

test("repository-check effect prepares without staging and executes one exact lifecycle", async (context) => {
  if (skipWithoutPosix(context)) return;
  const { root, stateDirectory, workspace } = await fixture();
  const execution = new PassingExecutionPort();
  const doctor: DockerDoctorPort = { inspect: async () => readyObservation };
  const host = new RepositoryCheckEffectHost({
    clock: () => "2026-08-01T12:00:02.000Z",
    doctor,
    execution,
    id: () => "receipt-repository-check-effect-1",
    snapshot: new RepositoryCheckSnapshotService({ stateDirectory, workspaceRoot: workspace }),
    stateDirectory,
  });
  try {
    const proposed = await host.execute(prepareEffect(workspace));
    strictEqual(proposed.type, "safe.action.proposed");
    if (proposed.type !== "safe.action.proposed") return;
    strictEqual(
      await readFile(
        join(stateDirectory, "repository-check-staging", "repository-check-run-effect-1"),
      ).then(
        () => "present",
        () => "missing",
      ),
      "missing",
    );
    const lifecycle: KernelEvent[] = [];
    const completed = await host.execute(
      {
        effectId: "repository-check-run-effect-1",
        envelope: proposed.action.safeActuation.envelope as RepositoryCheckActionEnvelopeV1,
        runId: "run-effect-1",
        type: "repository_check.execute",
      },
      undefined,
      async (event) => {
        lifecycle.push(event);
      },
    );
    strictEqual(completed.type, "repository.check.completed");
    deepStrictEqual(
      lifecycle.map((event) =>
        event.type === "repository.check.lifecycle" ? event.state : event.type,
      ),
      ["preparing", "creating", "created", "running", "exited", "result_decoded", "cleaning"],
    );
    deepStrictEqual(
      execution.calls.filter((call) => call === "create"),
      ["create"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

windowsTest("repository-check effect fails closed before native Windows execution", async () => {
  const { root, stateDirectory, workspace } = await fixture();
  const execution = new PassingExecutionPort();
  const host = new RepositoryCheckEffectHost({
    doctor: { inspect: async () => readyObservation },
    execution,
    snapshot: new RepositoryCheckSnapshotService({ stateDirectory, workspaceRoot: workspace }),
    stateDirectory,
  });
  try {
    const proposed = await host.execute(prepareEffect(workspace));
    strictEqual(proposed.type, "safe.action.proposed");
    if (proposed.type !== "safe.action.proposed") return;
    const blocked = await host.execute({
      effectId: "repository-check-run-effect-1",
      envelope: proposed.action.safeActuation.envelope as RepositoryCheckActionEnvelopeV1,
      runId: "run-effect-1",
      type: "repository_check.execute",
    });
    strictEqual(blocked.type, "run.blocked");
    deepStrictEqual(execution.calls, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("repository-check effect blocks compatibility drift before staging or Docker mutation", async () => {
  const { root, stateDirectory, workspace } = await fixture();
  const execution = new PassingExecutionPort();
  let observations = 0;
  const doctor: DockerDoctorPort = {
    inspect: async () => {
      observations += 1;
      return observations === 1
        ? readyObservation
        : {
            ...readyObservation,
            daemon: {
              ...readyObservation.daemon,
              value: { ...readyObservation.daemon.value, serverVersion: "29.6.3" },
            },
          };
    },
  };
  const host = new RepositoryCheckEffectHost({
    doctor,
    execution,
    snapshot: new RepositoryCheckSnapshotService({ stateDirectory, workspaceRoot: workspace }),
    stateDirectory,
  });
  try {
    const proposed = await host.execute(prepareEffect(workspace));
    strictEqual(proposed.type, "safe.action.proposed");
    if (proposed.type !== "safe.action.proposed") return;
    const blocked = await host.execute({
      effectId: "repository-check-run-effect-1",
      envelope: proposed.action.safeActuation.envelope as RepositoryCheckActionEnvelopeV1,
      runId: "run-effect-1",
      type: "repository_check.execute",
    });
    strictEqual(blocked.type, "run.blocked");
    deepStrictEqual(execution.calls, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("repository-check effect removes newly staged bytes when compatibility drifts before create", async () => {
  const { root, stateDirectory, workspace } = await fixture();
  const execution = new PassingExecutionPort();
  let observations = 0;
  const doctor: DockerDoctorPort = {
    inspect: async () => {
      observations += 1;
      return observations < 3
        ? readyObservation
        : {
            ...readyObservation,
            daemon: {
              ...readyObservation.daemon,
              value: { ...readyObservation.daemon.value, serverVersion: "29.6.3" },
            },
          };
    },
  };
  const host = new RepositoryCheckEffectHost({
    doctor,
    execution,
    snapshot: new RepositoryCheckSnapshotService({ stateDirectory, workspaceRoot: workspace }),
    stateDirectory,
  });
  try {
    const proposed = await host.execute(prepareEffect(workspace));
    strictEqual(proposed.type, "safe.action.proposed");
    if (proposed.type !== "safe.action.proposed") return;
    const blocked = await host.execute({
      effectId: "repository-check-run-effect-1",
      envelope: proposed.action.safeActuation.envelope as RepositoryCheckActionEnvelopeV1,
      runId: "run-effect-1",
      type: "repository_check.execute",
    });
    strictEqual(blocked.type, "run.blocked");
    deepStrictEqual(execution.calls, []);
    strictEqual(
      await readFile(
        join(stateDirectory, "repository-check-staging", "repository-check-run-effect-1"),
      ).then(
        () => "present",
        () => "missing",
      ),
      "missing",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

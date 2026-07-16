import { lstat, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import type { FakeModelRequestV1, FakeModelResponseV1, ModelDriver } from "@eden/providers";

import { AgentClientError, InProcessAgentClient } from "../../src/agent-client.ts";
import { WorkspaceTrustError, WorkspaceTrustService } from "../../src/workspace/index.ts";
import { acquireWorkspaceLock } from "../../src/workspace/workspace-lock.ts";

const [operation, cwd, stateDirectory, ...parameters] = process.argv.slice(2);
if (operation === undefined || cwd === undefined || stateDirectory === undefined) {
  throw new Error("Invalid workspace trust matrix fixture arguments.");
}
const workspacePath = cwd;
const statePath = stateDirectory;

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function barrier(acquiredPath: string, releasePath: string): Promise<void> {
  await writeFile(acquiredPath, "acquired\n", "utf8");
  while (!(await exists(releasePath))) await delay(10);
}

class ProbeModelDriver implements ModelDriver {
  readonly id = "process-matrix-probe-model";
  private readonly calledPath: string | undefined;

  constructor(calledPath?: string) {
    this.calledPath = calledPath;
  }

  async complete(_request: FakeModelRequestV1, _signal: AbortSignal): Promise<FakeModelResponseV1> {
    if (this.calledPath !== undefined) await writeFile(this.calledPath, "called\n", "utf8");
    return {
      proposal: {
        kind: "deterministic-fake-action",
        summary: "Run the deterministic fake task",
      },
      version: 1,
    };
  }
}

async function startRun(
  runId: string,
  options?: {
    readonly acquiredPath?: string;
    readonly idConsumedPath?: string;
    readonly modelCalledPath?: string;
    readonly releasePath?: string;
    readonly signal?: AbortSignal;
  },
): Promise<void> {
  const ids = [runId, "event-start", "event-model-intent", "event-model-result"];
  let cursor = 0;
  const client = await InProcessAgentClient.open({
    cwd: workspacePath,
    idSource: {
      next() {
        const id = ids[cursor];
        cursor += 1;
        if (id === undefined) throw new Error("Process matrix ID source exhausted.");
        if (cursor === 1 && options?.idConsumedPath !== undefined) {
          void writeFile(options.idConsumedPath, "consumed\n", "utf8");
        }
        return id;
      },
    },
    modelDriver: new ProbeModelDriver(options?.modelCalledPath),
    stateDirectory: statePath,
  });
  if (options?.acquiredPath !== undefined && options.releasePath !== undefined) {
    await barrier(options.acquiredPath, options.releasePath);
  }
  await client.submit(
    {
      commandId: `process-start-${process.pid}`,
      protocolVersion: 1,
      task: "Process matrix fake task",
      type: "run.start",
    },
    options?.signal === undefined ? undefined : { signal: options.signal },
  );
  await client.close();
}

try {
  switch (operation) {
    case "hold-lock": {
      const [acquiredPath, releasePath] = parameters;
      if (acquiredPath === undefined || releasePath === undefined)
        throw new Error("Missing barrier.");
      const service = await WorkspaceTrustService.open({ cwd, stateDirectory });
      const lock = await acquireWorkspaceLock({
        acquiredAt: "2026-07-16T00:00:00.000Z",
        stateDirectory,
        token: `holder-${process.pid}`,
        workspaceId: service.identity.workspaceId,
      });
      await barrier(acquiredPath, releasePath);
      await lock.release();
      break;
    }
    case "resolve": {
      const [decision, acquiredPath, releasePath] = parameters;
      if (
        (decision !== "trust" && decision !== "restrict") ||
        acquiredPath === undefined ||
        releasePath === undefined
      ) {
        throw new Error("Missing trust competition arguments.");
      }
      const service = await WorkspaceTrustService.open({ cwd, stateDirectory });
      const review = service.getReview();
      await barrier(acquiredPath, releasePath);
      await service.resolve({
        commandId: `process-resolve-${process.pid}`,
        decision,
        expectedRevision: review.revision,
        protocolVersion: 1,
        type: "workspace.trust.resolve",
        workspaceId: review.workspace.workspaceId,
      });
      break;
    }
    case "start": {
      const [runId] = parameters;
      if (runId === undefined) throw new Error("Missing run ID.");
      await startRun(runId);
      break;
    }
    case "start-abort": {
      const [runId] = parameters;
      if (runId === undefined) throw new Error("Missing run ID.");
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 100);
      await startRun(runId, { signal: controller.signal });
      break;
    }
    case "start-delayed": {
      const [runId, acquiredPath, releasePath, idConsumedPath, modelCalledPath] = parameters;
      if (
        runId === undefined ||
        acquiredPath === undefined ||
        releasePath === undefined ||
        idConsumedPath === undefined ||
        modelCalledPath === undefined
      ) {
        throw new Error("Missing delayed start arguments.");
      }
      await startRun(runId, { acquiredPath, idConsumedPath, modelCalledPath, releasePath });
      break;
    }
    default:
      throw new Error("Unknown workspace trust matrix operation.");
  }
  process.stdout.write(`${operation}:passed\n`);
} catch (error) {
  if (error instanceof AgentClientError || error instanceof WorkspaceTrustError) {
    process.stderr.write(`${error.productError.code}\n`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}

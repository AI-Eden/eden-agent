import { lstat, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import type { FakeModelRequestV1, FakeModelResponseV1, ModelDriver } from "@eden/providers";

import { AgentClientError, InProcessAgentClient } from "../../src/agent-client.ts";
import { WorkspaceTrustError, WorkspaceTrustService } from "../../src/workspace/index.ts";

const [operation, cwd, stateDirectory, acquiredPath, releasePath] = process.argv.slice(2);
if (
  (operation !== "start" && operation !== "restrict") ||
  cwd === undefined ||
  stateDirectory === undefined
) {
  throw new Error("Invalid workspace-trust process fixture arguments.");
}

class BarrierModelDriver implements ModelDriver {
  readonly id = "process-barrier-model";

  async complete(_request: FakeModelRequestV1, _signal: AbortSignal): Promise<FakeModelResponseV1> {
    if (acquiredPath === undefined || releasePath === undefined) {
      throw new Error("Start fixture requires barrier paths.");
    }
    await writeFile(acquiredPath, "model-dispatched\n", "utf8");
    while (!(await exists(releasePath))) await delay(10);
    return {
      proposal: {
        kind: "deterministic-fake-action",
        summary: "Run the deterministic fake task",
      },
      version: 1,
    };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

try {
  if (operation === "restrict") {
    const service = await WorkspaceTrustService.open({ cwd, stateDirectory });
    const review = service.getReview();
    await service.resolve({
      commandId: `process-restrict-${process.pid}`,
      decision: "restrict",
      expectedRevision: review.revision,
      protocolVersion: 1,
      type: "workspace.trust.resolve",
      workspaceId: review.workspace.workspaceId,
    });
  } else {
    const ids = ["run-process-start", "event-start", "event-model-intent", "event-model-result"];
    let cursor = 0;
    const client = await InProcessAgentClient.open({
      cwd,
      idSource: {
        next() {
          const id = ids[cursor];
          cursor += 1;
          if (id === undefined) throw new Error("Process ID source exhausted.");
          return id;
        },
      },
      modelDriver: new BarrierModelDriver(),
      stateDirectory,
    });
    await client.submit({
      commandId: "process-run-start",
      protocolVersion: 1,
      task: "Process barrier fake task",
      type: "run.start",
    });
    await client.close();
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

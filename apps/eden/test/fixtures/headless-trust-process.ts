import { lstat, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

import { AgentClientError, InProcessAgentClient } from "@eden/coding-runtime";

import { runHeadless } from "../../src/headless.ts";

type OpenOptions = Parameters<typeof InProcessAgentClient.open>[0];
type ModelDriver = NonNullable<OpenOptions["modelDriver"]>;

const [operation, cwd, stateDirectory, acquiredPath, releasePath] = process.argv.slice(2);
if (
  (operation !== "start" && operation !== "restrict") ||
  cwd === undefined ||
  stateDirectory === undefined
) {
  throw new Error("Invalid headless trust-process fixture arguments.");
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

class BarrierModelDriver implements ModelDriver {
  readonly id = "headless-process-barrier-model";

  async complete(
    _request: Parameters<ModelDriver["complete"]>[0],
    _signal: Parameters<ModelDriver["complete"]>[1],
  ): ReturnType<ModelDriver["complete"]> {
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

try {
  if (operation === "restrict") {
    const client = await InProcessAgentClient.open({ cwd, stateDirectory });
    const review = await client.getWorkspaceReview();
    await client.resolveWorkspaceTrust({
      commandId: `headless-process-restrict-${process.pid}`,
      decision: "restrict",
      expectedRevision: review.revision,
      protocolVersion: 1,
      type: "workspace.trust.resolve",
      workspaceId: review.workspace.workspaceId,
    });
    await client.close();
    process.stdout.write("restrict:passed\n");
  } else {
    const deterministicIds = [
      "run-headless-process",
      "event-start",
      "event-model-intent",
      "event-model-result",
      "event-approval",
      "event-action-intent",
      "event-action-result",
      "event-verifier-intent",
      "event-verifier-result",
    ];
    let cursor = 0;
    const exitCode = await runHeadless(
      {
        approveFakeAction: true,
        task: "Headless process barrier fake task",
        trustWorkspace: false,
      },
      {
        cwd,
        io: {
          stderr: (value) => process.stderr.write(value),
          stdout: (value) => process.stdout.write(value),
        },
        openClient: (options) =>
          InProcessAgentClient.open({
            ...options,
            idSource: {
              next() {
                const id = deterministicIds[cursor];
                cursor += 1;
                if (id === undefined) throw new Error("Headless process ID source exhausted.");
                return id;
              },
            },
            modelDriver: new BarrierModelDriver(),
          }),
        stateDirectory,
      },
    );
    process.exitCode = exitCode;
  }
} catch (error) {
  if (error instanceof AgentClientError) {
    process.stderr.write(`${JSON.stringify(error.productError)}\n`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}

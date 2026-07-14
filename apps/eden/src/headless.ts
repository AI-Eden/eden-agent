import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { AgentClientError, InProcessAgentClient } from "@eden/coding-runtime";
import type { ProductError, ProductEvent } from "@eden/contracts";

export type HeadlessOptions = {
  readonly approveFakeAction: boolean;
  readonly task: string;
};

export type HeadlessEnvironment = {
  readonly cwd: string;
  readonly io: {
    readonly stderr: (value: string) => void;
    readonly stdout: (value: string) => void;
  };
  readonly stateDirectory: string;
};

function writeError(error: ProductError, environment: HeadlessEnvironment): void {
  environment.io.stderr(`${JSON.stringify(error)}\n`);
}

async function collect(iterable: AsyncIterable<ProductEvent>): Promise<readonly ProductEvent[]> {
  const events: ProductEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

async function take(
  iterable: AsyncIterable<ProductEvent>,
  count: number,
): Promise<readonly ProductEvent[]> {
  const events: ProductEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
    if (events.length === count) break;
  }
  return events;
}

function writeEvents(events: readonly ProductEvent[], environment: HeadlessEnvironment): void {
  for (const event of events) environment.io.stdout(`${JSON.stringify(event)}\n`);
}

export async function runHeadless(
  options: HeadlessOptions,
  environment: HeadlessEnvironment,
): Promise<number> {
  const runId = randomUUID();
  let client: InProcessAgentClient | null = null;
  try {
    client = await InProcessAgentClient.open({
      cwd: environment.cwd,
      runId,
      stateDirectory: environment.stateDirectory,
      workspace: {
        name: basename(environment.cwd) || "workspace",
        trust: "trusted",
        workspaceId: `workspace:${runId}`,
      },
    });
    const awaiting = await client.submit({
      commandId: randomUUID(),
      protocolVersion: 1,
      task: options.task,
      type: "run.start",
    });
    if (!options.approveFakeAction) {
      writeEvents(await take(client.subscribe(runId), 2), environment);
      writeError(
        {
          code: "approval_required",
          message:
            "Headless execution requires --approve-fake-action for the displayed fake action.",
          recoverability: "ask-user",
          suggestedActions: ["Review the action and rerun with --approve-fake-action."],
        },
        environment,
      );
      return 2;
    }
    const approval = awaiting.approval;
    if (approval === null) throw new Error("The started fake task did not request approval.");
    await client.submit({
      approvalId: approval.approvalId,
      commandId: randomUUID(),
      decision: "approve",
      expectedRevision: awaiting.revision,
      protocolVersion: 1,
      runId,
      type: "approval.resolve",
    });
    writeEvents(await collect(client.subscribe(runId)), environment);
    return 0;
  } catch (error) {
    const productError =
      error instanceof AgentClientError
        ? error.productError
        : {
            code: "runtime_failure",
            message: error instanceof Error ? error.message : "The headless runtime failed.",
            recoverability: "fatal" as const,
            suggestedActions: ["Inspect the state directory and retry."],
          };
    writeError(productError, environment);
    return 1;
  } finally {
    await client?.close();
  }
}

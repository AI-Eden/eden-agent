import { randomUUID } from "node:crypto";
import { AgentClientError, InProcessAgentClient } from "@eden/coding-runtime";
import type { ProductError, ProductEvent } from "@eden/contracts";

export type HeadlessOptions = {
  readonly approveFakeAction: boolean;
  readonly task: string;
  readonly trustWorkspace: boolean;
};

export type HeadlessEnvironment = {
  readonly cwd: string;
  readonly io: {
    readonly stderr: (value: string) => void;
    readonly stdout: (value: string) => void;
  };
  readonly openClient?: typeof InProcessAgentClient.open;
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

async function takeThroughApproval(
  iterable: AsyncIterable<ProductEvent>,
): Promise<readonly ProductEvent[]> {
  const events: ProductEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
    if (event.type === "approval.presented") break;
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
  let client: InProcessAgentClient | null = null;
  try {
    client = await (environment.openClient ?? InProcessAgentClient.open)({
      cwd: environment.cwd,
      stateDirectory: environment.stateDirectory,
    });
    if (options.trustWorkspace) {
      const review = await client.getWorkspaceReview();
      await client.resolveWorkspaceTrust({
        commandId: randomUUID(),
        decision: "trust",
        expectedRevision: review.revision,
        protocolVersion: 1,
        type: "workspace.trust.resolve",
        workspaceId: review.workspace.workspaceId,
      });
    }
    const awaiting = await client.submit({
      commandId: randomUUID(),
      protocolVersion: 1,
      task: options.task,
      type: "run.start",
    });
    const runId = awaiting.runId;
    if (!options.approveFakeAction) {
      writeEvents(await takeThroughApproval(client.subscribe(runId)), environment);
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
            message: "Headless execution failed without exposing local state details.",
            recoverability: "fatal" as const,
            suggestedActions: ["Inspect the state directory and retry."],
          };
    writeError(productError, environment);
    return productError.code === "workspace_trust_required" ? 2 : 1;
  } finally {
    await client?.close();
  }
}

import { randomUUID } from "node:crypto";
import {
  AgentClientError,
  InProcessAgentClient,
  type InProcessAgentClientOptions,
} from "@eden/coding-runtime";
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
  readonly repositoryTools?: InProcessAgentClientOptions["repositoryTools"];
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

async function takeThroughRevision(
  iterable: AsyncIterable<ProductEvent>,
  revision: number,
): Promise<readonly ProductEvent[]> {
  const events: ProductEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
    if (event.revision >= revision && event.type === "model.attempt.updated") break;
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
      ...(environment.repositoryTools === undefined
        ? {}
        : { repositoryTools: environment.repositoryTools }),
      realProviderRuns: options.approveFakeAction ? false : "when-configured",
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
    if (awaiting.terminalOutcome?.state === "completed") {
      writeEvents(await collect(client.subscribe(runId)), environment);
      return 0;
    }
    if (awaiting.terminalOutcome !== null) {
      writeEvents(await collect(client.subscribe(runId)), environment);
      if (
        awaiting.terminalOutcome.state === "blocked" ||
        awaiting.terminalOutcome.state === "failed"
      ) {
        writeError(awaiting.terminalOutcome.error, environment);
      }
      return 1;
    }
    if (awaiting.phase === "awaiting-retry") {
      writeEvents(
        await takeThroughRevision(client.subscribe(runId), awaiting.revision),
        environment,
      );
      writeError(
        awaiting.retry?.reason ?? {
          code: "model_retry_required",
          message: "The provider model attempt requires an explicit retry.",
          recoverability: "ask-user",
          suggestedActions: ["Retry this run through an interactive client."],
        },
        environment,
      );
      return 1;
    }
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

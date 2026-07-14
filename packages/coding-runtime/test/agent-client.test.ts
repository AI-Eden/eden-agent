import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ProductCommand, ProductEvent } from "@eden/contracts";

import { AgentClientError, InProcessAgentClient } from "../src/agent-client.ts";

const workspace = {
  name: "eden-agent",
  trust: "trusted",
  workspaceId: "workspace-eden-agent",
} as const;

async function stateDirectory() {
  return mkdtemp(join(tmpdir(), "eden-client-"));
}

function startCommand(commandId: string): ProductCommand {
  return { commandId, protocolVersion: 1, task: "Index the fake workspace", type: "run.start" };
}

function approvalCommand(revision: number): ProductCommand {
  return {
    approvalId: "run-1:fake-approval",
    commandId: `command-approval-${revision}`,
    decision: "approve",
    expectedRevision: revision,
    protocolVersion: 1,
    runId: "run-1",
    type: "approval.resolve",
  };
}

async function collect(iterable: AsyncIterable<ProductEvent>): Promise<readonly ProductEvent[]> {
  const events: ProductEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test("one client completes a verifier-backed run and another replays the same product truth", async () => {
  // Given: an in-process client over a fresh real state directory.
  const directory = await stateDirectory();
  const first = await InProcessAgentClient.open({
    cwd: ".",
    runId: "run-1",
    stateDirectory: directory,
    workspace,
  });

  // When: start and approval commands traverse the real runtime stack.
  const awaiting = await first.submit(startCommand("command-run-1"));
  const terminal = await first.submit(approvalCommand(awaiting.revision));
  const events = await collect(first.subscribe("run-1"));
  await first.close();
  const reopened = await InProcessAgentClient.open({
    cwd: ".",
    runId: "run-1",
    stateDirectory: directory,
    workspace,
  });

  // Then: success has verifier evidence and replay reconstructs the deep-equal snapshot.
  strictEqual(terminal.terminalOutcome?.state, "succeeded");
  if (terminal.terminalOutcome?.state !== "succeeded") throw new Error("Expected success.");
  strictEqual(terminal.terminalOutcome.evidenceRef, "run-1:fake-evidence");
  strictEqual(events.at(-1)?.type, "run.terminal");
  deepStrictEqual(await reopened.getSnapshot("run-1"), terminal);
  deepStrictEqual(
    await collect(reopened.subscribe("run-1", 2)),
    events.filter((event) => event.cursor > 2),
  );
  await reopened.close();
});

test("a stale approval appends nothing", async () => {
  // Given: a run waiting at revision one.
  const client = await InProcessAgentClient.open({
    cwd: ".",
    runId: "run-1",
    stateDirectory: await stateDirectory(),
    workspace,
  });
  const before = await client.submit(startCommand("command-run-1"));

  // When: approval carries an earlier expected revision.
  await rejects(
    client.submit(approvalCommand(0)),
    (error) => error instanceof AgentClientError && error.productError.code === "stale_revision",
  );

  // Then: the authoritative revision and snapshot are unchanged.
  deepStrictEqual(await client.getSnapshot("run-1"), before);
  await client.close();
});

test("aborting a subscription wait does not alter run truth", async () => {
  // Given: a client whose initial awaiting-approval events have already been consumed.
  const client = await InProcessAgentClient.open({
    cwd: ".",
    runId: "run-1",
    stateDirectory: await stateDirectory(),
    workspace,
  });
  const before = await client.submit(startCommand("command-run-1"));
  const controller = new AbortController();
  const iterator = client
    .subscribe("run-1", 1, { signal: controller.signal })
    [Symbol.asyncIterator]();

  // When: the caller aborts only the pending client wait.
  const pending = iterator.next();
  controller.abort();

  // Then: iteration closes cleanly and journal-derived truth is untouched.
  deepStrictEqual(await pending, { done: true, value: undefined });
  deepStrictEqual(await client.getSnapshot("run-1"), before);
  await client.close();
});

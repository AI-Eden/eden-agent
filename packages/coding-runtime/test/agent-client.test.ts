import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { mkdir, mkdtemp, readdir, readFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ProductCommand, ProductEvent, WorkspaceReview } from "@eden/contracts";

import { AgentClientError, InProcessAgentClient } from "../src/agent-client.ts";

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "eden-client-"));
  const stateDirectory = join(base, "state");
  const workspaceDirectory = join(base, "workspace");
  await mkdir(workspaceDirectory);
  return { stateDirectory, workspaceDirectory };
}

function ids(...values: readonly string[]) {
  let cursor = 0;
  return {
    next() {
      const value = values[cursor];
      cursor += 1;
      if (value === undefined) throw new Error("The deterministic ID source is exhausted.");
      return value;
    },
  };
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

function trustCommand(review: WorkspaceReview, decision: "trust" | "restrict") {
  return {
    commandId: `command-${decision}-${review.revision}`,
    decision,
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  } as const;
}

async function trust(client: InProcessAgentClient) {
  const review = await client.getWorkspaceReview();
  return client.resolveWorkspaceTrust(trustCommand(review, "trust"));
}

async function collect(iterable: AsyncIterable<ProductEvent>): Promise<readonly ProductEvent[]> {
  const events: ProductEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

test("a restricted client rejects task start without creating a run", async () => {
  // Given: a fresh client bound to an unreviewed canonical workspace.
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1"),
    stateDirectory: directories.stateDirectory,
  });

  // When: a task start reaches the runtime before trust is granted.
  await rejects(
    client.submit(startCommand("command-run-1")),
    (error) =>
      error instanceof AgentClientError &&
      deepStrictEqual(error.productError, {
        code: "workspace_trust_required",
        message: "Trust this exact workspace before starting a task.",
        recoverability: "ask-user",
        suggestedActions: ["Review the workspace and explicitly grant trust."],
      }) === undefined,
  );

  // Then: no run ID was consumed and no runs directory exists.
  deepStrictEqual(await readdir(directories.stateDirectory), []);
  await client.close();
});

test("one trusted client completes a run and another replays its journal-owned workspace", async () => {
  // Given: an in-process client over separate real workspace and state directories.
  const directories = await fixture();
  const first = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0", "event-1", "event-2", "event-3", "event-4", "event-5"),
    stateDirectory: directories.stateDirectory,
  });
  const trusted = await trust(first);

  // When: start and approval commands traverse the real runtime stack.
  const awaiting = await first.submit(startCommand("command-run-1"));
  const terminal = await first.submit(approvalCommand(awaiting.revision));
  const events = await collect(first.subscribe("run-1"));
  const journal = await readFile(
    join(directories.stateDirectory, "runs", "run-1", "journal.jsonl"),
    "utf8",
  );
  await first.close();
  const reopened = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    runId: "run-1",
    stateDirectory: directories.stateDirectory,
  });

  // Then: verifier evidence and the immutable canonical workspace reconstruct exactly.
  strictEqual(terminal.terminalOutcome?.state, "succeeded");
  if (terminal.terminalOutcome?.state !== "succeeded") throw new Error("Expected success.");
  strictEqual(terminal.terminalOutcome.evidenceRef, "run-1:fake-evidence");
  strictEqual(events.at(-1)?.type, "run.terminal");
  strictEqual(terminal.workspace.root, await realpath(directories.workspaceDirectory));
  strictEqual(terminal.workspace.workspaceId, trusted.workspace.workspaceId);
  deepStrictEqual(JSON.parse(journal.split("\n")[0] ?? "").payload.workspace, terminal.workspace);
  deepStrictEqual(await reopened.getSnapshot("run-1"), terminal);
  deepStrictEqual(
    await collect(reopened.subscribe("run-1", 2)),
    events.filter((event) => event.cursor > 2),
  );
  await reopened.close();
});

test("a stale approval appends nothing", async () => {
  // Given: a trusted run waiting at revision one.
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0"),
    stateDirectory: directories.stateDirectory,
  });
  await trust(client);
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
  // Given: a trusted client whose awaiting-approval events have already been consumed.
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0"),
    stateDirectory: directories.stateDirectory,
  });
  await trust(client);
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

test("revocation blocks a new run while the historical snapshot remains trusted", async () => {
  // Given: one trusted run whose workspace snapshot is already committed.
  const directories = await fixture();
  const first = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0"),
    stateDirectory: directories.stateDirectory,
  });
  const trusted = await trust(first);
  const historical = await first.submit(startCommand("command-run-1"));

  // When: trust is explicitly revoked and clients reopen old and new lifecycles.
  await first.resolveWorkspaceTrust(trustCommand(trusted, "restrict"));
  await first.close();
  const oldRun = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    runId: "run-1",
    stateDirectory: directories.stateDirectory,
  });
  const newRun = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-2"),
    stateDirectory: directories.stateDirectory,
  });

  // Then: historical truth is unchanged and current task authority is blocked.
  deepStrictEqual(await oldRun.getSnapshot("run-1"), historical);
  strictEqual((await oldRun.getSnapshot("run-1")).workspace.trust, "trusted");
  await rejects(
    newRun.submit(startCommand("command-run-2")),
    (error) =>
      error instanceof AgentClientError && error.productError.code === "workspace_trust_required",
  );
  await oldRun.close();
  await newRun.close();
});

test("opening an unknown supplied run ID never creates it", async () => {
  // Given: a fresh workspace with no runs.
  const directories = await fixture();

  // When and Then: existing-run mode rejects the missing journal without creating runs.
  await rejects(
    InProcessAgentClient.open({
      cwd: directories.workspaceDirectory,
      runId: "missing-run",
      stateDirectory: directories.stateDirectory,
    }),
    (error) => error instanceof AgentClientError && error.productError.code === "run_not_found",
  );
  deepStrictEqual(await readdir(directories.stateDirectory), []);
});

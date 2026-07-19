import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ProductCommand, WorkspaceReview } from "@eden/contracts";
import type { FakeModelRequestV1, FakeModelResponseV1, ModelDriver } from "@eden/providers";

import { InProcessAgentClient } from "../src/agent-client.ts";
import { FileJournal } from "../src/journal/index.ts";
import { projectJournal } from "../src/projection.ts";

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

function trustCommand(review: WorkspaceReview) {
  return {
    commandId: `command-trust-${review.revision}`,
    decision: "trust",
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  } as const;
}

class ReadThenAnswerDriver implements ModelDriver {
  readonly id = "read-then-answer";
  readonly requests: FakeModelRequestV1[] = [];

  async complete(request: FakeModelRequestV1, signal: AbortSignal): Promise<FakeModelResponseV1> {
    signal.throwIfAborted();
    this.requests.push(request);
    if (request.toolResult === undefined) {
      return {
        proposal: {
          call: {
            arguments: { maxBytes: 1_024, offset: 0, path: "nested/answer.txt" },
            name: "read_file",
            toolCallId: "tool-call-answer",
          },
          kind: "repository-tool-call",
        },
        version: 1,
      };
    }
    return {
      proposal: {
        kind: "deterministic-fake-action",
        summary: "Run the deterministic fake task",
      },
      version: 1,
    };
  }
}

class FailingReplayDriver implements ModelDriver {
  readonly id = "must-not-run-during-replay";
  calls = 0;

  async complete(): Promise<FakeModelResponseV1> {
    this.calls += 1;
    throw new Error("Replay dispatched the model unexpectedly.");
  }
}

test("one fake model tool round trip is durable, bounded, attributable, and replay-only", async () => {
  const base = await mkdtemp(join(tmpdir(), "eden-tool-roundtrip-"));
  const workspace = join(base, "workspace");
  const stateDirectory = join(base, "state");
  await mkdir(join(workspace, "nested"), { recursive: true });
  await writeFile(join(workspace, "AGENTS.md"), "# Root rules\n", "utf8");
  await writeFile(join(workspace, "nested", "AGENTS.md"), "# Nested rules\n", "utf8");
  const content = "The bounded answer is 42.\n";
  const target = join(workspace, "nested", "answer.txt");
  await writeFile(target, content, "utf8");
  const before = await readFile(target);
  const driver = new ReadThenAnswerDriver();
  const client = await InProcessAgentClient.open({
    cwd: workspace,
    idSource: ids(
      "run-tool-1",
      "event-0",
      "event-1",
      "event-2",
      "event-3",
      "event-4",
      "event-5",
      "event-6",
    ),
    modelDriver: driver,
    stateDirectory,
  });
  const review = await client.getWorkspaceReview();
  const trusted = await client.resolveWorkspaceTrust(trustCommand(review));
  const start: ProductCommand = {
    commandId: "command-tool-start",
    protocolVersion: 1,
    task: "Read the nested answer",
    type: "run.start",
  };

  const view = await client.submit(start);

  assert.equal(view.phase, "awaiting-approval");
  assert.equal(driver.requests.length, 2);
  assert.equal(driver.requests[0]?.toolResult, undefined);
  const continuation = driver.requests[1]?.toolResult;
  assert.equal(continuation?.status, "succeeded");
  if (continuation?.status !== "succeeded" || continuation.name !== "read_file") return;
  assert.deepEqual(continuation.data, {
    bytesRead: Buffer.byteLength(content),
    content,
    contentHash: `sha256:${createHash("sha256").update(content).digest("hex")}`,
    nextOffset: null,
    offset: 0,
    sourcePath: "nested/answer.txt",
    totalBytes: Buffer.byteLength(content),
  });
  assert.deepEqual(view.tools, [
    {
      call: {
        arguments: { maxBytes: 1_024, offset: 0, path: "nested/answer.txt" },
        name: "read_file",
        toolCallId: "tool-call-answer",
      },
      result: continuation,
      state: "completed",
    },
  ]);
  assert.deepEqual(await readFile(target), before);

  const journalPath = join(
    stateDirectory,
    "runs",
    "v1",
    trusted.workspace.workspaceId,
    "run-tool-1",
    "journal.jsonl",
  );
  const journal = await FileJournal.open(journalPath, "run-tool-1", false);
  const projection = projectJournal(await journal.readAll());
  assert.deepEqual(
    (await journal.readAll()).map((record) => record.type),
    [
      "run.started",
      "effect.requested",
      "fake.model.tool-requested",
      "effect.requested",
      "repository.tool.completed",
      "effect.requested",
      "fake.model.completed",
    ],
  );
  assert.deepEqual(
    projection.events
      .filter((event) => event.type === "tool.updated")
      .map((event) => event.activity.state),
    ["requested", "completed"],
  );
  await client.close();

  await rm(target);
  const replayDriver = new FailingReplayDriver();
  const replayed = await InProcessAgentClient.open({
    cwd: workspace,
    modelDriver: replayDriver,
    runId: "run-tool-1",
    stateDirectory,
  });
  assert.deepEqual((await replayed.getSnapshot("run-tool-1")).tools, view.tools);
  assert.equal(replayDriver.calls, 0);
  await replayed.close();
});

import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { ProductCommand, ProductEvent, RunId, WorkspaceReview } from "@eden/contracts";
import type { FakeModelRequestV1, FakeModelResponseV1, ModelDriver } from "@eden/providers";

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

class CountingModelDriver implements ModelDriver {
  readonly id = "counting-fake";
  calls = 0;

  async complete(_request: FakeModelRequestV1, _signal: AbortSignal): Promise<FakeModelResponseV1> {
    this.calls += 1;
    return {
      proposal: {
        kind: "deterministic-fake-action",
        summary: "Run the deterministic fake task",
      },
      version: 1,
    };
  }
}
test("a restricted client rejects task start without creating a run", async () => {
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1"),
    stateDirectory: directories.stateDirectory,
  });

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

  await rejects(lstat(directories.stateDirectory), { code: "ENOENT" });
  await client.close();
});

test("a client cannot start from cached trust after another client revokes it", async () => {
  const directories = await fixture();
  const owner = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    stateDirectory: directories.stateDirectory,
  });
  await trust(owner);
  let consumedIds = 0;
  const stale = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: {
      next() {
        consumedIds += 1;
        return "run-stale";
      },
    },
    stateDirectory: directories.stateDirectory,
  });
  const current = await owner.getWorkspaceReview();

  await owner.resolveWorkspaceTrust(trustCommand(current, "restrict"));

  await rejects(
    stale.submit(startCommand("command-stale-start")),
    (error) =>
      error instanceof AgentClientError && error.productError.code === "workspace_trust_required",
  );
  strictEqual(consumedIds, 0);
  await rejects(readdir(join(directories.stateDirectory, "runs")), { code: "ENOENT" });
  await owner.close();
  await stale.close();
});

test("run start rejects a retargeted workspace path before consuming an ID", async () => {
  const directories = await fixture();
  const workspaceLink = join(directories.workspaceDirectory, "..", "workspace-link-start");
  const replacement = join(directories.workspaceDirectory, "..", "workspace-replacement");
  await mkdir(replacement);
  await symlink(directories.workspaceDirectory, workspaceLink, "dir");
  let consumedIds = 0;
  const client = await InProcessAgentClient.open({
    cwd: workspaceLink,
    idSource: {
      next() {
        consumedIds += 1;
        return "run-retargeted";
      },
    },
    stateDirectory: directories.stateDirectory,
  });
  await trust(client);

  await rm(workspaceLink);
  await symlink(replacement, workspaceLink, "dir");

  await rejects(
    client.submit(startCommand("command-retargeted-start")),
    (error) =>
      error instanceof AgentClientError && error.productError.code === "workspace_identity_changed",
  );
  strictEqual(consumedIds, 0);
  await rejects(readdir(join(directories.stateDirectory, "runs")), { code: "ENOENT" });
  await client.close();
});

test("a colliding run ID leaves one complete journal and one structured failure", async () => {
  const directories = await fixture();
  const first = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-collision", "event-first", "event-model-intent", "event-model-complete"),
    stateDirectory: directories.stateDirectory,
  });
  await trust(first);
  const second = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-collision"),
    stateDirectory: directories.stateDirectory,
  });

  const started = await first.submit(startCommand("command-first-collision"));
  await rejects(
    second.submit(startCommand("command-second-collision")),
    (error) => error instanceof AgentClientError && error.productError.code === "run_id_collision",
  );

  strictEqual(started.runId, "run-collision");
  const journal = await readFile(
    join(
      directories.stateDirectory,
      "runs",
      "v1",
      started.workspace.workspaceId,
      "run-collision",
      "journal.jsonl",
    ),
    "utf8",
  );
  strictEqual(journal.trim().split("\n").length, 3);
  const firstRecord = JSON.parse(journal.split("\n")[0] ?? "");
  strictEqual(firstRecord.correlationId, "command-first-collision");
  strictEqual(firstRecord.type, "run.started");
  await first.close();
  await second.close();
});

test("a pre-existing empty run directory is an exclusive allocation collision", async () => {
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-preexisting", "event-0", "event-1", "event-2"),
    stateDirectory: directories.stateDirectory,
  });
  const trusted = await trust(client);
  const runDirectory = join(
    directories.stateDirectory,
    "runs",
    "v1",
    trusted.workspace.workspaceId,
    "run-preexisting",
  );
  await mkdir(runDirectory, { recursive: true });

  await rejects(
    client.submit(startCommand("command-preexisting")),
    (error) => error instanceof AgentClientError && error.productError.code === "run_id_collision",
  );
  await rejects(readFile(join(runDirectory, "journal.jsonl")), { code: "ENOENT" });
  await client.close();
});

test("one client serializes concurrent run starts around session ownership", async () => {
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-serialized", "event-0", "event-1", "event-2"),
    stateDirectory: directories.stateDirectory,
  });
  const trusted = await trust(client);

  const results = await Promise.allSettled([
    client.submit(startCommand("command-start-first")),
    client.submit(startCommand("command-start-second")),
  ]);

  strictEqual(results[0]?.status, "fulfilled");
  strictEqual(results[1]?.status, "rejected");
  const rejected = results[1];
  strictEqual(
    rejected?.status === "rejected" &&
      rejected.reason instanceof AgentClientError &&
      rejected.reason.productError.code === "run_already_started",
    true,
  );
  deepStrictEqual(
    await readdir(join(directories.stateDirectory, "runs", "v1", trusted.workspace.workspaceId)),
    ["run-serialized"],
  );
  await client.close();
});

test("one client serializes concurrent approvals without corrupting the journal", async () => {
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids(
      "run-1",
      "event-0",
      "event-1",
      "event-2",
      "event-3",
      "event-4",
      "event-5",
      "event-6",
      "event-7",
    ),
    stateDirectory: directories.stateDirectory,
  });
  const trusted = await trust(client);
  const awaiting = await client.submit(startCommand("command-start"));
  const approval = approvalCommand(awaiting.revision);

  const results = await Promise.allSettled([
    client.submit({ ...approval, commandId: "command-approve-first" }),
    client.submit({ ...approval, commandId: "command-approve-second" }),
  ]);

  strictEqual(results[0]?.status, "fulfilled");
  strictEqual(results[1]?.status, "rejected");
  const rejected = results[1];
  strictEqual(
    rejected?.status === "rejected" &&
      rejected.reason instanceof AgentClientError &&
      rejected.reason.productError.code === "stale_revision",
    true,
  );
  const journalPath = join(
    directories.stateDirectory,
    "runs",
    "v1",
    trusted.workspace.workspaceId,
    "run-1",
    "journal.jsonl",
  );
  const records = (await readFile(journalPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  deepStrictEqual(
    records.map((record) => record.sequence),
    records.map((_, index) => index),
  );
  strictEqual((await client.getSnapshot("run-1")).terminalOutcome?.state, "succeeded");
  await client.close();
});

test("supplied run IDs are decoded before any filesystem lookup", async () => {
  const directories = await fixture();
  const outside = join(directories.stateDirectory, "runs", "v1", "outside");
  await mkdir(outside, { recursive: true });
  await writeFile(join(outside, "journal.jsonl"), "", "utf8");

  await rejects(
    InProcessAgentClient.open({
      cwd: directories.workspaceDirectory,
      runId: "../outside" as RunId,
      stateDirectory: directories.stateDirectory,
    }),
    (error) => error instanceof AgentClientError && error.productError.code === "invalid_run_id",
  );
});

test("a static symlinked runs directory cannot redirect new run state", async () => {
  const directories = await fixture();
  const externalRuns = join(directories.stateDirectory, "..", "external-runs");
  await mkdir(directories.stateDirectory);
  await mkdir(externalRuns);
  await symlink(externalRuns, join(directories.stateDirectory, "runs"), "dir");
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-redirected", "event-0", "event-1", "event-2"),
    stateDirectory: directories.stateDirectory,
  });
  await trust(client);

  await rejects(client.submit(startCommand("command-redirected")), AgentClientError);
  deepStrictEqual(await readdir(externalRuns), []);
  await client.close();
});

test("one validated model call causally creates the runtime-owned approval", async () => {
  const directories = await fixture();
  const driver = new CountingModelDriver();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-model", "event-0", "event-1", "event-2"),
    modelDriver: driver,
    stateDirectory: directories.stateDirectory,
  });
  await trust(client);

  const awaiting = await client.submit(startCommand("command-model"));

  strictEqual(driver.calls, 1);
  strictEqual(awaiting.phase, "awaiting-approval");
  strictEqual(awaiting.approval?.actionId, "run-model:fake-action");
  strictEqual(awaiting.approval?.cwd, await realpath(directories.workspaceDirectory));
  const records = (
    await readFile(
      join(
        directories.stateDirectory,
        "runs",
        "v1",
        awaiting.workspace.workspaceId,
        "run-model",
        "journal.jsonl",
      ),
      "utf8",
    )
  )
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  deepStrictEqual(
    records.map((record) => record.type),
    ["run.started", "effect.requested", "fake.model.completed"],
  );
  strictEqual("action" in records[0].payload, false);
  await client.close();

  const replayDriver: ModelDriver = {
    id: "must-not-run",
    async complete() {
      throw new Error("Replay dispatched the model.");
    },
  };
  const reopened = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    modelDriver: replayDriver,
    runId: "run-model",
    stateDirectory: directories.stateDirectory,
  });
  strictEqual((await reopened.getSnapshot("run-model")).phase, "awaiting-approval");
  await reopened.close();
});

test("an invalid model response blocks without presenting an action", async () => {
  const directories = await fixture();
  const invalidDriver = {
    id: "invalid-fake",
    async complete() {
      return {
        approved: true,
        proposal: { kind: "shell", summary: "forged" },
        version: 1,
      } as unknown as FakeModelResponseV1;
    },
  } satisfies ModelDriver;
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-invalid-model", "event-0", "event-1", "event-2"),
    modelDriver: invalidDriver,
    stateDirectory: directories.stateDirectory,
  });
  await trust(client);

  const blocked = await client.submit(startCommand("command-invalid-model"));

  strictEqual(blocked.phase, "review");
  strictEqual(blocked.currentAction, null);
  strictEqual(blocked.terminalOutcome?.state, "blocked");
  if (blocked.terminalOutcome?.state !== "blocked") throw new Error("Expected blocked state.");
  strictEqual(blocked.terminalOutcome.error.code, "fake_model_output_invalid");
  await client.close();
});

test("one trusted client completes a run and another replays its journal-owned workspace", async () => {
  const directories = await fixture();
  const first = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids(
      "run-1",
      "event-0",
      "event-1",
      "event-2",
      "event-3",
      "event-4",
      "event-5",
      "event-6",
      "event-7",
    ),
    stateDirectory: directories.stateDirectory,
  });
  const trusted = await trust(first);

  const awaiting = await first.submit(startCommand("command-run-1"));
  const terminal = await first.submit(approvalCommand(awaiting.revision));
  const events = await collect(first.subscribe("run-1"));
  const journal = await readFile(
    join(
      directories.stateDirectory,
      "runs",
      "v1",
      trusted.workspace.workspaceId,
      "run-1",
      "journal.jsonl",
    ),
    "utf8",
  );
  await first.close();
  const reopened = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    runId: "run-1",
    stateDirectory: directories.stateDirectory,
  });

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
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0", "event-1", "event-2"),
    stateDirectory: directories.stateDirectory,
  });
  await trust(client);
  const before = await client.submit(startCommand("command-run-1"));

  await rejects(
    client.submit(approvalCommand(0)),
    (error) => error instanceof AgentClientError && error.productError.code === "stale_revision",
  );

  deepStrictEqual(await client.getSnapshot("run-1"), before);
  await client.close();
});

test("aborting a subscription wait does not alter run truth", async () => {
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0", "event-1", "event-2"),
    stateDirectory: directories.stateDirectory,
  });
  await trust(client);
  const before = await client.submit(startCommand("command-run-1"));
  const controller = new AbortController();
  const iterator = client
    .subscribe("run-1", 3, { signal: controller.signal })
    [Symbol.asyncIterator]();

  const pending = iterator.next();
  controller.abort();

  deepStrictEqual(await pending, { done: true, value: undefined });
  deepStrictEqual(await client.getSnapshot("run-1"), before);
  await client.close();
});

test("revocation blocks a new run while the historical snapshot remains trusted", async () => {
  const directories = await fixture();
  const first = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0", "event-1", "event-2"),
    stateDirectory: directories.stateDirectory,
  });
  const trusted = await trust(first);
  const historical = await first.submit(startCommand("command-run-1"));

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

test("catalog and inspection remain read-only across workspace revocation", async () => {
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0", "event-1", "event-2"),
    stateDirectory: directories.stateDirectory,
  });
  const trusted = await trust(client);
  const historical = await client.submit(startCommand("command-run-1"));

  const trustedCatalog = await client.getRunCatalog();
  const inspection = await client.inspectRun("run-1");
  await client.resolveWorkspaceTrust(trustCommand(trusted, "restrict"));
  const restrictedCatalog = await client.getRunCatalog();

  strictEqual(trustedCatalog.workspace.trust, "trusted");
  strictEqual(restrictedCatalog.workspace.trust, "restricted");
  deepStrictEqual(trustedCatalog.entries, restrictedCatalog.entries);
  strictEqual(inspection.mode, "read-only");
  deepStrictEqual(inspection.view, historical);
  strictEqual(inspection.view.workspace.trust, "trusted");
  await client.close();
});

test("catalog operations reject aborted signals and a closed client", async () => {
  const directories = await fixture();
  const client = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    stateDirectory: directories.stateDirectory,
  });
  const controller = new AbortController();
  controller.abort();

  await rejects(
    client.getRunCatalog({ signal: controller.signal }),
    (error) => error instanceof AgentClientError && error.productError.code === "operation_aborted",
  );
  await rejects(
    client.inspectRun("run-missing", { signal: controller.signal }),
    (error) => error instanceof AgentClientError && error.productError.code === "operation_aborted",
  );
  await client.close();
  await rejects(
    client.getRunCatalog(),
    (error) => error instanceof AgentClientError && error.productError.code === "client_closed",
  );
});

test("canonical workspace aliases share history while another workspace cannot inspect it", async () => {
  const directories = await fixture();
  const seed = await InProcessAgentClient.open({
    cwd: directories.workspaceDirectory,
    idSource: ids("run-1", "event-0", "event-1", "event-2"),
    stateDirectory: directories.stateDirectory,
  });
  await trust(seed);
  await seed.submit(startCommand("command-run-1"));
  await seed.close();
  const alias = join(directories.workspaceDirectory, "..", "workspace-alias");
  const otherWorkspace = join(directories.workspaceDirectory, "..", "workspace-other");
  await symlink(directories.workspaceDirectory, alias, "dir");
  await mkdir(otherWorkspace);

  const aliasClient = await InProcessAgentClient.open({
    cwd: alias,
    stateDirectory: directories.stateDirectory,
  });
  const otherClient = await InProcessAgentClient.open({
    cwd: otherWorkspace,
    stateDirectory: directories.stateDirectory,
  });
  strictEqual((await aliasClient.getRunCatalog()).entries[0]?.runId, "run-1");
  await rejects(
    otherClient.inspectRun("run-1"),
    (error) => error instanceof AgentClientError && error.productError.code === "run_not_found",
  );
  await aliasClient.close();
  await otherClient.close();
});

test("opening an unknown supplied run ID never creates it", async () => {
  const directories = await fixture();

  await rejects(
    InProcessAgentClient.open({
      cwd: directories.workspaceDirectory,
      runId: "run-missing",
      stateDirectory: directories.stateDirectory,
    }),
    (error) => error instanceof AgentClientError && error.productError.code === "run_not_found",
  );
  await rejects(lstat(directories.stateDirectory), { code: "ENOENT" });
});

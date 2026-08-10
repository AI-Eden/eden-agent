import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { decodeProductView } from "@eden/contracts";
import type { KernelEffect, KernelEvent, ModelStepObservation } from "@eden/kernel";
import type { ModelStepRequestV1 } from "@eden/providers";
import { FakeToolHost } from "../src/fake-tool-host.ts";
import { encodeJournalRecord, FileJournal } from "../src/journal/index.ts";
import { type EffectHost, type ReconciliationResult, RuntimeEngine } from "../src/runtime.ts";
import { projectView } from "../src/view-projection.ts";

const workspace = {
  name: "fixture",
  root: "/work/fixture",
  trust: "trusted",
  workspaceId: "workspace-fixture",
} as const;
const clock = { now: () => new Date("2026-07-20T00:00:00.000Z") };
const usableCodingPolicy = {
  actionProposals: 8,
  commandOutputBytes: 262_144,
  commandStderrBytes: 65_536,
  commandStdoutBytes: 65_536,
  commandTimeoutMs: 600_000,
  finalAnswerStep: 12,
  gitDiffPageBytes: 24_576,
  gitDiffPages: 4,
  journalBytes: 2_097_152,
  journalRecordBytes: 65_536,
  journalRecords: 4_096,
  maxReadOnlyCallsPerStep: 4,
  modelSteps: 12,
  modelVisibleToolContentBytes: 524_288,
  newFileBytes: 32_768,
  profile: "usable_coding_v1",
  readOnlyConcurrency: 4,
  toolCalls: 16,
  version: 1,
  wallTimeMs: 1_800_000,
} as const;
const usableCodingGrant = {
  actionProposals: 3,
  commandOutputBytes: 65_536,
  journalBytes: 1_048_576,
  journalRecords: 2_048,
  modelSteps: 8,
  modelVisibleToolContentBytes: 131_072,
  policy: "usable_coding_v1",
  toolCalls: 10,
  version: 1,
  wallTimeMs: 900_000,
} as const;

function batchStartEvent(runId: string) {
  return {
    codingBudget: { grant: usableCodingGrant, policy: usableCodingPolicy },
    correlationId: `command-${runId}`,
    model: {
      contextWindowTokens: 128_000,
      maxOutputTokens: 512,
      model: "fixture-model",
      multiCallCapability: "bounded_read_only_v1",
      profileId: "fixture-profile",
    },
    runId,
    task: "Read independent files.",
    type: "run.started",
    workspace,
  } as const;
}

function ids(start = 0) {
  let value = start;
  return { next: () => `id-${value++}` };
}

class ScriptedHost implements EffectHost {
  modelCalls = 0;
  requests: ModelStepRequestV1[] = [];
  toolCalls = 0;
  readonly observations: ModelStepObservation[];

  constructor(observations: ModelStepObservation[]) {
    this.observations = observations;
  }

  async execute(effect: KernelEffect): Promise<KernelEvent> {
    if (effect.type !== "repository.tool.execute") throw new Error("Unexpected effect.");
    this.toolCalls += 1;
    return {
      effectId: effect.effectId,
      result: {
        data: {
          contentHash: `sha256:${"a".repeat(64)}`,
          continuation: null,
          engine: {
            contentHash: `sha256:${"b".repeat(64)}`,
            name: "ripgrep",
            version: "15.0.0",
          },
          matches: [
            {
              byteColumn: 1,
              lineNumber: 1,
              path: "README.md",
              preview: "EDEN_NATIVE_SMOKE",
            },
          ],
          sourcePath: ".",
          truncated: false,
        },
        name: "search_repository",
        status: "succeeded",
        toolCallId: effect.toolCall.toolCallId,
      },
      type: "repository.tool.completed",
    };
  }

  async reconcile(): Promise<ReconciliationResult> {
    return { status: "not-started" };
  }

  async executeModelAttempt(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    request: ModelStepRequestV1,
  ): Promise<KernelEvent> {
    this.requests.push(request);
    const scripted = this.observations[this.modelCalls++];
    if (scripted === undefined) throw new Error("Missing scripted model observation.");
    return {
      effectId: effect.effectId,
      observation: { ...scripted, attemptId: request.attemptId },
      type: "model.step.completed",
    };
  }

  async reconcileModelAttempt(): Promise<ReconciliationResult> {
    return { status: "not-started" };
  }
}

class BatchScriptedHost implements EffectHost {
  completionOrder: string[] = [];
  maxActive = 0;
  modelCalls = 0;
  toolCalls = 0;

  async execute(
    effect: KernelEffect,
    _signal?: AbortSignal,
    observe?: (event: KernelEvent) => Promise<void>,
  ): Promise<KernelEvent> {
    if (effect.type !== "repository.tool.batch.execute" || observe === undefined) {
      throw new Error("Expected one observable repository batch.");
    }
    this.toolCalls += effect.calls.length;
    this.maxActive = effect.calls.length;
    for (const index of [0, 1, 2, 3]) {
      await observe({
        effectId: effect.effectId,
        index,
        type: "repository.tool.batch.item.started",
      });
    }
    for (const index of [3, 2, 1, 0]) {
      const call = effect.calls[index];
      if (call === undefined || call.name !== "read_file") throw new Error("Missing read call.");
      this.completionOrder.push(call.toolCallId);
      await observe({
        effectId: effect.effectId,
        index,
        result: {
          data: {
            bytesRead: 1,
            content: String(index + 1),
            contentHash: `sha256:${String(index + 1).repeat(64)}`,
            nextOffset: null,
            offset: 0,
            sourcePath: call.arguments.path,
            totalBytes: 1,
          },
          name: "read_file",
          status: "succeeded",
          toolCallId: call.toolCallId,
        },
        type: "repository.tool.batch.item.completed",
      });
    }
    return { effectId: effect.effectId, type: "repository.tool.batch.closed" };
  }

  async reconcile(): Promise<ReconciliationResult> {
    return { status: "not-started" };
  }

  async executeModelAttempt(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    request: ModelStepRequestV1,
  ): Promise<KernelEvent> {
    this.modelCalls += 1;
    const calls = [1, 2, 3, 4].map((index) => ({
      arguments: { maxBytes: 8, offset: 0, path: `file-${index}.txt` },
      name: "read_file" as const,
      toolCallId: `call-${index}`,
    }));
    return {
      effectId: effect.effectId,
      observation:
        this.modelCalls === 1
          ? {
              attemptId: request.attemptId,
              finishStatus: "tool_calls",
              privateContinuity: null,
              requestId: "request-batch",
              status: "completed",
              text: "Read four independent files.",
              toolCalls: calls,
              usage: null,
              version: 1,
            }
          : {
              attemptId: request.attemptId,
              finishStatus: "stop",
              privateContinuity: null,
              requestId: "request-final",
              status: "completed",
              text: "The files contain 1, 2, 3, and 4.",
              toolCalls: [],
              usage: null,
              version: 1,
            },
      type: "model.step.completed",
    };
  }

  async reconcileModelAttempt(): Promise<ReconciliationResult> {
    return { status: "not-started" };
  }
}

class CrashingBatchHost extends BatchScriptedHost {
  batchExecutions = 0;

  override async execute(
    effect: KernelEffect,
    _signal?: AbortSignal,
    observe?: (event: KernelEvent) => Promise<void>,
  ): Promise<KernelEvent> {
    if (effect.type !== "repository.tool.batch.execute" || observe === undefined) {
      throw new Error("Expected one observable repository batch.");
    }
    this.batchExecutions += 1;
    const call = effect.calls[0];
    if (call === undefined || call.name !== "read_file") throw new Error("Missing read call.");
    await observe({
      effectId: effect.effectId,
      index: 0,
      type: "repository.tool.batch.item.started",
    });
    await observe({
      effectId: effect.effectId,
      index: 0,
      result: {
        data: {
          bytesRead: 1,
          content: "1",
          contentHash: `sha256:${"1".repeat(64)}`,
          nextOffset: null,
          offset: 0,
          sourcePath: call.arguments.path,
          totalBytes: 1,
        },
        name: "read_file",
        status: "succeeded",
        toolCallId: call.toolCallId,
      },
      type: "repository.tool.batch.item.completed",
    });
    throw new Error("fixture batch crash");
  }
}

async function engine(host: EffectHost) {
  const root = await mkdtemp(join(tmpdir(), "eden-provider-loop-"));
  const journal = await FileJournal.open(join(root, "journal.jsonl"), "run-model-1");
  const runtime = await RuntimeEngine.open(journal, host, clock, ids());
  await runtime.commit(
    {
      correlationId: "command-1",
      model: {
        contextWindowTokens: 128_000,
        maxOutputTokens: 512,
        model: "deepseek-v4-pro",
        profileId: "deepseek",
      },
      runId: "run-model-1",
      task: "Find the native smoke marker.",
      type: "run.started",
      workspace,
    },
    "command-1",
  );
  return { journal, root, runtime };
}

async function drive(runtime: RuntimeEngine) {
  while (runtime.state.phase === "executing") {
    const effect = await runtime.requestNextEffect();
    if (effect === null) return;
    await runtime.settleInFlightEffect();
  }
}

describe("provider model runtime loop", () => {
  it("persists two model attempts and one tool result, then replays with zero side effects", async () => {
    const host = new ScriptedHost([
      {
        attemptId: "replaced",
        finishStatus: "tool_calls",
        privateContinuity: "private-continuity-canary",
        requestId: "request-1",
        status: "completed",
        text: "I will search.",
        toolCalls: [
          {
            arguments: { continuation: null, path: ".", pattern: "EDEN_NATIVE_SMOKE" },
            name: "search_repository",
            toolCallId: "call-search",
          },
        ],
        usage: null,
        version: 1,
      },
      {
        attemptId: "replaced",
        finishStatus: "stop",
        privateContinuity: null,
        requestId: null,
        status: "completed",
        text: "README.md:1 contains the marker.",
        toolCalls: [],
        usage: { completionTokens: 8, promptTokens: 40, totalTokens: 48 },
        version: 1,
      },
    ]);
    const fixture = await engine(host);
    await drive(fixture.runtime);
    assert.equal(host.modelCalls, 2);
    assert.equal(host.toolCalls, 1);
    assert.equal(fixture.runtime.state.phase, "terminal");
    if (fixture.runtime.state.phase !== "terminal") return;
    assert.deepEqual(fixture.runtime.state.terminalOutcome, {
      answer: "README.md:1 contains the marker.",
      state: "completed",
    });
    assert.deepEqual(projectView(fixture.runtime.state).budget, {
      total: 16,
      unit: "actions",
      used: 3,
    });
    const calls = [host.modelCalls, host.toolCalls];
    const replayed = await RuntimeEngine.open(fixture.journal, host, clock, ids(20));
    assert.equal(replayed.state.phase, "terminal");
    assert.deepEqual([host.modelCalls, host.toolCalls], calls);
  });

  it("does not concatenate an interrupted attempt and continues only after explicit retry", async () => {
    const host = new ScriptedHost([
      {
        attemptId: "replaced",
        error: {
          code: "network",
          message: "The provider stream was interrupted after visible output.",
          recoverability: "ask-user",
          suggestedActions: ["Explicitly retry from the last committed conversation turn."],
        },
        partialText: "Incomplete output",
        status: "interrupted",
        version: 1,
      },
      {
        attemptId: "replaced",
        finishStatus: "stop",
        privateContinuity: null,
        requestId: null,
        status: "completed",
        text: "Fresh complete answer",
        toolCalls: [],
        usage: null,
        version: 1,
      },
    ]);
    const fixture = await engine(host);
    await drive(fixture.runtime);
    assert.equal(fixture.runtime.state.phase, "awaiting-retry");
    assert.equal(host.modelCalls, 1);
    assert.deepEqual(projectView(fixture.runtime.state).budget, {
      total: 16,
      unit: "actions",
      used: 1,
    });
    await fixture.runtime.commit({ type: "model.retry.requested" }, "command-retry");
    await fixture.runtime.settleInFlightEffect();
    assert.equal(host.modelCalls, 2);
    assert.equal(fixture.runtime.state.phase, "terminal");
    assert.deepEqual(projectView(fixture.runtime.state).budget, {
      total: 16,
      unit: "actions",
      used: 2,
    });
    assert.equal(JSON.stringify(fixture.runtime.state).includes("Incomplete outputFresh"), false);
  });

  it("turns a hard-crash unresolved attempt into unknown without dispatch", async () => {
    const host = new ScriptedHost([]);
    const fixture = await engine(host);
    const effect = await fixture.runtime.requestNextEffect();
    if (effect === null || effect.type !== "provider.model.step") {
      throw new Error("Expected provider model effect.");
    }
    await fixture.runtime.commit(
      {
        attemptId: "attempt-crashed",
        effectId: effect.effectId,
        reason: "initial",
        type: "model.attempt.started",
      },
      effect.effectId,
    );
    const replayed = await RuntimeEngine.open(fixture.journal, host, clock, ids(20));
    assert.equal(host.modelCalls, 0);
    await replayed.settleInFlightEffect();
    assert.equal(host.modelCalls, 0);
    assert.equal(replayed.state.phase, "awaiting-retry");
    if (replayed.state.phase !== "awaiting-retry") return;
    assert.equal(replayed.state.interruption.status, "unknown");
  });

  it("journals actual batch completion order and replays source order without redispatch", async () => {
    const host = new BatchScriptedHost();
    const root = await mkdtemp(join(tmpdir(), "eden-provider-batch-"));
    const journal = await FileJournal.open(join(root, "journal.jsonl"), "run-model-batch", {
      profile: "usable_coding_v1",
    });
    const runtime = await RuntimeEngine.open(journal, host, clock, ids());
    await runtime.commit(batchStartEvent("run-model-batch"), "command-batch");
    await drive(runtime);

    assert.equal(host.maxActive, 4);
    assert.deepEqual(host.completionOrder, ["call-4", "call-3", "call-2", "call-1"]);
    assert.equal(runtime.state.phase, "terminal");
    if (runtime.state.phase !== "terminal" || !("model" in runtime.state)) return;
    assert.deepEqual(
      runtime.state.conversation
        .filter((item) => item.role === "tool")
        .map((item) => item.call.toolCallId),
      ["call-1", "call-2", "call-3", "call-4"],
    );
    const records = await journal.readAll();
    const view = projectView(runtime.state);
    assert.equal(decodeProductView(view).ok, true);
    assert.deepEqual(view.codingBudget?.usage, runtime.state.codingBudget?.usage);
    assert.equal(view.codingBudget?.usage.journalRecords, records.length);
    assert.equal(
      view.codingBudget?.usage.journalBytes,
      records.reduce((total, record) => total + encodeJournalRecord(record).byteLength, 0),
    );
    assert.equal(view.codingBudget?.remaining.modelSteps, 6);
    assert.equal(view.codingBudget?.remaining.toolCalls, 6);
    assert.deepEqual(
      records
        .filter((record) => record.type === "repository.tool.batch.item.started")
        .map((record) => (record.payload as { index: number }).index),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      records
        .filter((record) => record.type === "repository.tool.batch.item.completed")
        .map((record) => (record.payload as { index: number }).index),
      [3, 2, 1, 0],
    );
    const callsBeforeReplay = [host.modelCalls, host.toolCalls];
    const replayed = await RuntimeEngine.open(journal, host, clock, ids(50));
    assert.equal(replayed.state.phase, "terminal");
    assert.deepEqual([host.modelCalls, host.toolCalls], callsBeforeReplay);
  });

  it("blocks a partially observed batch on replay instead of redispatching completed siblings", async () => {
    const host = new CrashingBatchHost();
    const root = await mkdtemp(join(tmpdir(), "eden-provider-batch-crash-"));
    const journal = await FileJournal.open(join(root, "journal.jsonl"), "run-batch-crash", {
      profile: "usable_coding_v1",
    });
    const runtime = await RuntimeEngine.open(journal, host, clock, ids());
    await runtime.commit(batchStartEvent("run-batch-crash"), "command-batch-crash");

    const modelEffect = await runtime.requestNextEffect();
    assert.equal(modelEffect?.type, "provider.model.step");
    await runtime.settleInFlightEffect();
    const batchEffect = await runtime.requestNextEffect();
    assert.equal(batchEffect?.type, "repository.tool.batch.execute");
    await assert.rejects(runtime.settleInFlightEffect(), /fixture batch crash/u);
    assert.equal(host.batchExecutions, 1);

    const replayed = await RuntimeEngine.open(journal, host, clock, ids(50));
    await replayed.settleInFlightEffect();
    assert.equal(host.batchExecutions, 1);
    assert.equal(replayed.state.phase, "terminal");
    if (replayed.state.phase !== "terminal") return;
    assert.equal(replayed.state.terminalOutcome.state, "blocked");
  });

  it("closes every started production batch item when cancellation is already requested", async () => {
    const root = await mkdtemp(join(tmpdir(), "eden-provider-batch-cancel-"));
    await writeFile(join(root, "fixture.txt"), "fixture", "utf8");
    const host = new FakeToolHost(join(root, ".receipts"), root);
    const calls = [1, 2, 3, 4].map((index) => ({
      arguments: { maxBytes: 8, offset: 0, path: "fixture.txt" },
      name: "read_file" as const,
      toolCallId: `cancel-${index}`,
    }));
    const events: KernelEvent[] = [];
    const controller = new AbortController();
    controller.abort();
    const closed = await host.execute(
      {
        calls,
        effectId: "effect-batch-cancel",
        runId: "run-batch-cancel",
        type: "repository.tool.batch.execute",
      },
      controller.signal,
      async (event) => {
        events.push(event);
      },
    );

    assert.deepEqual(
      events
        .filter((event) => event.type === "repository.tool.batch.item.started")
        .map((event) => event.index),
      [0, 1, 2, 3],
    );
    const completed = events.filter(
      (event): event is Extract<KernelEvent, { type: "repository.tool.batch.item.completed" }> =>
        event.type === "repository.tool.batch.item.completed",
    );
    assert.deepEqual(
      completed.map((event) => event.index),
      [0, 1, 2, 3],
    );
    assert.equal(
      completed.every(
        (event) =>
          event.result.status === "failed" && event.result.error.code === "operation_aborted",
      ),
      true,
    );
    assert.deepEqual(closed, {
      effectId: "effect-batch-cancel",
      type: "repository.tool.batch.closed",
    });
  });

  it("disables every tool on the final granted model step and charges only actual usage", async () => {
    const host = new ScriptedHost([
      {
        attemptId: "replaced",
        finishStatus: "stop",
        privateContinuity: null,
        requestId: "request-final-only",
        status: "completed",
        text: "Answered without a tool.",
        toolCalls: [],
        usage: null,
        version: 1,
      },
    ]);
    const root = await mkdtemp(join(tmpdir(), "eden-provider-final-step-"));
    const journal = await FileJournal.open(join(root, "journal.jsonl"), "run-final-step", {
      profile: "usable_coding_v1",
    });
    const runtime = await RuntimeEngine.open(journal, host, clock, ids());
    const start = batchStartEvent("run-final-step");
    await runtime.commit(
      {
        ...start,
        codingBudget: {
          grant: {
            ...usableCodingGrant,
            actionProposals: 0,
            commandOutputBytes: 0,
            modelSteps: 1,
            modelVisibleToolContentBytes: 0,
            toolCalls: 0,
            wallTimeMs: 60_000,
          },
          policy: usableCodingPolicy,
        },
        task: "Answer directly.",
      },
      "command-final-step",
    );
    await drive(runtime);

    assert.deepEqual(
      host.requests.map((request) => request.enabledTools),
      [[]],
    );
    assert.equal(runtime.state.phase, "terminal");
    if (runtime.state.phase !== "terminal" || !("model" in runtime.state)) return;
    assert.equal(runtime.state.codingBudget?.usage.modelSteps, 1);
    assert.equal(runtime.state.codingBudget?.usage.toolCalls, 0);
  });
});

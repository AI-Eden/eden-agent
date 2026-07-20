import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { KernelEffect, KernelEvent, ModelStepObservation } from "@eden/kernel";
import type { ModelStepRequestV1 } from "@eden/providers";

import { FileJournal } from "../src/journal/index.ts";
import { type EffectHost, type ReconciliationResult, RuntimeEngine } from "../src/runtime.ts";
import { projectView } from "../src/view-projection.ts";

const workspace = {
  name: "fixture",
  root: "/work/fixture",
  trust: "trusted",
  workspaceId: "workspace-fixture",
} as const;
const clock = { now: () => new Date("2026-07-20T00:00:00.000Z") };

function ids(start = 0) {
  let value = start;
  return { next: () => `id-${value++}` };
}

class ScriptedHost implements EffectHost {
  modelCalls = 0;
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
});

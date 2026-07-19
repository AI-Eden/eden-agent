import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";

import type { ProductEvent, WorkspaceReview } from "@eden/contracts";
import type {
  ModelStepDriver,
  ModelStepObservationV1,
  ModelStepRequestV1,
  ModelVisibleTextListener,
} from "@eden/providers";

import { InProcessAgentClient } from "../src/agent-client.ts";
import { FileJournal } from "../src/journal/index.ts";
import type { NativeProcessPort } from "../src/native-process.ts";
import { projectJournal } from "../src/projection.ts";

const credentialCanary = "SECRET_CANARY_REAL_PROVIDER_CLIENT";
const continuityCanary = "PRIVATE_CONTINUITY_CANARY";

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

class ReadThenAnswerProvider implements ModelStepDriver {
  calls = 0;
  readonly requests: ModelStepRequestV1[] = [];

  async completeModelStep(
    request: ModelStepRequestV1,
    _signal: AbortSignal,
    onVisibleText?: ModelVisibleTextListener,
  ): Promise<ModelStepObservationV1> {
    this.calls += 1;
    this.requests.push(request);
    if (this.calls === 1) {
      onVisibleText?.({
        attemptId: request.attemptId,
        offset: 0,
        outputIndex: 0,
        text: "I will read the repository evidence.",
        version: 1,
      });
      return {
        attemptId: request.attemptId,
        finishStatus: "tool_calls",
        privateContinuity: continuityCanary,
        requestId: "request-model-1",
        status: "completed",
        text: "I will read the repository evidence.",
        toolCalls: [
          {
            arguments: { maxBytes: 1_024, offset: 0, path: "nested/answer.txt" },
            name: "read_file",
            toolCallId: "call-read-answer",
          },
        ],
        usage: null,
        version: 1,
      };
    }
    if (this.calls === 2) {
      onVisibleText?.({
        attemptId: request.attemptId,
        offset: 0,
        outputIndex: 0,
        text: "Incomplete disconnected text",
        version: 1,
      });
      return {
        attemptId: request.attemptId,
        error: {
          code: "network",
          message: "The provider stream was interrupted after visible output.",
          recoverability: "ask-user",
          suggestedActions: ["Explicitly retry from the last committed conversation turn."],
        },
        partialText: "Incomplete disconnected text",
        status: "interrupted",
        version: 1,
      };
    }
    onVisibleText?.({
      attemptId: request.attemptId,
      offset: 0,
      outputIndex: 0,
      text: "nested/answer.txt says the bounded answer is 42.",
      version: 1,
    });
    return {
      attemptId: request.attemptId,
      finishStatus: "stop",
      privateContinuity: null,
      requestId: "request-model-2",
      status: "completed",
      text: "nested/answer.txt says the bounded answer is 42.",
      toolCalls: [],
      usage: { completionTokens: 9, promptTokens: 41, totalTokens: 50 },
      version: 1,
    };
  }
}

async function collect(iterable: AsyncIterable<ProductEvent>): Promise<ProductEvent[]> {
  const events: ProductEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

it("AgentClient runs a durable real-model tool loop with closed replay-only projections", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-provider-client-"));
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  const ripgrep = join(root, "rg-fixture");
  await mkdir(join(workspace, "nested"), { recursive: true });
  await writeFile(join(workspace, "AGENTS.md"), "# Fixture rules\nUse repository evidence.\n");
  await writeFile(
    join(workspace, "nested", "AGENTS.md"),
    "# Nested fixture rules\nCite nested paths.\n",
  );
  await writeFile(join(workspace, "nested", "answer.txt"), "The bounded answer is 42.\n");
  await writeFile(ripgrep, "fixture-ripgrep-15.0.0\n");
  await chmod(ripgrep, 0o755);
  const ripgrepHash = `sha256:${createHash("sha256").update("fixture-ripgrep-15.0.0\n").digest("hex")}`;
  const nativeProcess: NativeProcessPort = {
    async run(request) {
      const output = request.executable === ripgrep ? "ripgrep 15.0.0\n" : "git version 2.43.0\n";
      return {
        exitCode: 0,
        status: "exited",
        stderr: new Uint8Array(),
        stdout: Buffer.from(output),
      };
    },
  };
  const provider = new ReadThenAnswerProvider();
  const client = await InProcessAgentClient.open({
    createModelProvider: () => provider,
    createReadinessProvider: (resolved) => ({
      async checkReadiness() {
        return {
          checkedAt: "2026-07-20T00:00:00.000Z",
          model: resolved.profile.model,
          profileId: resolved.profile.id,
          requestId: null,
          state: "completion_ready",
        };
      },
    }),
    cwd: workspace,
    profileEnvironment: { EDEN_DEEPSEEK_KEY: credentialCanary },
    realProviderRuns: true,
    repositoryTools: {
      gitExecutable: "git-fixture",
      nativeProcess,
      ripgrepAsset: { contentHash: ripgrepHash, path: ripgrep, version: "15.0.0" },
    },
    stateDirectory,
  });
  try {
    const initial = await client.getProviderProfiles();
    const saved = await client.saveProviderProfile({
      commandId: "command-save",
      expectedRevision: initial.revision,
      profile: {
        baseUrl: "https://api.deepseek.com",
        billingSource: "pay_as_you_go",
        contextWindowTokens: 128_000,
        credential: { name: "EDEN_DEEPSEEK_KEY", source: "environment" },
        id: "deepseek",
        maxOutputTokens: 8_192,
        model: "deepseek-v4-pro",
        protocol: "openai_chat_completions",
        reasoningDisplay: "off",
      },
      protocolVersion: 1,
      select: true,
      type: "provider.profile.save",
    });
    const restricted = await client.getWorkspaceReview();
    await client.resolveWorkspaceTrust(trustCommand(restricted));
    await client.checkProviderReadiness({
      commandId: "command-ready",
      expectedRevision: saved.revision,
      possibleChargeConfirmed: true,
      profileId: "deepseek",
      protocolVersion: 1,
      type: "provider.readiness.check",
    });
    const livePromise = (async () => {
      const deltas = [];
      const stream = client.subscribeModelText();
      for await (const delta of stream) deltas.push(delta);
      return deltas;
    })();
    const interrupted = await client.submit({
      commandId: "command-run",
      protocolVersion: 1,
      task: "Read answer.txt and report its bounded answer.",
      type: "run.start",
    });
    assert.equal(interrupted.phase, "awaiting-retry");
    const interruptedTurn = interrupted.conversation?.at(-1);
    assert.equal(interruptedTurn?.role, "assistant");
    if (interruptedTurn?.role !== "assistant") return;
    assert.equal(interruptedTurn.status, "incomplete");
    const view = await client.submit({
      commandId: "command-retry",
      expectedRevision: interrupted.revision,
      protocolVersion: 1,
      runId: interrupted.runId,
      type: "model.retry",
    });
    const live = await livePromise;
    assert.equal(view.phase, "review");
    assert.deepEqual(view.terminalOutcome, {
      answer: "nested/answer.txt says the bounded answer is 42.",
      state: "completed",
    });
    assert.deepEqual(
      view.attempts?.map((attempt) => [attempt.state, attempt.usage.state]),
      [
        ["completed", "unknown"],
        ["interrupted", "unknown"],
        ["completed", "exact"],
      ],
    );
    assert.equal(provider.calls, 3);
    assert.deepEqual(
      live.map((delta) => [delta.cursor, delta.offset, delta.text]),
      [
        [0, 0, "I will read the repository evidence."],
        [1, 0, "Incomplete disconnected text"],
        [2, 0, "nested/answer.txt says the bounded answer is 42."],
      ],
    );
    assert.equal(
      provider.requests[0]?.conversation.some(
        (item) => item.role === "system" && item.content.includes("Fixture rules"),
      ),
      true,
    );
    const assistant = provider.requests[1]?.conversation.find((item) => item.role === "assistant");
    assert.equal(assistant?.role === "assistant" && assistant.privateContinuity, continuityCanary);
    assert.equal(
      provider.requests[1]?.conversation.some(
        (item) => item.role === "system" && item.content.includes("Nested fixture rules"),
      ),
      true,
    );
    assert.deepEqual(provider.requests[2]?.conversation, provider.requests[1]?.conversation);
    assert.equal(
      JSON.stringify(provider.requests[2]?.conversation).includes("Incomplete disconnected text"),
      false,
    );
    assert.equal(JSON.stringify(view).includes(continuityCanary), false);
    assert.equal(JSON.stringify(view).includes(credentialCanary), false);

    const events = await collect(client.subscribe(view.runId));
    assert.equal(
      events.some((event) => event.type === "model.attempt.updated"),
      true,
    );
    assert.equal(
      events.some((event) => event.type === "conversation.updated"),
      true,
    );
    assert.equal(JSON.stringify(events).includes(continuityCanary), false);
    assert.equal(JSON.stringify(events).includes(credentialCanary), false);

    const journal = await FileJournal.open(
      join(
        stateDirectory,
        "runs",
        "v1",
        restricted.workspace.workspaceId,
        view.runId,
        "journal.jsonl",
      ),
      view.runId,
      false,
    );
    const records = await journal.readAll();
    assert.equal(
      records.some((record) => record.type === "model.context.committed"),
      true,
    );
    assert.equal(
      records.every((record) => Buffer.byteLength(JSON.stringify(record)) < 65_536),
      true,
    );
    assert.equal(JSON.stringify(records).includes(credentialCanary), false);
    const callsBeforeReplay = provider.calls;
    const projection = projectJournal(records);
    assert.deepEqual(projection.view, view);
    assert.equal(provider.calls, callsBeforeReplay);
  } finally {
    await client.close();
  }
});

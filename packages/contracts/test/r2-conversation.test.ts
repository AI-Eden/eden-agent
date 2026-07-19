import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executingProductView } from "../src/fixtures.ts";
import { decodeProductCommand, decodeProductEvent, decodeProductView } from "../src/index.ts";

const attempt = {
  attemptId: "attempt-1",
  error: null,
  reason: "initial",
  state: "completed",
  step: 1,
  usage: { completionTokens: 8, promptTokens: 40, state: "exact", totalTokens: 48 },
} as const;
const turn = {
  attemptId: "attempt-1",
  content: "README.md:1 contains the marker.",
  role: "assistant",
  status: "complete",
  turnId: "assistant-attempt-1",
} as const;

describe("R2 conversation product contracts", () => {
  it("accepts completed non-success answers, attempts, conversation, and explicit retry", () => {
    const view = {
      ...executingProductView,
      attempts: [attempt],
      conversation: [
        { content: "Find the marker.", role: "user", turnId: "user-run-test-1" },
        turn,
      ],
      phase: "review",
      retry: { available: false, reason: null },
      terminalOutcome: { answer: turn.content, state: "completed" },
    } as const;
    assert.equal(decodeProductView(view).ok, true);
    assert.equal(
      decodeProductCommand({
        commandId: "command-retry-1",
        expectedRevision: 7,
        protocolVersion: 1,
        runId: "run-test-1",
        type: "model.retry",
      }).ok,
      true,
    );
  });

  it("projects durable model facts without private continuity or provider wire fields", () => {
    const base = {
      cursor: 1,
      eventId: "event-1",
      protocolVersion: 1,
      revision: 3,
      runId: "run-test-1",
    } as const;
    assert.equal(decodeProductEvent({ ...base, attempt, type: "model.attempt.updated" }).ok, true);
    assert.equal(decodeProductEvent({ ...base, turn, type: "conversation.updated" }).ok, true);
    assert.equal(
      decodeProductEvent({
        ...base,
        turn: { ...turn, privateContinuity: "must-stay-private" },
        type: "conversation.updated",
      }).ok,
      false,
    );
    assert.equal(
      decodeProductEvent({
        ...base,
        attempt: { ...attempt, providerResponse: { raw: true } },
        type: "model.attempt.updated",
      }).ok,
      false,
    );
  });
});

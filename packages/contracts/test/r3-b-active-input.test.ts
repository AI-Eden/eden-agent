import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeProductCommand,
  decodeProductEvent,
  decodeProductView,
  executingProductView,
} from "../src/index.ts";

const envelope = {
  cursor: 7,
  eventId: "event-conversation-input-1",
  protocolVersion: 1,
  revision: 7,
  runId: "run-conversation-input",
} as const;

const acceptedInput = {
  byteLength: 25,
  closureReason: null,
  commandId: "command-steer-1",
  content: "Inspect the failing test.",
  deliveredTurnId: null,
  messageId: "message-steer-1",
  mode: "steer",
  order: 0,
  reservation: { modelStep: 8, state: "reserved" },
  state: "accepted",
} as const;

describe("R3-B active-run input product contract", () => {
  it("accepts distinct steer and queue commands with the current run envelope", () => {
    for (const [type, content] of [
      ["conversation.steer", "Inspect the failing test."],
      ["conversation.queue", "Then explain the verified result."],
    ] as const) {
      const command = {
        commandId: `command-${type}`,
        content,
        expectedRevision: 7,
        protocolVersion: 1,
        runId: envelope.runId,
        type,
      };
      assert.deepEqual(decodeProductCommand(command), { ok: true, value: command });
    }

    for (const content of ["", "\ud800", "界".repeat(1_366)]) {
      assert.equal(
        decodeProductCommand({
          commandId: "command-invalid",
          content,
          expectedRevision: 7,
          protocolVersion: 1,
          runId: envelope.runId,
          type: "conversation.steer",
        }).ok,
        false,
      );
    }
  });

  it("projects accepted, delivered, and closed lifecycle with exact reservation truth", () => {
    const lifecycle = [
      acceptedInput,
      {
        ...acceptedInput,
        deliveredTurnId: "turn-steer-1",
        reservation: { modelStep: 8, state: "consumed" },
        state: "delivered",
      },
      {
        ...acceptedInput,
        closureReason: {
          code: "run_cancelled",
          message: "The run ended before this queued input could be delivered.",
          recoverability: "ask-user",
          suggestedActions: ["Start a new run if this follow-up is still needed."],
        },
        deliveredTurnId: null,
        mode: "queue",
        reservation: { modelStep: 8, state: "released" },
        state: "closed",
      },
    ] as const;

    for (const [index, input] of lifecycle.entries()) {
      const event = {
        ...envelope,
        cursor: envelope.cursor + index,
        eventId: `event-conversation-input-${index}`,
        input,
        type: "conversation.input.updated",
      };
      assert.deepEqual(decodeProductEvent(event), { ok: true, value: event });
    }
  });

  it("keeps old views decodable and adds pending input plus a typed delivered user turn", () => {
    assert.equal(decodeProductView(executingProductView).ok, true);

    const view = {
      ...executingProductView,
      conversation: [
        {
          content: acceptedInput.content,
          messageId: acceptedInput.messageId,
          role: "user",
          source: "steer",
          turnId: "turn-steer-1",
        },
      ],
      conversationInput: {
        acceptedBytes: acceptedInput.byteLength,
        acceptedCount: 1,
        closed: [],
        pending: [acceptedInput],
        remainingBytes: 16_384 - acceptedInput.byteLength,
        reservations: { pending: 1, remainingModelSteps: 4 },
        submission: {
          queue: { available: true, reason: null },
          steer: {
            available: false,
            reason: {
              code: "steer_capacity_reached",
              message: "One steering message is already pending.",
              recoverability: "ask-user",
              suggestedActions: ["Wait for the pending steering message to be delivered."],
            },
          },
        },
      },
    };
    assert.deepEqual(decodeProductView(view), { ok: true, value: view });
  });
});

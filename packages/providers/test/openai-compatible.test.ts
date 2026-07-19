import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, it } from "node:test";

import {
  fixedReadinessAnswer,
  fixedReadinessPrompt,
  OpenAICompatibleProvider,
  ProviderAdapterError,
} from "../src/index.ts";

const secretCanary = "SECRET_CANARY_PROVIDER_ADAPTER";
const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function fixture(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ readonly baseUrl: string; readonly requests: () => number }> {
  let count = 0;
  const server = createServer((request, response) => {
    count += 1;
    handler(request, response);
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing fixture address.");
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, requests: () => count };
}

function adapter(baseUrl: string, timeoutMilliseconds = 2_000) {
  return new OpenAICompatibleProvider({
    apiKey: secretCanary,
    baseUrl,
    clock: { now: () => new Date("2026-07-19T12:00:00.000Z") },
    model: "fixture-model",
    profileId: "fixture-profile",
    timeoutMilliseconds,
  });
}

describe("OpenAI-compatible readiness", () => {
  it("uses one fixed minimally billable stream with SDK retries disabled", async () => {
    let capturedBody = "";
    let capturedAuthorization = "";
    const local = await fixture((request, response) => {
      capturedAuthorization = request.headers.authorization ?? "";
      request.setEncoding("utf8");
      request.on("data", (chunk) => (capturedBody += chunk));
      request.on("end", () => {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "x-request-id": "request-safe-1",
        });
        response.end(
          [
            `data: ${JSON.stringify({
              choices: [
                {
                  delta: { content: fixedReadinessAnswer, reasoning_content: null },
                  finish_reason: null,
                  index: 0,
                },
              ],
              created: 1,
              id: "chatcmpl-ready",
              model: "fixture-model",
              object: "chat.completion.chunk",
            })}\n\n`,
            `data: ${JSON.stringify({
              choices: [{ delta: {}, finish_reason: "stop", index: 0 }],
              created: 1,
              id: "chatcmpl-ready",
              model: "fixture-model",
              object: "chat.completion.chunk",
            })}\n\n`,
            "data: [DONE]\n\n",
          ].join(""),
        );
      });
    });

    const result = await adapter(local.baseUrl).checkReadiness(new AbortController().signal);
    assert.deepEqual(result, {
      checkedAt: "2026-07-19T12:00:00.000Z",
      model: "fixture-model",
      profileId: "fixture-profile",
      requestId: "request-safe-1",
      state: "completion_ready",
    });
    assert.equal(local.requests(), 1);
    assert.equal(capturedAuthorization, `Bearer ${secretCanary}`);
    const body = JSON.parse(capturedBody);
    assert.deepEqual(body.messages, [{ content: fixedReadinessPrompt, role: "user" }]);
    assert.equal(body.max_tokens, 8);
    assert.equal(body.stream, true);
    assert.deepEqual(body.thinking, { type: "disabled" });
    assert.equal(body.tools, undefined);
  });

  it("keeps catalog reachability distinct when the completion check fails", async () => {
    const local = await fixture((request, response) => {
      if (request.url === "/v1/models") {
        response.writeHead(200, {
          "content-type": "application/json",
          "x-request-id": "request-catalog-1",
        });
        response.end(
          JSON.stringify({
            data: [{ created: 1, id: "fixture-model", object: "model", owned_by: "fixture" }],
            object: "list",
          }),
        );
        return;
      }
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "invalid_api_key", message: secretCanary } }));
    });
    const provider = adapter(local.baseUrl);
    assert.deepEqual(await provider.checkCatalog(new AbortController().signal), {
      checkedAt: "2026-07-19T12:00:00.000Z",
      model: "fixture-model",
      modelAvailable: true,
      profileId: "fixture-profile",
      requestId: "request-catalog-1",
      state: "catalog_reachable",
    });
    await assert.rejects(
      provider.checkReadiness(new AbortController().signal),
      (error) => error instanceof ProviderAdapterError && error.failure.code === "authentication",
    );
    assert.equal(local.requests(), 2);
  });

  it("rejects a successful credential response with the wrong fixed answer", async () => {
    const local = await fixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(
        [
          `data: ${JSON.stringify({
            choices: [{ delta: { content: "NOT_READY" }, finish_reason: "stop", index: 0 }],
            created: 1,
            id: "chatcmpl-wrong-answer",
            model: "fixture-model",
            object: "chat.completion.chunk",
          })}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
      );
    });
    await assert.rejects(
      adapter(local.baseUrl).checkReadiness(new AbortController().signal),
      (error) =>
        error instanceof ProviderAdapterError && error.failure.code === "protocol_incompatibility",
    );
    assert.equal(local.requests(), 1);
  });

  for (const [status, providerCode, expected] of [
    [401, "invalid_api_key", "authentication"],
    [402, "billing_required", "billing_quota"],
    [404, "model_not_found", "unavailable_model"],
    [408, "request_timeout", "timeout"],
    [429, "rate_limit_exceeded", "rate_limit"],
    [429, "insufficient_quota", "billing_quota"],
    [500, "internal_error", "provider_internal"],
    [503, "overloaded", "overload"],
    [418, "unknown", "unknown"],
  ] as const) {
    it(`maps status ${status} and ${providerCode} to ${expected} without leaking payloads`, async () => {
      const local = await fixture((_request, response) => {
        response.writeHead(status, {
          "content-type": "application/json",
          "x-request-id": `${"x".repeat(129)}${secretCanary}`,
        });
        response.end(
          JSON.stringify({
            error: { code: providerCode, message: secretCanary, type: providerCode },
          }),
        );
      });
      await assert.rejects(
        adapter(local.baseUrl).checkReadiness(new AbortController().signal),
        (error) => {
          assert.ok(error instanceof ProviderAdapterError);
          assert.equal(error.failure.code, expected);
          assert.equal(error.failure.requestId, null);
          assert.equal(JSON.stringify(error.failure).includes(secretCanary), false);
          return true;
        },
      );
      assert.equal(local.requests(), 1);
    });
  }

  it("classifies malformed streams, network failures, timeout, and cancellation", async () => {
    const malformed = await fixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(`data: {not-json-${secretCanary}}\n\n`);
    });
    const originalConsoleError = console.error;
    const consoleOutput: unknown[] = [];
    console.error = (...values) => consoleOutput.push(...values);
    try {
      await assert.rejects(
        adapter(malformed.baseUrl).checkReadiness(new AbortController().signal),
        (error) => {
          assert.ok(error instanceof ProviderAdapterError);
          assert.equal(error.failure.code, "protocol_incompatibility");
          return true;
        },
      );
    } finally {
      console.error = originalConsoleError;
    }
    assert.deepEqual(consoleOutput, []);

    const timeout = await fixture(() => undefined);
    await assert.rejects(
      adapter(timeout.baseUrl, 25).checkReadiness(new AbortController().signal),
      (error) => {
        assert.ok(error instanceof ProviderAdapterError);
        assert.equal(error.failure.code, "timeout");
        return true;
      },
    );

    const controller = new AbortController();
    const cancelled = adapter(timeout.baseUrl).checkReadiness(controller.signal);
    controller.abort();
    await assert.rejects(cancelled, (error) => {
      assert.ok(error instanceof ProviderAdapterError);
      assert.equal(error.failure.code, "cancellation");
      return true;
    });

    const unavailable = await fixture((_request, response) => response.destroy());
    await assert.rejects(
      adapter(unavailable.baseUrl).checkReadiness(new AbortController().signal),
      (error) => {
        assert.ok(error instanceof ProviderAdapterError);
        assert.equal(error.failure.code, "network");
        return true;
      },
    );
  });
});

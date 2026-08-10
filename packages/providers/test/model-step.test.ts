import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterEach, describe, it } from "node:test";

import {
  decodeModelStepObservation,
  decodeModelStepRequest,
  OpenAICompatibleProvider,
} from "../src/index.ts";

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

function adapter(baseUrl: string) {
  return new OpenAICompatibleProvider({
    apiKey: "SECRET_CANARY_MODEL_STEP",
    baseUrl,
    clock: { now: () => new Date("2026-07-20T00:00:00.000Z") },
    model: "fixture-model",
    profileId: "fixture-profile",
    timeoutMilliseconds: 2_000,
  });
}

function multiCallAdapter(baseUrl: string) {
  return new OpenAICompatibleProvider({
    apiKey: "SECRET_CANARY_MODEL_STEP",
    baseUrl,
    clock: { now: () => new Date("2026-07-20T00:00:00.000Z") },
    model: "fixture-model",
    multiCallCapability: "bounded_read_only_v1",
    profileId: "fixture-profile",
    timeoutMilliseconds: 2_000,
  });
}

const request = {
  attemptId: "attempt-1",
  conversation: [{ content: "Inspect the repository.", role: "user" }],
  enabledTools: ["list_files", "read_file", "search_repository", "git_status"],
  maxOutputTokens: 128,
  version: 1,
} as const;

function chunk(delta: object, finishReason: string | null = null, usage?: object): string {
  return `data: ${JSON.stringify({
    choices: [{ delta, finish_reason: finishReason, index: 0 }],
    created: 1,
    id: "chatcmpl-step",
    model: "fixture-model",
    object: "chat.completion.chunk",
    ...(usage === undefined ? {} : { usage }),
  })}\n\n`;
}

describe("OpenAI-compatible model steps", () => {
  it("exposes closed request and observation decoders", () => {
    assert.equal(decodeModelStepRequest(request).ok, true);
    assert.equal(decodeModelStepRequest({ ...request, rawProvider: true }).ok, false);
    assert.equal(
      decodeModelStepRequest({
        ...request,
        conversation: Array.from({ length: 268 }, (_, index) => ({
          content: `bounded context ${index}`,
          role: "system" as const,
        })),
      }).ok,
      true,
    );
    assert.equal(
      decodeModelStepRequest({
        ...request,
        conversation: [{ content: "界".repeat(16_385), role: "system" }],
      }).ok,
      false,
    );
    assert.equal(
      decodeModelStepObservation({
        attemptId: "attempt-1",
        finishStatus: "stop",
        privateContinuity: null,
        requestId: null,
        status: "completed",
        text: "answer",
        toolCalls: [],
        usage: null,
        version: 1,
      }).ok,
      true,
    );
    assert.equal(
      decodeModelStepObservation({
        attemptId: "attempt-1",
        finishStatus: "stop",
        privateContinuity: null,
        rawProvider: true,
        requestId: null,
        status: "completed",
        text: "answer",
        toolCalls: [],
        usage: null,
        version: 1,
      }).ok,
      false,
    );
  });
  it("coalesces visible text and reports exact usage only when received", async () => {
    const local = await fixture((_request, response) => {
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "x-request-id": "request-step-1",
      });
      response.end(
        [
          chunk({ content: "Repository " }),
          chunk({ content: "answer." }, "stop"),
          `data: ${JSON.stringify({
            choices: [],
            created: 1,
            id: "chatcmpl-step",
            model: "fixture-model",
            object: "chat.completion.chunk",
            usage: { completion_tokens: 3, prompt_tokens: 7, total_tokens: 10 },
          })}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
      );
    });
    const deltas: unknown[] = [];
    const result = await adapter(local.baseUrl).completeModelStep(
      request,
      new AbortController().signal,
      (delta) => deltas.push(delta),
    );
    assert.deepEqual(deltas, [
      { attemptId: "attempt-1", offset: 0, outputIndex: 0, text: "Repository ", version: 1 },
      { attemptId: "attempt-1", offset: 11, outputIndex: 0, text: "answer.", version: 1 },
    ]);
    assert.deepEqual(result, {
      attemptId: "attempt-1",
      finishStatus: "stop",
      privateContinuity: null,
      requestId: "request-step-1",
      status: "completed",
      text: "Repository answer.",
      toolCalls: [],
      usage: { completionTokens: 3, promptTokens: 7, totalTokens: 10 },
      version: 1,
    });
    assert.equal(local.requests(), 1);
  });

  it("sends the complete nine-tool R3-A surface through the real adapter", async () => {
    let body = "";
    const local = await fixture((incoming, response) => {
      incoming.setEncoding("utf8");
      incoming.on("data", (value) => (body += value));
      incoming.on("end", () => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          [
            chunk({ content: "The complete R3-A surface is available." }, "stop"),
            "data: [DONE]\n\n",
          ].join(""),
        );
      });
    });
    const result = await adapter(local.baseUrl).completeModelStep(
      {
        ...request,
        enabledTools: [
          "list_files",
          "read_file",
          "search_repository",
          "git_diff",
          "git_status",
          "anchor_edit",
          "write_file",
          "run_command",
          "repository_check",
        ],
      },
      new AbortController().signal,
    );
    assert.equal(result.status, "completed");
    assert.equal(JSON.parse(body).tools.length, 9);
  });

  it("coalesces split tool-call identity, name, and arguments into one closed call", async () => {
    let body = "";
    const local = await fixture((incoming, response) => {
      incoming.setEncoding("utf8");
      incoming.on("data", (value) => (body += value));
      incoming.on("end", () => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          [
            chunk({
              tool_calls: [
                {
                  function: { arguments: '{"path":".","continu', name: "search_" },
                  id: "call-",
                  index: 0,
                  type: "function",
                },
              ],
            }),
            chunk(
              {
                tool_calls: [
                  {
                    function: {
                      arguments: 'ation":null,"pattern":"EDEN_NATIVE_SMOKE"}',
                      name: "repository",
                    },
                    id: "search",
                    index: 0,
                  },
                ],
              },
              "tool_calls",
            ),
            "data: [DONE]\n\n",
          ].join(""),
        );
      });
    });
    const result = await adapter(local.baseUrl).completeModelStep(
      request,
      new AbortController().signal,
    );
    assert.equal(result.status, "completed");
    if (result.status !== "completed") return;
    assert.deepEqual(result.toolCalls, [
      {
        arguments: { continuation: null, path: ".", pattern: "EDEN_NATIVE_SMOKE" },
        name: "search_repository",
        toolCallId: "call-search",
      },
    ]);
    assert.equal(result.usage, null);
    const parsedBody = JSON.parse(body);
    assert.equal(parsedBody.parallel_tool_calls, false);
    assert.equal(parsedBody.stream_options.include_usage, true);
    assert.equal(parsedBody.tools.length, 4);
  });

  it("normalizes four source-ordered calls only for a proven multi-call profile", async () => {
    let body = "";
    const calls = [
      ["call-list", "list_files", '{"continuation":null,"path":"."}'],
      ["call-read-a", "read_file", '{"maxBytes":8,"offset":0,"path":"a.txt"}'],
      ["call-read-b", "read_file", '{"maxBytes":8,"offset":0,"path":"b.txt"}'],
      ["call-status", "git_status", "{}"],
    ] as const;
    const local = await fixture((incoming, response) => {
      incoming.setEncoding("utf8");
      incoming.on("data", (value) => (body += value));
      incoming.on("end", () => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(
          [
            chunk(
              {
                tool_calls: calls.map(([id, name, arguments_], index) => ({
                  function: { arguments: arguments_, name },
                  id,
                  index,
                  type: "function",
                })),
              },
              "tool_calls",
            ),
            "data: [DONE]\n\n",
          ].join(""),
        );
      });
    });

    const result = await multiCallAdapter(local.baseUrl).completeModelStep(
      request,
      new AbortController().signal,
    );

    assert.equal(result.status, "completed");
    if (result.status !== "completed") return;
    assert.deepEqual(
      result.toolCalls.map((call) => call.toolCallId),
      calls.map(([id]) => id),
    );
    assert.equal(JSON.parse(body).parallel_tool_calls, true);
    assert.equal(decodeModelStepObservation(result).ok, true);
  });

  for (const [label, delta] of [
    [
      "unknown tool",
      {
        tool_calls: [
          {
            function: { arguments: "{}", name: "shell" },
            id: "call-shell",
            index: 0,
            type: "function",
          },
        ],
      },
    ],
    [
      "malformed arguments",
      {
        tool_calls: [
          {
            function: { arguments: "{", name: "git_status" },
            id: "call-git",
            index: 0,
            type: "function",
          },
        ],
      },
    ],
  ] as const) {
    it(`fails closed for ${label}`, async () => {
      const local = await fixture((_request, response) => {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end([chunk(delta, "tool_calls"), "data: [DONE]\n\n"].join(""));
      });
      const result = await adapter(local.baseUrl).completeModelStep(
        request,
        new AbortController().signal,
      );
      assert.equal(result.status, "unknown");
      if (result.status !== "unknown") return;
      assert.equal(result.error.code, "protocol_incompatibility");
      assert.equal(JSON.stringify(result).includes("shell"), false);
    });
  }

  it("returns a bounded incomplete snapshot after a post-delta disconnect", async () => {
    let destroyResponse: (() => void) | undefined;
    const local = await fixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk({ content: "Committed partial text" }));
      destroyResponse = () => response.destroy();
    });
    const result = await adapter(local.baseUrl).completeModelStep(
      request,
      new AbortController().signal,
      () => destroyResponse?.(),
    );
    assert.deepEqual(result, {
      attemptId: "attempt-1",
      error: {
        code: "network",
        message: "The provider stream was interrupted after visible output.",
        recoverability: "ask-user",
        suggestedActions: ["Explicitly retry from the last committed conversation turn."],
      },
      partialText: "Committed partial text",
      status: "interrupted",
      version: 1,
    });
  });

  it("returns a controlled cancellation snapshot without partial tool data or usage", async () => {
    const controller = new AbortController();
    const local = await fixture((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write(chunk({ content: "Visible before cancel" }));
    });
    const result = await adapter(local.baseUrl).completeModelStep(request, controller.signal, () =>
      controller.abort(),
    );
    assert.deepEqual(result, {
      attemptId: "attempt-1",
      error: {
        code: "cancellation",
        message: "The model attempt was cancelled after visible output.",
        recoverability: "ask-user",
        suggestedActions: ["Explicitly retry from the last committed conversation turn."],
      },
      partialText: "Visible before cancel",
      status: "interrupted",
      version: 1,
    });
  });
});

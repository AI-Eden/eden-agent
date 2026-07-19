import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { test } from "node:test";

import { decodeFakeModelRequest, decodeFakeModelResponse, FakeModelDriver } from "../src/index.ts";

test("the fake model accepts and returns only closed version-one values", async () => {
  const driver = new FakeModelDriver();
  const request = { task: "Index the fake workspace", version: 1 } as const;

  strictEqual(decodeFakeModelRequest(request).ok, true);
  strictEqual(decodeFakeModelRequest({ ...request, cwd: "/forged" }).ok, false);
  const widenedRequest = { ...request, cwd: "/forged" };
  await rejects(driver.complete(widenedRequest, new AbortController().signal));
  const response = await driver.complete(request, new AbortController().signal);

  deepStrictEqual(response, {
    proposal: {
      kind: "deterministic-fake-action",
      summary: "Run the deterministic fake task",
    },
    version: 1,
  });
  strictEqual(decodeFakeModelResponse(response).ok, true);
  strictEqual(decodeFakeModelResponse({ ...response, approved: true }).ok, false);
  strictEqual(
    decodeFakeModelResponse({
      proposal: { kind: "shell", summary: "Run the deterministic fake task" },
      version: 1,
    }).ok,
    false,
  );
});

test("the fake model honors an already-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort();

  await rejects(
    new FakeModelDriver().complete(
      { task: "Index the fake workspace", version: 1 },
      controller.signal,
    ),
    (error) => error instanceof Error && error.name === "AbortError",
  );
});

test("the fake model boundary accepts one closed tool call and one terminal continuation result", () => {
  const call = {
    arguments: { maxBytes: 1024, offset: 0, path: "README.md" },
    name: "read_file",
    toolCallId: "tool-call-readme",
  } as const;
  const result = {
    data: {
      bytesRead: 4,
      content: "Eden",
      contentHash: `sha256:${"a".repeat(64)}`,
      nextOffset: null,
      offset: 0,
      sourcePath: "README.md",
      totalBytes: 4,
    },
    name: "read_file",
    status: "succeeded",
    toolCallId: "tool-call-readme",
  } as const;

  strictEqual(
    decodeFakeModelResponse({ proposal: { call, kind: "repository-tool-call" }, version: 1 }).ok,
    true,
  );
  strictEqual(
    decodeFakeModelRequest({ task: "Read the repository", toolResult: result, version: 1 }).ok,
    true,
  );
  strictEqual(
    decodeFakeModelResponse({
      proposal: { calls: [call, call], kind: "repository-tool-call" },
      version: 1,
    }).ok,
    false,
  );
  strictEqual(
    decodeFakeModelResponse({
      proposal: {
        call: { name: "read_file", toolCallId: "half-complete" },
        kind: "repository-tool-call",
      },
      version: 1,
    }).ok,
    false,
  );
});

test("the matching fake tasks request the closed search and Git status tools once", async () => {
  const driver = new FakeModelDriver();
  deepStrictEqual(
    await driver.complete(
      { task: "Search the repository for EDEN_NATIVE_SMOKE.", version: 1 },
      new AbortController().signal,
    ),
    {
      proposal: {
        call: {
          arguments: { continuation: null, path: ".", pattern: "EDEN_NATIVE_SMOKE" },
          name: "search_repository",
          toolCallId: "fake-search-repository",
        },
        kind: "repository-tool-call",
      },
      version: 1,
    },
  );
  deepStrictEqual(
    await driver.complete(
      { task: "Show the current repository status.", version: 1 },
      new AbortController().signal,
    ),
    {
      proposal: {
        call: {
          arguments: {},
          name: "git_status",
          toolCallId: "fake-git-status",
        },
        kind: "repository-tool-call",
      },
      version: 1,
    },
  );
});

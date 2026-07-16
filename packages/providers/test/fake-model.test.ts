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

import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";

import { decodeUsableCodingModelObservation } from "../src/index.ts";

const readCall = (index: number) => ({
  arguments: { maxBytes: 1, offset: 0, path: `file-${index}.txt` },
  name: "read_file" as const,
  toolCallId: `tool-${index}`,
});

test("usable coding observations allow model-chosen zero-to-four calls and reserve step 12", () => {
  const earlyAnswer = {
    finishStatus: "stop",
    step: 2,
    toolCalls: [],
    version: 1,
  } as const;
  const readBatch = {
    finishStatus: "tool_calls",
    step: 11,
    toolCalls: [readCall(1), readCall(2), readCall(3), readCall(4)],
    version: 1,
  } as const;
  const finalAnswer = { ...earlyAnswer, step: 12 } as const;

  deepStrictEqual(decodeUsableCodingModelObservation(earlyAnswer), {
    ok: true,
    value: earlyAnswer,
  });
  deepStrictEqual(decodeUsableCodingModelObservation(readBatch), { ok: true, value: readBatch });
  deepStrictEqual(decodeUsableCodingModelObservation(finalAnswer), {
    ok: true,
    value: finalAnswer,
  });

  strictEqual(
    decodeUsableCodingModelObservation({
      ...readBatch,
      toolCalls: [...readBatch.toolCalls, readCall(5)],
    }).ok,
    false,
  );
  strictEqual(decodeUsableCodingModelObservation({ ...readBatch, step: 12 }).ok, false);
  strictEqual(
    decodeUsableCodingModelObservation({ ...earlyAnswer, toolCalls: [readCall(1)] }).ok,
    false,
  );
});

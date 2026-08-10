import { strictEqual } from "node:assert";
import { test } from "node:test";

import { decodeRepositoryToolCall, decodeRepositoryToolResult } from "../src/index.ts";

const hash = (character: string) => `sha256:${character.repeat(64)}`;
const call = {
  arguments: { continuation: null, path: "." },
  name: "git_diff",
  toolCallId: "call-diff",
} as const;
const result = {
  data: {
    bytesRead: 5,
    content: "diff\n",
    contentHash: hash("a"),
    continuation: null,
    head: "b".repeat(40),
    offset: 0,
    patchHash: hash("c"),
    sourcePath: ".",
    statusHash: hash("d"),
    totalBytes: 5,
  },
  name: "git_diff",
  status: "succeeded",
  toolCallId: "call-diff",
} as const;

test("git diff call and page are closed semantic repository values", () => {
  strictEqual(decodeRepositoryToolCall(call).ok, true);
  strictEqual(decodeRepositoryToolResult(result).ok, true);

  for (const hostile of [
    { ...call, arguments: { ...call.arguments, executable: "git" } },
    { ...call, arguments: { ...call.arguments, argv: ["diff"] } },
    { ...call, arguments: { ...call.arguments, environment: { GIT_EXTERNAL_DIFF: "sentinel" } } },
    { ...call, arguments: { ...call.arguments, path: "../outside" } },
  ]) {
    strictEqual(decodeRepositoryToolCall(hostile).ok, false);
  }

  strictEqual(
    decodeRepositoryToolResult({ ...result, data: { ...result.data, bytesRead: 4 } }).ok,
    false,
  );
  strictEqual(
    decodeRepositoryToolResult({
      ...result,
      data: {
        ...result.data,
        continuation: {
          head: result.data.head,
          nextOffset: 4,
          patchHash: result.data.patchHash,
          path: ".",
          statusHash: result.data.statusHash,
        },
      },
    }).ok,
    false,
  );
});

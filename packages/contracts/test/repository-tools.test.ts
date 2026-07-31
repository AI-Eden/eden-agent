import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  awaitingApprovalProductView,
  decodeProductEvent,
  decodeProductView,
  decodeRepositoryToolCall,
  decodeRepositoryToolResult,
} from "@eden/contracts";

const listCall = {
  arguments: { continuation: null, path: "." },
  name: "list_files",
  toolCallId: "tool-call-list-1",
} as const;

const listResult = {
  data: {
    contentHash: `sha256:${"a".repeat(64)}`,
    continuation: "packages/contracts/src/protocol.ts",
    entries: [
      { kind: "directory", path: "packages", size: null },
      { kind: "file", path: "packages/contracts/package.json", size: 420 },
    ],
    sourcePath: ".",
    truncated: true,
    visited: 2,
  },
  name: "list_files",
  status: "succeeded",
  toolCallId: "tool-call-list-1",
} as const;

const readCall = {
  arguments: { maxBytes: 24_576, offset: 0, path: "packages/contracts/package.json" },
  name: "read_file",
  toolCallId: "tool-call-read-1",
} as const;

const readResult = {
  data: {
    bytesRead: 24,
    content: "abcdefghijklmnopqrstuvwx",
    contentHash: `sha256:${"b".repeat(64)}`,
    nextOffset: 24,
    offset: 0,
    sourcePath: "packages/contracts/package.json",
    totalBytes: 420,
  },
  name: "read_file",
  status: "succeeded",
  toolCallId: "tool-call-read-1",
} as const;

const repositoryCheckCall = {
  arguments: { checkName: "test" },
  name: "repository_check",
  toolCallId: "tool-call-repository-check-1",
} as const;

const repositoryCheckResult = {
  data: {
    actionId: "action-repository-check-1",
    checkName: "test",
    cleanupStatus: "complete",
    exitCode: 1,
    imageIndexDigest: `sha256:${"c".repeat(64)}`,
    inputManifestDigest: `sha256:${"d".repeat(64)}`,
    outcome: "failed",
    platformManifestDigest: `sha256:${"e".repeat(64)}`,
    profileRevision: "r2-docker-profile-v1",
    stderrSha256: `sha256:${"f".repeat(64)}`,
    stdoutSha256: `sha256:${"0".repeat(64)}`,
  },
  name: "repository_check",
  status: "completed",
  toolCallId: "tool-call-repository-check-1",
} as const;

describe("repository tool contracts", () => {
  it("decodes closed bounded list/read calls and terminal semantic results", () => {
    assert.equal(decodeRepositoryToolCall(listCall).ok, true);
    assert.equal(decodeRepositoryToolCall(readCall).ok, true);
    assert.equal(decodeRepositoryToolCall(repositoryCheckCall).ok, true);
    assert.equal(decodeRepositoryToolResult(listResult).ok, true);
    assert.equal(decodeRepositoryToolResult(readResult).ok, true);
    assert.equal(decodeRepositoryToolResult(repositoryCheckResult).ok, true);
    assert.equal(
      decodeRepositoryToolResult({ ...repositoryCheckResult, rawStdout: "secret canary" }).ok,
      false,
    );
  });

  it("rejects absolute, traversal, oversized, half-complete, parallel, and forged result values", () => {
    for (const call of [
      { ...listCall, arguments: { ...listCall.arguments, path: "/etc" } },
      { ...listCall, arguments: { ...listCall.arguments, path: "../outside" } },
      { ...readCall, arguments: { ...readCall.arguments, maxBytes: 24_577 } },
      { ...readCall, arguments: { path: readCall.arguments.path } },
      [listCall, readCall],
      { ...listCall, shell: "find" },
      { ...repositoryCheckCall, arguments: { checkName: "npm test" } },
      { ...repositoryCheckCall, arguments: { checkName: "test", process: ["sh", "-c"] } },
    ]) {
      assert.equal(decodeRepositoryToolCall(call).ok, false);
    }
    for (const result of [
      { ...readResult, rawStdout: "provider-owned" },
      { ...readResult, data: { ...readResult.data, content: "x".repeat(24_577) } },
      { ...listResult, data: { ...listResult.data, visited: 4_097 } },
      {
        ...listResult,
        data: {
          ...listResult.data,
          entries: Array.from({ length: 7 }, (_, index) => ({
            kind: "file",
            path: `${"a".repeat(4_000)}${index}`,
            size: 1,
          })),
        },
      },
      { ...listResult, data: { ...listResult.data, entries: [] }, status: "running" },
    ]) {
      assert.equal(decodeRepositoryToolResult(result).ok, false);
    }
  });

  it("projects attributable requested/completed tool cards without renderer-owned fields", () => {
    const requested = { call: listCall, result: null, state: "requested" } as const;
    const completed = { call: listCall, result: listResult, state: "completed" } as const;
    assert.equal(
      decodeProductView({ ...awaitingApprovalProductView, tools: [requested, completed] }).ok,
      true,
    );
    assert.equal(
      decodeProductEvent({
        activity: completed,
        cursor: 2,
        eventId: "event-tool-1",
        protocolVersion: 1,
        revision: 3,
        runId: "run-contracts-1",
        type: "tool.updated",
      }).ok,
      true,
    );
    assert.equal(
      decodeProductEvent({
        activity: { ...completed, expanded: true },
        cursor: 2,
        eventId: "event-tool-forged",
        protocolVersion: 1,
        revision: 3,
        runId: "run-contracts-1",
        type: "tool.updated",
      }).ok,
      false,
    );
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeRepositoryCapabilityReview,
  decodeRepositoryToolCall,
  decodeRepositoryToolResult,
  decodeWorkspaceReview,
  trustedWorkspaceReview,
} from "@eden/contracts";

const searchCall = {
  arguments: { continuation: null, path: ".", pattern: "RepositoryToolService" },
  name: "search_repository",
  toolCallId: "tool-call-search-1",
} as const;
const searchResult = {
  data: {
    contentHash: `sha256:${"a".repeat(64)}`,
    continuation: null,
    engine: {
      contentHash: `sha256:${"b".repeat(64)}`,
      name: "ripgrep",
      version: "15.0.0",
    },
    matches: [
      {
        byteColumn: 14,
        lineNumber: 3,
        path: "packages/coding-runtime/src/tools/index.ts",
        preview: "export class RepositoryToolService {\n",
      },
    ],
    sourcePath: ".",
    truncated: false,
  },
  name: "search_repository",
  status: "succeeded",
  toolCallId: searchCall.toolCallId,
} as const;
const statusCall = {
  arguments: {},
  name: "git_status",
  toolCallId: "tool-call-status-1",
} as const;
const statusResult = {
  data: {
    contentHash: `sha256:${"c".repeat(64)}`,
    entries: [
      {
        indexStatus: ".",
        kind: "modified",
        originalPath: null,
        path: "README.md",
        worktreeStatus: "M",
      },
      {
        indexStatus: "?",
        kind: "untracked",
        originalPath: null,
        path: "new file.txt",
        worktreeStatus: "?",
      },
    ],
    gitVersion: "2.43.0",
    sourcePath: ".",
  },
  name: "git_status",
  status: "succeeded",
  toolCallId: statusCall.toolCallId,
} as const;

const readyCapabilities = {
  git: {
    contentHash: null,
    error: null,
    minimumVersion: "2.31.0",
    name: "git",
    state: "ready",
    version: "2.43.0",
  },
  ripgrep: {
    contentHash: `sha256:${"b".repeat(64)}`,
    error: null,
    minimumVersion: "15.0.0",
    name: "ripgrep",
    state: "ready",
    version: "15.0.0",
  },
  state: "ready",
} as const;

describe("native repository tool contracts", () => {
  it("decodes closed search and Git-status calls and terminal results", () => {
    assert.equal(decodeRepositoryToolCall(searchCall).ok, true);
    assert.equal(decodeRepositoryToolCall(statusCall).ok, true);
    assert.equal(decodeRepositoryToolResult(searchResult).ok, true);
    assert.equal(decodeRepositoryToolResult(statusResult).ok, true);
  });

  it("rejects executable authority, malformed cursors, oversized results, and raw native output", () => {
    for (const call of [
      { ...searchCall, executable: "rg" },
      { ...searchCall, arguments: { ...searchCall.arguments, continuation: -1 } },
      { ...searchCall, arguments: { ...searchCall.arguments, pattern: "" } },
      { ...statusCall, arguments: { porcelain: 2 } },
    ]) {
      assert.equal(decodeRepositoryToolCall(call).ok, false);
    }
    for (const result of [
      { ...searchResult, rawStdout: "native" },
      {
        ...searchResult,
        data: {
          ...searchResult.data,
          matches: Array.from({ length: 257 }, () => searchResult.data.matches[0]),
        },
      },
      { ...statusResult, data: { ...statusResult.data, entries: [] }, rawStderr: "native" },
      {
        ...statusResult,
        data: {
          ...statusResult.data,
          entries: Array.from({ length: 257 }, () => statusResult.data.entries[0]),
        },
      },
    ]) {
      assert.equal(decodeRepositoryToolResult(result).ok, false);
    }
  });

  it("projects a closed prerequisite review without executable paths or renderer state", () => {
    assert.equal(decodeRepositoryCapabilityReview(readyCapabilities).ok, true);
    assert.equal(
      decodeWorkspaceReview({ ...trustedWorkspaceReview, repository: readyCapabilities }).ok,
      true,
    );
    assert.equal(
      decodeRepositoryCapabilityReview({ ...readyCapabilities, executable: "/usr/bin/rg" }).ok,
      false,
    );
    assert.equal(
      decodeRepositoryCapabilityReview({
        ...readyCapabilities,
        state: "blocked",
      }).ok,
      false,
    );
  });
});

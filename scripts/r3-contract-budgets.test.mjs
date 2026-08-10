import { strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { AnchorEditService } from "../packages/coding-runtime/src/anchor-edit.ts";
import { encodeJournalRecord } from "../packages/coding-runtime/src/journal/index.ts";
import { RunCommandService } from "../packages/coding-runtime/src/run-command.ts";
import { createJournalRecord } from "../packages/coding-runtime/src/runtime.ts";
import { SafeActuationEffectHost } from "../packages/coding-runtime/src/safe-actuation-host.ts";
import { WriteFileService } from "../packages/coding-runtime/src/write-file.ts";

const hash = (content) => `sha256:${createHash("sha256").update(content).digest("hex")}`;
const head = "a".repeat(40);
const time = "2026-08-11T00:00:00.000Z";

function encoded(event, sequence = 0) {
  return encodeJournalRecord(
    createJournalRecord(event, {
      causationId: "r3-causation",
      correlationId: "r3-correlation",
      eventId: `r3-event-${sequence}`,
      recordedAt: new Date(time),
      runId: "run-r3-budget",
      sequence,
    }),
  ).byteLength;
}

function modelCompleted(toolCalls, text = "x".repeat(4_096)) {
  return {
    effectId: "effect-model",
    observation: {
      attemptId: "attempt-model",
      finishStatus: toolCalls.length === 0 ? "stop" : "tool_calls",
      privateContinuity: "c".repeat(8_192),
      requestId: "request-model",
      status: "completed",
      text,
      toolCalls,
      usage: null,
      version: 1,
    },
    type: "model.step.completed",
  };
}

async function createCommandFixture(root) {
  const directory = join(root, "bin");
  const program = "eden-command-fixture.js";
  await mkdir(directory);
  await writeFile(join(directory, program), "process.exit(0);\n", "utf8");
  if (process.platform !== "win32") await chmod(join(directory, program), 0o755);
  return { directory, program };
}

test("R3 maximum production event fixtures fit one exact journal record", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-r3-budget-"));
  const stateDirectory = join(root, "state");
  await mkdir(stateDirectory);
  await mkdir(join(root, "src"));
  const commandFixture = await createCommandFixture(root);
  try {
    const safe = new SafeActuationEffectHost(
      new AnchorEditService({ stateDirectory, workspaceRoot: root }),
      { now: () => time },
      undefined,
      new WriteFileService({ stateDirectory, workspaceRoot: root }),
      new RunCommandService({ path: commandFixture.directory, workspaceRoot: root }),
    );
    const workspace = {
      name: "fixture",
      root,
      trust: "trusted",
      workspaceId: "workspace-r3-budget",
    };
    const commandCall = {
      arguments: {
        args: Array.from({ length: 12 }, () => "x".repeat(4_096)),
        cwd: ".",
        network: "host_unrestricted",
        program: commandFixture.program,
        reason: "r".repeat(4_096),
        timeoutMs: 600_000,
      },
      name: "run_command",
      toolCallId: "call-command-max",
    };
    const commandAction = await safe.execute({
      effectId: "effect-command-prepare",
      expectedRevision: 3,
      proposalRevision: 1,
      runId: "run-r3-budget",
      toolCall: commandCall,
      type: "run_command.prepare",
      workspace,
    });
    strictEqual(commandAction.type, "safe.action.proposed");

    const writeCall = {
      arguments: { content: "w".repeat(32_768), path: "src/maximum.txt" },
      name: "write_file",
      toolCallId: "call-write-max",
    };
    const writeAction = await safe.execute({
      effectId: "effect-write-prepare",
      expectedRevision: 3,
      proposalRevision: 1,
      runId: "run-r3-budget",
      toolCall: writeCall,
      type: "write_file.prepare",
      workspace,
    });
    strictEqual(writeAction.type, "safe.action.proposed");

    const outputBytes = Buffer.alloc(8_192);
    const output = {
      byteLength: outputBytes.byteLength,
      contentBase64: outputBytes.toString("base64"),
      effectId: "effect-command",
      index: 7,
      stream: "stdout",
      type: "run_command.output",
    };
    const patchContent = "p".repeat(57_344);
    const patch = {
      actionId: "action-write",
      effectId: "effect-patch",
      patch: {
        byteLength: Buffer.byteLength(patchContent),
        content: patchContent,
        contentHash: hash(patchContent),
        state: "complete",
      },
      type: "review.eden_patch.captured",
    };
    const trackedContent = "t".repeat(24_576);
    const snapshot = {
      actionId: "action-write",
      effectId: "effect-snapshot",
      phase: "current",
      snapshot: {
        head,
        observedAt: time,
        statusEntries: [],
        statusHash: hash("status"),
        trackedPatch: {
          byteLength: Buffer.byteLength(trackedContent),
          content: trackedContent,
          contentHash: hash(trackedContent),
          state: "complete",
        },
      },
      type: "review.git_snapshot.captured",
    };
    const readContent = "r".repeat(24_576);
    const readResult = {
      effectId: "effect-read",
      index: 3,
      result: {
        data: {
          bytesRead: 24_576,
          content: readContent,
          contentHash: hash(readContent),
          nextOffset: null,
          offset: 0,
          sourcePath: "maximum.txt",
          totalBytes: 24_576,
        },
        name: "read_file",
        status: "succeeded",
        toolCallId: "call-read-max",
      },
      type: "repository.tool.batch.item.completed",
    };
    const terminal = modelCompleted([], "f".repeat(4_096));

    for (const event of [
      commandAction,
      writeAction,
      output,
      patch,
      snapshot,
      readResult,
      terminal,
    ]) {
      strictEqual(encoded(event) <= 65_536, true, event.type);
    }

    const tooLargeCommand = await safe.execute({
      effectId: "effect-command-too-large",
      expectedRevision: 3,
      proposalRevision: 1,
      runId: "run-r3-budget",
      toolCall: {
        ...commandCall,
        arguments: {
          ...commandCall.arguments,
          args: Array.from({ length: 13 }, () => "x".repeat(4_096)),
        },
      },
      type: "run_command.prepare",
      workspace,
    });
    strictEqual(tooLargeCommand.type, "run.blocked");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("the independently counted complete R3-A maximum fixture fits 2 MiB and 4096 records", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-r3-run-budget-"));
  const stateDirectory = join(root, "state");
  await mkdir(stateDirectory);
  await mkdir(join(root, "src"));
  const commandFixture = await createCommandFixture(root);
  try {
    const safe = new SafeActuationEffectHost(
      new AnchorEditService({ stateDirectory, workspaceRoot: root }),
      { now: () => time },
      undefined,
      new WriteFileService({ stateDirectory, workspaceRoot: root }),
      new RunCommandService({ path: commandFixture.directory, workspaceRoot: root }),
    );
    const workspace = { name: "fixture", root, trust: "trusted", workspaceId: "workspace-r3-run" };
    const writeCall = {
      arguments: { content: "w".repeat(32_768), path: "src/maximum.txt" },
      name: "write_file",
      toolCallId: "call-write-max",
    };
    const writeAction = await safe.execute({
      effectId: "effect-write-prepare",
      expectedRevision: 3,
      proposalRevision: 1,
      runId: "run-r3-budget",
      toolCall: writeCall,
      type: "write_file.prepare",
      workspace,
    });
    const commandCall = {
      arguments: {
        args: Array.from({ length: 12 }, () => "x".repeat(4_096)),
        cwd: ".",
        network: "host_unrestricted",
        program: commandFixture.program,
        reason: "r".repeat(4_096),
        timeoutMs: 600_000,
      },
      name: "run_command",
      toolCallId: "call-command-max",
    };
    const commandAction = await safe.execute({
      effectId: "effect-command-prepare",
      expectedRevision: 3,
      proposalRevision: 1,
      runId: "run-r3-budget",
      toolCall: commandCall,
      type: "run_command.prepare",
      workspace,
    });
    if (
      writeAction.type !== "safe.action.proposed" ||
      commandAction.type !== "safe.action.proposed"
    ) {
      throw new Error("Maximum action fixture did not prepare.");
    }

    const readContent = "r".repeat(24_576);
    const readResult = {
      effectId: "effect-read",
      index: 0,
      result: {
        data: {
          bytesRead: 24_576,
          content: readContent,
          contentHash: hash(readContent),
          nextOffset: null,
          offset: 0,
          sourcePath: "maximum.txt",
          totalBytes: 24_576,
        },
        name: "read_file",
        status: "succeeded",
        toolCallId: "call-read-max",
      },
      type: "repository.tool.batch.item.completed",
    };
    const outputBytes = Buffer.alloc(8_192);
    const output = {
      byteLength: outputBytes.byteLength,
      contentBase64: outputBytes.toString("base64"),
      effectId: "effect-command",
      index: 0,
      stream: "stdout",
      type: "run_command.output",
    };
    const edenContent = "p".repeat(57_344);
    const edenPatch = {
      actionId: "action-write",
      effectId: "effect-patch",
      patch: {
        byteLength: 57_344,
        content: edenContent,
        contentHash: hash(edenContent),
        state: "complete",
      },
      type: "review.eden_patch.captured",
    };
    const trackedContent = "t".repeat(24_576);
    const snapshot = {
      actionId: "action-write",
      effectId: "effect-snapshot",
      phase: "current",
      snapshot: {
        head,
        observedAt: time,
        statusEntries: [],
        statusHash: hash("status"),
        trackedPatch: {
          byteLength: 24_576,
          content: trackedContent,
          contentHash: hash(trackedContent),
          state: "complete",
        },
      },
      type: "review.git_snapshot.captured",
    };
    const readCalls = Array.from({ length: 4 }, (_, index) => ({
      arguments: { maxBytes: 24_576, offset: 0, path: `file-${index}.txt` },
      name: "read_file",
      toolCallId: `call-read-${index}`,
    }));
    const smallLifecycle = { effectId: "effect-small", type: "effect.dispatch.started" };
    const categories = [
      { count: 6, name: "write model steps", size: encoded(modelCompleted([writeCall])) },
      { count: 2, name: "command model steps", size: encoded(modelCompleted([commandCall])) },
      { count: 2, name: "four-read batch model steps", size: encoded(modelCompleted(readCalls)) },
      { count: 1, name: "final-answer model step", size: encoded(modelCompleted([])) },
      { count: 6, name: "write proposals", size: encoded(writeAction) },
      { count: 2, name: "command proposals", size: encoded(commandAction) },
      { count: 8, name: "maximum read results", size: encoded(readResult) },
      { count: 32, name: "maximum command output chunks", size: encoded(output) },
      { count: 6, name: "maximum new-file patches", size: encoded(edenPatch) },
      { count: 12, name: "maximum tracked snapshots", size: encoded(snapshot) },
      { count: 160, name: "remaining lifecycle facts", size: encoded(smallLifecycle) },
    ];
    const recordCount = categories.reduce((total, category) => total + category.count, 0);
    const bytes = categories.reduce((total, category) => total + category.count * category.size, 0);

    strictEqual(recordCount <= 4_096, true);
    strictEqual(bytes <= 2_097_152, true, JSON.stringify({ bytes, categories }));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

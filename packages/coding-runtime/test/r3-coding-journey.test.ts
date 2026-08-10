import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { describe, it } from "node:test";

import { decodeProductView, ProductViewSchema } from "@eden/contracts";
import type { RunState, SafeActuationAction } from "@eden/kernel";
import type { ModelStepObservationV1, ModelStepRequestV1 } from "@eden/providers";
import Schema from "typebox/schema";

import { AnchorEditService } from "../src/anchor-edit.ts";
import { FakeToolHost } from "../src/fake-tool-host.ts";
import { GitReviewService } from "../src/git-review.ts";
import { encodeJournalRecord, FileJournal } from "../src/journal/index.ts";
import type { NativeProcessPort } from "../src/native-process.ts";
import { projectJournal } from "../src/projection.ts";
import { RunCommandService } from "../src/run-command.ts";
import { RunEffectHost } from "../src/run-effect-host.ts";
import { RuntimeEngine } from "../src/runtime.ts";
import { SafeActuationEffectHost } from "../src/safe-actuation-host.ts";
import { WriteFileService } from "../src/write-file.ts";

const usableCodingPolicy = {
  actionProposals: 8,
  commandOutputBytes: 262_144,
  commandStderrBytes: 65_536,
  commandStdoutBytes: 65_536,
  commandTimeoutMs: 600_000,
  finalAnswerStep: 12,
  gitDiffPageBytes: 24_576,
  gitDiffPages: 4,
  journalBytes: 2_097_152,
  journalRecordBytes: 65_536,
  journalRecords: 4_096,
  maxReadOnlyCallsPerStep: 4,
  modelSteps: 12,
  modelVisibleToolContentBytes: 524_288,
  newFileBytes: 32_768,
  profile: "usable_coding_v1",
  readOnlyConcurrency: 4,
  toolCalls: 16,
  version: 1,
  wallTimeMs: 1_800_000,
} as const;

const usableCodingGrant = {
  actionProposals: 8,
  commandOutputBytes: 262_144,
  journalBytes: 2_097_152,
  journalRecords: 4_096,
  modelSteps: 12,
  modelVisibleToolContentBytes: 524_288,
  policy: "usable_coding_v1",
  toolCalls: 16,
  version: 1,
  wallTimeMs: 1_800_000,
} as const;

type WithoutAttempt<T> = T extends unknown ? Omit<T, "attemptId"> : never;
type ScriptedObservation = WithoutAttempt<ModelStepObservationV1>;

class ScriptedModel {
  calls = 0;
  readonly observations: readonly ScriptedObservation[];
  readonly requests: ModelStepRequestV1[] = [];

  constructor(observations: readonly ScriptedObservation[]) {
    this.observations = observations;
  }

  async completeModelStep(input: ModelStepRequestV1): Promise<ModelStepObservationV1> {
    this.requests.push(input);
    const observation = this.observations[this.calls++];
    if (observation === undefined) throw new Error("Missing scripted R3 observation.");
    return { ...observation, attemptId: input.attemptId } as ModelStepObservationV1;
  }
}

function ids(start = 0) {
  let next = start;
  return { next: () => `r3-event-${next++}` };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "eden-r3-journey-"));
  const stateDirectory = join(root, ".state");
  mkdirSync(stateDirectory, { mode: 0o700 });
  writeFileSync(join(root, "answer.cjs"), "module.exports = 41;\n");
  writeFileSync(
    join(root, "answer.test.cjs"),
    [
      "const assert = require('node:assert/strict');",
      "const { readFileSync } = require('node:fs');",
      "const test = require('node:test');",
      "test('known correction', () => {",
      "  assert.equal(require('./answer.cjs'), 42);",
      "  assert.equal(readFileSync('created.txt', 'utf8'), 'created\\n');",
      "  assert.equal(process.env.EDEN_SECRET_CANARY, undefined);",
      "});",
      "",
    ].join("\n"),
  );
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });
  execFileSync("git", ["add", "answer.cjs", "answer.test.cjs"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "failing fixture"], { cwd: root });
  const independentFailure = spawnSync(process.execPath, ["--test", "answer.test.cjs"], {
    cwd: root,
    encoding: "utf8",
    env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
  });
  assert.notEqual(independentFailure.status, 0);
  return { root, stateDirectory };
}

function observations(): readonly ScriptedObservation[] {
  return [
    {
      error: {
        code: "network",
        message: "The provider request was proven not started.",
        recoverability: "retry",
        suggestedActions: ["Retry the same committed conversation turn once."],
      },
      status: "not_started",
      version: 1,
    },
    {
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-r3-batch",
      status: "completed",
      text: "Inspect four independent repository facts.",
      toolCalls: [
        {
          arguments: { continuation: null, path: "." },
          name: "list_files",
          toolCallId: "call-list",
        },
        {
          arguments: { maxBytes: 1_024, offset: 0, path: "answer.cjs" },
          name: "read_file",
          toolCallId: "call-read",
        },
        { arguments: {}, name: "git_status", toolCallId: "call-status" },
        {
          arguments: { continuation: null, path: "." },
          name: "git_diff",
          toolCallId: "call-initial-diff",
        },
      ],
      usage: null,
      version: 1,
    },
    {
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-r3-edit",
      status: "completed",
      text: "Propose the independently known source correction.",
      toolCalls: [
        {
          arguments: {
            path: "answer.cjs",
            replacements: [
              {
                expectedOccurrences: 1,
                newText: "module.exports = 42;",
                oldText: "module.exports = 41;",
              },
            ],
          },
          name: "anchor_edit",
          toolCallId: "call-edit",
        },
      ],
      usage: null,
      version: 1,
    },
    {
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-r3-create",
      status: "completed",
      text: "Propose the independently expected new file.",
      toolCalls: [
        {
          arguments: { content: "created\n", path: "created.txt" },
          name: "write_file",
          toolCallId: "call-create",
        },
      ],
      usage: null,
      version: 1,
    },
    {
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-r3-command",
      status: "completed",
      text: "Propose the structured test command.",
      toolCalls: [
        {
          arguments: {
            args: ["--test", "answer.test.cjs"],
            cwd: ".",
            network: "host_unrestricted",
            program: basename(process.execPath),
            reason: "Run the deterministic repository test fixture.",
            timeoutMs: 10_000,
          },
          name: "run_command",
          toolCallId: "call-command",
        },
      ],
      usage: null,
      version: 1,
    },
    {
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-r3-final-diff",
      status: "completed",
      text: "Inspect the final tracked diff.",
      toolCalls: [
        {
          arguments: { continuation: null, path: "." },
          name: "git_diff",
          toolCallId: "call-final-diff",
        },
      ],
      usage: null,
      version: 1,
    },
    {
      finishStatus: "stop",
      privateContinuity: null,
      requestId: "request-r3-final",
      status: "completed",
      text: "The approved correction, new file, test command, and final diff are complete for review.",
      toolCalls: [],
      usage: null,
      version: 1,
    },
  ];
}

async function openJourney(root: string, stateDirectory: string, model: ScriptedModel) {
  const journal = await FileJournal.open(join(stateDirectory, "journal.jsonl"), "run-r3-journey", {
    profile: "usable_coding_v1",
  });
  const fake = new FakeToolHost(join(stateDirectory, "receipts"), root, undefined, {}, model);
  const safe = new SafeActuationEffectHost(
    new AnchorEditService({ stateDirectory, workspaceRoot: root }),
    { now: () => "2026-08-11T00:00:00.000Z" },
    new GitReviewService({ now: () => "2026-08-11T00:00:00.000Z", workspaceRoot: root }),
    new WriteFileService({ stateDirectory, workspaceRoot: root }),
    new RunCommandService({ path: dirname(process.execPath), workspaceRoot: root }),
  );
  const engine = await RuntimeEngine.open(
    journal,
    new RunEffectHost(fake, safe),
    {
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    },
    ids(),
  );
  await engine.commit(
    {
      codingBudget: { grant: usableCodingGrant, policy: usableCodingPolicy },
      correlationId: "command-r3-journey",
      model: {
        contextWindowTokens: 128_000,
        maxOutputTokens: 1_024,
        model: "deterministic-r3-fixture",
        multiCallCapability: "bounded_read_only_v1",
        profileId: "fixture",
      },
      runId: "run-r3-journey",
      task: "Correct the deterministic failing fixture and prove the result.",
      type: "run.started",
      workspace: {
        name: "R3 fixture",
        root,
        trust: "trusted",
        workspaceId: "workspace-r3-journey",
      },
    },
    "command-r3-journey",
  );
  return { engine, fake, journal, safe };
}

async function drive(engine: RuntimeEngine): Promise<void> {
  while (engine.state.phase === "executing") {
    const effect = await engine.requestNextEffect();
    if (effect === null) return;
    await engine.settleInFlightEffect();
  }
}

function approval(state: RunState): SafeActuationAction {
  if (state.phase !== "awaiting-approval" || !("safeActuation" in state.action)) {
    throw new Error(`Expected approval, received ${state.phase}.`);
  }
  return state.action;
}

async function approve(engine: RuntimeEngine, expectedKind: string): Promise<void> {
  const action = approval(engine.state);
  assert.equal(action.safeActuation.envelope.kind, expectedKind);
  await engine.commit(
    { approvalId: action.approvalId, decision: "approve", type: "approval.resolved" },
    `approve-${expectedKind}`,
  );
  await drive(engine);
}

describe("R3-A deterministic coding journey", () => {
  it("reads concurrently, edits, creates, runs, diffs, recovers once, and ends completed", async () => {
    const { root, stateDirectory } = fixture();
    const previousCanary = process.env.EDEN_SECRET_CANARY;
    process.env.EDEN_SECRET_CANARY = "must-not-reach-command";
    try {
      const model = new ScriptedModel(observations());
      const { engine, journal } = await openJourney(root, stateDirectory, model);
      await drive(engine);
      await approve(engine, "anchor_edit");
      await approve(engine, "write_file");
      await approve(engine, "run_command");

      assert.equal(engine.state.phase, "terminal");
      if (engine.state.phase !== "terminal") return;
      assert.equal(engine.state.terminalOutcome.state, "completed");
      assert.equal(readFileSync(join(root, "answer.cjs"), "utf8"), "module.exports = 42;\n");
      assert.equal(readFileSync(join(root, "created.txt"), "utf8"), "created\n");
      assert.equal(
        spawnSync(process.execPath, ["--test", "answer.test.cjs"], {
          cwd: root,
          env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
        }).status,
        0,
      );

      const records = await journal.readAll();
      assert.equal(records.filter((record) => record.type === "model.attempt.started").length, 7);
      assert.equal(
        records.filter((record) => record.type === "repository.tool.batch.closed").length,
        1,
      );
      assert.equal(records.filter((record) => record.type === "anchor_edit.completed").length, 1);
      assert.equal(records.filter((record) => record.type === "write_file.completed").length, 1);
      assert.equal(records.filter((record) => record.type === "run_command.completed").length, 1);
      const commandDispatch = records.findIndex(
        (record) =>
          record.type === "effect.dispatch.started" &&
          JSON.stringify(record.payload).includes("run-command:action-call-command"),
      );
      const commandCompleted = records.findIndex(
        (record) => record.type === "run_command.completed",
      );
      assert.notEqual(commandDispatch, -1);
      assert.ok(commandDispatch < commandCompleted);
      assert.equal(
        records.every((record) => encodeJournalRecord(record).byteLength <= 65_536),
        true,
      );
      assert.ok(
        records.reduce((total, record) => total + encodeJournalRecord(record).byteLength, 0) <=
          2_097_152,
      );

      const projected = projectJournal(records).view;
      const decodedView = decodeProductView(projected);
      assert.equal(
        decodedView.ok,
        true,
        JSON.stringify([...Schema.Compile(ProductViewSchema).Errors(projected)]),
      );
      assert.equal(projected.terminalOutcome?.state, "completed");
      assert.equal(projected.codingBudget?.usage.actionProposals, 3);
      assert.equal(projected.codingBudget?.usage.modelSteps, 6);
      assert.equal(projected.codingBudget?.usage.toolCalls, 8);
      assert.equal(
        projected.tools?.find((tool) => tool.call.name === "run_command")?.result?.status,
        "completed",
      );
      assert.equal(JSON.stringify(projected).includes("must-not-reach-command"), false);

      const callsBeforeReplay = model.calls;
      const replayed = await RuntimeEngine.open(
        journal,
        new RunEffectHost(
          new FakeToolHost(join(stateDirectory, "replay-receipts"), root, undefined, {}, model),
          new SafeActuationEffectHost(
            new AnchorEditService({ stateDirectory, workspaceRoot: root }),
            {},
            new GitReviewService({ workspaceRoot: root }),
            new WriteFileService({ stateDirectory, workspaceRoot: root }),
            new RunCommandService({ path: dirname(process.execPath), workspaceRoot: root }),
          ),
        ),
        { now: () => new Date("2026-08-11T00:00:00.000Z") },
        ids(500),
      );
      assert.equal(replayed.state.phase, "terminal");
      assert.equal(model.calls, callsBeforeReplay);
    } finally {
      if (previousCanary === undefined) delete process.env.EDEN_SECRET_CANARY;
      else process.env.EDEN_SECRET_CANARY = previousCanary;
      await new Promise((resolve) => setTimeout(resolve, 100));
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("blocks an approved command after durable dispatch without a terminal receipt", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const commandObservation = observations()[4];
      if (commandObservation === undefined) throw new Error("Missing command observation.");
      const model = new ScriptedModel([commandObservation]);
      const { engine, journal } = await openJourney(root, stateDirectory, model);
      await drive(engine);
      const action = approval(engine.state);
      assert.equal(action.safeActuation.envelope.kind, "run_command");
      await engine.commit(
        { approvalId: action.approvalId, decision: "approve", type: "approval.resolved" },
        "approve-command-crash",
      );
      const effect = await engine.requestNextEffect();
      assert.equal(effect?.type, "run_command.execute");
      await engine.markDispatchStarted();

      let nativeCalls = 0;
      const nativeProcess: NativeProcessPort = {
        run: async () => {
          nativeCalls += 1;
          return { status: "spawn-failed" };
        },
      };
      const replaySafe = new SafeActuationEffectHost(
        new AnchorEditService({ stateDirectory, workspaceRoot: root }),
        {},
        new GitReviewService({ workspaceRoot: root }),
        new WriteFileService({ stateDirectory, workspaceRoot: root }),
        new RunCommandService({
          nativeProcess,
          path: dirname(process.execPath),
          workspaceRoot: root,
        }),
      );
      const replayed = await RuntimeEngine.open(
        journal,
        new RunEffectHost(
          new FakeToolHost(join(stateDirectory, "replay-receipts"), root, undefined, {}, model),
          replaySafe,
        ),
        { now: () => new Date("2026-08-11T00:00:00.000Z") },
        ids(700),
      );
      await replayed.settleInFlightEffect();
      assert.equal(nativeCalls, 0);
      assert.equal(replayed.state.phase, "terminal");
      if (replayed.state.phase !== "terminal") return;
      assert.equal(replayed.state.terminalOutcome.state, "blocked");
      if (replayed.state.terminalOutcome.state !== "blocked") return;
      assert.equal(replayed.state.terminalOutcome.error.code, "effect_outcome_unknown");
      assert.equal(
        (await journal.readAll()).some((record) => record.type === "run_command.completed"),
        false,
      );
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 100));
      rmSync(root, { force: true, recursive: true });
    }
  });
});

import { deepStrictEqual, strictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { RunState, SafeActuationAction } from "@eden/kernel";
import type { ModelStepObservationV1, ModelStepRequestV1 } from "@eden/providers";

import { AnchorEditService } from "../src/anchor-edit.ts";
import { FakeToolHost } from "../src/fake-tool-host.ts";
import { GitReviewService } from "../src/git-review.ts";
import { FileJournal } from "../src/journal/index.ts";
import { projectJournal } from "../src/projection.ts";
import { RunEffectHost } from "../src/run-effect-host.ts";
import { RuntimeEngine } from "../src/runtime.ts";
import { SafeActuationEffectHost } from "../src/safe-actuation-host.ts";
import { WriteFileService } from "../src/write-file.ts";

const clock = { now: () => new Date("2026-07-28T10:00:00.000Z") };

function ids(start = 1) {
  let next = start;
  return { next: () => `event-${next++}` };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "eden-safe-provider-"));
  const stateDirectory = `${root}-state`;
  mkdirSync(stateDirectory, { mode: 0o700 });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });
  writeFileSync(join(root, "tracked.txt"), "first old\nsecond old\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "base"], { cwd: root });
  return { root, stateDirectory };
}

class ScriptedModel {
  readonly #observations: readonly ScriptedObservation[];
  calls = 0;

  constructor(observations: readonly ScriptedObservation[]) {
    this.#observations = observations;
  }

  async completeModelStep(input: ModelStepRequestV1): Promise<ModelStepObservationV1> {
    const observation = this.#observations[this.calls++];
    if (observation === undefined) throw new Error("Missing scripted model observation.");
    return { ...observation, attemptId: input.attemptId } as ModelStepObservationV1;
  }
}

type ScriptedObservation = Omit<
  Extract<ModelStepObservationV1, { readonly status: "completed" }>,
  "attemptId"
>;

async function runtime(
  root: string,
  stateDirectory: string,
  model: ScriptedModel,
): Promise<{ journal: FileJournal; runtime: RuntimeEngine }> {
  const journal = await FileJournal.open(join(stateDirectory, "journal.jsonl"), "run-safe-model");
  const fake = new FakeToolHost(join(stateDirectory, "receipts"), root, undefined, {}, model);
  const safe = new SafeActuationEffectHost(
    new AnchorEditService({ stateDirectory, workspaceRoot: root }),
    { now: () => clock.now().toISOString() },
    new GitReviewService({ now: () => clock.now().toISOString(), workspaceRoot: root }),
    new WriteFileService({ stateDirectory, workspaceRoot: root }),
  );
  const engine = await RuntimeEngine.open(journal, new RunEffectHost(fake, safe), clock, ids());
  await engine.commit(
    {
      correlationId: "command-safe-model",
      model: {
        contextWindowTokens: 128_000,
        maxOutputTokens: 512,
        model: "fixture-model",
        profileId: "fixture-profile",
      },
      runId: "run-safe-model",
      task: "Update the tracked text.",
      type: "run.started",
      workspace: {
        name: "fixture",
        root,
        trust: "trusted",
        workspaceId: "workspace-safe-model",
      },
    },
    "command-safe-model",
  );
  return { journal, runtime: engine };
}

async function drive(engine: RuntimeEngine): Promise<void> {
  while (engine.state.phase === "executing") {
    const effect = await engine.requestNextEffect();
    if (effect === null) return;
    await engine.settleInFlightEffect();
  }
}

function readState(engine: RuntimeEngine): RunState {
  return engine.state;
}

function proposal(
  toolCallId: string,
  replacements: readonly {
    readonly expectedOccurrences: 1;
    readonly newText: string;
    readonly oldText: string;
  }[],
): ScriptedObservation {
  return {
    finishStatus: "tool_calls",
    privateContinuity: null,
    requestId: `request-${toolCallId}`,
    status: "completed",
    text: "I propose one bounded edit.",
    toolCalls: [
      {
        arguments: { path: "tracked.txt", replacements: [...replacements] },
        name: "anchor_edit",
        toolCallId,
      },
    ],
    usage: null,
    version: 1,
  };
}

function currentSafeAction(state: RunState): SafeActuationAction {
  if (state.phase !== "awaiting-approval" || !("safeActuation" in state.action)) {
    throw new Error("Expected a safe-actuation approval.");
  }
  return state.action;
}

describe("provider safe-actuation loop", () => {
  it("exclusively creates one approved UTF-8 file and keeps its patch distinct from Git tracking", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const model = new ScriptedModel([
        {
          finishStatus: "tool_calls",
          privateContinuity: null,
          requestId: "request-write-file",
          status: "completed",
          text: "I propose one new file.",
          toolCalls: [
            {
              arguments: { content: "export const greeting = '你好';\n", path: "created.ts" },
              name: "write_file",
              toolCallId: "call-write-file",
            },
          ],
          usage: null,
          version: 1,
        },
      ]);
      const { journal, runtime: engine } = await runtime(root, stateDirectory, model);
      await drive(engine);
      strictEqual(engine.state.phase, "awaiting-approval", JSON.stringify(engine.state));
      const action = currentSafeAction(engine.state);
      strictEqual(action.safeActuation.envelope.kind, "write_file");
      await engine.commit(
        { approvalId: action.approvalId, decision: "approve", type: "approval.resolved" },
        "command-approve-write",
      );
      await drive(engine);

      strictEqual(
        readFileSync(join(root, "created.ts"), "utf8"),
        "export const greeting = '你好';\n",
      );
      const records = await journal.readAll();
      strictEqual(records.filter((record) => record.type === "write_file.completed").length, 1);
      const projected = projectJournal(records);
      deepStrictEqual(projected.view.changedFiles, [
        { attribution: "eden", path: "created.ts", status: "added" },
      ]);
      deepStrictEqual(projected.view.review?.untrackedPaths, ["created.ts"]);
      strictEqual(projected.view.review?.edenPatch.state, "complete");
      if (projected.view.review?.edenPatch.state === "complete") {
        strictEqual(projected.view.review.edenPatch.content.includes("--- /dev/null"), true);
        strictEqual(
          projected.view.review.edenPatch.content.includes("+export const greeting"),
          true,
        );
      }
      strictEqual(projected.view.review?.currentTrackedPatch.state, "complete");
      if (projected.view.review?.currentTrackedPatch.state === "complete") {
        strictEqual(
          projected.view.review.currentTrackedPatch.content.includes("created.ts"),
          false,
        );
      }
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("prepares an ask decision, consumes approval, and applies only the approved digest", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const model = new ScriptedModel([
        proposal("call-edit", [
          { expectedOccurrences: 1, newText: "first new", oldText: "first old" },
        ]),
      ]);
      const { journal, runtime: engine } = await runtime(root, stateDirectory, model);
      await drive(engine);
      strictEqual(engine.state.phase, "awaiting-approval");
      const action = currentSafeAction(engine.state);
      strictEqual(action.safeActuation.policy.decision, "ask");
      strictEqual(action.safeActuation.approval.state, "available");

      await engine.commit(
        {
          approvalId: action.approvalId,
          decision: "approve",
          type: "approval.resolved",
        },
        "command-approve",
      );
      await drive(engine);

      strictEqual(readFileSync(join(root, "tracked.txt"), "utf8"), "first new\nsecond old\n");
      const reviewState = readState(engine);
      if (reviewState.phase !== "terminal") throw new Error("Expected completed review.");
      strictEqual(reviewState.terminalOutcome.state, "completed");
      strictEqual(reviewState.safeReview?.baselineCheck?.status, "passed");
      strictEqual(reviewState.safeReview?.currentCheck?.status, "passed");
      const records = await journal.readAll();
      const recordBytes = records.map(
        (record) => new TextEncoder().encode(`${JSON.stringify(record)}\n`).byteLength,
      );
      strictEqual(
        recordBytes.every((byteLength) => byteLength <= 65_536),
        true,
      );
      strictEqual(
        recordBytes.reduce((total, byteLength) => total + byteLength, 0) <= 1_048_576,
        true,
      );
      strictEqual(records.length <= 4_096, true);
      const recordTypes = records.map((record) => record.type);
      deepStrictEqual(
        recordTypes.filter((type) =>
          [
            "safe.action.proposed",
            "approval.consumed",
            "anchor_edit.completed",
            "review.eden_patch.captured",
            "review.git_snapshot.captured",
            "review.git_check.completed",
          ].includes(type),
        ),
        [
          "safe.action.proposed",
          "review.eden_patch.captured",
          "review.git_snapshot.captured",
          "review.git_check.completed",
          "approval.consumed",
          "anchor_edit.completed",
          "review.git_snapshot.captured",
          "review.git_check.completed",
        ],
      );
      strictEqual(recordTypes.filter((type) => type === "effect.dispatch.started").length, 7);
      const projected = projectJournal(records);
      strictEqual(projected.view.phase, "review");
      strictEqual(projected.view.terminalOutcome?.state, "completed");
      deepStrictEqual(projected.view.changedFiles, [
        { attribution: "eden", path: "tracked.txt", status: "modified" },
      ]);
      deepStrictEqual(
        projected.view.checks.map((check) => [check.name, check.status]),
        [
          ["Git diff-check (baseline)", "passed"],
          ["Git diff-check (current)", "passed"],
        ],
      );
      strictEqual(projected.view.review?.actionDigest, action.digest);
      strictEqual(projected.view.review?.approval.state, "consumed");
      strictEqual(projected.view.review?.edenPatch.state, "complete");
      strictEqual(projected.view.review?.currentTrackedPatch.state, "complete");
      deepStrictEqual(projected.view.review?.untrackedPaths, []);
      strictEqual(
        projected.events.some(
          (event) =>
            event.type === "review.updated" &&
            event.review.actionDigest === action.digest &&
            event.review.approval.state === "consumed",
        ),
        true,
      );
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("feeds denial back once and accepts only one no-broader child proposal", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const model = new ScriptedModel([
        proposal("call-parent", [
          { expectedOccurrences: 1, newText: "first new", oldText: "first old" },
          { expectedOccurrences: 1, newText: "second new", oldText: "second old" },
        ]),
        proposal("call-child", [
          { expectedOccurrences: 1, newText: "first new", oldText: "first old" },
        ]),
      ]);
      const { runtime: engine } = await runtime(root, stateDirectory, model);
      await drive(engine);
      strictEqual(engine.state.phase, "awaiting-approval");
      const rootAction = currentSafeAction(engine.state);
      const parent = rootAction.actionId;
      await engine.commit(
        {
          approvalId: rootAction.approvalId,
          decision: "deny",
          type: "approval.resolved",
        },
        "command-deny",
      );
      await drive(engine);

      strictEqual(model.calls, 2);
      strictEqual(engine.state.phase, "awaiting-approval");
      const child = currentSafeAction(engine.state);
      strictEqual(child.safeActuation.parentActionId, parent);
      strictEqual(
        child.safeActuation.envelope.operation.type === "anchor_edit"
          ? child.safeActuation.envelope.operation.replacements.length
          : 0,
        1,
      );
      await engine.commit(
        {
          approvalId: child.approvalId,
          decision: "deny",
          type: "approval.resolved",
        },
        "command-deny-child",
      );
      await drive(engine);
      const deniedState = readState(engine);
      strictEqual(deniedState.phase, "terminal");
      if (deniedState.phase !== "terminal") throw new Error("Expected terminal denial.");
      strictEqual(deniedState.terminalOutcome.state, "blocked");
      strictEqual(readFileSync(join(root, "tracked.txt"), "utf8"), "first old\nsecond old\n");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("blocks before approval when the complete Eden patch exceeds its budget", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const longContext = "x".repeat(12_300);
      writeFileSync(join(root, "tracked.txt"), `${longContext}\nfirst old\n${longContext}\n`);
      execFileSync("git", ["add", "tracked.txt"], { cwd: root });
      execFileSync("git", ["commit", "--quiet", "-m", "large base"], { cwd: root });
      const model = new ScriptedModel([
        proposal("call-large", [
          { expectedOccurrences: 1, newText: "first new", oldText: "first old" },
        ]),
      ]);
      const { journal, runtime: engine } = await runtime(root, stateDirectory, model);

      await drive(engine);

      strictEqual(engine.state.phase, "terminal");
      if (engine.state.phase !== "terminal") throw new Error("Expected a blocked run.");
      strictEqual(engine.state.terminalOutcome.state, "blocked");
      if (engine.state.terminalOutcome.state !== "blocked") {
        throw new Error("Expected a blocked outcome.");
      }
      strictEqual(engine.state.terminalOutcome.error.code, "review_budget_exceeded");
      strictEqual(
        (await journal.readAll()).some((record) => record.type === "approval.consumed"),
        false,
      );
      strictEqual(readFileSync(join(root, "tracked.txt"), "utf8").includes("first new"), false);
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("durably blocks when HEAD changes after the approved edit", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const model = new ScriptedModel([
        proposal("call-head-drift", [
          { expectedOccurrences: 1, newText: "first new", oldText: "first old" },
        ]),
      ]);
      const { journal, runtime: engine } = await runtime(root, stateDirectory, model);
      await drive(engine);
      const action = currentSafeAction(engine.state);
      await engine.commit(
        {
          approvalId: action.approvalId,
          decision: "approve",
          type: "approval.resolved",
        },
        "command-approve-head-drift",
      );
      while (engine.state.phase === "executing") {
        const effect = await engine.requestNextEffect();
        if (effect === null) break;
        await engine.settleInFlightEffect();
        if (engine.state.phase === "executing" && engine.state.stage === "git-current-ready") {
          execFileSync("git", ["add", "tracked.txt"], { cwd: root });
          execFileSync("git", ["commit", "--quiet", "-m", "concurrent head change"], {
            cwd: root,
          });
        }
      }

      strictEqual(engine.state.phase, "terminal");
      if (engine.state.phase !== "terminal") throw new Error("Expected a blocked run.");
      strictEqual(engine.state.terminalOutcome.state, "blocked");
      if (engine.state.terminalOutcome.state !== "blocked") {
        throw new Error("Expected a blocked outcome.");
      }
      strictEqual(engine.state.terminalOutcome.error.code, "review_head_changed");
      strictEqual((await journal.readAll()).at(-1)?.type, "run.blocked");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });
});

import { deepStrictEqual, strictEqual } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { SafeActuationAction } from "@eden/kernel";

import {
  AnchorEditService,
  createSafeApproval,
  evaluateSafeActuationPolicy,
  FileJournal,
  GitReviewService,
  RuntimeEngine,
  SafeActuationEffectHost,
  safeActionDigest,
} from "../src/index.ts";

const fixedClock = { now: () => new Date("2026-07-28T08:00:00.000Z") };

function ids(start = 1) {
  let next = start;
  return { next: () => `event-${next++}` };
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "eden-safe-recovery-"));
  const stateDirectory = `${root}-state`;
  mkdirSync(stateDirectory, { mode: 0o700 });
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });
  writeFileSync(join(root, "tracked.txt"), "before\nold value\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: root });
  execFileSync("git", ["commit", "--quiet", "-m", "base"], { cwd: root });
  return { root, stateDirectory };
}

async function preparedAction(root: string, stateDirectory: string) {
  const service = new AnchorEditService({ stateDirectory, workspaceRoot: root });
  const envelope = await service.prepare({
    actionId: "action-safe-1",
    canonicalRootHash: `sha256:${"a".repeat(64)}`,
    path: "tracked.txt",
    proposalRevision: 1,
    replacements: [{ expectedOccurrences: 1, newText: "new value", oldText: "old value" }],
    runId: "run-safe-1",
    workspaceId: "workspace-safe-1",
  });
  const policy = evaluateSafeActuationPolicy(envelope, fixedClock.now().toISOString());
  const approval = createSafeApproval({
    approvalId: "approval-safe-1",
    envelope,
    expectedRevision: 11,
  });
  const action: SafeActuationAction = {
    actionId: envelope.actionId,
    approvalId: approval.approvalId,
    canonicalDisplay: "AnchorEdit tracked.txt: 1 replacement",
    cwd: ".",
    digest: safeActionDigest(envelope),
    reason: policy.reason,
    safeActuation: {
      approval: {
        actionDigest: approval.actionDigest,
        expectedRevision: approval.expectedRevision,
        proposalRevision: approval.proposalRevision,
        state: approval.state,
      },
      envelope,
      parentActionId: null,
      policy,
    },
    scope: "tracked.txt",
  };
  return { action, service };
}

async function approvedEngine(
  root: string,
  stateDirectory: string,
  journal: FileJournal,
  host: SafeActuationEffectHost,
) {
  const { action } = await preparedAction(root, stateDirectory);
  const engine = await RuntimeEngine.open(journal, host, fixedClock, ids());
  await engine.commit(
    {
      correlationId: "command-safe-1",
      runId: "run-safe-1",
      task: "Replace one anchor.",
      type: "run.started",
      workspace: {
        name: "fixture",
        root,
        trust: "trusted",
        workspaceId: "workspace-safe-1",
      },
    },
    "command-safe-1",
  );
  await engine.commit(
    { action, effectId: "direct-safe-proposal", type: "safe.action.proposed" },
    "command-safe-1",
  );
  while (engine.state.phase === "executing") {
    const effect = await engine.requestNextEffect();
    if (effect === null) break;
    await engine.settleInFlightEffect();
  }
  strictEqual(engine.state.phase, "awaiting-approval");
  await engine.commit(
    { approvalId: action.approvalId, decision: "approve", type: "approval.resolved" },
    "command-safe-1",
  );
  return engine;
}

describe("journaled safe-actuation recovery", () => {
  it("durably consumes approval and records dispatch before writing", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const journal = await FileJournal.open(join(stateDirectory, "journal.jsonl"), "run-safe-1");
      const { service } = await preparedAction(root, stateDirectory);
      const host = new SafeActuationEffectHost(
        service,
        { now: () => fixedClock.now().toISOString() },
        new GitReviewService({
          now: () => fixedClock.now().toISOString(),
          workspaceRoot: root,
        }),
      );
      const engine = await approvedEngine(root, stateDirectory, journal, host);

      const effect = await engine.requestNextEffect();
      strictEqual(effect?.type, "anchor_edit.execute");
      await engine.settleInFlightEffect();

      const records = await journal.readAll();
      deepStrictEqual(
        records
          .map((record) => record.type)
          .filter((type) =>
            [
              "run.started",
              "safe.action.proposed",
              "approval.resolved",
              "approval.consumed",
              "anchor_edit.completed",
            ].includes(type),
          ),
        [
          "run.started",
          "safe.action.proposed",
          "approval.resolved",
          "approval.consumed",
          "anchor_edit.completed",
        ],
      );
      strictEqual(readFileSync(join(root, "tracked.txt"), "utf8"), "before\nnew value\n");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("reconciles desired content after a crash without a duplicate write", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const journal = await FileJournal.open(join(stateDirectory, "journal.jsonl"), "run-safe-1");
      const { service } = await preparedAction(root, stateDirectory);
      const host = new SafeActuationEffectHost(
        service,
        { now: () => fixedClock.now().toISOString() },
        new GitReviewService({
          now: () => fixedClock.now().toISOString(),
          workspaceRoot: root,
        }),
      );
      const engine = await approvedEngine(root, stateDirectory, journal, host);
      const effect = await engine.requestNextEffect();
      if (effect?.type !== "anchor_edit.execute") throw new Error("Expected AnchorEdit.");
      await engine.markDispatchStarted();
      await host.execute(effect);

      const restarted = await RuntimeEngine.open(
        journal,
        host,
        fixedClock,
        ids((await journal.readAll()).length + 1),
      );
      await restarted.settleInFlightEffect();

      const records = await journal.readAll();
      const last = records.at(-1);
      strictEqual(last?.type, "anchor_edit.completed");
      strictEqual((last?.payload as { readonly recovered?: boolean } | undefined)?.recovered, true);
      strictEqual(readFileSync(join(root, "tracked.txt"), "utf8"), "before\nnew value\n");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("pure replay performs no live reconciliation and unrelated content blocks", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const journal = await FileJournal.open(join(stateDirectory, "journal.jsonl"), "run-safe-1");
      const { service } = await preparedAction(root, stateDirectory);
      const host = new SafeActuationEffectHost(
        service,
        { now: () => fixedClock.now().toISOString() },
        new GitReviewService({
          now: () => fixedClock.now().toISOString(),
          workspaceRoot: root,
        }),
      );
      const engine = await approvedEngine(root, stateDirectory, journal, host);
      await engine.requestNextEffect();
      writeFileSync(join(root, "tracked.txt"), "someone else changed it\n");

      let liveCalls = 0;
      const countingHost = new SafeActuationEffectHost(
        service,
        {
          onReconcile: () => {
            liveCalls += 1;
          },
        },
        new GitReviewService({ workspaceRoot: root }),
      );
      const restarted = await RuntimeEngine.open(
        journal,
        countingHost,
        fixedClock,
        ids((await journal.readAll()).length + 1),
      );
      strictEqual(liveCalls, 0);
      await restarted.settleInFlightEffect();
      strictEqual(liveCalls, 1);
      strictEqual(restarted.state.phase, "terminal");
      if (restarted.state.phase !== "terminal") throw new Error("Expected terminal state.");
      strictEqual(restarted.state.terminalOutcome.state, "blocked");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });

  it("treats a dispatched Git capture without a receipt as unknown instead of retrying", async () => {
    const { root, stateDirectory } = fixture();
    try {
      const journal = await FileJournal.open(join(stateDirectory, "journal.jsonl"), "run-safe-1");
      const { service } = await preparedAction(root, stateDirectory);
      let reviewExecutions = 0;
      const host = new SafeActuationEffectHost(
        service,
        { now: () => fixedClock.now().toISOString() },
        new GitReviewService({
          now: () => {
            reviewExecutions += 1;
            return fixedClock.now().toISOString();
          },
          workspaceRoot: root,
        }),
      );
      const engine = await approvedEngine(root, stateDirectory, journal, host);
      const edit = await engine.requestNextEffect();
      if (edit?.type !== "anchor_edit.execute") throw new Error("Expected AnchorEdit.");
      await engine.settleInFlightEffect();
      const capture = await engine.requestNextEffect();
      if (capture?.type !== "review.git_snapshot.capture") {
        throw new Error("Expected current Git capture.");
      }
      await engine.markDispatchStarted();
      const beforeRestart = reviewExecutions;

      const restarted = await RuntimeEngine.open(
        journal,
        host,
        fixedClock,
        ids((await journal.readAll()).length + 1),
      );
      await restarted.settleInFlightEffect();

      strictEqual(restarted.state.phase, "terminal");
      if (restarted.state.phase !== "terminal") throw new Error("Expected blocked recovery.");
      strictEqual(restarted.state.terminalOutcome.state, "blocked");
      if (restarted.state.terminalOutcome.state !== "blocked") {
        throw new Error("Expected blocked outcome.");
      }
      strictEqual(restarted.state.terminalOutcome.error.code, "effect_outcome_unknown");
      strictEqual(reviewExecutions, beforeRestart);
      strictEqual((await journal.readAll()).at(-1)?.type, "run.blocked");
    } finally {
      rmSync(root, { force: true, recursive: true });
      rmSync(stateDirectory, { force: true, recursive: true });
    }
  });
});

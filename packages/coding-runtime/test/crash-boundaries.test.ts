import { deepStrictEqual, strictEqual } from "node:assert";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { KernelEffect, KernelEvent } from "@eden/kernel";

import { FakeToolHost } from "../src/fake-tool-host.ts";
import { FileJournal } from "../src/journal/index.ts";
import { createJournalRecord, type EffectHost, RuntimeEngine } from "../src/runtime.ts";
import {
  approvalRecord,
  modelCompletedRecord,
  modelRequestedRecord,
  startRecord,
} from "./records.ts";

const fixedClock = { now: () => new Date("2026-07-15T00:00:02.000Z") };

function ids(start = 4) {
  let next = start;
  return { next: () => `event-${next++}` };
}

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "eden-crash-"));
  const journalPath = join(root, "run.jsonl");
  const receiptsPath = join(root, "receipts");
  const journal = await FileJournal.open(journalPath, "run-1");
  const host = new FakeToolHost(receiptsPath);
  return { host, journal, journalPath, receiptsPath };
}

async function appendApproved(journal: FileJournal) {
  await journal.append(startRecord);
  await journal.append(modelRequestedRecord);
  await journal.append(modelCompletedRecord);
  await journal.append(approvalRecord);
}

test("restart observes only committed domain events", async () => {
  // Given: an empty durable journal at the boundary before a domain commit.
  const fixture = await setup();

  // When: one engine restarts before commit, then after a raw committed start record.
  const before = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids());
  await fixture.journal.append(startRecord);
  const after = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids());

  // Then: replay sees the prior idle truth first and applies the commit exactly once after restart.
  strictEqual(before.state.phase, "idle");
  strictEqual(after.state.phase, "executing");
  strictEqual(after.state.revision, 1);
});

test("an intent committed before dispatch executes once with the same effect identity", async () => {
  // Given: an approved run whose deterministic effect intent is durably committed.
  const fixture = await setup();
  await appendApproved(fixture.journal);
  const first = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids());
  const effect = await first.requestNextEffect();

  // When: a fresh engine reconciles the not-started effect.
  const restarted = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids(5));
  await restarted.settleInFlightEffect();

  // Then: one receipt exists and the observation advances the run without changing effect identity.
  strictEqual(effect?.effectId, "run-1:fake-action");
  strictEqual(restarted.state.phase, "executing");
  if (restarted.state.phase !== "executing") throw new Error("Expected executing state.");
  strictEqual(restarted.state.stage, "verification-ready");
  strictEqual((await readdir(fixture.receiptsPath)).length, 1);
});

test("a receipt committed before observation is reconciled without another execution", async () => {
  // Given: a committed intent and a durable adapter receipt with no journal observation.
  const fixture = await setup();
  await appendApproved(fixture.journal);
  const first = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids());
  const effect = await first.requestNextEffect();
  if (effect === null) throw new Error("Expected an effect.");
  const observation = await fixture.host.execute(effect);

  // When: a fresh engine settles the unresolved intent.
  const restarted = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids(5));
  await restarted.settleInFlightEffect();

  // Then: it appends the recorded observation and leaves the single receipt unchanged.
  const reconciled = await fixture.host.reconcile(effect);
  strictEqual(restarted.state.revision, 6);
  strictEqual(reconciled.status, "completed");
  if (reconciled.status !== "completed") throw new Error("Expected a completed receipt.");
  deepStrictEqual(reconciled.observation, observation);
  strictEqual((await readdir(fixture.receiptsPath)).length, 1);
});

test("an observation committed before reduction replays exactly once", async () => {
  // Given: an action receipt and its observation appended without reducing in the old process.
  const fixture = await setup();
  await appendApproved(fixture.journal);
  const first = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids());
  const effect = await first.requestNextEffect();
  if (effect === null) throw new Error("Expected an effect.");
  const observation = await fixture.host.execute(effect);
  await fixture.journal.append(
    createJournalRecord(observation, {
      causationId: effect.effectId,
      correlationId: "command-run-1",
      eventId: "event-5",
      recordedAt: fixedClock.now(),
      runId: "run-1",
      sequence: 5,
    }),
  );

  // When: a fresh engine replays the same journal.
  const restarted = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids());

  // Then: the observation is present once and no dispatch occurs during replay.
  strictEqual(restarted.state.revision, 6);
  if (restarted.state.phase !== "executing") throw new Error("Expected executing state.");
  strictEqual(restarted.state.stage, "verification-ready");
  strictEqual((await fixture.journal.readAll()).length, 6);
});

test("unknown reconciliation blocks visibly without executing the effect", async () => {
  // Given: a committed unresolved intent and an adapter that cannot establish its outcome.
  const fixture = await setup();
  await appendApproved(fixture.journal);
  const first = await RuntimeEngine.open(fixture.journal, fixture.host, fixedClock, ids());
  await first.requestNextEffect();
  const unknownHost: EffectHost = {
    execute(_effect: KernelEffect): Promise<KernelEvent> {
      throw new Error("Unknown effects must not execute.");
    },
    async reconcile() {
      return { status: "unknown" } as const;
    },
  };

  // When: recovery asks the owning adapter to settle the intent.
  const restarted = await RuntimeEngine.open(fixture.journal, unknownHost, fixedClock, ids(5));
  await restarted.settleInFlightEffect();

  // Then: the run is blocked and no receipt was created.
  strictEqual(restarted.state.phase, "terminal");
  if (restarted.state.phase !== "terminal") throw new Error("Expected terminal state.");
  strictEqual(restarted.state.terminalOutcome.state, "blocked");
  strictEqual((await readdir(fixture.receiptsPath).catch(() => [])).length, 0);
});

import { strictEqual } from "node:assert";
import { link, mkdir, mkdtemp, readdir, rename, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { FakeModelRequestV1, FakeModelResponseV1, ModelDriver } from "@eden/providers";

import { fakeAction } from "../src/fake-action.ts";
import { FakeToolHost } from "../src/fake-tool-host.ts";
import { FileJournal } from "../src/journal/index.ts";
import { createJournalRecord, RuntimeEngine } from "../src/runtime.ts";
import { startRecord } from "./records.ts";

const clock = { now: () => new Date("2026-07-16T00:00:00.000Z") };

function ids(start: number) {
  let next = start;
  return { next: () => `event-${next++}` };
}

class CountingDriver implements ModelDriver {
  readonly id = "counting-model";
  calls = 0;

  async complete(_request: FakeModelRequestV1, _signal: AbortSignal): Promise<FakeModelResponseV1> {
    this.calls += 1;
    return {
      proposal: {
        kind: "deterministic-fake-action",
        summary: "Run the deterministic fake task",
      },
      version: 1,
    };
  }
}

class AbortReasonDriver implements ModelDriver {
  readonly id = "abort-reason-model";

  async complete(_request: FakeModelRequestV1, signal: AbortSignal): Promise<FakeModelResponseV1> {
    throw signal.reason;
  }
}

async function setup(driver: ModelDriver) {
  const root = await mkdtemp(join(tmpdir(), "eden-model-crash-"));
  const receipts = join(root, "receipts");
  const journal = await FileJournal.open(join(root, "journal.jsonl"), "run-1");
  const host = new FakeToolHost(receipts, "/work/eden-agent", driver);
  await journal.append(startRecord);
  return { host, journal, receipts };
}

test("a model intent restarts with one call and the same effect identity", async () => {
  const driver = new CountingDriver();
  const fixture = await setup(driver);
  const first = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(1));
  const effect = await first.requestNextEffect();

  strictEqual(driver.calls, 0);
  strictEqual(effect?.effectId, "run-1:fake-model");
  const restarted = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(2));
  await restarted.settleInFlightEffect();

  strictEqual(driver.calls, 1);
  strictEqual(restarted.state.phase, "awaiting-approval");
  strictEqual((await readdir(fixture.receipts)).length, 1);
});

test("a custom abort reason remains an aborted model operation", async () => {
  const fixture = await setup(new AbortReasonDriver());
  const engine = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(1));
  const effect = await engine.requestNextEffect();
  if (effect === null) throw new Error("Expected model effect.");
  const controller = new AbortController();
  controller.abort("caller-cancelled");

  const observation = await fixture.host.execute(effect, controller.signal);

  strictEqual(observation.type, "run.blocked");
  if (observation.type !== "run.blocked") throw new Error("Expected a blocked observation.");
  strictEqual(observation.error.code, "operation_aborted");
});

test("a durable model receipt reconciles without a duplicate provider call", async () => {
  const driver = new CountingDriver();
  const fixture = await setup(driver);
  const first = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(1));
  const effect = await first.requestNextEffect();
  if (effect === null) throw new Error("Expected model effect.");
  await fixture.host.execute(effect);
  strictEqual(driver.calls, 1);

  const restarted = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(2));
  await restarted.settleInFlightEffect();

  strictEqual(driver.calls, 1);
  strictEqual(restarted.state.phase, "awaiting-approval");
});

test("a committed model observation replays with zero provider calls", async () => {
  const driver = new CountingDriver();
  const fixture = await setup(driver);
  const first = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(1));
  const effect = await first.requestNextEffect();
  if (effect === null) throw new Error("Expected model effect.");
  const observation = await fixture.host.execute(effect);
  await fixture.journal.append(
    createJournalRecord(observation, {
      causationId: effect.effectId,
      correlationId: "command-run-1",
      eventId: "event-2",
      recordedAt: clock.now(),
      runId: "run-1",
      sequence: 2,
    }),
  );
  const callsBeforeReplay = driver.calls;

  const replayed = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(3));

  strictEqual(driver.calls, callsBeforeReplay);
  strictEqual(replayed.state.phase, "awaiting-approval");
});

test("an unknown model receipt blocks without calling the provider", async () => {
  const driver = new CountingDriver();
  const fixture = await setup(driver);
  const first = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(1));
  const effect = await first.requestNextEffect();
  if (effect === null) throw new Error("Expected model effect.");
  await mkdir(fixture.receipts, { recursive: true });
  await writeFile(
    join(fixture.receipts, `${Buffer.from(effect.effectId).toString("base64url")}.json`),
    '{"effectId":"forged"}\n',
    "utf8",
  );

  const restarted = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(2));
  await restarted.settleInFlightEffect();

  strictEqual(driver.calls, 0);
  strictEqual(restarted.state.phase, "terminal");
  if (restarted.state.phase !== "terminal") throw new Error("Expected terminal state.");
  strictEqual(restarted.state.terminalOutcome.state, "blocked");
});

test("a malformed UTF-8 receipt never reconciles as completed", async () => {
  const driver = new CountingDriver();
  const fixture = await setup(driver);
  const engine = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(1));
  const effect = await engine.requestNextEffect();
  if (effect === null) throw new Error("Expected model effect.");
  await mkdir(fixture.receipts, { recursive: true });
  await writeFile(
    join(fixture.receipts, `${Buffer.from(effect.effectId).toString("base64url")}.json`),
    Buffer.from([0x7b, 0xff, 0x7d, 0x0a]),
  );

  strictEqual((await fixture.host.reconcile(effect)).status, "unknown");
  strictEqual(driver.calls, 0);
});

test("linked receipts never reconcile as completed", async () => {
  for (const shape of ["hardlink", "symlink"] as const) {
    const driver = new CountingDriver();
    const fixture = await setup(driver);
    const engine = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(1));
    const effect = await engine.requestNextEffect();
    if (effect === null) throw new Error("Expected model effect.");
    await fixture.host.execute(effect);
    const receipt = join(
      fixture.receipts,
      `${Buffer.from(effect.effectId).toString("base64url")}.json`,
    );
    const moved = join(fixture.receipts, `${shape}-source.json`);
    await rename(receipt, moved);
    if (shape === "hardlink") await link(moved, receipt);
    else await symlink(moved, receipt, "file");

    strictEqual((await fixture.host.reconcile(effect)).status, "unknown");
  }
});

test("a symlinked receipt directory never reconciles external state", async () => {
  const driver = new CountingDriver();
  const fixture = await setup(driver);
  const engine = await RuntimeEngine.open(fixture.journal, fixture.host, clock, ids(1));
  const effect = await engine.requestNextEffect();
  if (effect === null) throw new Error("Expected model effect.");
  const external = join(fixture.receipts, "..", "external-receipts");
  await mkdir(external);
  await symlink(external, fixture.receipts, "dir");
  await writeFile(
    join(external, `${Buffer.from(effect.effectId).toString("base64url")}.json`),
    `${JSON.stringify({
      effectId: effect.effectId,
      observation: {
        action: fakeAction("run-1", "/work/eden-agent", "Run the deterministic fake task"),
        effectId: effect.effectId,
        type: "fake.model.completed",
      },
    })}\n`,
    "utf8",
  );

  strictEqual((await fixture.host.reconcile(effect)).status, "unknown");
});

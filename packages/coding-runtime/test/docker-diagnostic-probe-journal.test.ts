import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type TestContext, test } from "node:test";
import { decodeDockerDiagnosticProbeEvent } from "@eden/contracts";
import {
  dockerDiagnosticProbeActionDigestFixture,
  dockerDiagnosticProbeActionFixture,
  dockerDiagnosticProbeCleanupFixture,
  dockerDiagnosticProbeObservationsFixture,
  dockerDiagnosticProbeReceiptFixture,
  dockerDiagnosticProbeResultFixture,
} from "../../contracts/test/docker-diagnostic-probe-fixture.ts";
import {
  createDockerDiagnosticProbeRecoveryRequiredEvent,
  createDockerDiagnosticProbeRecoveryResolvedEvent,
  DockerDiagnosticProbeJournal,
  DockerDiagnosticProbeJournalError,
  projectDockerDiagnosticProbeJournal,
} from "../src/index.ts";

const windowsTest = process.platform === "win32" ? test : test.skip;

function skipWithoutPosix(context: TestContext): boolean {
  if (process.platform !== "win32") return false;
  context.skip("requires POSIX filesystem permission semantics");
  return true;
}

async function stateDirectory(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "eden-docker-probe-journal-")), "state");
}

function event(
  type:
    | "docker.probe.action.prepared"
    | "docker.probe.approval.consumed"
    | "docker.probe.effect.intent",
) {
  const common = {
    eventId: `event-${type}`,
    probeId: "probe-example-1",
    recordedAt: "2026-07-31T00:00:00.000Z",
    redaction: "closed_no_raw_docker",
    type,
  } as const;
  if (type === "docker.probe.action.prepared") {
    return {
      ...common,
      payload: {
        action: dockerDiagnosticProbeActionFixture,
        actionDigest: dockerDiagnosticProbeActionDigestFixture,
        approvalId: "approval-probe-1",
        effectId: "effect-docker-probe-1",
      },
      type,
    } as const;
  }
  if (type === "docker.probe.approval.consumed") {
    return {
      ...common,
      payload: {
        actionDigest: dockerDiagnosticProbeActionDigestFixture,
        actionId: "action-docker-probe-1",
        approvalId: "approval-probe-1",
        decision: "approve",
      },
      type,
    } as const;
  }
  return {
    ...common,
    payload: {
      actionId: "action-docker-probe-1",
      configDigest: `sha256:${"4".repeat(64)}`,
      containerName: "eden-probe-0123456789abcdef01234567",
      effectId: "effect-docker-probe-1",
    },
    type,
  } as const;
}

windowsTest("native Windows keeps the POSIX diagnostic journal fail-closed", async () => {
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory: await stateDirectory() });
  await rejects(
    journal.append(event("docker.probe.action.prepared")),
    (error: unknown) =>
      error instanceof DockerDiagnosticProbeJournalError &&
      error.code === "journal_permissions_invalid",
  );
});

test("diagnostic journal projection remains platform-neutral", () => {
  const records = [
    event("docker.probe.action.prepared"),
    event("docker.probe.approval.consumed"),
    event("docker.probe.effect.intent"),
  ].map((record, index) => ({ ...record, journalVersion: 1 as const, sequence: index + 1 }));

  deepStrictEqual(projectDockerDiagnosticProbeJournal(records), {
    actionDigest: dockerDiagnosticProbeActionDigestFixture,
    actionId: "action-docker-probe-1",
    cleanup: null,
    effectId: "effect-docker-probe-1",
    lastLifecycleState: "effect_intent",
    probeId: "probe-example-1",
    recovery: null,
    receipt: null,
    revision: 1,
    status: "unresolved",
    terminalDraft: null,
  });
});

test("private diagnostic journal accepts only the exact durable lifecycle prefix", async (context) => {
  if (skipWithoutPosix(context)) return;
  const state = await stateDirectory();
  const journal = new DockerDiagnosticProbeJournal({ stateDirectory: state });

  await journal.append(event("docker.probe.action.prepared"));
  await journal.append(event("docker.probe.approval.consumed"));
  await journal.append(event("docker.probe.effect.intent"));

  const records = await journal.load();
  strictEqual(records.length, 3);
  deepStrictEqual(
    records.map((record) => [record.sequence, record.type]),
    [
      [1, "docker.probe.action.prepared"],
      [2, "docker.probe.approval.consumed"],
      [3, "docker.probe.effect.intent"],
    ],
  );
  strictEqual((await lstat(journal.path)).mode & 0o777, 0o600);
  strictEqual((await lstat(dirname(journal.path))).mode & 0o777, 0o700);
  strictEqual((await readFile(journal.path, "utf8")).endsWith("\n"), true);
  deepStrictEqual(projectDockerDiagnosticProbeJournal(records), {
    actionDigest: dockerDiagnosticProbeActionDigestFixture,
    actionId: "action-docker-probe-1",
    cleanup: null,
    effectId: "effect-docker-probe-1",
    lastLifecycleState: "effect_intent",
    probeId: "probe-example-1",
    recovery: null,
    receipt: null,
    revision: 1,
    status: "unresolved",
    terminalDraft: null,
  });

  const outOfOrder = new DockerDiagnosticProbeJournal({
    stateDirectory: await stateDirectory(),
  });
  await rejects(
    outOfOrder.append(event("docker.probe.effect.intent")),
    (error: unknown) =>
      error instanceof DockerDiagnosticProbeJournalError &&
      error.code === "journal_sequence_invalid",
  );
});

test("the first durable record preserves the stable effect identity before effect intent", async (context) => {
  if (skipWithoutPosix(context)) return;
  const journal = new DockerDiagnosticProbeJournal({
    stateDirectory: await stateDirectory(),
  });

  await journal.append(event("docker.probe.action.prepared"));

  deepStrictEqual(projectDockerDiagnosticProbeJournal(await journal.load()), {
    actionDigest: dockerDiagnosticProbeActionDigestFixture,
    actionId: "action-docker-probe-1",
    cleanup: null,
    effectId: "effect-docker-probe-1",
    lastLifecycleState: "action_prepared",
    probeId: "probe-example-1",
    recovery: null,
    receipt: null,
    revision: 1,
    status: "unresolved",
    terminalDraft: null,
  });

  const recovery = createDockerDiagnosticProbeRecoveryRequiredEvent(
    projectDockerDiagnosticProbeJournal(await journal.load()),
    "event-probe-recovery-1",
  );
  strictEqual(recovery.ok, true);
  if (!recovery.ok) return;
  strictEqual(decodeDockerDiagnosticProbeEvent(recovery.event).ok, true);
  strictEqual(recovery.event.effectId, "effect-docker-probe-1");
  strictEqual(recovery.event.lastLifecycleState, "action_prepared");
});

test("action-prepared recovery closes as not-started without container facts", async (context) => {
  if (skipWithoutPosix(context)) return;
  const journal = new DockerDiagnosticProbeJournal({
    stateDirectory: await stateDirectory(),
  });
  await journal.append(event("docker.probe.action.prepared"));
  await journal.append({
    eventId: "event-recovery-closed",
    payload: {
      actionDigest: dockerDiagnosticProbeActionDigestFixture,
      actionId: "action-docker-probe-1",
      effectId: "effect-docker-probe-1",
      lastLifecycleState: "action_prepared",
      outcome: "not_started",
      reason: "approval_not_consumed",
    },
    probeId: "probe-example-1",
    recordedAt: "2026-07-31T00:00:01.000Z",
    redaction: "closed_no_raw_docker",
    type: "docker.probe.recovery.closed",
  });

  const records = await journal.load();
  const projection = projectDockerDiagnosticProbeJournal(records);
  deepStrictEqual(projection, {
    actionDigest: dockerDiagnosticProbeActionDigestFixture,
    actionId: "action-docker-probe-1",
    cleanup: null,
    effectId: "effect-docker-probe-1",
    lastLifecycleState: "recovery_closed",
    probeId: "probe-example-1",
    receipt: null,
    recovery: {
      lastLifecycleState: "action_prepared",
      outcome: "not_started",
      reason: "approval_not_consumed",
      resolvedAt: "2026-07-31T00:00:01.000Z",
    },
    revision: 1,
    status: "resolved",
    terminalDraft: null,
  });
  const resolved = createDockerDiagnosticProbeRecoveryResolvedEvent(
    projection,
    "event-probe-recovery-resolved-1",
  );
  strictEqual(resolved.ok, true);
  if (!resolved.ok) return;
  strictEqual(decodeDockerDiagnosticProbeEvent(resolved.event).ok, true);
  strictEqual(resolved.event.type, "docker.probe.recovery.resolved");
  strictEqual(resolved.event.reason, "approval_not_consumed");
  strictEqual(
    records.some((record) => record.type === "docker.probe.container.created"),
    false,
  );
});

test("later lifecycle records cannot replace the first durable effect identity", async (context) => {
  if (skipWithoutPosix(context)) return;
  const journal = new DockerDiagnosticProbeJournal({
    stateDirectory: await stateDirectory(),
  });
  await journal.append(event("docker.probe.action.prepared"));
  await journal.append(event("docker.probe.approval.consumed"));

  const intent = event("docker.probe.effect.intent");
  await rejects(
    journal.append({
      ...intent,
      payload: { ...intent.payload, effectId: "effect-docker-probe-other" },
    }),
    (error: unknown) =>
      error instanceof DockerDiagnosticProbeJournalError &&
      error.code === "journal_sequence_invalid",
  );
});

test("diagnostic journal blocks permissive, linked, malformed, and concurrently locked state", async (context) => {
  if (skipWithoutPosix(context)) return;
  const permissiveState = await stateDirectory();
  const permissive = new DockerDiagnosticProbeJournal({ stateDirectory: permissiveState });
  await permissive.append(event("docker.probe.action.prepared"));
  await chmod(permissive.path, 0o644);
  await rejects(
    permissive.load(),
    (error: unknown) =>
      error instanceof DockerDiagnosticProbeJournalError &&
      error.code === "journal_permissions_invalid",
  );

  const linkedState = await stateDirectory();
  const linked = new DockerDiagnosticProbeJournal({ stateDirectory: linkedState });
  await mkdir(dirname(linked.path), { mode: 0o700, recursive: true });
  const target = join(linkedState, "target.jsonl");
  await writeFile(target, "{}\n", { mode: 0o600 });
  await link(target, linked.path);
  await rejects(
    linked.load(),
    (error: unknown) =>
      error instanceof DockerDiagnosticProbeJournalError && error.code === "journal_link_invalid",
  );

  const malformedState = await stateDirectory();
  const malformed = new DockerDiagnosticProbeJournal({ stateDirectory: malformedState });
  await mkdir(dirname(malformed.path), { mode: 0o700, recursive: true });
  await writeFile(malformed.path, "{not-json}\n", { mode: 0o600 });
  await rejects(
    malformed.load(),
    (error: unknown) =>
      error instanceof DockerDiagnosticProbeJournalError && error.code === "journal_record_invalid",
  );

  const locked = new DockerDiagnosticProbeJournal({ stateDirectory: await stateDirectory() });
  const lease = await locked.acquireLock();
  await rejects(
    locked.acquireLock(),
    (error: unknown) =>
      error instanceof DockerDiagnosticProbeJournalError && error.code === "journal_locked",
  );
  await lease.release();
  const nextLease = await locked.acquireLock();
  await nextLease.release();
});

test("complete journal replays receipt-before-cleanup into one resolved projection", async (context) => {
  if (skipWithoutPosix(context)) return;
  const journal = new DockerDiagnosticProbeJournal({
    stateDirectory: await stateDirectory(),
  });
  const later = [
    {
      eventId: "event-container-created",
      payload: {
        container: dockerDiagnosticProbeReceiptFixture.container,
        effectId: "effect-docker-probe-1",
        labels: dockerDiagnosticProbeReceiptFixture.labels,
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T00:00:01.000Z",
      redaction: "closed_no_raw_docker",
      type: "docker.probe.container.created",
    },
    {
      eventId: "event-dispatch-started",
      payload: {
        containerId: dockerDiagnosticProbeReceiptFixture.container.id,
        effectId: "effect-docker-probe-1",
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T00:00:02.000Z",
      redaction: "closed_no_raw_docker",
      type: "docker.probe.dispatch.started",
    },
    {
      eventId: "event-receipt-recorded",
      payload: {
        receipt: dockerDiagnosticProbeReceiptFixture,
        terminalDraft: {
          endedAt: "2026-07-31T00:00:03.000Z",
          observations: dockerDiagnosticProbeObservationsFixture,
          outcome: "passed",
          startedAt: "2026-07-31T00:00:02.000Z",
        },
      },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T00:00:03.000Z",
      redaction: "closed_no_raw_docker",
      type: "docker.probe.receipt.recorded",
    },
    {
      eventId: "event-cleanup-recorded",
      payload: { cleanup: dockerDiagnosticProbeCleanupFixture },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T00:00:04.000Z",
      redaction: "closed_no_raw_docker",
      type: "docker.probe.cleanup.recorded",
    },
    {
      eventId: "event-terminal",
      payload: { result: dockerDiagnosticProbeResultFixture },
      probeId: "probe-example-1",
      recordedAt: "2026-07-31T00:00:05.000Z",
      redaction: "closed_no_raw_docker",
      type: "docker.probe.terminal",
    },
  ] as const;
  for (const value of [
    event("docker.probe.action.prepared"),
    event("docker.probe.approval.consumed"),
    event("docker.probe.effect.intent"),
    ...later,
  ]) {
    await journal.append(value);
  }

  const records = await journal.load();
  const projection = projectDockerDiagnosticProbeJournal(records);
  strictEqual(projection.status, "resolved");
  if (projection.status !== "resolved") return;
  strictEqual(projection.lastLifecycleState, "terminal");
  deepStrictEqual(projection.receipt, dockerDiagnosticProbeReceiptFixture);
  deepStrictEqual(projection.cleanup, dockerDiagnosticProbeCleanupFixture);
  deepStrictEqual(projection.terminalDraft, {
    endedAt: "2026-07-31T00:00:03.000Z",
    observations: dockerDiagnosticProbeObservationsFixture,
    outcome: "passed",
    startedAt: "2026-07-31T00:00:02.000Z",
  });
  strictEqual(
    records.findIndex((record) => record.type === "docker.probe.receipt.recorded") <
      records.findIndex((record) => record.type === "docker.probe.cleanup.recorded"),
    true,
  );
});

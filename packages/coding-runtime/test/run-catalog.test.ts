import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { WorkspaceSummary } from "@eden/contracts";

import { journalPath } from "../src/client-session.ts";
import {
  journalByteLimit,
  journalRecordByteLimit,
  journalRecordLimit,
} from "../src/journal/file-journal.ts";
import { RunHistoryError, readRunCatalog, readRunInspection } from "../src/run-catalog.ts";
import { resolveWorkspaceIdentity } from "../src/workspace/index.ts";

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "eden-run-catalog-"));
  const workspaceDirectory = join(base, "workspace");
  await mkdir(workspaceDirectory);
  const identity = await resolveWorkspaceIdentity(workspaceDirectory);
  const workspace = {
    name: identity.name,
    root: identity.canonicalRoot,
    trust: "restricted",
    workspaceId: identity.workspaceId,
  } satisfies WorkspaceSummary;
  return { base, stateDirectory: join(base, "state"), workspace };
}

function startRecord(workspace: WorkspaceSummary, runId: string, task: string) {
  return {
    causationId: `command-${runId}`,
    correlationId: `command-${runId}`,
    eventId: `event-${runId}`,
    journalVersion: 1,
    payload: {
      correlationId: `command-${runId}`,
      runId,
      task,
      workspace: { ...workspace, trust: "trusted" },
    },
    recordedAt: "2026-07-16T08:00:00.000Z",
    redaction: { fields: [], status: "not-required" },
    runId,
    sequence: 0,
    type: "run.started",
  } as const;
}

function sizedRecord(record: ReturnType<typeof startRecord> | Record<string, unknown>) {
  const base = { ...record, redaction: { fields: ["x"], status: "redacted" } };
  const current = Buffer.byteLength(`${JSON.stringify(base)}\n`, "utf8");
  const padding = journalRecordByteLimit - current;
  if (padding < 0) throw new Error("Catalog budget fixture exceeded one journal record.");
  const sized = {
    ...base,
    redaction: { fields: [`x${"p".repeat(padding)}`], status: "redacted" },
  };
  strictEqual(Buffer.byteLength(`${JSON.stringify(sized)}\n`, "utf8"), journalRecordByteLimit);
  return sized;
}

function cancellationRecord(runId: string, sequence: number) {
  return {
    causationId: null,
    correlationId: "c",
    eventId: `e${sequence.toString(36)}`,
    journalVersion: 1,
    payload: {},
    recordedAt: "2026-07-16T08:00:01.000Z",
    redaction: { fields: [], status: "not-required" },
    runId,
    sequence,
    type: "run.cancelled",
  } as const;
}

test("a missing workspace partition returns an empty catalog without creating state", async () => {
  const directories = await fixture();

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  deepStrictEqual(catalog.entries, []);
  deepStrictEqual(catalog.notices, []);
  strictEqual(catalog.truncated, false);
  await rejects(lstat(directories.stateDirectory), { code: "ENOENT" });
});

test("valid and corrupt attributed runs remain independently visible and read-only", async () => {
  const directories = await fixture();
  const availableId = "run-available-1";
  const corruptId = "run-corrupt-1";
  const availableJournal = journalPath(
    directories.stateDirectory,
    directories.workspace.workspaceId,
    availableId,
  );
  const corruptJournal = journalPath(
    directories.stateDirectory,
    directories.workspace.workspaceId,
    corruptId,
  );
  await mkdir(join(availableJournal, ".."), { recursive: true });
  await mkdir(join(corruptJournal, ".."), { recursive: true });
  await writeFile(
    availableJournal,
    `${JSON.stringify(startRecord(directories.workspace, availableId, "Available task"))}\n`,
    "utf8",
  );
  await writeFile(corruptJournal, '{"journalVersion":\n', "utf8");
  const beforeNames = await readdir(
    join(directories.stateDirectory, "runs", "v1", directories.workspace.workspaceId),
  );
  const beforeAvailable = await readFile(availableJournal, "utf8");
  const beforeCorrupt = await readFile(corruptJournal, "utf8");

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });
  const inspection = await readRunInspection({
    runId: availableId,
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  deepStrictEqual(
    catalog.entries.map((entry) => [entry.runId, entry.availability]),
    [
      [availableId, "available"],
      [corruptId, "unavailable"],
    ],
  );
  strictEqual(inspection.mode, "read-only");
  strictEqual(inspection.summary.task, "Available task");
  strictEqual(inspection.view.runId, availableId);
  await rejects(
    readRunInspection({
      runId: corruptId,
      stateDirectory: directories.stateDirectory,
      workspace: directories.workspace,
    }),
    (error) =>
      error instanceof RunHistoryError && error.productError.code === "run_history_unavailable",
  );
  deepStrictEqual(
    await readdir(
      join(directories.stateDirectory, "runs", "v1", directories.workspace.workspaceId),
    ),
    beforeNames,
  );
  strictEqual(await readFile(availableJournal, "utf8"), beforeAvailable);
  strictEqual(await readFile(corruptJournal, "utf8"), beforeCorrupt);
});

test("catalog limits reserve unavailable entries and cap invalid-state notices", async () => {
  const directories = await fixture();
  const partition = join(
    directories.stateDirectory,
    "runs",
    "v1",
    directories.workspace.workspaceId,
  );
  await Promise.all(
    Array.from({ length: 101 }, (_, index) =>
      mkdir(join(partition, `run-bad-${index.toString().padStart(3, "0")}`), {
        recursive: true,
      }),
    ),
  );
  await Promise.all(
    Array.from({ length: 17 }, (_, index) =>
      writeFile(join(partition, `INVALID-${index.toString().padStart(2, "0")}`), "invalid", "utf8"),
    ),
  );
  const validId = "run-valid-1";
  const validJournal = journalPath(
    directories.stateDirectory,
    directories.workspace.workspaceId,
    validId,
  );
  await mkdir(join(validJournal, ".."), { recursive: true });
  await writeFile(
    validJournal,
    `${JSON.stringify(startRecord(directories.workspace, validId, "Valid but over capacity"))}\n`,
    "utf8",
  );

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(catalog.entries.length, 100);
  strictEqual(
    catalog.entries.every((entry) => entry.availability === "unavailable"),
    true,
  );
  strictEqual(catalog.entries[0]?.runId, "run-bad-000");
  strictEqual(catalog.entries.at(-1)?.runId, "run-bad-099");
  strictEqual(catalog.notices.length, 16);
  strictEqual(
    catalog.notices.every((notice) => notice.code === "run_history_state_invalid"),
    true,
  );
  strictEqual(catalog.truncated, true);
});

test("catalog accepts exact entry and notice limits without truncation", async () => {
  const directories = await fixture();
  const partition = join(
    directories.stateDirectory,
    "runs",
    "v1",
    directories.workspace.workspaceId,
  );
  await Promise.all(
    Array.from({ length: 100 }, (_, index) =>
      mkdir(join(partition, `run-exact-${index.toString().padStart(3, "0")}`), {
        recursive: true,
      }),
    ),
  );
  await Promise.all(
    Array.from({ length: 16 }, (_, index) =>
      writeFile(join(partition, `INVALID-EXACT-${index.toString().padStart(2, "0")}`), "invalid"),
    ),
  );

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(catalog.entries.length, 100);
  strictEqual(catalog.notices.length, 16);
  strictEqual(catalog.truncated, false);
});

test("catalog never follows a symlinked run-state ancestor", async () => {
  const directories = await fixture();
  const externalRuns = join(directories.base, "external-runs");
  const runId = "run-external-1";
  const externalJournal = join(
    externalRuns,
    "v1",
    directories.workspace.workspaceId,
    runId,
    "journal.jsonl",
  );
  await mkdir(join(externalJournal, ".."), { recursive: true });
  await writeFile(
    externalJournal,
    `${JSON.stringify(startRecord(directories.workspace, runId, "Must not be followed"))}\n`,
    "utf8",
  );
  await mkdir(directories.stateDirectory);
  await symlink(externalRuns, join(directories.stateDirectory, "runs"), "dir");

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  deepStrictEqual(catalog.entries, []);
  strictEqual(catalog.notices[0]?.code, "run_history_state_invalid");
  await rejects(
    readRunInspection({
      runId,
      stateDirectory: directories.stateDirectory,
      workspace: directories.workspace,
    }),
    (error) => error instanceof RunHistoryError && error.productError.code === "run_not_found",
  );
});

test("catalog stops after 512 visited children with one sanitized budget notice", async () => {
  const directories = await fixture();
  const partition = join(
    directories.stateDirectory,
    "runs",
    "v1",
    directories.workspace.workspaceId,
  );
  await Promise.all(
    Array.from({ length: 513 }, (_, index) =>
      mkdir(join(partition, `run-budget-${index.toString().padStart(3, "0")}`), {
        recursive: true,
      }),
    ),
  );

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(catalog.truncated, true);
  strictEqual(
    catalog.notices.filter((notice) => notice.code === "run_history_budget_exceeded").length,
    1,
  );
});

test("catalog accepts exactly 512 visited children before the visit budget trips", async () => {
  const directories = await fixture();
  const partition = join(
    directories.stateDirectory,
    "runs",
    "v1",
    directories.workspace.workspaceId,
  );
  await Promise.all(
    Array.from({ length: 512 }, (_, index) =>
      mkdir(join(partition, `run-exact-visit-${index.toString().padStart(3, "0")}`), {
        recursive: true,
      }),
    ),
  );

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(
    catalog.notices.some((notice) => notice.code === "run_history_budget_exceeded"),
    false,
  );
  strictEqual(catalog.entries.length, 100);
});

test("oversized and hardlinked journals stay unavailable beside a valid sibling", async () => {
  const directories = await fixture();
  const validId = "run-valid-bounded";
  const oversizedId = "run-oversized";
  const hardlinkedId = "run-hardlinked";
  const validJournal = journalPath(
    directories.stateDirectory,
    directories.workspace.workspaceId,
    validId,
  );
  const oversizedJournal = journalPath(
    directories.stateDirectory,
    directories.workspace.workspaceId,
    oversizedId,
  );
  const hardlinkedJournal = journalPath(
    directories.stateDirectory,
    directories.workspace.workspaceId,
    hardlinkedId,
  );
  await mkdir(join(validJournal, ".."), { recursive: true });
  await mkdir(join(oversizedJournal, ".."), { recursive: true });
  await mkdir(join(hardlinkedJournal, ".."), { recursive: true });
  await writeFile(
    validJournal,
    `${JSON.stringify(startRecord(directories.workspace, validId, "Valid sibling"))}\n`,
    "utf8",
  );
  await writeFile(oversizedJournal, Buffer.alloc(1_048_577, 0x61));
  const hardlinkSource = join(directories.base, "hardlink-source.jsonl");
  await writeFile(
    hardlinkSource,
    `${JSON.stringify(startRecord(directories.workspace, hardlinkedId, "Hardlinked"))}\n`,
    "utf8",
  );
  await link(hardlinkSource, hardlinkedJournal);

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  deepStrictEqual(
    catalog.entries.map((entry) => [entry.runId, entry.availability]),
    [
      [validId, "available"],
      [hardlinkedId, "unavailable"],
      [oversizedId, "unavailable"],
    ],
  );
});

test("a summary with reversed journal chronology cannot collapse valid siblings", async () => {
  const directories = await fixture();
  const validId = "run-valid-summary";
  const invalidId = "run-invalid-summary";
  const validJournal = journalPath(
    directories.stateDirectory,
    directories.workspace.workspaceId,
    validId,
  );
  const invalidJournal = journalPath(
    directories.stateDirectory,
    directories.workspace.workspaceId,
    invalidId,
  );
  await mkdir(join(validJournal, ".."), { recursive: true });
  await mkdir(join(invalidJournal, ".."), { recursive: true });
  await writeFile(
    validJournal,
    `${JSON.stringify(startRecord(directories.workspace, validId, "Valid summary"))}\n`,
    "utf8",
  );
  const invalidStart = startRecord(directories.workspace, invalidId, "Invalid summary");
  const modelIntent = {
    ...invalidStart,
    causationId: invalidStart.eventId,
    eventId: "event-invalid-model-intent",
    payload: {
      effect: {
        effectId: `${invalidId}:fake-model`,
        runId: invalidId,
        task: "Invalid summary",
        type: "fake.model.complete",
      },
    },
    recordedAt: "2026-07-16T07:59:59.000Z",
    sequence: 1,
    type: "effect.requested",
  };
  await writeFile(
    invalidJournal,
    `${JSON.stringify(invalidStart)}\n${JSON.stringify(modelIntent)}\n`,
    "utf8",
  );

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  deepStrictEqual(
    catalog.entries.map((entry) => [entry.runId, entry.availability]),
    [
      [validId, "available"],
      [invalidId, "unavailable"],
    ],
  );
});

test("catalog aborts between filesystem operations with fixed product copy", async () => {
  const directories = await fixture();
  const partition = join(
    directories.stateDirectory,
    "runs",
    "v1",
    directories.workspace.workspaceId,
  );
  await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      mkdir(join(partition, `run-abort-${index.toString().padStart(2, "0")}`), {
        recursive: true,
      }),
    ),
  );
  let checks = 0;
  const signal = {
    get aborted() {
      checks += 1;
      return checks > 12;
    },
  } as AbortSignal;

  await rejects(
    readRunCatalog({
      signal,
      stateDirectory: directories.stateDirectory,
      workspace: directories.workspace,
    }),
    (error) => error instanceof RunHistoryError && error.productError.code === "operation_aborted",
  );
  strictEqual(checks > 12, true);
});

test("catalog stops at the 16 MiB cumulative journal budget", async () => {
  const directories = await fixture();
  const padded = "x".repeat(4_096);
  for (let runIndex = 0; runIndex < 19; runIndex += 1) {
    const runId = `run-cumulative-${runIndex.toString().padStart(2, "0")}`;
    const journal = journalPath(
      directories.stateDirectory,
      directories.workspace.workspaceId,
      runId,
    );
    await mkdir(join(journal, ".."), { recursive: true });
    const records: unknown[] = [startRecord(directories.workspace, runId, "Cumulative budget")];
    for (let sequence = 1; sequence < 25; sequence += 1) {
      records.push({
        causationId: null,
        correlationId: `command-${runId}`,
        eventId: `event-${runId}-${sequence}`,
        journalVersion: 1,
        payload: {
          error: {
            code: "padded_failure",
            message: padded,
            recoverability: "fatal",
            suggestedActions: Array.from({ length: 8 }, () => padded),
          },
        },
        recordedAt: "2026-07-16T08:00:01.000Z",
        redaction: { fields: [], status: "not-required" },
        runId,
        sequence,
        type: "run.blocked",
      });
    }
    await writeFile(journal, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  }

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(catalog.truncated, true);
  strictEqual(catalog.notices[0]?.code, "run_history_budget_exceeded");
  strictEqual(catalog.entries.length < 19, true);
});

test("catalog accepts exactly the cumulative byte budget", async () => {
  const directories = await fixture();
  for (let runIndex = 0; runIndex < 16; runIndex += 1) {
    const runId = `run-exact-bytes-${runIndex.toString().padStart(2, "0")}`;
    const journal = journalPath(
      directories.stateDirectory,
      directories.workspace.workspaceId,
      runId,
    );
    await mkdir(join(journal, ".."), { recursive: true });
    const records = [
      sizedRecord(startRecord(directories.workspace, runId, "Exact byte budget")),
      ...Array.from({ length: 15 }, (_, index) =>
        sizedRecord(cancellationRecord(runId, index + 1)),
      ),
    ];
    const source = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
    strictEqual(Buffer.byteLength(source), journalByteLimit);
    await writeFile(journal, source);
  }

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(
    catalog.notices.some((notice) => notice.code === "run_history_budget_exceeded"),
    false,
  );
  strictEqual(catalog.entries.length, 16);
});

test("corrupt journals still consume the cumulative byte budget", async () => {
  const directories = await fixture();
  for (let runIndex = 0; runIndex < 17; runIndex += 1) {
    const runId = `run-corrupt-budget-${runIndex.toString().padStart(2, "0")}`;
    const journal = journalPath(
      directories.stateDirectory,
      directories.workspace.workspaceId,
      runId,
    );
    await mkdir(join(journal, ".."), { recursive: true });
    await writeFile(journal, Buffer.concat([Buffer.alloc(999_999, 0x61), Buffer.from("\n")]));
  }

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(catalog.truncated, true);
  strictEqual(catalog.notices[0]?.code, "run_history_budget_exceeded");
  strictEqual(catalog.entries.length < 17, true);
});

test("catalog stops after the 16,384-record cumulative budget", async () => {
  const directories = await fixture();
  for (let runIndex = 0; runIndex < 5; runIndex += 1) {
    const runId = `run-record-budget-${runIndex}`;
    const journal = journalPath(
      directories.stateDirectory,
      directories.workspace.workspaceId,
      runId,
    );
    await mkdir(join(journal, ".."), { recursive: true });
    if (runIndex === 4) {
      await writeFile(journal, "", "utf8");
      continue;
    }
    const records: unknown[] = [startRecord(directories.workspace, runId, "Record budget")];
    for (let sequence = 1; sequence < 4_096; sequence += 1) {
      records.push({
        causationId: null,
        correlationId: "c",
        eventId: `e${sequence.toString(36)}`,
        journalVersion: 1,
        payload: {},
        recordedAt: "2026-07-16T08:00:01.000Z",
        redaction: { fields: [], status: "not-required" },
        runId,
        sequence,
        type: "run.cancelled",
      });
    }
    await writeFile(journal, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  }

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(catalog.truncated, true);
  strictEqual(catalog.notices[0]?.code, "run_history_budget_exceeded");
  strictEqual(catalog.entries.length, 4);
});

test("catalog accepts exactly the cumulative record budget", async () => {
  const directories = await fixture();
  for (let runIndex = 0; runIndex < 4; runIndex += 1) {
    const runId = `run-exact-records-${runIndex}`;
    const journal = journalPath(
      directories.stateDirectory,
      directories.workspace.workspaceId,
      runId,
    );
    await mkdir(join(journal, ".."), { recursive: true });
    const records = [
      startRecord(directories.workspace, runId, "Exact record budget"),
      ...Array.from({ length: journalRecordLimit - 1 }, (_, index) =>
        cancellationRecord(runId, index + 1),
      ),
    ];
    await writeFile(journal, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  }

  const catalog = await readRunCatalog({
    stateDirectory: directories.stateDirectory,
    workspace: directories.workspace,
  });

  strictEqual(
    catalog.notices.some((notice) => notice.code === "run_history_budget_exceeded"),
    false,
  );
  strictEqual(catalog.entries.length, 4);
});

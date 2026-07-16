import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { link, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  JournalCorruptionError,
  JournalReadAbortedError,
  journalByteLimit,
  journalRecordByteLimit,
  journalRecordLimit,
  readJournalRecordsBounded,
} from "../src/journal/file-journal.ts";
import { decodeJournalRecord, FileJournal } from "../src/journal/index.ts";
import { modelRequestedRecord, startRecord } from "./records.ts";

function cancellationRecord(sequence: number, sourceBytes?: number) {
  const base = {
    causationId: null,
    correlationId: "c",
    eventId: `e${sequence.toString(36)}`,
    journalVersion: 1,
    payload: {},
    recordedAt: "2026-07-16T00:00:00.000Z",
    redaction: { fields: [], status: "not-required" },
    runId: "run-1",
    sequence,
    type: "run.cancelled",
  } as const;
  if (sourceBytes === undefined) return base;
  const paddedBase = {
    ...base,
    redaction: { fields: ["x"], status: "redacted" as const },
  };
  const current = Buffer.byteLength(`${JSON.stringify(paddedBase)}\n`, "utf8");
  const padding = sourceBytes - current;
  if (padding < 0) throw new Error("Requested journal record size is too small.");
  const record = {
    ...paddedBase,
    redaction: { fields: [`x${"p".repeat(padding)}`], status: "redacted" as const },
  };
  strictEqual(Buffer.byteLength(`${JSON.stringify(record)}\n`, "utf8"), sourceBytes);
  return record;
}

test("file journal round-trips committed JSONL records", async () => {
  // Given: a new run journal in an isolated state directory.
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-"));
  const journal = await FileJournal.open(join(directory, "events.jsonl"), "run-1");

  // When: two contiguous events are appended and the journal is reopened.
  await journal.append(startRecord);
  await journal.append(modelRequestedRecord);
  const reopened = await FileJournal.open(join(directory, "events.jsonl"), "run-1");

  // Then: the complete records round-trip in commit order.
  deepStrictEqual(await reopened.readAll(), [startRecord, modelRequestedRecord]);
});

test("file journal rejects an unterminated trailing record", async () => {
  // Given: a journal whose final JSON object lacks the commit newline.
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-partial-"));
  const filePath = join(directory, "events.jsonl");
  await writeFile(filePath, JSON.stringify(startRecord), "utf8");

  // When: the runtime opens the journal.
  const opening = FileJournal.open(filePath, "run-1");

  // Then: replay blocks without silently repairing the bytes.
  await rejects(opening, JournalCorruptionError);
});

test("file journal rejects a sequence gap before append", async () => {
  // Given: an empty journal expecting sequence zero.
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-gap-"));
  const journal = await FileJournal.open(join(directory, "events.jsonl"), "run-1");
  const gapRecord = { ...modelRequestedRecord, sequence: 1 };

  // When: a caller attempts to append sequence one first.
  const appending = journal.append(gapRecord);

  // Then: the append fails before bytes are committed.
  await rejects(appending, JournalCorruptionError);
});

test("journal v1 rejects future versions and unknown envelope fields", () => {
  // Given: records outside the closed identity migration for journal version one.
  const future = { ...startRecord, journalVersion: 2 };
  const widened = { ...startRecord, rendererFocus: "approval" };

  // When and Then: both fail decoding without a compatibility guess.
  strictEqual(decodeJournalRecord(future).ok, false);
  strictEqual(decodeJournalRecord(widened).ok, false);
});

test("file journal rejects duplicate identities and another run before append", async () => {
  // Given: one committed event in a run-owned journal.
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-identity-"));
  const duplicatePath = join(directory, "duplicate.jsonl");
  const duplicateJournal = await FileJournal.open(duplicatePath, "run-1");
  await duplicateJournal.append(startRecord);
  const duplicate = { ...modelRequestedRecord, eventId: startRecord.eventId };
  const otherRunJournal = await FileJournal.open(join(directory, "other-run.jsonl"), "run-1");
  const otherRun = { ...startRecord, runId: "run-2" };

  // When and Then: neither invalid identity crosses the durable append boundary.
  await rejects(duplicateJournal.append(duplicate), JournalCorruptionError);
  await rejects(otherRunJournal.append(otherRun), JournalCorruptionError);
});

test("append accepts exact journal budgets and rejects every limit plus one", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-append-budgets-"));

  const recordPath = join(directory, "record.jsonl");
  const recordJournal = await FileJournal.open(recordPath, "run-1");
  await recordJournal.append(cancellationRecord(0, journalRecordByteLimit));
  strictEqual((await readFile(recordPath)).byteLength, journalRecordByteLimit);
  const oversizedPath = join(directory, "oversized-record.jsonl");
  const oversizedJournal = await FileJournal.open(oversizedPath, "run-1");
  await rejects(
    oversizedJournal.append(cancellationRecord(0, journalRecordByteLimit + 1)),
    (error) => error instanceof JournalCorruptionError && error.code === "record_too_large",
  );
  strictEqual((await readFile(oversizedPath)).byteLength, 0);

  const filePath = join(directory, "file.jsonl");
  const firstRecords = Array.from({ length: 15 }, (_, sequence) =>
    cancellationRecord(sequence, journalRecordByteLimit),
  );
  await writeFile(filePath, `${firstRecords.map((record) => JSON.stringify(record)).join("\n")}\n`);
  const fileJournal = await FileJournal.open(filePath, "run-1", false);
  await fileJournal.append(cancellationRecord(15, journalRecordByteLimit));
  strictEqual((await readFile(filePath)).byteLength, journalByteLimit);
  await rejects(
    fileJournal.append(cancellationRecord(16)),
    (error) => error instanceof JournalCorruptionError && error.code === "file_too_large",
  );

  const countPath = join(directory, "count.jsonl");
  const countRecords = Array.from({ length: journalRecordLimit - 1 }, (_, sequence) =>
    cancellationRecord(sequence),
  );
  await writeFile(
    countPath,
    `${countRecords.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  const countJournal = await FileJournal.open(countPath, "run-1", false);
  await countJournal.append(cancellationRecord(journalRecordLimit - 1));
  strictEqual((await countJournal.readAll()).length, journalRecordLimit);
  await rejects(
    countJournal.append(cancellationRecord(journalRecordLimit)),
    (error) => error instanceof JournalCorruptionError && error.code === "record_limit",
  );
});

test("bounded replay uses the same newline-inclusive record limit as append", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-record-boundary-"));
  const exactPath = join(directory, "exact.jsonl");
  const oversizedPath = join(directory, "oversized.jsonl");
  await writeFile(
    exactPath,
    `${JSON.stringify(cancellationRecord(0, journalRecordByteLimit))}\n`,
    "utf8",
  );
  await writeFile(
    oversizedPath,
    `${JSON.stringify(cancellationRecord(0, journalRecordByteLimit + 1))}\n`,
    "utf8",
  );

  strictEqual((await readJournalRecordsBounded(exactPath, "run-1")).recordCount, 1);
  await rejects(
    readJournalRecordsBounded(oversizedPath, "run-1"),
    (error) => error instanceof JournalCorruptionError && error.code === "record_too_large",
  );
});

test("bounded journal reads enforce byte, line, record, and hardlink limits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-budgets-"));
  const oversized = join(directory, "oversized.jsonl");
  const longRecord = join(directory, "long-record.jsonl");
  const tooManyRecords = join(directory, "too-many-records.jsonl");
  const hardlinkSource = join(directory, "hardlink-source.jsonl");
  const hardlinked = join(directory, "hardlinked.jsonl");
  await writeFile(oversized, Buffer.alloc(1_048_577, 0x61));
  await writeFile(longRecord, `${"a".repeat(65_537)}\n`, "utf8");
  const records = Array.from({ length: 4_097 }, (_, sequence) =>
    JSON.stringify({
      causationId: null,
      correlationId: "command-run-1",
      eventId: `event-${sequence}`,
      journalVersion: 1,
      payload: {},
      recordedAt: "2026-07-16T00:00:00.000Z",
      redaction: { fields: [], status: "not-required" },
      runId: "run-1",
      sequence,
      type: "run.cancelled",
    }),
  );
  await writeFile(tooManyRecords, `${records.join("\n")}\n`, "utf8");
  await writeFile(hardlinkSource, `${JSON.stringify(startRecord)}\n`, "utf8");
  await link(hardlinkSource, hardlinked);

  for (const [path, code] of [
    [oversized, "file_too_large"],
    [longRecord, "record_too_large"],
    [tooManyRecords, "record_limit"],
    [hardlinked, "invalid_record"],
  ] as const) {
    await rejects(
      readJournalRecordsBounded(path, "run-1"),
      (error) => error instanceof JournalCorruptionError && error.code === code,
    );
  }
});

test("bounded journal reads reject a leaf replaced after the handle opens", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-replaced-"));
  const filePath = join(directory, "events.jsonl");
  const parkedPath = join(directory, "parked.jsonl");
  await writeFile(filePath, `${JSON.stringify(startRecord)}\n`, "utf8");

  await rejects(
    readJournalRecordsBounded(filePath, "run-1", {
      onCheckpoint: async (stage) => {
        if (stage !== "opened") return;
        await rename(filePath, parkedPath);
        await writeFile(filePath, `${JSON.stringify(startRecord)}\n`, "utf8");
      },
    }),
    (error) => error instanceof JournalCorruptionError && error.code === "identity_changed",
  );
});

test("bounded journal reads observe cancellation between decoded records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-record-abort-"));
  const filePath = join(directory, "events.jsonl");
  const records = Array.from({ length: 128 }, (_, sequence) => ({
    causationId: null,
    correlationId: "command-run-1",
    eventId: `event-${sequence}`,
    journalVersion: 1,
    payload: {},
    recordedAt: "2026-07-16T00:00:00.000Z",
    redaction: { fields: [], status: "not-required" },
    runId: "run-1",
    sequence,
    type: "run.cancelled",
  }));
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`);
  let checks = 0;
  const signal = {
    get aborted() {
      checks += 1;
      return checks > 20;
    },
  } as AbortSignal;

  await rejects(readJournalRecordsBounded(filePath, "run-1", { signal }), JournalReadAbortedError);
  strictEqual(checks > 20, true);
});

test("bounded journal reads reject malformed UTF-8 before schema decoding", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-utf8-"));
  const filePath = join(directory, "events.jsonl");
  const bytes = Buffer.from(`${JSON.stringify(startRecord)}\n`, "utf8");
  const task = Buffer.from("Index the fake workspace", "utf8");
  const taskOffset = bytes.indexOf(task);
  if (taskOffset < 0) throw new Error("Expected the task marker in the journal fixture.");
  bytes[taskOffset] = 0xff;
  await writeFile(filePath, bytes);

  await rejects(
    readJournalRecordsBounded(filePath, "run-1"),
    (error) => error instanceof JournalCorruptionError && error.code === "invalid_record",
  );
});

test("an opened journal rejects pathname replacement before append", async () => {
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-append-replaced-"));
  const filePath = join(directory, "events.jsonl");
  const parkedPath = join(directory, "parked.jsonl");
  const journal = await FileJournal.open(filePath, "run-1");
  await rename(filePath, parkedPath);
  await writeFile(filePath, "", "utf8");

  await rejects(
    journal.append(startRecord),
    (error) => error instanceof JournalCorruptionError && error.code === "identity_changed",
  );
  strictEqual(await readFile(filePath, "utf8"), "");
  strictEqual(await readFile(parkedPath, "utf8"), "");
});

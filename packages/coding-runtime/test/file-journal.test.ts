import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { decodeJournalRecord, FileJournal, JournalCorruptionError } from "../src/journal/index.ts";
import { approvalRecord, startRecord } from "./records.ts";

test("file journal round-trips committed JSONL records", async () => {
  // Given: a new run journal in an isolated state directory.
  const directory = await mkdtemp(join(tmpdir(), "eden-journal-"));
  const journal = await FileJournal.open(join(directory, "events.jsonl"), "run-1");

  // When: two contiguous events are appended and the journal is reopened.
  await journal.append(startRecord);
  await journal.append(approvalRecord);
  const reopened = await FileJournal.open(join(directory, "events.jsonl"), "run-1");

  // Then: the complete records round-trip in commit order.
  deepStrictEqual(await reopened.readAll(), [startRecord, approvalRecord]);
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
  const gapRecord = { ...approvalRecord, sequence: 1 };

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
  const duplicate = { ...approvalRecord, eventId: startRecord.eventId };
  const otherRunJournal = await FileJournal.open(join(directory, "other-run.jsonl"), "run-1");
  const otherRun = { ...startRecord, runId: "run-2" };

  // When and Then: neither invalid identity crosses the durable append boundary.
  await rejects(duplicateJournal.append(duplicate), JournalCorruptionError);
  await rejects(otherRunJournal.append(otherRun), JournalCorruptionError);
});

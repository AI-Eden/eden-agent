import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { decodeJournalRecord, type JournalRecordV1 } from "./schema.ts";

export class JournalCorruptionError extends Error {
  readonly name = "JournalCorruptionError";
  readonly code:
    | "invalid_record"
    | "sequence_gap"
    | "duplicate_event_id"
    | "run_id_mismatch"
    | "unterminated_record";

  constructor(
    code:
      | "invalid_record"
      | "sequence_gap"
      | "duplicate_event_id"
      | "run_id_mismatch"
      | "unterminated_record",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new JournalCorruptionError("invalid_record", "Journal contains invalid JSON.");
    }
    throw error;
  }
}

function validateSequence(records: readonly JournalRecordV1[], runId: string): void {
  const eventIds = new Set<string>();
  for (const [sequence, record] of records.entries()) {
    if (record.sequence !== sequence) {
      throw new JournalCorruptionError("sequence_gap", "Journal sequence is not contiguous.");
    }
    if (record.runId !== runId) {
      throw new JournalCorruptionError("run_id_mismatch", "Journal record has another run ID.");
    }
    if (eventIds.has(record.eventId)) {
      throw new JournalCorruptionError("duplicate_event_id", "Journal event ID is duplicated.");
    }
    eventIds.add(record.eventId);
  }
}

async function loadRecords(filePath: string, runId: string): Promise<readonly JournalRecordV1[]> {
  const content = await readFile(filePath, "utf8");
  if (content.length === 0) {
    return [];
  }
  if (!content.endsWith("\n")) {
    throw new JournalCorruptionError(
      "unterminated_record",
      "Journal ends with an unterminated record.",
    );
  }
  const records = content
    .slice(0, -1)
    .split("\n")
    .map((line) => {
      const decoded = decodeJournalRecord(parseLine(line));
      if (!decoded.ok) {
        throw new JournalCorruptionError("invalid_record", "Journal record failed validation.");
      }
      return decoded.value.record;
    });
  validateSequence(records, runId);
  return records;
}

export class FileJournal {
  private readonly filePath: string;
  private readonly runId: string;
  private readonly records: JournalRecordV1[];

  private constructor(filePath: string, runId: string, records: JournalRecordV1[]) {
    this.filePath = filePath;
    this.runId = runId;
    this.records = records;
  }

  static async open(filePath: string, runId: string): Promise<FileJournal> {
    await mkdir(dirname(filePath), { recursive: true });
    const handle = await open(filePath, "a");
    await handle.close();
    const records = await loadRecords(filePath, runId);
    return new FileJournal(filePath, runId, [...records]);
  }

  async append(record: JournalRecordV1): Promise<void> {
    const decoded = decodeJournalRecord(record);
    if (!decoded.ok) {
      throw new JournalCorruptionError("invalid_record", "Journal record failed validation.");
    }
    validateSequence([...this.records, decoded.value.record], this.runId);
    const handle = await open(this.filePath, "a");
    try {
      await handle.writeFile(`${JSON.stringify(decoded.value.record)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    this.records.push(decoded.value.record);
  }

  async readAll(): Promise<readonly JournalRecordV1[]> {
    return [...this.records];
  }
}

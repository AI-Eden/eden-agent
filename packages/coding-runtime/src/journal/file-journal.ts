import { lstat, open } from "node:fs/promises";

import { decodeJournalRecord, type JournalRecordV1 } from "./schema.ts";

export const journalByteLimit = 1_048_576;
export const journalRecordByteLimit = 65_536;
export const journalRecordLimit = 4_096;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

export type JournalReadOptions = {
  readonly maxBytes?: number;
  readonly maxRecords?: number;
  readonly onCheckpoint?: (stage: "opened" | "before-final-path") => Promise<void>;
  readonly signal?: AbortSignal;
};

export type JournalReadResult = {
  readonly bytesRead: number;
  readonly recordCount: number;
  readonly records: readonly JournalRecordV1[];
};

export class JournalCorruptionError extends Error {
  readonly name = "JournalCorruptionError";
  readonly code:
    | "invalid_record"
    | "sequence_gap"
    | "duplicate_event_id"
    | "file_too_large"
    | "identity_changed"
    | "record_limit"
    | "record_too_large"
    | "run_id_mismatch"
    | "unterminated_record";
  readonly bytesRead: number;
  readonly recordsRead: number;

  constructor(
    code:
      | "invalid_record"
      | "sequence_gap"
      | "duplicate_event_id"
      | "file_too_large"
      | "identity_changed"
      | "record_limit"
      | "record_too_large"
      | "run_id_mismatch"
      | "unterminated_record",
    message: string,
    bytesRead = 0,
    recordsRead = 0,
  ) {
    super(message);
    this.code = code;
    this.bytesRead = bytesRead;
    this.recordsRead = recordsRead;
  }
}

export class JournalBudgetExceededError extends Error {
  readonly name = "JournalBudgetExceededError";
  readonly bytesRead: number;
  readonly recordsRead: number;

  constructor(bytesRead: number, recordsRead: number) {
    super("The run-history ingestion budget was exceeded.");
    this.bytesRead = bytesRead;
    this.recordsRead = recordsRead;
  }
}

export class JournalReadAbortedError extends Error {
  readonly name = "JournalReadAbortedError";
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new JournalReadAbortedError("Journal read was aborted.");
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

function validateSequence(
  records: readonly JournalRecordV1[],
  runId: string,
  signal?: AbortSignal,
): void {
  const eventIds = new Set<string>();
  for (const [sequence, record] of records.entries()) {
    checkAborted(signal);
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

function loadRecords(
  content: Buffer,
  runId: string,
  maxRecords: number,
  signal?: AbortSignal,
): readonly JournalRecordV1[] {
  if (content.length === 0) return [];
  if (content.at(-1) !== 0x0a) {
    throw new JournalCorruptionError(
      "unterminated_record",
      "Journal ends with an unterminated record.",
      content.length,
    );
  }
  const records: JournalRecordV1[] = [];
  let start = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== 0x0a) continue;
    checkAborted(signal);
    const recordBytes = index - start + 1;
    const nextCount = records.length + 1;
    if (recordBytes > journalRecordByteLimit) {
      throw new JournalCorruptionError(
        "record_too_large",
        "Journal record exceeds the byte limit.",
        content.length,
        nextCount,
      );
    }
    if (nextCount > journalRecordLimit) {
      throw new JournalCorruptionError(
        "record_limit",
        "Journal exceeds the record limit.",
        content.length,
        nextCount,
      );
    }
    if (nextCount > maxRecords) {
      throw new JournalBudgetExceededError(content.length, nextCount);
    }
    let parsed: unknown;
    try {
      parsed = parseLine(fatalUtf8Decoder.decode(content.subarray(start, index)));
    } catch (error) {
      if (error instanceof JournalCorruptionError) {
        throw new JournalCorruptionError(error.code, error.message, content.length, nextCount);
      }
      if (error instanceof TypeError) {
        throw new JournalCorruptionError(
          "invalid_record",
          "Journal record is not valid UTF-8.",
          content.length,
          nextCount,
        );
      }
      throw error;
    }
    const decoded = decodeJournalRecord(parsed);
    if (!decoded.ok) {
      throw new JournalCorruptionError(
        "invalid_record",
        "Journal record failed validation.",
        content.length,
        nextCount,
      );
    }
    records.push(decoded.value.record);
    start = index + 1;
  }
  try {
    validateSequence(records, runId, signal);
  } catch (error) {
    if (error instanceof JournalCorruptionError) {
      throw new JournalCorruptionError(error.code, error.message, content.length, records.length);
    }
    throw error;
  }
  return records;
}

function sameIdentity(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return (
    right.isFile() &&
    !right.isSymbolicLink() &&
    right.nlink === 1 &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size
  );
}

export async function readJournalRecordsBounded(
  filePath: string,
  runId: string,
  options: JournalReadOptions = {},
): Promise<JournalReadResult> {
  checkAborted(options.signal);
  const before = await lstat(filePath);
  checkAborted(options.signal);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw new JournalCorruptionError("invalid_record", "Journal is not a regular file.");
  }
  if (before.size > journalByteLimit) {
    throw new JournalCorruptionError("file_too_large", "Journal exceeds the byte limit.");
  }
  if (before.size > (options.maxBytes ?? journalByteLimit)) {
    throw new JournalBudgetExceededError(0, 0);
  }
  checkAborted(options.signal);
  const handle = await open(filePath, "r");
  try {
    checkAborted(options.signal);
    const opened = await handle.stat();
    checkAborted(options.signal);
    if (!sameIdentity(before, opened)) {
      throw new JournalCorruptionError(
        "identity_changed",
        "Journal identity changed while opening.",
      );
    }
    await options.onCheckpoint?.("opened");
    checkAborted(options.signal);
    const content = Buffer.alloc(opened.size);
    let offset = 0;
    while (offset < content.length) {
      checkAborted(options.signal);
      const { bytesRead } = await handle.read(
        content,
        offset,
        Math.min(65_536, content.length - offset),
        offset,
      );
      checkAborted(options.signal);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== content.length) {
      throw new JournalCorruptionError(
        "identity_changed",
        "Journal size changed while reading.",
        offset,
      );
    }
    const afterHandle = await handle.stat();
    checkAborted(options.signal);
    if (!sameIdentity(before, afterHandle)) {
      throw new JournalCorruptionError(
        "identity_changed",
        "Journal identity changed while reading.",
        offset,
      );
    }
    const records = loadRecords(
      content,
      runId,
      options.maxRecords ?? journalRecordLimit,
      options.signal,
    );
    checkAborted(options.signal);
    await options.onCheckpoint?.("before-final-path");
    checkAborted(options.signal);
    const afterPath = await lstat(filePath);
    checkAborted(options.signal);
    if (!sameIdentity(before, afterPath)) {
      throw new JournalCorruptionError(
        "identity_changed",
        "Journal identity changed after reading.",
        offset,
        records.length,
      );
    }
    return { bytesRead: offset, recordCount: records.length, records };
  } finally {
    await handle.close();
  }
}

export async function readJournalRecords(
  filePath: string,
  runId: string,
): Promise<readonly JournalRecordV1[]> {
  return (await readJournalRecordsBounded(filePath, runId)).records;
}

export class FileJournal {
  private readonly filePath: string;
  private readonly runId: string;
  private readonly records: JournalRecordV1[];
  private identity: Awaited<ReturnType<typeof lstat>>;

  private constructor(
    filePath: string,
    runId: string,
    records: JournalRecordV1[],
    identity: Awaited<ReturnType<typeof lstat>>,
  ) {
    this.filePath = filePath;
    this.runId = runId;
    this.records = records;
    this.identity = identity;
  }

  static async open(filePath: string, runId: string, create?: boolean): Promise<FileJournal> {
    let records: readonly JournalRecordV1[];
    if (create === true) {
      const handle = await open(filePath, "wx", 0o600);
      await handle.close();
      records = [];
    } else if (create === false) {
      records = await readJournalRecords(filePath, runId);
    } else {
      try {
        records = await readJournalRecords(filePath, runId);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        const handle = await open(filePath, "wx", 0o600);
        await handle.close();
        records = [];
      }
    }
    const identity = await lstat(filePath);
    if (!identity.isFile() || identity.isSymbolicLink() || identity.nlink !== 1) {
      throw new JournalCorruptionError("invalid_record", "Journal is not a regular file.");
    }
    return new FileJournal(filePath, runId, [...records], identity);
  }

  async append(record: JournalRecordV1): Promise<void> {
    const decoded = decodeJournalRecord(record);
    if (!decoded.ok) {
      throw new JournalCorruptionError("invalid_record", "Journal record failed validation.");
    }
    const source = `${JSON.stringify(decoded.value.record)}\n`;
    const sourceBytes = Buffer.byteLength(source, "utf8");
    if (sourceBytes > journalRecordByteLimit) {
      throw new JournalCorruptionError(
        "record_too_large",
        "Journal record exceeds the byte limit.",
      );
    }
    if (this.records.length >= journalRecordLimit) {
      throw new JournalCorruptionError("record_limit", "Journal record count exceeds the limit.");
    }
    if (Number(this.identity.size) + sourceBytes > journalByteLimit) {
      throw new JournalCorruptionError("file_too_large", "Journal exceeds the byte limit.");
    }
    validateSequence([...this.records, decoded.value.record], this.runId);
    const before = await lstat(this.filePath);
    if (!sameIdentity(this.identity, before)) {
      throw new JournalCorruptionError(
        "identity_changed",
        "Journal identity changed before append.",
      );
    }
    const handle = await open(this.filePath, "a");
    try {
      const opened = await handle.stat();
      if (!sameIdentity(this.identity, opened)) {
        throw new JournalCorruptionError(
          "identity_changed",
          "Journal identity changed while opening.",
        );
      }
      await handle.writeFile(source, "utf8");
      await handle.sync();
      const afterHandle = await handle.stat();
      const afterPath = await lstat(this.filePath);
      if (
        !sameIdentity(afterHandle, afterPath) ||
        afterHandle.dev !== this.identity.dev ||
        afterHandle.ino !== this.identity.ino ||
        afterHandle.size !== Number(this.identity.size) + sourceBytes
      ) {
        throw new JournalCorruptionError(
          "identity_changed",
          "Journal identity changed after append.",
        );
      }
      this.identity = afterHandle;
    } finally {
      await handle.close();
    }
    this.records.push(decoded.value.record);
  }

  async readAll(): Promise<readonly JournalRecordV1[]> {
    return [...this.records];
  }
}

export {
  encodeJournalRecord,
  FileJournal,
  JournalCorruptionError,
  readJournalRecords,
} from "./file-journal.ts";
export type {
  DecodedJournalRecord,
  JournalDecodeResult,
  JournalRecordV1,
} from "./schema.ts";
export {
  decodeJournalRecord,
  JournalRecordV1Schema,
  journalVersion,
} from "./schema.ts";

import type { JournalRecordV1 } from "./schema.ts";

export interface JournalPort {
  append(record: JournalRecordV1): Promise<void>;
  readAll(): Promise<readonly JournalRecordV1[]>;
}

export interface JournalPort {
  append(event: unknown): Promise<void>;
  readAll(): AsyncIterable<unknown>;
}


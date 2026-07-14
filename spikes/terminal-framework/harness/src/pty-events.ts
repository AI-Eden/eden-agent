import type { IPty } from "node-pty";
import type { CandidateId } from "./pty.ts";

export const processHarnessEventTimeoutMs = 10_000;

export class ProcessHarnessTimeoutError extends Error {
  readonly candidateId: CandidateId;
  readonly expectedEvent: string;

  constructor(candidateId: CandidateId, expectedEvent: string) {
    super(`Timed out waiting for ${expectedEvent} from ${candidateId}.`);
    this.name = "ProcessHarnessTimeoutError";
    this.candidateId = candidateId;
    this.expectedEvent = expectedEvent;
  }
}

type WaitForTextOptions = {
  readonly candidateId: CandidateId;
  readonly expectedText: string;
  readonly readTranscript: () => string;
  readonly terminal: IPty;
};

export function waitForText(options: WaitForTextOptions): Promise<void> {
  if (options.readTranscript().includes(options.expectedText)) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new ProcessHarnessTimeoutError(options.candidateId, options.expectedText));
    }, processHarnessEventTimeoutMs);
    const subscription = options.terminal.onData(() => {
      if (options.readTranscript().includes(options.expectedText)) {
        clearTimeout(timer);
        subscription.dispose();
        resolve();
      }
    });
  });
}

export function waitForNextData(candidateId: CandidateId, terminal: IPty): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new ProcessHarnessTimeoutError(candidateId, "the next rendered frame"));
    }, processHarnessEventTimeoutMs);
    const subscription = terminal.onData(() => {
      clearTimeout(timer);
      subscription.dispose();
      resolve();
    });
  });
}

export function waitForExit(candidateId: CandidateId, terminal: IPty): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new ProcessHarnessTimeoutError(candidateId, "process exit"));
    }, processHarnessEventTimeoutMs);
    const subscription = terminal.onExit(({ exitCode }) => {
      clearTimeout(timer);
      subscription.dispose();
      resolve(exitCode);
    });
  });
}

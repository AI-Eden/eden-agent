import { stat } from "node:fs/promises";
import { join } from "node:path";

import type { ProductCommand, ProductError, ProductView, RunId } from "@eden/contracts";
import type { Action } from "@eden/kernel";

import { FakeToolHost } from "./fake-tool-host.ts";
import { FileJournal } from "./journal/index.ts";
import { type RuntimeClock, RuntimeEngine, type RuntimeIdSource } from "./runtime.ts";

export type RunSession = {
  readonly engine: RuntimeEngine;
  readonly journal: FileJournal;
  readonly runId: RunId;
};

export class AgentClientError extends Error {
  readonly name = "AgentClientError";
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

export function clientError(
  code: string,
  message: string,
  recoverability: ProductError["recoverability"] = "fatal",
  suggestedAction = message,
): AgentClientError {
  return new AgentClientError({
    code,
    message,
    recoverability,
    suggestedActions: [suggestedAction],
  });
}

export function assertCurrentRevision(
  command: Exclude<ProductCommand, { readonly type: "run.start" }>,
  view: ProductView,
): void {
  if (command.runId !== view.runId) {
    throw clientError("run_not_found", `Run ${command.runId} is not owned by this client.`);
  }
  if (command.expectedRevision !== view.revision) {
    throw clientError("stale_revision", "The command revision is stale.", "retry");
  }
}

export function fakeAction(runId: string, cwd: string): Action {
  return {
    actionId: `${runId}:fake-action`,
    approvalId: `${runId}:fake-approval`,
    canonicalDisplay: "Run the deterministic fake task",
    cwd,
    digest: `${runId}:fake-action-digest`,
    reason: "Exercise the R1 fake-task boundary without changing workspace files.",
    scope: "R1 demo state directory only",
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export async function journalExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

export function journalPath(stateDirectory: string, runId: RunId): string {
  return join(stateDirectory, "runs", runId, "journal.jsonl");
}

export async function openRunSession(
  runId: RunId,
  stateDirectory: string,
  clock: RuntimeClock,
  idSource: RuntimeIdSource,
): Promise<RunSession> {
  const runDirectory = join(stateDirectory, "runs", runId);
  const journal = await FileJournal.open(journalPath(stateDirectory, runId), runId);
  const engine = await RuntimeEngine.open(
    journal,
    new FakeToolHost(join(runDirectory, "receipts")),
    clock,
    idSource,
  );
  return { engine, journal, runId };
}

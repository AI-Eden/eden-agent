import { lstat, opendir } from "node:fs/promises";
import { join } from "node:path";

import {
  type AvailableRunSummary,
  AvailableRunSummarySchema,
  decodeRunCatalog,
  decodeRunInspection,
  type ProductError,
  type RunCatalog,
  type RunId,
  RunIdSchema,
  type RunInspection,
  type UnavailableRunSummary,
  type WorkspaceSummary,
} from "@eden/contracts";
import Schema from "typebox/schema";

import { journalPath, runDirectoryPath } from "./client-session.ts";
import {
  JournalBudgetExceededError,
  JournalCorruptionError,
  JournalReadAbortedError,
  readJournalRecordsBounded,
} from "./journal/file-journal.ts";
import { decodeJournalRecord } from "./journal/schema.ts";
import { ProjectionError, projectJournal } from "./projection.ts";

const entryLimit = 100;
const noticeLimit = 16;
const childVisitLimit = 512;
const catalogByteLimit = 16 * 1_048_576;
const catalogRecordLimit = 16_384;
const runIdValidator = Schema.Compile(RunIdSchema);
const summaryValidator = Schema.Compile(AvailableRunSummarySchema);

export type RunHistoryOptions = {
  readonly runId: RunId;
  readonly signal?: AbortSignal;
  readonly stateDirectory: string;
  readonly workspace: WorkspaceSummary;
};

export type RunCatalogOptions = Omit<RunHistoryOptions, "runId">;

export class RunHistoryError extends Error {
  readonly name = "RunHistoryError";
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

function historyError(
  code: "operation_aborted" | "run_history_unavailable" | "run_not_found",
): ProductError {
  if (code === "operation_aborted") {
    return {
      code,
      message: "The run-history operation was aborted.",
      recoverability: "retry",
      suggestedActions: ["Retry the run-history operation when ready."],
    };
  }
  if (code === "run_not_found") {
    return {
      code,
      message: "The run was not found in this exact workspace.",
      recoverability: "reconfigure",
      suggestedActions: ["List this workspace's available run history and choose a run ID."],
    };
  }
  return {
    code,
    message: "The attributed run history is unavailable.",
    recoverability: "reconfigure",
    suggestedActions: ["Inspect or remove the damaged isolated state manually."],
  };
}

function invalidStateNotice(): ProductError {
  return {
    code: "run_history_state_invalid",
    message: "An invalid run-history state entry was ignored.",
    recoverability: "reconfigure",
    suggestedActions: ["Inspect the isolated Eden state directory manually."],
  };
}

function budgetNotice(): ProductError {
  return {
    code: "run_history_budget_exceeded",
    message: "The bounded R1 run-history scan stopped before visiting all local state.",
    recoverability: "reconfigure",
    suggestedActions: ["Reduce the isolated run-history state before retrying."],
  };
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new RunHistoryError(historyError("operation_aborted"));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function asciiOrder(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

type LoadedRun = {
  readonly bytesRead: number;
  readonly recordCount: number;
  readonly summary: AvailableRunSummary;
  readonly view: RunInspection["view"];
};

type RunLoadResult =
  | { readonly kind: "available"; readonly value: LoadedRun }
  | { readonly bytesRead: number; readonly kind: "unavailable"; readonly recordCount: number };

function unavailable(runId: RunId): UnavailableRunSummary {
  return { availability: "unavailable", error: historyError("run_history_unavailable"), runId };
}

async function loadRun(
  options: RunHistoryOptions,
  remainingBytes = catalogByteLimit,
  remainingRecords = catalogRecordLimit,
): Promise<RunLoadResult> {
  let observedBytes = 0;
  let observedRecords = 0;
  try {
    const snapshot = await readJournalRecordsBounded(
      journalPath(options.stateDirectory, options.workspace.workspaceId, options.runId),
      options.runId,
      {
        maxBytes: remainingBytes,
        maxRecords: remainingRecords,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    observedBytes = snapshot.bytesRead;
    observedRecords = snapshot.recordCount;
    const first = snapshot.records[0];
    const last = snapshot.records.at(-1);
    if (first === undefined || last === undefined) {
      return {
        bytesRead: snapshot.bytesRead,
        kind: "unavailable",
        recordCount: snapshot.recordCount,
      };
    }
    const decoded = decodeJournalRecord(first);
    if (!decoded.ok || decoded.value.event.type !== "run.started") {
      return {
        bytesRead: snapshot.bytesRead,
        kind: "unavailable",
        recordCount: snapshot.recordCount,
      };
    }
    const started = decoded.value.event;
    if (
      started.workspace.workspaceId !== options.workspace.workspaceId ||
      started.workspace.root !== options.workspace.root
    ) {
      return {
        bytesRead: snapshot.bytesRead,
        kind: "unavailable",
        recordCount: snapshot.recordCount,
      };
    }
    const projected = projectJournal(snapshot.records);
    if (
      projected.view.runId !== options.runId ||
      projected.view.workspace.workspaceId !== options.workspace.workspaceId ||
      projected.view.workspace.root !== options.workspace.root
    ) {
      return {
        bytesRead: snapshot.bytesRead,
        kind: "unavailable",
        recordCount: snapshot.recordCount,
      };
    }
    const summary = {
      availability: "available",
      phase: projected.view.phase,
      revision: projected.view.revision,
      runId: options.runId,
      startedAt: first.recordedAt,
      task: started.task,
      terminalOutcome: projected.view.terminalOutcome,
      updatedAt: last.recordedAt,
    } satisfies AvailableRunSummary;
    if (!summaryValidator.Check(summary)) {
      return {
        bytesRead: snapshot.bytesRead,
        kind: "unavailable",
        recordCount: snapshot.recordCount,
      };
    }
    return {
      kind: "available",
      value: {
        bytesRead: snapshot.bytesRead,
        recordCount: snapshot.recordCount,
        summary,
        view: projected.view,
      },
    };
  } catch (error) {
    if (error instanceof JournalBudgetExceededError) throw error;
    if (error instanceof JournalReadAbortedError) {
      throw new RunHistoryError(historyError("operation_aborted"));
    }
    if (error instanceof JournalCorruptionError) {
      return {
        bytesRead: error.bytesRead,
        kind: "unavailable",
        recordCount: error.recordsRead,
      };
    }
    if (error instanceof ProjectionError || isNodeError(error)) {
      return {
        bytesRead: observedBytes,
        kind: "unavailable",
        recordCount: observedRecords,
      };
    }
    throw new RunHistoryError(historyError("run_history_unavailable"));
  }
}

async function isRegularRunDirectory(path: string, signal?: AbortSignal): Promise<boolean> {
  checkAborted(signal);
  const metadata = await lstat(path);
  checkAborted(signal);
  return metadata.isDirectory() && !metadata.isSymbolicLink();
}

type PartitionState =
  | { readonly kind: "invalid" | "missing" }
  | { readonly kind: "ready"; readonly path: string };

async function inspectPartition(options: RunCatalogOptions): Promise<PartitionState> {
  const runs = join(options.stateDirectory, "runs");
  const version = join(runs, "v1");
  const partition = join(version, options.workspace.workspaceId);
  for (const path of [runs, version, partition]) {
    try {
      if (!(await isRegularRunDirectory(path, options.signal))) return { kind: "invalid" };
    } catch (error) {
      if (error instanceof RunHistoryError) throw error;
      if (isNodeError(error) && error.code === "ENOENT") return { kind: "missing" };
      if (isNodeError(error)) return { kind: "invalid" };
      throw new RunHistoryError(historyError("run_history_unavailable"));
    }
  }
  return { kind: "ready", path: partition };
}

function emptyCatalog(options: RunCatalogOptions, invalid: boolean): RunCatalog {
  return {
    entries: [],
    notices: invalid ? [invalidStateNotice()] : [],
    protocolVersion: 1,
    truncated: false,
    workspace: options.workspace,
  };
}

function availableOrder(left: LoadedRun, right: LoadedRun): number {
  const time = Date.parse(right.summary.updatedAt) - Date.parse(left.summary.updatedAt);
  return time === 0 ? asciiOrder(left.summary.runId, right.summary.runId) : time;
}

export async function readRunCatalog(options: RunCatalogOptions): Promise<RunCatalog> {
  checkAborted(options.signal);
  const partition = await inspectPartition(options);
  if (partition.kind !== "ready") return emptyCatalog(options, partition.kind === "invalid");
  const names: string[] = [];
  let visitBudgetReached = false;
  try {
    checkAborted(options.signal);
    const directory = await opendir(partition.path);
    const iteration = await (async () => {
      checkAborted(options.signal);
      for await (const entry of directory) {
        checkAborted(options.signal);
        if (names.length >= childVisitLimit) {
          visitBudgetReached = true;
          break;
        }
        names.push(entry.name);
      }
    })().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ error, ok: false as const }),
    );
    let closeError: unknown;
    try {
      await directory.close();
    } catch (error) {
      if (!(isNodeError(error) && error.code === "ERR_DIR_CLOSED")) closeError = error;
    }
    if (!iteration.ok) throw iteration.error;
    if (closeError !== undefined) throw closeError;
  } catch (error) {
    if (error instanceof RunHistoryError) throw error;
    if (isNodeError(error) && error.code === "ENOENT") return emptyCatalog(options, false);
    if (isNodeError(error)) return emptyCatalog(options, true);
    throw new RunHistoryError(historyError("run_history_unavailable"));
  }
  names.sort(asciiOrder);
  const available: LoadedRun[] = [];
  const unavailableEntries: UnavailableRunSummary[] = [];
  let invalidCount = 0;
  let bytesRead = 0;
  let recordsRead = 0;
  let cumulativeBudgetReached = false;
  for (const name of names) {
    checkAborted(options.signal);
    if (bytesRead >= catalogByteLimit || recordsRead >= catalogRecordLimit) {
      cumulativeBudgetReached = true;
      break;
    }
    if (!runIdValidator.Check(name)) {
      invalidCount += 1;
      continue;
    }
    const runId = name;
    try {
      if (
        !(await isRegularRunDirectory(
          runDirectoryPath(options.stateDirectory, options.workspace.workspaceId, runId),
          options.signal,
        ))
      ) {
        invalidCount += 1;
        continue;
      }
    } catch (error) {
      if (error instanceof RunHistoryError) throw error;
      if (isNodeError(error)) {
        invalidCount += 1;
        continue;
      }
      throw new RunHistoryError(historyError("run_history_unavailable"));
    }
    try {
      const loaded = await loadRun(
        { ...options, runId },
        catalogByteLimit - bytesRead,
        catalogRecordLimit - recordsRead,
      );
      if (loaded.kind === "available") {
        bytesRead += loaded.value.bytesRead;
        recordsRead += loaded.value.recordCount;
        available.push(loaded.value);
      } else {
        bytesRead += loaded.bytesRead;
        recordsRead += loaded.recordCount;
        unavailableEntries.push(unavailable(runId));
      }
    } catch (error) {
      if (error instanceof JournalBudgetExceededError) {
        cumulativeBudgetReached = true;
        break;
      }
      throw error;
    }
  }
  available.sort(availableOrder);
  unavailableEntries.sort((left, right) => asciiOrder(left.runId, right.runId));
  const selectedUnavailable = unavailableEntries.slice(0, entryLimit);
  const selectedAvailable = available.slice(0, entryLimit - selectedUnavailable.length);
  const budgetExceeded = visitBudgetReached || cumulativeBudgetReached;
  const notices = budgetExceeded ? [budgetNotice()] : [];
  notices.push(
    ...Array.from(
      { length: Math.min(invalidCount, noticeLimit - notices.length) },
      invalidStateNotice,
    ),
  );
  const catalog = {
    entries: [...selectedAvailable.map((entry) => entry.summary), ...selectedUnavailable],
    notices,
    protocolVersion: 1,
    truncated:
      budgetExceeded ||
      available.length + unavailableEntries.length > entryLimit ||
      invalidCount > noticeLimit,
    workspace: options.workspace,
  } satisfies RunCatalog;
  const decoded = decodeRunCatalog(catalog);
  if (!decoded.ok) throw new RunHistoryError(historyError("run_history_unavailable"));
  return decoded.value;
}

export async function readRunInspection(options: RunHistoryOptions): Promise<RunInspection> {
  checkAborted(options.signal);
  if (!runIdValidator.Check(options.runId)) {
    throw new RunHistoryError(historyError("run_not_found"));
  }
  const partition = await inspectPartition(options);
  if (partition.kind !== "ready") throw new RunHistoryError(historyError("run_not_found"));
  try {
    if (
      !(await isRegularRunDirectory(
        runDirectoryPath(options.stateDirectory, options.workspace.workspaceId, options.runId),
        options.signal,
      ))
    ) {
      throw new RunHistoryError(historyError("run_not_found"));
    }
  } catch (error) {
    if (error instanceof RunHistoryError) throw error;
    if (isNodeError(error)) throw new RunHistoryError(historyError("run_not_found"));
    throw new RunHistoryError(historyError("run_history_unavailable"));
  }
  const loaded = await loadRun(options);
  if (loaded.kind !== "available") {
    throw new RunHistoryError(historyError("run_history_unavailable"));
  }
  const inspection = {
    mode: "read-only",
    protocolVersion: 1,
    summary: loaded.value.summary,
    view: loaded.value.view,
  } satisfies RunInspection;
  const decoded = decodeRunInspection(inspection);
  if (!decoded.ok) throw new RunHistoryError(historyError("run_history_unavailable"));
  return decoded.value;
}

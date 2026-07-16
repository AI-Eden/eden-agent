import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, renameSync, rmSync } from "node:fs";
import {
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  decodeProductEvent,
  decodeRunCatalog,
  decodeRunInspection,
} from "../packages/contracts/src/index.ts";

const source = resolve(process.argv[2] ?? "");
const requestedEvidencePath = process.argv[3];
const standaloneEvidenceName = "standalone.json";
const repositoryRoot = resolve(import.meta.dirname, "..");
const directory = await mkdtemp(join(tmpdir(), "eden-standalone-"));
const hiddenSourceEntries = [];

function restoreSourceTree() {
  for (const entry of hiddenSourceEntries.toReversed()) {
    if (!existsSync(entry.hidden)) continue;
    if (existsSync(entry.original)) {
      throw new Error(`Cannot restore standalone source entry ${entry.name}.`);
    }
    renameSync(entry.hidden, entry.original);
  }
  hiddenSourceEntries.length = 0;
}

function cleanup() {
  restoreSourceTree();
  rmSync(directory, { force: true, recursive: true });
}

process.on("exit", cleanup);
process.once("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.once("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
const binaryDirectory = join(directory, "bin");
const stateRoot = join(directory, "states");
const workspace = join(directory, "workspace");
const otherWorkspace = join(directory, "other-workspace");
await mkdir(binaryDirectory);
await mkdir(workspace);
await mkdir(otherWorkspace);
const canonicalWorkspace = await realpath(workspace);
const executable = join(binaryDirectory, basename(source));
await copyFile(source, executable);
if (process.platform !== "win32") await chmod(executable, 0o755);

try {
  for (const name of ["apps", "packages", "spikes", "node_modules"]) {
    const original = join(repositoryRoot, name);
    if (!existsSync(original)) continue;
    const hidden = join(repositoryRoot, `.eden-standalone-hidden-${process.pid}-${name}`);
    renameSync(original, hidden);
    hiddenSourceEntries.push({ hidden, name, original });
  }
} catch (error) {
  restoreSourceTree();
  throw error;
}
const sourceEntriesUnavailable = hiddenSourceEntries.every(
  (entry) => !existsSync(entry.original) && existsSync(entry.hidden),
);

function stateDirectory(name) {
  return join(stateRoot, name);
}

function run(arguments_, stateName, cwd = workspace) {
  return spawnSync(executable, arguments_, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, EDEN_STATE_DIR: stateDirectory(stateName) },
  });
}

async function runAbortedHistory(stateName) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(executable, ["run", "list", "--json"], {
      cwd: workspace,
      env: {
        ...process.env,
        EDEN_HISTORY_PROBE: "1",
        EDEN_STATE_DIR: stateDirectory(stateName),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    let interrupted = false;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Timed out waiting for the history abort probe."));
    }, 10_000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => {
      stderr += chunk;
      if (!interrupted && stderr.includes("__EDEN_HISTORY_READY__")) {
        interrupted = true;
        child.kill("SIGINT");
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (status) => {
      clearTimeout(timeout);
      resolveResult({ status, stderr, stdout });
    });
  });
}

function decodeOne(result, decoder, label) {
  requireExit(result, 0, label);
  if (result.stderr !== "") throw new Error(`${label} wrote unexpected stderr.`);
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  if (lines.length !== 1) throw new Error(`${label} did not emit exactly one JSON value.`);
  const decoded = decoder(JSON.parse(lines[0]));
  if (!decoded.ok) throw new Error(`${label} emitted an invalid product value.`);
  return decoded.value;
}

function requireExit(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label} exited ${result.status}: ${result.stderr}`);
  }
}

function requireError(result, expectedExit, expectedCode, label) {
  requireExit(result, expectedExit, label);
  const lines = result.stderr.trim().split("\n");
  if (lines.length !== 1 || JSON.parse(lines[0]).code !== expectedCode) {
    throw new Error(`${label} did not emit one ${expectedCode} ProductError.`);
  }
}

function decodeEvents(result, label) {
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  const events = lines.map((line) => decodeProductEvent(JSON.parse(line)));
  if (events.length === 0 || !events.every((event) => event.ok)) {
    throw new Error(`${label} stdout contained a non-ProductEvent line.`);
  }
  return events;
}

function requireSuccess(result, label) {
  requireExit(result, 0, label);
  if (result.stderr !== "") throw new Error(`${label} wrote unexpected stderr.`);
  const events = decodeEvents(result, label);
  const last = events.at(-1);
  if (
    !(last?.ok && last.value.type === "run.terminal" && last.value.outcome.state === "succeeded")
  ) {
    throw new Error(`${label} did not end in verifier-backed success.`);
  }
  return events;
}

async function entries(path) {
  return readdir(path).catch(() => []);
}

async function treeDigest(root) {
  const names = (await readdir(root, { recursive: true })).sort();
  const hash = createHash("sha256");
  let receiptCount = 0;
  for (const name of names) {
    const path = join(root, name);
    const metadata = await lstat(path);
    hash.update(`${name}\0${metadata.mode}\0${metadata.size}\0`);
    if (metadata.isFile() && !metadata.isSymbolicLink()) {
      hash.update(await readFile(path));
      if (name.includes("receipts") && name.endsWith(".json")) receiptCount += 1;
    }
  }
  return { digest: hash.digest("hex"), receiptCount };
}

async function trustRecordFor(stateName) {
  const directory = join(stateDirectory(stateName), "workspace-trust", "v1");
  const name = (await entries(directory))[0];
  if (name === undefined) throw new Error(`${stateName} did not persist workspace trust.`);
  const path = join(directory, name);
  return { bytes: await readFile(path, "utf8"), path };
}

function runPartition(stateName, workspaceId) {
  return join(stateDirectory(stateName), "runs", "v1", workspaceId);
}

function historyStartRecord(workspaceSummary, runId) {
  return {
    causationId: "c",
    correlationId: "c",
    eventId: "e0",
    journalVersion: 1,
    payload: {
      correlationId: "c",
      runId,
      task: "History budget task",
      workspace: { ...workspaceSummary, trust: "trusted" },
    },
    recordedAt: "2026-07-16T00:00:00.000Z",
    redaction: { fields: [], status: "not-required" },
    runId,
    sequence: 0,
    type: "run.started",
  };
}

function historyCancelledRecord(runId, sequence) {
  return {
    causationId: null,
    correlationId: "c",
    eventId: `e${sequence.toString(36)}`,
    journalVersion: 1,
    payload: {},
    recordedAt: "2026-07-16T00:00:01.000Z",
    redaction: { fields: [], status: "not-required" },
    runId,
    sequence,
    type: "run.cancelled",
  };
}

async function writeRecordBudgetRun(stateName, workspaceSummary, runId, recordCount) {
  const directory = join(runPartition(stateName, workspaceSummary.workspaceId), runId);
  await mkdir(directory, { recursive: true });
  const records = [historyStartRecord(workspaceSummary, runId)];
  for (let sequence = 1; sequence < recordCount; sequence += 1) {
    records.push(historyCancelledRecord(runId, sequence));
  }
  await writeFile(
    join(directory, "journal.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}

const help = run(["--help"], "help-state");
requireExit(help, 0, "help");
if (
  !help.stdout.includes("eden run list --json") ||
  !help.stdout.includes("eden run show --json <run-id>")
) {
  throw new Error("Help omitted the frozen run-history commands.");
}
const invalid = run(["--invalid"], "invalid-state");
requireError(invalid, 2, "invalid_arguments", "invalid arguments");
const duplicate = run(
  ["exec", "--json", "--trust-workspace", "--trust-workspace", "task"],
  "duplicate-state",
);
requireError(duplicate, 2, "invalid_arguments", "duplicate trust flag");

const restricted = run(
  ["exec", "--json", "--approve-fake-action", "Index the fake workspace"],
  "restricted-state",
);
requireError(restricted, 2, "workspace_trust_required", "restricted headless run");
if (restricted.stdout !== "") {
  throw new Error("Restricted execution created output.");
}
try {
  await lstat(stateDirectory("restricted-state"));
  throw new Error("Restricted execution created a state inode.");
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

const trustOnly = run(
  ["exec", "--json", "--trust-workspace", "Index the fake workspace"],
  "trust-only-state",
);
requireError(trustOnly, 2, "approval_required", "trust-only headless run");
const pendingEvents = decodeEvents(trustOnly, "trust-only headless run");
if (
  pendingEvents.length !== 4 ||
  pendingEvents[0]?.value.type !== "session.snapshot" ||
  pendingEvents[1]?.value.type !== "phase.progress" ||
  pendingEvents[2]?.value.type !== "phase.progress" ||
  pendingEvents[3]?.value.type !== "approval.presented" ||
  trustOnly.stdout.includes("run.terminal")
) {
  throw new Error("Trust-only execution crossed the action-approval boundary.");
}
const pendingTrust = await trustRecordFor("trust-only-state");
const pendingWorkspaceId = JSON.parse(pendingTrust.bytes).workspaceId;
const pendingRunRoot = runPartition("trust-only-state", pendingWorkspaceId);
const pendingRuns = await entries(pendingRunRoot);
const pendingReceipts = await entries(join(pendingRunRoot, pendingRuns[0] ?? "", "receipts"));
if (pendingReceipts.length !== 1) {
  throw new Error("Trust-only execution did not create exactly one fake-model receipt.");
}
const pendingJournal = await readFile(
  join(pendingRunRoot, pendingRuns[0] ?? "", "journal.jsonl"),
  "utf8",
);
const pendingRecords = pendingJournal
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
if (
  pendingRecords[0]?.type !== "run.started" ||
  pendingRecords[0]?.payload.action !== undefined ||
  pendingRecords[1]?.type !== "effect.requested" ||
  pendingRecords[2]?.type !== "fake.model.completed"
) {
  throw new Error("fake.model.completed was not causally necessary before approval.");
}

const successArguments = [
  "exec",
  "--json",
  "--trust-workspace",
  "--approve-fake-action",
  "Index the fake workspace",
];
const approved = run(successArguments, "approved-state");
const events = requireSuccess(approved, "both-flags headless run");
const approvedTrust = await trustRecordFor("approved-state");
const trustPath = approvedTrust.path;
const trustBytes = approvedTrust.bytes;
const trustRecord = JSON.parse(trustBytes);
if (
  trustRecord.version !== 1 ||
  trustRecord.decision !== "trusted" ||
  trustRecord.revision !== 1 ||
  trustRecord.canonicalRoot !== canonicalWorkspace
) {
  throw new Error("Standalone workspace-trust record did not match the approved schema.");
}

const repeated = run(successArguments, "approved-state");
requireSuccess(repeated, "repeated-trust headless run");
if ((await readFile(trustPath, "utf8")) !== trustBytes) {
  throw new Error("Repeated explicit trust changed the current trust record.");
}
const persisted = run(
  ["exec", "--json", "--approve-fake-action", "Index the fake workspace"],
  "approved-state",
);
requireSuccess(persisted, "persisted-trust headless run");

const approvedRunRoot = runPartition("approved-state", trustRecord.workspaceId);
const runNames = await entries(approvedRunRoot);
const journal = await readFile(join(approvedRunRoot, runNames[0] ?? "", "journal.jsonl"), "utf8");
const startRecord = JSON.parse(journal.split("\n")[0]);
const snapshot = events.find((event) => event.ok && event.value.type === "session.snapshot");
if (
  !snapshot?.ok ||
  snapshot.value.type !== "session.snapshot" ||
  JSON.stringify(startRecord.payload.workspace) !== JSON.stringify(snapshot.value.view.workspace)
) {
  throw new Error("journal.jsonl workspace snapshot did not match product replay truth.");
}

const historyTrustBefore = await readFile(trustPath, "utf8");
const historyJournalBefore = await readFile(
  join(approvedRunRoot, runNames[0] ?? "", "journal.jsonl"),
  "utf8",
);
const listed = decodeOne(
  run(["run", "list", "--json"], "approved-state"),
  decodeRunCatalog,
  "run list",
);
if (
  listed.workspace.workspaceId !== trustRecord.workspaceId ||
  listed.entries.length !== 3 ||
  listed.entries.some((entry) => entry.availability !== "available")
) {
  throw new Error("Run list did not expose the three exact-workspace standalone runs.");
}
const historyRunId = snapshot.value.view.runId;
const shown = decodeOne(
  run(["run", "show", "--json", historyRunId], "approved-state"),
  decodeRunInspection,
  "run show",
);
if (shown.mode !== "read-only" || shown.view.runId !== historyRunId) {
  throw new Error("Run show did not return the selected read-only inspection.");
}
requireError(
  run(["run", "show", "--json", "run-missing"], "approved-state"),
  2,
  "run_not_found",
  "missing run show",
);
const otherCatalog = decodeOne(
  run(["run", "list", "--json"], "approved-state", otherWorkspace),
  decodeRunCatalog,
  "other-workspace run list",
);
if (otherCatalog.entries.length !== 0) {
  throw new Error("Another workspace observed the first workspace's run history.");
}
requireError(
  run(["run", "show", "--json", historyRunId], "approved-state", otherWorkspace),
  2,
  "run_not_found",
  "wrong-workspace run show",
);
requireError(
  run(["run", "show", "--json", "../run-1"], "approved-state"),
  2,
  "invalid_arguments",
  "path-like run show",
);

const corruptRunId = "run-corrupt-1";
const corruptDirectory = join(approvedRunRoot, corruptRunId);
await mkdir(corruptDirectory);
const corruptJournal = join(corruptDirectory, "journal.jsonl");
await writeFile(corruptJournal, '{"journalVersion":\n', "utf8");
const oversizedRunId = "run-oversized-1";
const oversizedDirectory = join(approvedRunRoot, oversizedRunId);
await mkdir(oversizedDirectory);
await writeFile(join(oversizedDirectory, "journal.jsonl"), Buffer.alloc(1_048_577, 0x61));
const hardlinkedRunId = "run-hardlinked-1";
const hardlinkedDirectory = join(approvedRunRoot, hardlinkedRunId);
await mkdir(hardlinkedDirectory);
const hardlinkSource = join(directory, "hardlink-source.jsonl");
await writeFile(hardlinkSource, '{"journalVersion":\n', "utf8");
await link(hardlinkSource, join(hardlinkedDirectory, "journal.jsonl"));
const symlinkedRunId = "run-symlinked-1";
const symlinkedDirectory = join(approvedRunRoot, symlinkedRunId);
await mkdir(symlinkedDirectory);
await symlink(corruptJournal, join(symlinkedDirectory, "journal.jsonl"), "file");
const longRecordRunId = "run-long-record-1";
const longRecordDirectory = join(approvedRunRoot, longRecordRunId);
await mkdir(longRecordDirectory);
await writeFile(join(longRecordDirectory, "journal.jsonl"), `${"a".repeat(65_537)}\n`, "utf8");
const replacedRunId = "run-replaced-1";
const replacedDirectory = join(approvedRunRoot, replacedRunId);
await mkdir(replacedDirectory);
const replacedJournal = join(replacedDirectory, "journal.jsonl");
await writeFile(replacedJournal, `${JSON.stringify(startRecord)}\n`, "utf8");
await rename(replacedJournal, join(replacedDirectory, "parked.jsonl"));
await writeFile(replacedJournal, '{"journalVersion":\n', "utf8");
const historyTreeBefore = await treeDigest(stateDirectory("approved-state"));
const mixed = decodeOne(
  run(["run", "list", "--json"], "approved-state"),
  decodeRunCatalog,
  "mixed run list",
);
for (const runId of [
  corruptRunId,
  oversizedRunId,
  hardlinkedRunId,
  symlinkedRunId,
  longRecordRunId,
  replacedRunId,
]) {
  if (
    !mixed.entries.some((entry) => entry.runId === runId && entry.availability === "unavailable")
  ) {
    throw new Error(`Invalid attributed run ${runId} disappeared from standalone history.`);
  }
}
requireError(
  run(["run", "show", "--json", corruptRunId], "approved-state"),
  1,
  "run_history_unavailable",
  "corrupt run show",
);
const historyTreeAfter = await treeDigest(stateDirectory("approved-state"));
if (
  (await readFile(trustPath, "utf8")) !== historyTrustBefore ||
  (await readFile(join(approvedRunRoot, runNames[0] ?? "", "journal.jsonl"), "utf8")) !==
    historyJournalBefore ||
  (await readFile(corruptJournal, "utf8")) !== '{"journalVersion":\n' ||
  historyTreeAfter.digest !== historyTreeBefore.digest ||
  historyTreeAfter.receiptCount !== historyTreeBefore.receiptCount
) {
  throw new Error("Run list/show changed trust or journal bytes.");
}

await writeFile(trustPath, '{"version":', "utf8");
const malformed = run(
  ["exec", "--json", "--approve-fake-action", "Index the fake workspace"],
  "approved-state",
);
requireError(malformed, 2, "workspace_trust_required", "malformed trust record");
if (malformed.stdout !== "") throw new Error("Malformed trust state did not fail closed.");

await mkdir(stateRoot, { recursive: true });
await writeFile(stateDirectory("unavailable-state"), "not a directory", "utf8");
const unavailable = run(
  ["exec", "--json", "--trust-workspace", "--approve-fake-action", "task"],
  "unavailable-state",
);
requireError(unavailable, 1, "runtime_failure", "unavailable state directory");
if (unavailable.stdout.includes("run.terminal")) {
  throw new Error("Unavailable state produced terminal success.");
}

const missingStatePath = stateDirectory("missing-history-state");
const missingCatalog = decodeOne(
  run(["run", "list", "--json"], "missing-history-state"),
  decodeRunCatalog,
  "missing-state run list",
);
if (missingCatalog.entries.length !== 0) {
  throw new Error("Missing-state history returned a run.");
}
try {
  await lstat(missingStatePath);
  throw new Error("Missing-state history created an inode.");
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
}

const budgetStateName = "budget-state";
const budgetCatalog = decodeOne(
  run(["run", "list", "--json"], budgetStateName),
  decodeRunCatalog,
  "budget workspace identity",
);
const budgetPartition = runPartition(budgetStateName, budgetCatalog.workspace.workspaceId);
await Promise.all(
  Array.from({ length: 513 }, (_, index) =>
    mkdir(join(budgetPartition, `run-budget-${index.toString().padStart(3, "0")}`), {
      recursive: true,
    }),
  ),
);
const boundedCatalog = decodeOne(
  run(["run", "list", "--json"], budgetStateName),
  decodeRunCatalog,
  "bounded run list",
);
if (
  boundedCatalog.truncated !== true ||
  boundedCatalog.notices.filter((notice) => notice.code === "run_history_budget_exceeded")
    .length !== 1
) {
  throw new Error("The 513-child catalog did not expose its bounded scan.");
}

const cumulativeStateName = "cumulative-budget-state";
const cumulativeCatalog = decodeOne(
  run(["run", "list", "--json"], cumulativeStateName),
  decodeRunCatalog,
  "cumulative budget workspace identity",
);
const cumulativePartition = runPartition(
  cumulativeStateName,
  cumulativeCatalog.workspace.workspaceId,
);
for (let index = 0; index < 17; index += 1) {
  const runDirectory = join(
    cumulativePartition,
    `run-cumulative-${index.toString().padStart(2, "0")}`,
  );
  await mkdir(runDirectory, { recursive: true });
  await writeFile(
    join(runDirectory, "journal.jsonl"),
    Buffer.concat([Buffer.alloc(999_999, 0x61), Buffer.from("\n")]),
  );
}
const cumulativeBounded = decodeOne(
  run(["run", "list", "--json"], cumulativeStateName),
  decodeRunCatalog,
  "cumulative bounded run list",
);
if (
  cumulativeBounded.truncated !== true ||
  cumulativeBounded.entries.length >= 17 ||
  cumulativeBounded.notices[0]?.code !== "run_history_budget_exceeded"
) {
  throw new Error("The standalone cumulative byte budget did not stop visibly.");
}

const recordLimitStateName = "record-limit-state";
const recordLimitCatalog = decodeOne(
  run(["run", "list", "--json"], recordLimitStateName),
  decodeRunCatalog,
  "record-limit workspace identity",
);
await writeRecordBudgetRun(
  recordLimitStateName,
  recordLimitCatalog.workspace,
  "run-record-limit",
  4_097,
);
const recordLimited = decodeOne(
  run(["run", "list", "--json"], recordLimitStateName),
  decodeRunCatalog,
  "record-limit run list",
);
if (recordLimited.entries[0]?.availability !== "unavailable") {
  throw new Error("The standalone per-journal record limit did not fail closed.");
}

const cumulativeRecordStateName = "cumulative-record-state";
const cumulativeRecordCatalog = decodeOne(
  run(["run", "list", "--json"], cumulativeRecordStateName),
  decodeRunCatalog,
  "cumulative-record workspace identity",
);
for (let index = 0; index < 5; index += 1) {
  await writeRecordBudgetRun(
    cumulativeRecordStateName,
    cumulativeRecordCatalog.workspace,
    `run-cumulative-record-${index}`,
    4_096,
  );
}
const cumulativeRecordBounded = decodeOne(
  run(["run", "list", "--json"], cumulativeRecordStateName),
  decodeRunCatalog,
  "cumulative-record run list",
);
if (
  cumulativeRecordBounded.truncated !== true ||
  cumulativeRecordBounded.entries.length >= 5 ||
  cumulativeRecordBounded.notices[0]?.code !== "run_history_budget_exceeded"
) {
  throw new Error("The standalone cumulative record budget did not stop visibly.");
}

const aborted = await runAbortedHistory(cumulativeRecordStateName);
if (
  aborted.status !== 1 ||
  aborted.stdout !== "" ||
  !aborted.stderr.includes("__EDEN_HISTORY_READY__") ||
  !aborted.stderr.includes('"code":"operation_aborted"')
) {
  throw new Error("The standalone history abort did not return sanitized product truth.");
}

restoreSourceTree();

const evidence = {
  decodedCounts: {
    approvedProductEvents: events.length,
    boundedCatalogEntries: boundedCatalog.entries.length,
    cumulativeCatalogEntries: cumulativeBounded.entries.length,
    cumulativeRecordCatalogEntries: cumulativeRecordBounded.entries.length,
    pendingProductEvents: pendingEvents.length,
  },
  historySideEffects: {
    newEffectReceipts: historyTreeAfter.receiptCount - historyTreeBefore.receiptCount,
    stateDigestChanged: historyTreeAfter.digest !== historyTreeBefore.digest,
  },
  exitTable: [
    { expected: 0, id: "help", observed: help.status },
    { expected: 2, id: "invalid", observed: invalid.status },
    { expected: 2, id: "restricted", observed: restricted.status },
    { expected: 2, id: "trust-only", observed: trustOnly.status },
    { expected: 0, id: "approved", observed: approved.status },
    { expected: 0, id: "persisted-trust", observed: persisted.status },
    { expected: 1, id: "corrupt-history", observed: 1 },
    { expected: 0, id: "bounded-history", observed: 0 },
    { expected: 0, id: "missing-history-no-write", observed: 0 },
    { expected: 1, id: "aborted-history", observed: aborted.status },
  ],
  rows: [
    { id: "model-causality", status: "passed" },
    { id: "workspace-trust", status: "passed" },
    { id: "bounded-history", status: "passed" },
    { id: "journal-byte-limit", status: "passed" },
    { id: "journal-record-byte-limit", status: "passed" },
    { id: "journal-record-limit", status: "passed" },
    { id: "catalog-byte-budget", status: "passed" },
    { id: "catalog-record-budget", status: "passed" },
    { id: "history-abort", status: "passed" },
    { id: "linked-and-replaced-history", status: "passed" },
    { id: "missing-history-no-write", status: "passed" },
    { id: "corrupt-history", status: "passed" },
    { id: "workspace-isolation", status: "passed" },
  ],
  schemaVersion: 1,
  sourceBoundary: {
    copiedArtifactOutsideCheckout: !executable.startsWith(repositoryRoot),
    hiddenEntries: ["apps", "packages", "spikes", "node_modules"],
    originalArtifactNotExecuted: executable !== source,
    sourceEntriesUnavailable,
  },
  status: "passed",
};
if (requestedEvidencePath !== undefined) {
  if (basename(requestedEvidencePath) !== standaloneEvidenceName) {
    throw new Error(`Standalone evidence path must end with ${standaloneEvidenceName}.`);
  }
  await mkdir(resolve(requestedEvidencePath, ".."), { recursive: true });
  await writeFile(requestedEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

process.stdout.write(
  `${JSON.stringify({ artifact: executable, evidence: requestedEvidencePath ?? null, status: "passed" })}\n`,
);

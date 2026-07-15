import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { decodeProductEvent } from "../packages/contracts/src/index.ts";

const source = resolve(process.argv[2] ?? "");
const directory = await mkdtemp(join(tmpdir(), "eden-standalone-"));
const binaryDirectory = join(directory, "bin");
const stateRoot = join(directory, "states");
const workspace = join(directory, "workspace");
await mkdir(binaryDirectory);
await mkdir(workspace);
const executable = join(binaryDirectory, basename(source));
await copyFile(source, executable);
if (process.platform !== "win32") await chmod(executable, 0o755);

function stateDirectory(name) {
  return join(stateRoot, name);
}

function run(arguments_, stateName) {
  return spawnSync(executable, arguments_, {
    cwd: workspace,
    encoding: "utf8",
    env: { ...process.env, EDEN_STATE_DIR: stateDirectory(stateName) },
  });
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

requireExit(run(["--help"], "help-state"), 0, "help");
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
if (
  restricted.stdout !== "" ||
  (await entries(join(stateDirectory("restricted-state"), "runs"))).length > 0
) {
  throw new Error("Restricted execution created output or durable run state.");
}

const trustOnly = run(
  ["exec", "--json", "--trust-workspace", "Index the fake workspace"],
  "trust-only-state",
);
requireError(trustOnly, 2, "approval_required", "trust-only headless run");
const pendingEvents = decodeEvents(trustOnly, "trust-only headless run");
if (pendingEvents.length !== 2 || trustOnly.stdout.includes("run.terminal")) {
  throw new Error("Trust-only execution crossed the action-approval boundary.");
}
const pendingRuns = await entries(join(stateDirectory("trust-only-state"), "runs"));
const pendingReceipts = await entries(
  join(stateDirectory("trust-only-state"), "runs", pendingRuns[0] ?? "", "receipts"),
);
if (pendingReceipts.length > 0) throw new Error("Trust-only execution created an effect receipt.");

const successArguments = [
  "exec",
  "--json",
  "--trust-workspace",
  "--approve-fake-action",
  "Index the fake workspace",
];
const approved = run(successArguments, "approved-state");
const events = requireSuccess(approved, "both-flags headless run");
const trustDirectory = join(stateDirectory("approved-state"), "workspace-trust", "v1");
const trustName = (await entries(trustDirectory))[0];
if (trustName === undefined) throw new Error("Standalone did not persist workspace trust.");
const trustPath = join(trustDirectory, trustName);
const trustBytes = await readFile(trustPath, "utf8");
const trustRecord = JSON.parse(trustBytes);
if (
  trustRecord.version !== 1 ||
  trustRecord.decision !== "trusted" ||
  trustRecord.revision !== 1 ||
  trustRecord.canonicalRoot !== workspace
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

const runNames = await entries(join(stateDirectory("approved-state"), "runs"));
const journal = await readFile(
  join(stateDirectory("approved-state"), "runs", runNames[0] ?? "", "journal.jsonl"),
  "utf8",
);
const startRecord = JSON.parse(journal.split("\n")[0]);
const snapshot = events.find((event) => event.ok && event.value.type === "session.snapshot");
if (
  !snapshot?.ok ||
  snapshot.value.type !== "session.snapshot" ||
  JSON.stringify(startRecord.payload.workspace) !== JSON.stringify(snapshot.value.view.workspace)
) {
  throw new Error("journal.jsonl workspace snapshot did not match product replay truth.");
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

process.stdout.write(
  `${JSON.stringify({ artifact: executable, events: events.length, status: "passed" })}\n`,
);

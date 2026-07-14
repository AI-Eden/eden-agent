import { spawnSync } from "node:child_process";
import { chmod, copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { decodeProductEvent } from "../packages/contracts/src/index.ts";

const source = resolve(process.argv[2] ?? "");
const directory = await mkdtemp(join(tmpdir(), "eden-standalone-"));
const executable = join(directory, basename(source));
await copyFile(source, executable);
if (process.platform !== "win32") await chmod(executable, 0o755);

function run(arguments_, stateName) {
  return spawnSync(executable, arguments_, {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, EDEN_STATE_DIR: join(directory, stateName) },
  });
}

function requireExit(result, expected, label) {
  if (result.status !== expected) {
    throw new Error(`${label} exited ${result.status}: ${result.stderr}`);
  }
}

requireExit(run(["--help"], "help-state"), 0, "help");
const invalid = run(["--invalid"], "invalid-state");
requireExit(invalid, 2, "invalid arguments");
if (JSON.parse(invalid.stderr).code !== "invalid_arguments") {
  throw new Error("Invalid arguments did not produce the stable ProductError.");
}

const approved = run(
  ["exec", "--json", "--approve-fake-action", "Index the fake workspace"],
  "approved-state",
);
requireExit(approved, 0, "approved headless run");
const events = approved.stdout
  .trim()
  .split("\n")
  .map((line) => decodeProductEvent(JSON.parse(line)));
if (!events.every((event) => event.ok))
  throw new Error("Standalone stdout contained a non-ProductEvent line.");
const last = events.at(-1);
if (!(last?.ok && last.value.type === "run.terminal" && last.value.outcome.state === "succeeded")) {
  throw new Error("Standalone headless run did not end in verifier-backed success.");
}

const pending = run(["exec", "--json", "Index the fake workspace"], "pending-state");
requireExit(pending, 2, "approval-required headless run");
if (
  JSON.parse(pending.stderr).code !== "approval_required" ||
  pending.stdout.includes("run.terminal")
) {
  throw new Error("Approval-required execution crossed the effect boundary.");
}

process.stdout.write(
  `${JSON.stringify({ artifact: executable, events: events.length, status: "passed" })}\n`,
);

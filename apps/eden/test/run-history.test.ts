import { deepStrictEqual, rejects, strictEqual } from "node:assert";
import { lstat, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { decodeRunCatalog, decodeRunInspection } from "@eden/contracts";

import { runHeadless } from "../src/headless.ts";
import { runHistory } from "../src/run-history.ts";

function output() {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return {
    environment(cwd: string, stateDirectory: string) {
      return {
        cwd,
        io: {
          stderr: (value: string) => stderr.push(value),
          stdout: (value: string) => stdout.push(value),
        },
        stateDirectory,
      };
    },
    stderr,
    stdout,
  };
}

async function fixture() {
  const base = await mkdtemp(join(tmpdir(), "eden-history-cli-"));
  const stateDirectory = join(base, "state");
  const workspaceDirectory = join(base, "workspace");
  await mkdir(workspaceDirectory);
  return { stateDirectory, workspaceDirectory };
}

test("headless list and show emit one closed read-only value", async () => {
  const directories = await fixture();
  const seed = output();
  strictEqual(
    await runHeadless(
      {
        approveFakeAction: true,
        task: "Index the fake workspace",
        trustWorkspace: true,
      },
      seed.environment(directories.workspaceDirectory, directories.stateDirectory),
    ),
    0,
  );
  const listed = output();

  const listExit = await runHistory(
    { mode: "run-list" },
    listed.environment(directories.workspaceDirectory, directories.stateDirectory),
  );
  const decodedCatalog = decodeRunCatalog(JSON.parse(listed.stdout.join("")));

  strictEqual(listExit, 0);
  strictEqual(listed.stderr.length, 0);
  strictEqual(decodedCatalog.ok, true);
  if (!decodedCatalog.ok) throw new Error("Expected a valid run catalog.");
  strictEqual(decodedCatalog.value.entries.length, 1);
  const entry = decodedCatalog.value.entries[0];
  if (entry === undefined) throw new Error("Expected one run entry.");
  const shown = output();
  const showExit = await runHistory(
    { mode: "run-show", runId: entry.runId },
    shown.environment(directories.workspaceDirectory, directories.stateDirectory),
  );
  const decodedInspection = decodeRunInspection(JSON.parse(shown.stdout.join("")));
  strictEqual(showExit, 0);
  strictEqual(shown.stderr.length, 0);
  strictEqual(decodedInspection.ok, true);
  if (!decodedInspection.ok) throw new Error("Expected a valid run inspection.");
  strictEqual(decodedInspection.value.mode, "read-only");
  strictEqual(decodedInspection.value.summary.runId, entry.runId);
});

test("missing and unavailable show use distinct structured exit classes", async () => {
  const directories = await fixture();
  const empty = output();
  const missingExit = await runHistory(
    { mode: "run-show", runId: "run-missing" },
    empty.environment(directories.workspaceDirectory, directories.stateDirectory),
  );
  strictEqual(missingExit, 2);
  strictEqual(empty.stdout.length, 0);
  strictEqual(JSON.parse(empty.stderr.join("")).code, "run_not_found");

  const listed = output();
  await runHistory(
    { mode: "run-list" },
    listed.environment(directories.workspaceDirectory, directories.stateDirectory),
  );
  const catalog = decodeRunCatalog(JSON.parse(listed.stdout.join("")));
  if (!catalog.ok) throw new Error("Expected an empty catalog.");
  const corruptId = "run-corrupt-1";
  const corruptJournal = join(
    directories.stateDirectory,
    "runs",
    "v1",
    catalog.value.workspace.workspaceId,
    corruptId,
    "journal.jsonl",
  );
  await mkdir(join(corruptJournal, ".."), { recursive: true });
  await writeFile(corruptJournal, '{"journalVersion":\n', "utf8");
  const before = await readFile(corruptJournal, "utf8");
  const unavailable = output();
  const unavailableExit = await runHistory(
    { mode: "run-show", runId: corruptId },
    unavailable.environment(directories.workspaceDirectory, directories.stateDirectory),
  );

  strictEqual(unavailableExit, 1);
  deepStrictEqual(unavailable.stdout, []);
  strictEqual(JSON.parse(unavailable.stderr.join("")).code, "run_history_unavailable");
  strictEqual(await readFile(corruptJournal, "utf8"), before);
});

test("missing-state list and show create no inode", async () => {
  const directories = await fixture();
  const listed = output();

  strictEqual(
    await runHistory(
      { mode: "run-list" },
      listed.environment(directories.workspaceDirectory, directories.stateDirectory),
    ),
    0,
  );
  await rejects(lstat(directories.stateDirectory), { code: "ENOENT" });

  const shown = output();
  strictEqual(
    await runHistory(
      { mode: "run-show", runId: "run-missing" },
      shown.environment(directories.workspaceDirectory, directories.stateDirectory),
    ),
    2,
  );
  await rejects(lstat(directories.stateDirectory), { code: "ENOENT" });
});

test("history failures never expose a secret canary path or journal content", async () => {
  const directories = await fixture();
  const canary = "EDEN_SECRET_CANARY_DO_NOT_PRINT";
  const listed = output();
  await runHistory(
    { mode: "run-list" },
    listed.environment(directories.workspaceDirectory, directories.stateDirectory),
  );
  const catalog = decodeRunCatalog(JSON.parse(listed.stdout.join("")));
  if (!catalog.ok) throw new Error("Expected an empty catalog.");
  const runId = "run-secret-canary";
  const journal = join(
    directories.stateDirectory,
    "runs",
    "v1",
    catalog.value.workspace.workspaceId,
    runId,
    "journal.jsonl",
  );
  await mkdir(join(journal, ".."), { recursive: true });
  await writeFile(journal, `${canary}:${journal}\n`, "utf8");
  const shown = output();

  const exit = await runHistory(
    { mode: "run-show", runId },
    shown.environment(directories.workspaceDirectory, directories.stateDirectory),
  );
  const rendered = `${shown.stdout.join("")}\n${shown.stderr.join("")}`;

  strictEqual(exit, 1);
  strictEqual(JSON.parse(shown.stderr.join("")).code, "run_history_unavailable");
  strictEqual(rendered.includes(canary), false);
  strictEqual(rendered.includes(journal), false);
});

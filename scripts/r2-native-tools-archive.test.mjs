import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { decodeProductEvent } from "../packages/contracts/src/index.ts";

const source = resolve(process.argv[2] ?? "apps/eden/dist");
const root = await mkdtemp(join(tmpdir(), "eden-r2-native-archive-"));
const archive = join(root, "archive");
const workspace = join(root, "workspace");
const state = join(root, "state");
await cp(source, archive, { recursive: true });
await mkdir(workspace);

const applicationName = process.platform === "win32" ? "eden.exe" : "eden";
const ripgrepName = process.platform === "win32" ? "rg.exe" : "rg";
const expectedEntries = [
  "THIRD_PARTY_NOTICES.txt",
  applicationName,
  "eden-assets.json",
  ripgrepName,
].sort();
const entries = (await readdir(archive)).sort();
if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
  throw new Error(`The packaged archive has unexpected entries: ${entries.join(", ")}`);
}
const manifest = JSON.parse(await readFile(join(archive, "eden-assets.json"), "utf8"));
const hash = async (path) =>
  `sha256:${createHash("sha256")
    .update(await readFile(path))
    .digest("hex")}`;
for (const [name, descriptor] of [
  [applicationName, manifest.application],
  [ripgrepName, manifest.ripgrep],
  ["THIRD_PARTY_NOTICES.txt", manifest.notices],
]) {
  if (descriptor.path !== name || descriptor.contentHash !== (await hash(join(archive, name)))) {
    throw new Error(`The archive manifest does not match ${name}.`);
  }
}
if (
  manifest.formatVersion !== 1 ||
  manifest.ripgrep.package !== "@vscode/ripgrep" ||
  manifest.ripgrep.packageVersion !== "1.18.0" ||
  manifest.ripgrep.version !== "15.0.0" ||
  manifest.target.architecture !== process.arch ||
  manifest.target.platform !== process.platform
) {
  throw new Error("The archive manifest target or pinned ripgrep provenance is invalid.");
}

const executable = join(archive, applicationName);
if (process.platform !== "win32") await chmod(executable, 0o755);
const git = (...arguments_) => {
  const result = spawnSync("git", arguments_, {
    cwd: workspace,
    encoding: "utf8",
    env: {
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH,
    },
  });
  if (result.status !== 0) throw new Error(`Git fixture setup failed: ${result.stderr}`);
};
git("init", "--quiet");
git("config", "user.email", "eden@example.invalid");
git("config", "user.name", "Eden Archive Test");
await writeFile(join(workspace, "fixture.txt"), "EDEN_NATIVE_SMOKE\n", "utf8");
git("add", "fixture.txt");
git("commit", "--quiet", "-m", "fixture");

function runTask(task, stateName) {
  const result = spawnSync(
    executable,
    ["exec", "--json", "--trust-workspace", "--approve-fake-action", task],
    {
      cwd: workspace,
      encoding: "utf8",
      env: { ...process.env, EDEN_STATE_DIR: join(state, stateName) },
    },
  );
  if (result.status !== 0 || result.stderr !== "") {
    throw new Error(`The copied archive task failed: ${result.stderr}`);
  }
  return result.stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const decoded = decodeProductEvent(JSON.parse(line));
      if (!decoded.ok) throw new Error("The copied archive emitted an invalid ProductEvent.");
      return decoded.value;
    });
}

const searchEvents = runTask("Search the repository for EDEN_NATIVE_SMOKE.", "search");
const search = searchEvents.find(
  (event) =>
    event.type === "tool.updated" &&
    event.activity.state === "completed" &&
    event.activity.result?.name === "search_repository",
);
if (
  search?.type !== "tool.updated" ||
  search.activity.result?.status !== "succeeded" ||
  search.activity.result.name !== "search_repository" ||
  search.activity.result.data.matches[0]?.path !== "fixture.txt" ||
  search.activity.result.data.engine.contentHash !== manifest.ripgrep.contentHash
) {
  throw new Error("The copied archive did not complete pinned semantic search.");
}

await writeFile(join(workspace, "untracked status.txt"), "dirty\n", "utf8");
const statusEvents = runTask("Show the current repository status.", "status");
const status = statusEvents.find(
  (event) =>
    event.type === "tool.updated" &&
    event.activity.state === "completed" &&
    event.activity.result?.name === "git_status",
);
if (
  status?.type !== "tool.updated" ||
  status.activity.result?.status !== "succeeded" ||
  status.activity.result.name !== "git_status" ||
  !status.activity.result.data.entries.some(
    (entry) => entry.kind === "untracked" && entry.path === "untracked status.txt",
  )
) {
  throw new Error("The copied archive did not complete host-Git semantic status.");
}

process.stdout.write(
  `${JSON.stringify({
    archive: basename(source),
    applicationHash: manifest.application.contentHash,
    gitVersion: status.activity.result.data.gitVersion,
    ripgrepHash: manifest.ripgrep.contentHash,
    ripgrepVersion: manifest.ripgrep.version,
    status: "passed",
  })}\n`,
);

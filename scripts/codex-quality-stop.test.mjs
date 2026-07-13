import { strictEqual } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const sessionStartPath = join(repositoryRoot, ".codex", "hooks", "quality-session-start.mjs");
const stopPath = join(repositoryRoot, ".codex", "hooks", "quality-stop.mjs");

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "eden-agent-codex-hook-"));

  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ private: true, packageManager: "pnpm@11.7.0" }),
  );
  copyFileSync(join(repositoryRoot, "biome.json"), join(directory, "biome.json"));
  symlinkSync(
    join(repositoryRoot, "node_modules"),
    join(directory, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  mkdirSync(join(directory, "temporary"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: directory });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: directory });
  writeFileSync(join(directory, "existing.ts"), 'const existing = { value: "clean" };\n');
  execFileSync("git", ["add", "existing.ts"], { cwd: directory });
  execFileSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: directory });

  return directory;
}

function runHook(scriptPath, directory, sessionId) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd: directory,
    encoding: "utf8",
    env: { ...process.env, TMPDIR: join(directory, "temporary") },
    input: JSON.stringify({ cwd: directory, session_id: sessionId }),
  });
}

test("formats only TypeScript files changed after the Codex session starts", () => {
  const directory = createFixture();
  const sessionId = "session-under-test";
  const existingPath = join(directory, "existing.ts");
  const addedPath = join(directory, "added.ts");

  try {
    writeFileSync(existingPath, 'const existing={value:"user-dirty"}\n');
    const started = runHook(sessionStartPath, directory, sessionId);
    strictEqual(started.status, 0, started.stderr);

    writeFileSync(addedPath, 'const added={value:"agent-change"}\n');
    const stopped = runHook(stopPath, directory, sessionId);

    strictEqual(stopped.status, 0, stopped.stderr);
    strictEqual(JSON.parse(stopped.stdout).continue, true);
    strictEqual(readFileSync(existingPath, "utf8"), 'const existing={value:"user-dirty"}\n');
    strictEqual(readFileSync(addedPath, "utf8"), 'const added = { value: "agent-change" };\n');
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

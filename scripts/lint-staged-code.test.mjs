import { strictEqual } from "node:assert";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
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
const scriptPath = join(repositoryRoot, "scripts", "lint-staged-code.mjs");

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), "eden-agent-hook-"));

  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ private: true, packageManager: "pnpm@11.7.0" }),
  );
  copyFileSync(join(repositoryRoot, "biome.json"), join(directory, "biome.json"));
  symlinkSync(join(repositoryRoot, "node_modules"), join(directory, "node_modules"));
  execFileSync("git", ["init", "--quiet"], { cwd: directory });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: directory });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: directory });

  return directory;
}

test("formats and re-stages a staged TypeScript file", () => {
  const directory = createFixture();
  const sourcePath = join(directory, "example.ts");

  try {
    writeFileSync(sourcePath, 'const value={thing:"x"}\n');
    execFileSync("git", ["add", "example.ts"], { cwd: directory });

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: directory,
      encoding: "utf8",
    });

    strictEqual(result.status, 0, result.stderr);
    strictEqual(readFileSync(sourcePath, "utf8"), 'const value = { thing: "x" };\n');
    strictEqual(
      execFileSync("git", ["show", ":example.ts"], {
        cwd: directory,
        encoding: "utf8",
      }),
      'const value = { thing: "x" };\n',
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

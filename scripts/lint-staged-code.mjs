import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const codeFilePattern = /\.(?:[cm]?[jt]sx?)$/iu;
const biomePath = join(
  process.cwd(),
  "node_modules",
  "@biomejs",
  "biome",
  "bin",
  process.platform === "win32" ? "biome.exe" : "biome",
);

function runBiome(command, files) {
  return spawnSync(process.execPath, [biomePath, command, ...files], { stdio: "inherit" });
}

const diff = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"], {
  encoding: "utf8",
});

if (diff.error || diff.status !== 0) {
  console.error(diff.stderr || diff.error?.message || "Could not inspect staged files.");
  process.exit(1);
}

const files = diff.stdout
  .split("\0")
  .filter(Boolean)
  .filter((file) => codeFilePattern.test(file))
  .filter((file) => existsSync(file));

if (files.length === 0) {
  process.exit(0);
}

if (!existsSync(biomePath)) {
  console.error("Biome could not start. Run `pnpm install` first.");
  process.exit(1);
}

const formatted = runBiome("format", ["--write", ...files]);
if (formatted.status !== 0) {
  process.exit(formatted.status ?? 1);
}

const fixed = runBiome("lint", ["--write", ...files]);
if (fixed.status !== 0) {
  process.exit(fixed.status ?? 1);
}

const staged = spawnSync("git", ["add", "--", ...files], { stdio: "inherit" });
if (staged.status !== 0) {
  process.exit(staged.status ?? 1);
}

const checked = runBiome("check", files);
process.exit(checked.status ?? 1);

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

const diff = run("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"]);

if (diff.error || diff.status !== 0) {
  console.error(diff.stderr || diff.error?.message || "Could not inspect staged files.");
  process.exit(1);
}

const files = diff.stdout
  .split("\0")
  .filter(Boolean)
  .filter((file) => /\.(md|markdown)$/iu.test(file))
  .filter((file) => existsSync(file));

if (files.length === 0) {
  process.exit(0);
}

const literalFiles = files.map((file) => ":" + file);
const fixed = run("pnpm", ["exec", "markdownlint-cli2", "--fix", ...literalFiles], {
  stdio: "inherit",
});

if (fixed.error) {
  console.error("Markdown lint could not start. Run `pnpm install` first.");
  process.exit(1);
}

if (fixed.status !== 0) {
  process.exit(fixed.status ?? 1);
}

const staged = run("git", ["add", "--", ...files], { stdio: "inherit" });
if (staged.status !== 0) {
  process.exit(staged.status ?? 1);
}

const checked = run("pnpm", ["exec", "markdownlint-cli2", ...literalFiles], {
  stdio: "inherit",
});
process.exit(checked.status ?? 1);

import { spawnSync } from "node:child_process";

const result = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  stdio: "inherit",
});

if (result.error) {
  console.error("Could not configure Git hooks: " + result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);


import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function readInput() {
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return JSON.parse(input || "{}");
}

function runGit(args) {
  return spawnSync("git", args, { encoding: "utf8" });
}

function changedFiles() {
  return [
    ["diff", "--name-only", "-z"],
    ["diff", "--cached", "--name-only", "-z"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ].flatMap((args) => {
    const result = runGit(args);
    return result.status === 0 ? result.stdout.split("\0").filter(Boolean) : [];
  });
}

const input = await readInput();
const root = runGit(["rev-parse", "--show-toplevel"]);

if (root.status !== 0 || typeof input.session_id !== "string") {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

const stateDirectory = join(tmpdir(), "eden-agent-codex-hooks");
mkdirSync(stateDirectory, { recursive: true });
writeFileSync(
  join(stateDirectory, `${encodeURIComponent(input.session_id)}.json`),
  JSON.stringify({ files: [...new Set(changedFiles())] }),
);
process.stdout.write(JSON.stringify({ continue: true }));

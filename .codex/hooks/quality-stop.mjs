import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const codeFilePattern = /\.(?:[cm]?[jt]sx?)$/iu;

async function readInput() {
  let input = "";

  for await (const chunk of process.stdin) {
    input += chunk;
  }

  return JSON.parse(input || "{}");
}

function runGit(args, options = {}) {
  return spawnSync("git", args, { encoding: "utf8", ...options });
}

function changedFiles(root) {
  return [
    ["diff", "--name-only", "-z"],
    ["diff", "--cached", "--name-only", "-z"],
    ["ls-files", "--others", "--exclude-standard", "-z"],
  ].flatMap((args) => {
    const result = runGit(args, { cwd: root });
    return result.status === 0 ? result.stdout.split("\0").filter(Boolean) : [];
  });
}

function runBiome(root, command, files) {
  const biomePath = join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "biome.cmd" : "biome",
  );
  const result = spawnSync(biomePath, [command, ...files], {
    cwd: root,
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stderr.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result.status === 0;
}

const input = await readInput();
const rootResult = runGit(["rev-parse", "--show-toplevel"]);

if (rootResult.status !== 0 || typeof input.session_id !== "string") {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

const root = rootResult.stdout.trim();
const statePath = join(
  tmpdir(),
  "eden-agent-codex-hooks",
  `${encodeURIComponent(input.session_id)}.json`,
);

if (!existsSync(statePath)) {
  process.stdout.write(
    JSON.stringify({
      continue: true,
      systemMessage: "Biome skipped: this Codex session has no quality baseline.",
    }),
  );
  process.exit(0);
}

const baseline = new Set(JSON.parse(readFileSync(statePath, "utf8")).files);
const files = [...new Set(changedFiles(root))].filter(
  (file) => !baseline.has(file) && codeFilePattern.test(file) && existsSync(join(root, file)),
);
rmSync(statePath, { force: true });

if (files.length === 0) {
  process.stdout.write(JSON.stringify({ continue: true }));
  process.exit(0);
}

const formatted = runBiome(root, "format", ["--write", ...files]);
const fixed = runBiome(root, "lint", ["--write", ...files]);
const checked = runBiome(root, "check", files);

process.stdout.write(
  JSON.stringify({
    continue: true,
    ...(formatted && fixed && checked
      ? {}
      : {
          systemMessage:
            "Biome left diagnostics after safe automatic fixes; review the hook output before handoff.",
        }),
  }),
);

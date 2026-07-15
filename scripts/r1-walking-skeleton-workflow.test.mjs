import { deepStrictEqual, match, notStrictEqual, strictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflowUrl = new URL("../.github/workflows/r1-walking-skeleton.yml", import.meta.url);
const attributesUrl = new URL("../.gitattributes", import.meta.url);
const smokeUrl = new URL("./smoke-standalone.mjs", import.meta.url);
const expectedPaths = [
  ".github/workflows/r1-walking-skeleton.yml",
  ".gitattributes",
  ".markdownlint-cli2.jsonc",
  ".markdownlint-cli2.mjs",
  "biome.json",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "scripts/r1-walking-skeleton-workflow.test.mjs",
  "scripts/smoke-standalone.mjs",
  "apps/eden/**",
  "packages/coding-runtime/**",
  "packages/contracts/**",
  "packages/kernel/**",
];

test("keeps repository text checkouts LF-normalized on every runner", async () => {
  strictEqual(await readFile(attributesUrl, "utf8"), "* text=auto eol=lf\n");
});

function readEventList(source, eventName, key) {
  const lines = source.split(/\r?\n/u);
  const eventStart = lines.indexOf(`  ${eventName}:`);
  notStrictEqual(eventStart, -1);
  const listStart = lines.indexOf(`    ${key}:`, eventStart);
  notStrictEqual(listStart, -1);
  const values = [];

  for (const line of lines.slice(listStart + 1)) {
    if (!line.startsWith("      - ")) {
      break;
    }
    values.push(JSON.parse(line.slice(8)));
  }

  return values;
}

test("limits automatic runs to the R1 standalone dependency closure", async () => {
  // Given: the repository-owned R1 walking-skeleton workflow.
  const workflow = await readFile(workflowUrl, "utf8");

  // When and Then: pull requests and main pushes use the same frozen path boundary.
  deepStrictEqual(readEventList(workflow, "pull_request", "paths"), expectedPaths);
  deepStrictEqual(readEventList(workflow, "push", "paths"), expectedPaths);
});

test("R1 workflow freezes the cross-platform standalone evidence contract", async () => {
  // Given: the repository-owned R1 walking-skeleton workflow.
  const workflow = await readFile(workflowUrl, "utf8");

  // When and Then: every required clean-machine lane and proof step is explicit.
  match(workflow, /os: \[ubuntu-latest, windows-latest, macos-latest\]/u);
  match(workflow, /oven-sh\/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6/u);
  match(workflow, /bun-version: 1\.3\.14/u);
  match(workflow, /pnpm install --frozen-lockfile/u);
  match(workflow, /chmod \+x node_modules\/\.pnpm\/node-pty@1\.1\.0/u);
  match(workflow, /pnpm test/u);
  match(workflow, /pnpm typecheck/u);
  match(workflow, /pnpm build/u);
  match(workflow, /pnpm --filter @eden\/cli package:bun/u);
  match(workflow, /scripts\/smoke-standalone\.mjs/u);
  match(workflow, /actions\/upload-artifact@v4/u);
  strictEqual(/^\s+version:/mu.test(workflow), false);
  strictEqual(workflow.includes("terminal-framework"), false);
});

test("standalone smoke freezes onboarding and explicit trust evidence", async () => {
  const smoke = await readFile(smokeUrl, "utf8");

  match(smoke, /--trust-workspace/u);
  match(smoke, /workspace_trust_required/u);
  match(smoke, /approval_required/u);
  match(smoke, /invalid_arguments/u);
  match(smoke, /malformed trust record/u);
  match(smoke, /journal\.jsonl/u);
  match(smoke, /workspace-trust/u);
  match(smoke, /unavailable-state/u);
});

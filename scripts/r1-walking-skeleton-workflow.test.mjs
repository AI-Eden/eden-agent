import { deepStrictEqual, match, notStrictEqual, strictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflowUrl = new URL("../.github/workflows/r1-walking-skeleton.yml", import.meta.url);
const expectedPaths = [
  ".github/workflows/r1-walking-skeleton.yml",
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
  match(workflow, /pnpm install --frozen-lockfile/u);
  match(workflow, /pnpm test/u);
  match(workflow, /pnpm typecheck/u);
  match(workflow, /pnpm build/u);
  match(workflow, /pnpm --filter @eden\/cli package:bun/u);
  match(workflow, /scripts\/smoke-standalone\.mjs/u);
  match(workflow, /actions\/upload-artifact@v4/u);
  strictEqual(workflow.includes("terminal-framework"), false);
});

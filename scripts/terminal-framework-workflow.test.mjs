import { deepStrictEqual, match, notStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workflowSource = readFileSync(
  join(repositoryRoot, ".github", "workflows", "terminal-framework-spike.yml"),
  "utf8",
);
const expectedPaths = [
  ".github/workflows/terminal-framework-spike.yml",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "scripts/terminal-framework-workflow.test.mjs",
  "spikes/terminal-framework/**",
  "!spikes/terminal-framework/results/**",
  "spikes/terminal-framework/results/result.schema.json",
];

function readEventList(eventName, key) {
  const lines = workflowSource.split("\n");
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

test("limits automatic terminal-framework runs to spike inputs", () => {
  deepStrictEqual(readEventList("pull_request", "paths"), expectedPaths);
  deepStrictEqual(readEventList("push", "paths"), expectedPaths);
});

test("limits automatic terminal-framework pushes to branches", () => {
  deepStrictEqual(readEventList("push", "branches"), ["**"]);
});

test("keeps manual terminal-framework runs available", () => {
  match(workflowSource, /^ {2}workflow_dispatch:$/m);
});

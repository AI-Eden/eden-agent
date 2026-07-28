import { deepStrictEqual, match, strictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflowUrl = new URL("../.github/workflows/r2-acceptance.yml", import.meta.url);
const packageUrl = new URL("../package.json", import.meta.url);

test("R2 acceptance owns named local gates and the three-platform packaged matrix", async () => {
  const [workflow, packageSource] = await Promise.all([
    readFile(workflowUrl, "utf8"),
    readFile(packageUrl, "utf8"),
  ]);
  const scripts = JSON.parse(packageSource).scripts;

  deepStrictEqual(
    [
      "test:r2-budgets",
      "test:r2-native-archive",
      "test:r2-process",
      "test:r2-provider-fixtures",
      "test:r2-safe-actuation",
      "test:r2-secret-canaries",
      "test:r2-tui-pty",
    ].filter((name) => typeof scripts[name] !== "string"),
    [],
  );
  strictEqual(
    scripts["test:r2-native-archive"],
    "node scripts/r2-native-tools-archive.mjs apps/eden/dist",
  );
  match(workflow, /os: \[ubuntu-latest, windows-latest, macos-latest\]/u);
  match(workflow, /pnpm install --frozen-lockfile/u);
  match(workflow, /pnpm test:r2-process/u);
  match(workflow, /pnpm test:r2-provider-fixtures/u);
  match(workflow, /pnpm test:r2-secret-canaries/u);
  match(workflow, /pnpm test:r2-safe-actuation/u);
  match(workflow, /pnpm test:r2-budgets/u);
  match(workflow, /pnpm test:r2-native-archive/u);
  match(workflow, /scripts\/r2-safe-actuation-acceptance\.mjs/u);
  match(workflow, /r2-evidence\/safe-actuation\.json \$\{\{ github\.sha \}\}/u);
  match(workflow, /scripts\/smoke-standalone\.mjs/u);
  match(workflow, /scripts\/r1-production-pty\.mjs/u);
  match(
    workflow,
    /scripts\/smoke-standalone\.mjs "\$artifact" r2-evidence\/production-pty\/standalone\.json/u,
  );
  match(workflow, /scripts\/r2-tui-pty\.mjs/u);
  match(workflow, /\$\{\{ github\.sha \}\} --functional-only/u);
  match(workflow, /\$\{\{ github\.sha \}\}/u);
  match(workflow, /apps\/eden\/dist\/rg\*/u);
  match(workflow, /THIRD_PARTY_NOTICES\.txt/u);
  match(workflow, /actions\/upload-artifact@v4/u);
  strictEqual(workflow.includes("DEEPSEEK"), false);
  strictEqual(workflow.includes("KIMI"), false);
});

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
      "test:r2-docker-contracts",
      "test:r2-docker-evidence",
      "test:r2-docker-fixture",
      "test:r2-docker-recovery",
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
  strictEqual(scripts["test:r2-tui-pty"], "node scripts/r2-tui-pty.mjs --self-test");
  match(workflow, /os: \[ubuntu-latest, windows-latest, macos-latest\]/u);
  match(workflow, /pnpm install --frozen-lockfile/u);
  match(workflow, /pnpm test:r2-process/u);
  match(workflow, /pnpm test:r2-provider-fixtures/u);
  match(workflow, /pnpm test:r2-secret-canaries/u);
  match(workflow, /pnpm test:r2-safe-actuation/u);
  match(workflow, /pnpm test:r2-budgets/u);
  match(workflow, /ubuntu-docker-repository-check:/u);
  match(
    workflow,
    /if: github\.event_name != 'pull_request' \|\| github\.event\.pull_request\.head\.repo\.full_name == github\.repository/u,
  );
  strictEqual((workflow.match(/packages: read/gu) ?? []).length, 1);
  match(
    workflow,
    /ubuntu-docker-repository-check:\n {4}if:.*\n {4}permissions:\n {6}contents: read\n {6}packages: read/u,
  );
  match(workflow, /pnpm test:r2-docker-contracts/u);
  match(workflow, /pnpm test:r2-docker-fixture/u);
  match(workflow, /pnpm test:r2-docker-recovery/u);
  match(workflow, /pnpm test:r2-docker-evidence/u);
  match(workflow, /--userns-remap "\$r2_user"/u);
  match(workflow, /--userland-proxy=false/u);
  match(workflow, /ghcr\.io\/ai-eden\/eden-node24-check@sha256:8421694e/u);
  match(workflow, /scripts\/r2-docker-repository-check-acceptance\.mjs/u);
  match(workflow, /docker-repository-check\.json/u);
  match(workflow, /process\.env\.GITHUB_SHA/u);
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

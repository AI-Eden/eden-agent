import { deepStrictEqual, match, notStrictEqual, strictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const workflowUrl = new URL("../.github/workflows/r1-walking-skeleton.yml", import.meta.url);
const attributesUrl = new URL("../.gitattributes", import.meta.url);
const smokeUrl = new URL("./smoke-standalone.mjs", import.meta.url);
const productionPtyUrl = new URL("./r1-production-pty.mjs", import.meta.url);
const readmeUrl = new URL("../README.md", import.meta.url);
const contextUrl = new URL("../CONTEXT.md", import.meta.url);
const specUrl = new URL("../SPEC.md", import.meta.url);
const architectureUrl = new URL("../docs/architecture.md", import.meta.url);
const eventModelUrl = new URL("../docs/event-model.md", import.meta.url);
const threatModelUrl = new URL("../docs/threat-model.md", import.meta.url);
const fakeModelAdrUrl = new URL(
  "../docs/adr/0011-r1-deterministic-fake-model-step.md",
  import.meta.url,
);
const trustStartAdrUrl = new URL(
  "../docs/adr/0012-linearize-workspace-trust-and-run-start.md",
  import.meta.url,
);
const futureWorkUrl = new URL(
  "../docs/future-works/adversarial-local-state-filesystem-hardening.md",
  import.meta.url,
);
const fakeTaskPlanUrl = new URL(
  "../docs/plans/2026-07-15-r1-fake-task-vertical-slice.md",
  import.meta.url,
);
const trustPlanUrl = new URL(
  "../docs/plans/2026-07-15-r1-onboarding-workspace-trust.md",
  import.meta.url,
);
const historyPlanUrl = new URL(
  "../docs/plans/2026-07-16-r1-run-history-read-only-review.md",
  import.meta.url,
);
const expectedPaths = [
  ".github/workflows/r1-walking-skeleton.yml",
  ".gitattributes",
  ".markdownlint-cli2.jsonc",
  ".markdownlint-cli2.mjs",
  "biome.json",
  "CONTEXT.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "PRODUCT.md",
  "README.md",
  "SPEC.md",
  "tsconfig.base.json",
  "docs/**",
  "scripts/r1-production-pty.mjs",
  "scripts/r1-walking-skeleton-workflow.test.mjs",
  "scripts/smoke-standalone.mjs",
  "apps/eden/**",
  "packages/coding-runtime/**",
  "packages/contracts/**",
  "packages/kernel/**",
  "packages/providers/**",
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
  match(workflow, /scripts\/r1-production-pty\.mjs/u);
  match(workflow, /workflow_dispatch:/u);
  match(workflow, /r1-evidence/u);
  match(workflow, /EDEN_TUI_CAPTURE_DIR/u);
  match(workflow, /r1-evidence\/renderer\/\*\.txt/u);
  match(workflow, /manifest\.json/u);
  match(workflow, /actions\/upload-artifact@v4/u);
  strictEqual(/^\s+version:/mu.test(workflow), false);
  strictEqual(workflow.includes("terminal-framework"), false);
});

test("standalone smoke freezes trust, history, corruption, and isolation evidence", async () => {
  const smoke = await readFile(smokeUrl, "utf8");

  match(smoke, /--trust-workspace/u);
  match(smoke, /workspace_trust_required/u);
  match(smoke, /approval_required/u);
  match(smoke, /invalid_arguments/u);
  match(smoke, /malformed trust record/u);
  match(smoke, /journal\.jsonl/u);
  match(smoke, /workspace-trust/u);
  match(smoke, /unavailable-state/u);
  match(smoke, /decodeRunCatalog/u);
  match(smoke, /decodeRunInspection/u);
  match(smoke, /run_history_unavailable/u);
  match(smoke, /other-workspace/u);
  match(smoke, /Run list\/show changed trust or journal bytes/u);
  match(smoke, /fake\.model\.completed/u);
  match(smoke, /run_history_budget_exceeded/u);
  match(smoke, /Restricted execution created a state inode/u);
  match(smoke, /Missing-state history created an inode/u);
  match(smoke, /standalone\.json/u);
});

test("production PTY emits the frozen manifest and rejects missing required rows", async () => {
  const productionPty = await readFile(productionPtyUrl, "utf8");

  match(productionPty, /artifactSha256/u);
  match(productionPty, /decodedCounts/u);
  match(productionPty, /exitTable/u);
  match(productionPty, /60x20/u);
  match(productionPty, /100x30/u);
  match(productionPty, /terminalRestoration/u);
  match(productionPty, /shellSentinel/u);
  match(productionPty, /not-run/u);
  match(productionPty, /Required evidence row did not pass/u);
  match(productionPty, /terminatePtyProcessGroup/u);
  match(productionPty, /shouldUseBundledConpty/u);
  match(productionPty, /waitForScreenText\(session, "Enter submits"\)/u);
  match(productionPty, /waitForScreenText\(session, "Complete the production PTY fake task"\)/u);
  match(productionPty, /process\.exit\(0\)/u);
  strictEqual(productionPty.includes("taskkill.exe"), false);
});

test("public Quickstart names the live R1 artifact without release or resume claims", async () => {
  const readme = await readFile(readmeUrl, "utf8");

  match(readme, /roadmap stage R1/u);
  match(readme, /pnpm install --frozen-lockfile/u);
  match(readme, /pnpm --filter @eden\/cli package:bun/u);
  match(readme, /eden run list --json/u);
  match(readme, /eden run show --json run-<id-from-list>/u);
  match(readme, /read-only history/u);
  strictEqual(readme.includes("architecture-first scaffold at roadmap stage R0"), false);
  strictEqual(readme.includes("package-manager release or installer"), true);
});

test("R1 source documents freeze model causality and fresh start authority", async () => {
  const [architecture, eventModel, fakeModelAdr, trustStartAdr] = await Promise.all([
    readFile(architectureUrl, "utf8"),
    readFile(eventModelUrl, "utf8"),
    readFile(fakeModelAdrUrl, "utf8"),
    readFile(trustStartAdrUrl, "utf8"),
  ]);

  match(architecture, /validated fake-model observation creates the action proposal/u);
  match(eventModel, /run\.started[^\n]*contains no action/u);
  match(fakeModelAdr, /Approval cannot become visible before/u);
  match(fakeModelAdr, /runtime-owned action/u);
  match(trustStartAdr, /Trust review caches are presentation hints/u);
  match(trustStartAdr, /workspace_state_busy/u);
  match(trustStartAdr, /run\.started[^\n]*durable/u);
});

test("accepted R1 and frozen R2 status documents remain honest", async () => {
  const [context, spec, threatModel, futureWork] = await Promise.all([
    readFile(contextUrl, "utf8"),
    readFile(specUrl, "utf8"),
    readFile(threatModelUrl, "utf8"),
    readFile(futureWorkUrl, "utf8"),
  ]);

  match(context, /R0 and R1 are complete/u);
  match(context, /owner accepted the R1 exit on 2026-07-17/iu);
  match(context, /owner approved its public decision brief, ADR 0013, ADR 0014/iu);
  match(spec, /R1 completed with owner acceptance on 2026-07-17/u);
  match(spec, /owner approved the R2 first-slice decision brief, ADR 0013, ADR 0014/iu);
  match(spec, /The contract below is frozen/u);
  strictEqual(spec.includes("Draft for R0"), false);
  match(threatModel, /512/u);
  match(threatModel, /1 MiB/u);
  match(threatModel, /hardlink/u);
  match(threatModel, /does not claim resistance to malicious same-user/u);
  match(futureWork, /deferred/u);
  match(futureWork, /descriptor-relative/u);
  strictEqual(context.includes("R1 exit acceptance remains pending"), false);
  strictEqual(spec.includes("R1 exit candidate work"), false);
});

test("accepted R1 slice plans contain no pending owner checkpoint", async () => {
  for (const plan of await Promise.all(
    [fakeTaskPlanUrl, trustPlanUrl, historyPlanUrl].map((url) => readFile(url, "utf8")),
  )) {
    match(plan, /Status: Accepted/u);
    strictEqual(/pending this slice review|Final slice review, pending/u.test(plan), false);
  }
});

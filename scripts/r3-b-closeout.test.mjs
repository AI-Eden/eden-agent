import { match, strictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const finalEvidenceSourceSha = "381b2f404b4f38397831f8193f7dced8efd20ea1";

const currentStatusUrls = [
  new URL("../CONTEXT.md", import.meta.url),
  new URL("../PRODUCT.md", import.meta.url),
  new URL("../SPEC.md", import.meta.url),
  new URL("../docs/adr/0020-r3-b-conversation-spine-and-typed-intervention.md", import.meta.url),
  new URL("../docs/plans/2026-08-10-r3-resume-ready-verified-goal.md", import.meta.url),
  new URL("../docs/plans/2026-08-11-r3-b-terminal-product-shell.md", import.meta.url),
];
const evidenceUrl = new URL(
  "../docs/benchmark-results/2026-08-12-r3-b-repair-packaged-tui-local.json",
  import.meta.url,
);
const reviewUrl = new URL("../docs/evidence/r3-b-milestone-review/review.md", import.meta.url);

test("R3-B matching-surface repair closes against exact copied-package evidence", async () => {
  const evidence = JSON.parse(await readFile(evidenceUrl, "utf8"));
  const review = await readFile(reviewUrl, "utf8");
  const currentStatuses = await Promise.all(
    currentStatusUrls.map(async (url) => await readFile(url, "utf8")),
  );

  strictEqual(evidence.milestone, "R3-B");
  strictEqual(evidence.sourceSha, finalEvidenceSourceSha);
  strictEqual(evidence.status, "passed");
  strictEqual(evidence.provider.externalNetwork, false);
  strictEqual(evidence.provider.secretCanaryExposed, false);
  strictEqual(evidence.verifierSuccessClaimed, false);
  strictEqual(evidence.journeys.length, 3);

  for (const journey of evidence.journeys) {
    strictEqual(journey.status, "passed");
    strictEqual(journey.trustTaskFocus, "direct");
    strictEqual(journey.readinessFeedback, "checking_then_completion_ready");
    strictEqual(journey.activeInput.acceptedCount, 2);
    strictEqual(journey.activeInput.cjkMultiline, true);
    strictEqual(journey.activeInput.pending, 0);
    strictEqual(journey.activeInput.sources.join(","), "steer,queue");
    strictEqual(journey.budget.modelSteps, 8);
    strictEqual(journey.budget.toolCalls, 6);
    strictEqual(journey.budget.actionProposals, 3);
    strictEqual(journey.exitCode, 0);
    strictEqual(journey.terminalRestoration, "restored");
  }

  match(review, /R3-B is owner-accepted and closed/u);
  match(review, new RegExp(finalEvidenceSourceSha, "u"));
  match(review, /31590345318/u);
  match(review, /31590345277/u);
  match(review, /explicitly bounded residual failure/u);
  match(review, /R3-C remains not started/u);

  for (const status of currentStatuses) {
    match(status, /matching-surface repair amendment/u);
    match(status, /R3-B is owner-accepted and closed/u);
    match(status, new RegExp(finalEvidenceSourceSha, "u"));
    strictEqual(status.includes("R3-B owner milestone review remains pending"), false);
    strictEqual(status.includes("R3-B closeout is reopened only for that repair"), false);
  }
});

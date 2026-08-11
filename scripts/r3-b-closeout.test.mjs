import { match, strictEqual } from "node:assert";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const finalEvidenceSourceSha = "f98e8b3d87b530d46aa7e33664290a02a75ad1a5";

const currentStatusUrls = [
  new URL("../CONTEXT.md", import.meta.url),
  new URL("../PRODUCT.md", import.meta.url),
  new URL("../SPEC.md", import.meta.url),
  new URL("../docs/adr/0020-r3-b-conversation-spine-and-typed-intervention.md", import.meta.url),
  new URL("../docs/plans/2026-08-10-r3-resume-ready-verified-goal.md", import.meta.url),
  new URL("../docs/plans/2026-08-11-r3-b-terminal-product-shell.md", import.meta.url),
];
const evidenceUrl = new URL(
  "../docs/benchmark-results/2026-08-11-r3-b-packaged-tui-local.json",
  import.meta.url,
);
const reviewUrl = new URL("../docs/evidence/r3-b-milestone-review/review.md", import.meta.url);

test("R3-B closeout stays bound to final-source evidence and owner review", async () => {
  const evidence = JSON.parse(await readFile(evidenceUrl, "utf8"));
  const review = await readFile(reviewUrl, "utf8");
  const currentStatuses = await Promise.all(
    currentStatusUrls.map(async (url) => await readFile(url, "utf8")),
  );

  strictEqual(evidence.milestone, "R3-B");
  strictEqual(evidence.sourceSha, finalEvidenceSourceSha);
  strictEqual(evidence.status, "passed");
  strictEqual(evidence.provider.externalNetwork, false);
  strictEqual(evidence.verifierSuccessClaimed, false);

  match(review, /R3-B is owner-accepted and closed/u);
  match(review, new RegExp(finalEvidenceSourceSha, "u"));
  match(review, /R3-C remains not started/u);

  for (const status of currentStatuses) {
    match(status, /R3-B is owner-accepted and closed/u);
    strictEqual(status.includes("R3-B owner milestone review remains pending"), false);
  }
});

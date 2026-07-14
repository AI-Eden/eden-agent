import { match, strictEqual } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const reportPath = join(repositoryRoot, "docs", "research", "terminal-framework-spike.md");

test("terminal framework evidence report contains every decision input", () => {
  // Given the approved Slice 7 report location and completeness contract.
  strictEqual(existsSync(reportPath), true, `Missing evidence report: ${reportPath}`);
  const report = readFileSync(reportPath, "utf8");

  // When the report is reviewed from a clean checkout.
  const requiredSections = [
    "Recommendation",
    "Baseline and candidate versions",
    "Environment matrix",
    "Reproduction commands",
    "Failures and not-run evidence",
    "Hard-gate verdicts",
    "Weighted scores",
    "Runtime comparison",
    "Renderer comparison",
    "Residual risks",
    "Decision checkpoint",
  ];

  // Then every required evidence and decision section is present.
  for (const section of requiredSections) {
    match(report, new RegExp(`^## ${section}$`, "mu"), `Missing report section: ${section}`);
  }
  for (const candidate of ["Ink/Node", "Ink/Bun", "OpenTUI/Bun"]) {
    match(report, new RegExp(candidate, "u"), `Missing candidate: ${candidate}`);
  }
  match(report, /baseline commit: `[a-f0-9]{40}`/u);
  match(report, /Node 24\.15\.0/u);
  match(report, /Bun 1\.3\.14/u);
  match(report, /Ink 7\.1\.0/u);
  match(report, /OpenTUI 0\.4\.3/u);
  match(report, /`not-run`/u);
  match(report, /select OpenTUI\/Bun/u);
  match(report, /select Ink\/Bun/u);
  match(report, /select Ink\/Node/u);
  match(report, /extend the spike/u);
  match(report, /reject or defer all combinations/u);
});

import { deepStrictEqual } from "node:assert";
import { test } from "node:test";

import {
  generateLargeDiff,
  generateLargeOutput,
  serializeFixtureManifest,
  terminalSizePresets,
  terminalSpikeFixture,
} from "../src/fixture.ts";

test("approval fixture preserves the canonical action when inspected", () => {
  // Given: the worked approval example frozen in the approved R0 plan.
  const canonicalAction = {
    command: "pnpm --filter @eden/kernel test",
    cwd: ".",
    reason: "Run the required kernel transition checks.",
    scope: "workspace tests only",
  } as const;

  // When: a renderer reads the action from the shared fixture.
  const renderedAction = terminalSpikeFixture.approval;

  // Then: every renderer receives the exact action representation.
  deepStrictEqual(renderedAction, canonicalAction);
});

test("session fixture exposes workspace trust phase network and budget context", () => {
  // Given: the product context required by the approved terminal journey.
  const expectedSession = {
    budget: { limit: 20, unit: "steps", used: 12 },
    model: "fake-model",
    network: "blocked",
    phase: "review",
    profile: "build",
    workspace: { name: "eden-agent", root: ".", trustMode: "workspace" },
  } as const;

  // When: a renderer reads the shared session context.
  const session = terminalSpikeFixture.session;

  // Then: every candidate receives the same non-secret product context.
  deepStrictEqual(session, expectedSession);
});

test("progress fixture exposes one running action and an attributable timeline", () => {
  // Given: the progress information required by the approved terminal journey.
  const expectedProgress = {
    runningAction: "Run the required kernel transition checks.",
    timeline: [
      { label: "Plan approved", status: "complete" },
      { label: "Fixture prepared", status: "complete" },
      { label: "Kernel checks", status: "running" },
    ],
  } as const;

  // When: a renderer reads the shared progress context.
  const progress = terminalSpikeFixture.progress;

  // Then: every candidate receives the same running action and timeline.
  deepStrictEqual(progress, expectedProgress);
});

test("review fixture keeps changed files diff checks and recovery attributable", () => {
  // Given: the review evidence required by the approved terminal journey.
  const expectedReview = {
    changedFiles: [{ path: "packages/kernel/src/index.ts", status: "modified" }],
    checks: [
      { id: "unit", status: "passed", summary: "Kernel transition tests passed." },
      {
        id: "typecheck",
        recovery: "Open failure details and rerun the required check.",
        status: "failed",
        summary: "RunState transition is not exhaustive.",
      },
    ],
    diff: [
      "diff --git a/packages/kernel/src/index.ts b/packages/kernel/src/index.ts",
      "@@ -1,1 +1,1 @@",
      "-export const state = 'running';",
      "+export const state = 'review';",
    ].join("\n"),
  } as const;

  // When: a renderer reads the shared review evidence.
  const review = terminalSpikeFixture.review;

  // Then: every candidate receives one attributable review bundle.
  deepStrictEqual(review, expectedReview);
});

test("composer fixture starts empty without hidden task text", () => {
  // Given: the approved empty task-composer initial state.
  const expectedComposer = { draft: "" } as const;

  // When: a renderer reads the shared composer state.
  const composer = terminalSpikeFixture.composer;

  // Then: every candidate starts from the same empty draft.
  deepStrictEqual(composer, expectedComposer);
});

test("serialized fixture manifest is identifiable and contains no secret or completion claim", () => {
  // Given: the redaction boundary required by the approved fixture acceptance check.
  const forbiddenText = ["sk-", "/home/", "raw reasoning", "succeeded"] as const;

  // When: the fixture is serialized for inspection.
  const manifest = serializeFixtureManifest();

  // Then: it identifies the fixture without exposing forbidden content.
  deepStrictEqual(
    {
      forbiddenTextPresent: forbiddenText.some((text) => manifest.includes(text)),
      hasFixtureId: manifest.includes("terminal-spike-r0-v1"),
    },
    { forbiddenTextPresent: false, hasFixtureId: true },
  );
});

test("terminal size presets preserve the approved narrow medium and wide surfaces", () => {
  // Given: the three terminal surfaces fixed by the approved spike plan.
  const expectedSizes = [
    { columns: 60, id: "narrow", rows: 20 },
    { columns: 100, id: "medium", rows: 30 },
    { columns: 160, id: "wide", rows: 45 },
  ] as const;

  // When: a candidate requests the shared terminal sizes.
  const candidateSizes = terminalSizePresets;

  // Then: every candidate exercises exactly the same three surfaces.
  deepStrictEqual(candidateSizes, expectedSizes);
});

test("large output is deterministic and meets the approved stress floor", () => {
  // Given: the fixed seed and 10,000-line output floor from the approved plan.
  const oneMiB = 1_048_576;

  // When: the shared large-output fixture is generated twice.
  const first = generateLargeOutput();
  const second = generateLargeOutput();

  // Then: both results are identical and carry the required marker and metadata.
  deepStrictEqual(first, second);
  deepStrictEqual(
    {
      byteFloorMet: first.byteCount >= oneMiB,
      hasLastMarker: first.text.includes("output-09999"),
      lineCount: first.lineCount,
      marker: first.marker,
      seed: first.seed,
    },
    {
      byteFloorMet: true,
      hasLastMarker: true,
      lineCount: 10_000,
      marker: "output-09999",
      seed: 7705,
    },
  );
});

test("large diff is deterministic and meets the approved file and line floors", () => {
  // Given: the fixed seed, 20-file floor, and 2,000 changed-line floor.
  const expectedMetadata = {
    changedLineCount: 2_000,
    fileCount: 20,
    hasLastFile: true,
    marker: "synthetic/file-20.ts",
    seed: 7705,
  } as const;

  // When: the shared large-diff fixture is generated twice.
  const first = generateLargeDiff();
  const second = generateLargeDiff();

  // Then: both results are identical and carry the required marker and metadata.
  deepStrictEqual(first, second);
  deepStrictEqual(
    {
      changedLineCount: first.changedLineCount,
      fileCount: first.fileCount,
      hasLastFile: first.text.includes("diff --git a/synthetic/file-20.ts"),
      marker: first.marker,
      seed: first.seed,
    },
    expectedMetadata,
  );
});

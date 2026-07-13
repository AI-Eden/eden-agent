export const terminalSpikeFixture = {
  approval: {
    command: "pnpm --filter @eden/kernel test",
    cwd: ".",
    reason: "Run the required kernel transition checks.",
    scope: "workspace tests only",
  },
  composer: { draft: "" },
  fixtureId: "terminal-spike-r0-v1",
  progress: {
    runningAction: "Run the required kernel transition checks.",
    timeline: [
      { label: "Plan approved", status: "complete" },
      { label: "Fixture prepared", status: "complete" },
      { label: "Kernel checks", status: "running" },
    ],
  },
  review: {
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
  },
  session: {
    budget: { limit: 20, unit: "steps", used: 12 },
    model: "fake-model",
    network: "blocked",
    phase: "review",
    profile: "build",
    workspace: { name: "eden-agent", root: ".", trustMode: "workspace" },
  },
} as const;

export const terminalSizePresets = [
  { columns: 60, id: "narrow", rows: 20 },
  { columns: 100, id: "medium", rows: 30 },
  { columns: 160, id: "wide", rows: 45 },
] as const;

export type StressText = {
  readonly byteCount: number;
  readonly lineCount: number;
  readonly marker: string;
  readonly seed: number;
  readonly text: string;
};

const outputSeed = 7705;
const outputPayload = `terminal-payload-${"0123456789abcdef".repeat(7)}`;
const outputLines = Array.from({ length: 10_000 }, (_, index) => {
  const marker = `output-${String(index).padStart(5, "0")}`;
  return `${marker} | seed=${outputSeed} | ${outputPayload}`;
});
const outputText = outputLines.join("\n");
const largeOutput = {
  byteCount: new TextEncoder().encode(outputText).byteLength,
  lineCount: outputLines.length,
  marker: "output-09999",
  seed: outputSeed,
  text: outputText,
} satisfies StressText;

export function generateLargeOutput(): StressText {
  return largeOutput;
}

export type StressDiff = {
  readonly changedLineCount: number;
  readonly fileCount: number;
  readonly marker: string;
  readonly seed: number;
  readonly text: string;
};

const diffSeed = 7705;
const diffFileCount = 20;
const replacementsPerFile = 50;
const diffFiles = Array.from({ length: diffFileCount }, (_, fileOffset) => {
  const fileIndex = fileOffset + 1;
  const filePath = `synthetic/file-${String(fileIndex).padStart(2, "0")}.ts`;
  const changedLines = Array.from({ length: replacementsPerFile }, (_, lineOffset) => {
    const value = (diffSeed + fileIndex * 101 + lineOffset * 17) % 100_000;
    return `-export const value${lineOffset} = ${value};\n+export const value${lineOffset} = ${value + 1};`;
  });
  return [
    `diff --git a/${filePath} b/${filePath}`,
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
    `@@ -1,${replacementsPerFile} +1,${replacementsPerFile} @@`,
    ...changedLines,
  ].join("\n");
});
const largeDiff = {
  changedLineCount: diffFileCount * replacementsPerFile * 2,
  fileCount: diffFileCount,
  marker: "synthetic/file-20.ts",
  seed: diffSeed,
  text: diffFiles.join("\n"),
} satisfies StressDiff;

export function generateLargeDiff(): StressDiff {
  return largeDiff;
}

export function serializeFixtureManifest(): string {
  return JSON.stringify(terminalSpikeFixture);
}

export const candidatePackageIds = ["ink-node", "ink-bun", "opentui-bun"] as const;

export const measurementVersions = {
  bun: "1.3.14",
  node: "v24.15.0",
  pnpm: "11.7.0",
} as const;

export const packagingVersions = {
  bun: "1.3.14",
  node: "v24.15.0",
  pnpm: "11.13.0",
} as const;

export type CandidatePackageId = (typeof candidatePackageIds)[number];

export type CandidatePackageConfig = {
  readonly entrypoint: string;
  readonly executableName: string;
  readonly id: CandidatePackageId;
  readonly nativeEmbedding: "none" | "opentui";
  readonly packageDirectory: string;
  readonly packageName: string;
  readonly runtime: "bun" | "node";
};

const inkDirectory = "spikes/terminal-framework/ink";

const packageConfigs: Record<CandidatePackageId, CandidatePackageConfig> = {
  "ink-bun": {
    entrypoint: "src/cli.tsx",
    executableName: "terminal-spike-ink",
    id: "ink-bun",
    nativeEmbedding: "none",
    packageDirectory: inkDirectory,
    packageName: "@eden/terminal-spike-ink",
    runtime: "bun",
  },
  "ink-node": {
    entrypoint: "src/cli.tsx",
    executableName: "terminal-spike-ink",
    id: "ink-node",
    nativeEmbedding: "none",
    packageDirectory: inkDirectory,
    packageName: "@eden/terminal-spike-ink",
    runtime: "node",
  },
  "opentui-bun": {
    entrypoint: "src/cli.tsx",
    executableName: "terminal-spike-opentui",
    id: "opentui-bun",
    nativeEmbedding: "opentui",
    packageDirectory: "spikes/terminal-framework/opentui",
    packageName: "@eden/terminal-spike-opentui",
    runtime: "bun",
  },
};

export function getCandidatePackageConfig(id: CandidatePackageId): CandidatePackageConfig {
  return packageConfigs[id];
}

export function parseCandidatePackageId(value: string | undefined): CandidatePackageId | null {
  switch (value) {
    case "ink-bun":
    case "ink-node":
    case "opentui-bun":
      return value;
    default:
      return null;
  }
}

import { cpus, hostname, release, totalmem } from "node:os";
import type { MeasurementOptions } from "./measurement-options.ts";
import { runPackageCommand } from "./package-command.ts";
import { expectedPackageVersions } from "./package-config.ts";

export type MeasurementEnvironment = {
  readonly arch: string;
  readonly cpuCount: number;
  readonly cpuModel: string;
  readonly hostLoadPolicy: string;
  readonly hostname: string;
  readonly locale: string;
  readonly osRelease: string;
  readonly platform: NodeJS.Platform;
  readonly runner: {
    readonly imageOs: string | null;
    readonly imageVersion: string | null;
    readonly name: string | null;
  };
  readonly shell: string;
  readonly terminalId: string;
  readonly totalMemoryBytes: number;
  readonly versions: {
    readonly bun: string;
    readonly node: string;
    readonly pnpm: string;
  };
};

export type MeasurementSource = {
  readonly commit: string;
  readonly dirty: boolean;
};

export class MeasurementEnvironmentError extends Error {
  readonly name = "MeasurementEnvironmentError";
}

export function captureMeasurementEnvironment(options: MeasurementOptions): MeasurementEnvironment {
  const processors = cpus();
  const firstProcessor = processors[0];
  if (firstProcessor === undefined) {
    throw new MeasurementEnvironmentError("CPU metadata is unavailable");
  }
  return {
    arch: process.arch,
    cpuCount: processors.length,
    cpuModel: firstProcessor.model,
    hostLoadPolicy: options.hostLoadPolicy,
    hostname: hostname(),
    locale: process.env.LC_ALL ?? process.env.LANG ?? "unavailable",
    osRelease: release(),
    platform: process.platform,
    runner: {
      imageOs: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
      name: process.env.RUNNER_NAME ?? null,
    },
    shell: process.env.SHELL ?? process.env.ComSpec ?? process.env.COMSPEC ?? "unavailable",
    terminalId: options.terminalId,
    totalMemoryBytes: totalmem(),
    versions: {
      bun: options.runtimeVersions.bun,
      node: options.runtimeVersions.node,
      pnpm: expectedPackageVersions.pnpm,
    },
  };
}

export function captureMeasurementSource(repoRoot: string): MeasurementSource {
  const commit = runPackageCommand("git", ["rev-parse", "HEAD"], repoRoot);
  const status = runPackageCommand("git", ["status", "--porcelain"], repoRoot);
  if (commit.exitCode !== 0 || status.exitCode !== 0) {
    throw new MeasurementEnvironmentError("Git source evidence is unavailable");
  }
  return { commit: commit.stdout.trim(), dirty: status.stdout.trim().length > 0 };
}

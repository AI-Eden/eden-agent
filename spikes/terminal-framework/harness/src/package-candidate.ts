import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cleanupPackageWorkspace,
  createPackageWorkspace,
  type PackageArtifact,
  type PackageOutput,
  packageBunExecutable,
  packageNodeTarball,
} from "./package-artifact.ts";
import { type PackageCommandResult, runPackageCommand, runPnpmCommand } from "./package-command.ts";
import {
  type CandidatePackageConfig,
  expectedPackageVersions,
  getCandidatePackageConfig,
  parseCandidatePackageId,
} from "./package-config.ts";
import { collectProductionDependencyGraph, type ProductionDependency } from "./package-evidence.ts";

type ToolVersions = {
  readonly bun: string;
  readonly node: string;
  readonly pnpm: string;
};

type SourceEvidence = {
  readonly commit: string;
  readonly dirty: boolean;
  readonly lockfileSha256: string;
};

type PackageResult = {
  readonly arch: string;
  readonly artifact: PackageArtifact | null;
  readonly candidateId: string;
  readonly commands: readonly PackageCommandResult[];
  readonly deployment: {
    readonly cleanSmoke: "failed" | "passed";
    readonly installedSizeBytes: number | null;
    readonly nativePackage: string | null;
    readonly productionDependencies: readonly ProductionDependency[];
    readonly productionDependencyCount: number;
  };
  readonly error: string | null;
  readonly platform: NodeJS.Platform;
  readonly runner: {
    readonly imageOs: string | null;
    readonly imageVersion: string | null;
    readonly name: string | null;
  };
  readonly schemaVersion: "1";
  readonly source: SourceEvidence;
  readonly status: "failed" | "passed";
  readonly versions: ToolVersions;
};

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function main(): Promise<void> {
  const candidateId = parseCandidatePackageId(
    process.argv.slice(2).find((argument) => argument !== "--"),
  );
  if (candidateId === null) {
    process.stderr.write("Usage: pnpm package -- <ink-node|ink-bun|opentui-bun>\n");
    process.exitCode = 2;
    return;
  }

  const config = getCandidatePackageConfig(candidateId);
  const workspace = await createPackageWorkspace(config);
  const packageDirectory = resolve(repoRoot, config.packageDirectory);
  const commands: PackageCommandResult[] = [];
  let artifact: PackageArtifact | null = null;
  let installedSizeBytes: number | null = null;
  let error: string | null = null;
  let versions: ToolVersions = {
    bun: "unavailable",
    node: process.version,
    pnpm: "unavailable",
  };
  let source: SourceEvidence = {
    commit: "unavailable",
    dirty: true,
    lockfileSha256: "unavailable",
  };
  let productionDependencies: readonly ProductionDependency[] = [];

  try {
    source = await readSourceEvidence(commands);
    requireSourceEvidence(source);
    versions = collectToolVersions(commands, packageDirectory);
    requireExpectedVersions(versions);
    productionDependencies = collectProductionDependencyGraph(
      commands,
      config.packageName,
      repoRoot,
    );
    const output: PackageOutput =
      config.runtime === "node"
        ? await packageNodeTarball(config, workspace, packageDirectory, commands)
        : await packageBunExecutable(config, workspace, packageDirectory, commands);
    artifact = output.artifact;
    installedSizeBytes = output.installedSizeBytes;
  } catch (cause: unknown) {
    error = cause instanceof Error ? cause.message : String(cause);
    process.exitCode = 1;
  }

  const result = createPackageResult(
    config,
    artifact,
    commands,
    error,
    installedSizeBytes,
    productionDependencies,
    source,
    versions,
  );
  await mkdir(dirname(workspace.resultPath), { recursive: true });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  try {
    await writeFile(workspace.resultPath, serialized, "utf8");
    await new Promise<void>((resolveOutput) => {
      process.stdout.write(serialized, () => resolveOutput());
    });
  } finally {
    await cleanupPackageWorkspace(workspace);
  }
}

function collectToolVersions(
  commands: PackageCommandResult[],
  packageDirectory: string,
): ToolVersions {
  return {
    bun: observePnpmOutput(commands, ["exec", "bun", "--version"], packageDirectory),
    node: process.version,
    pnpm: observePnpmOutput(commands, ["--version"], repoRoot),
  };
}

function observePnpmOutput(
  commands: PackageCommandResult[],
  arguments_: readonly string[],
  cwd: string,
): string {
  const result = runPnpmCommand(commands, arguments_, cwd);
  return result.exitCode === 0 ? result.stdout.trim() : "unavailable";
}

function requireExpectedVersions(versions: ToolVersions): void {
  for (const key of ["bun", "node", "pnpm"] as const) {
    if (versions[key] !== expectedPackageVersions[key]) {
      throw new Error(`Expected ${key} ${expectedPackageVersions[key]}, observed ${versions[key]}`);
    }
  }
}

function createPackageResult(
  config: CandidatePackageConfig,
  artifact: PackageArtifact | null,
  commands: PackageCommandResult[],
  error: string | null,
  installedSizeBytes: number | null,
  productionDependencies: readonly ProductionDependency[],
  source: SourceEvidence,
  versions: ToolVersions,
): PackageResult {
  return {
    arch: process.arch,
    artifact,
    candidateId: config.id,
    commands,
    deployment: {
      cleanSmoke: artifact === null ? "failed" : "passed",
      installedSizeBytes,
      nativePackage: resolveNativePackage(config),
      productionDependencies,
      productionDependencyCount: productionDependencies.length,
    },
    error,
    platform: process.platform,
    runner: {
      imageOs: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
      name: process.env.RUNNER_NAME ?? null,
    },
    schemaVersion: "1",
    source,
    status: error === null ? "passed" : "failed",
    versions,
  };
}

async function readSourceEvidence(commands: PackageCommandResult[]): Promise<SourceEvidence> {
  const commit = runPackageCommand("git", ["rev-parse", "HEAD"], repoRoot);
  const status = runPackageCommand("git", ["status", "--porcelain"], repoRoot);
  commands.push(commit, status);
  const lockfile = await readFile(resolve(repoRoot, "pnpm-lock.yaml"));
  return {
    commit: commit.exitCode === 0 ? commit.stdout.trim() : "unavailable",
    dirty: status.exitCode !== 0 || status.stdout.trim().length > 0,
    lockfileSha256: createHash("sha256").update(lockfile).digest("hex"),
  };
}

function requireSourceEvidence(source: SourceEvidence): void {
  if (source.commit === "unavailable" || source.lockfileSha256 === "unavailable") {
    throw new Error("Source commit and lockfile evidence are required before packaging");
  }
}

function resolveNativePackage(config: CandidatePackageConfig): string | null {
  if (config.nativeEmbedding === "none") {
    return null;
  }
  const platform = process.platform === "win32" ? "win32" : process.platform;
  return `@opentui/core-${platform}-${process.arch}`;
}

// node-pty 1.1.0 leaves its bundled-ConPTY worker ref'd after the PTY exits.
try {
  await main();
} catch (cause: unknown) {
  const error = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
  await new Promise<void>((resolveOutput) => {
    process.stderr.write(`${error}\n`, () => resolveOutput());
  });
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);

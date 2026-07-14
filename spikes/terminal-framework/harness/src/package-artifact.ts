import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  type PackageCommandResult,
  requirePackageCommand,
  requirePnpmCommand,
} from "./package-command.ts";
import { type CandidatePackageConfig, packagingVersions } from "./package-config.ts";
import { measureDirectorySize } from "./package-evidence.ts";
import { runInteractivePackageSmoke } from "./package-pty-smoke.ts";

export type PackageArtifact = {
  readonly kind: "executable" | "tarball";
  readonly path: string;
  readonly sha256: string;
  readonly sizeBytes: number;
};

export type PackageOutput = {
  readonly artifact: PackageArtifact;
  readonly installedSizeBytes: number;
};

export type PackageWorkspace = {
  readonly artifactDirectory: string;
  readonly resultPath: string;
  readonly workingDirectory: string;
};

export async function createPackageWorkspace(
  config: CandidatePackageConfig,
): Promise<PackageWorkspace> {
  const packageRoot =
    process.env.EDEN_PACKAGE_ARTIFACT_DIR ?? join(tmpdir(), "eden-terminal-packages");
  await mkdir(packageRoot, { recursive: true });
  const artifactDirectory = await mkdtemp(join(packageRoot, `${config.id}-`));
  const workingDirectory = await mkdtemp(join(tmpdir(), `eden-${config.id}-`));
  return {
    artifactDirectory,
    resultPath: join(artifactDirectory, "result.json"),
    workingDirectory,
  };
}

export async function cleanupPackageWorkspace(workspace: PackageWorkspace): Promise<void> {
  await rm(workspace.workingDirectory, { force: true, recursive: true });
}

export async function packageBunExecutable(
  config: CandidatePackageConfig,
  workspace: PackageWorkspace,
  packageDirectory: string,
  commands: PackageCommandResult[],
): Promise<PackageOutput> {
  const extension = process.platform === "win32" ? ".exe" : "";
  const outputPath = join(workspace.artifactDirectory, `${config.executableName}${extension}`);
  const arguments_ = ["exec", "bun", "build", "--compile", config.entrypoint];
  if (config.nativeEmbedding === "opentui" && process.platform === "linux") {
    arguments_.push("--define", 'process.env.OPENTUI_LIBC="glibc"');
  }
  arguments_.push("--outfile", outputPath);
  requirePnpmCommand(commands, arguments_, packageDirectory);
  const smokeDirectory = join(workspace.workingDirectory, "clean-smoke");
  await mkdir(smokeDirectory);
  await smokeArtifact(outputPath, [], smokeDirectory, commands);
  const artifact = await describePackageArtifact("executable", outputPath);
  return { artifact, installedSizeBytes: artifact.sizeBytes };
}

export async function packageNodeTarball(
  config: CandidatePackageConfig,
  workspace: PackageWorkspace,
  packageDirectory: string,
  commands: PackageCommandResult[],
): Promise<PackageOutput> {
  const stageDirectory = join(workspace.workingDirectory, "package");
  const bundlePath = join(stageDirectory, "dist", "cli.js");
  const binPath = join(stageDirectory, "bin", `${config.executableName}.js`);
  await mkdir(dirname(bundlePath), { recursive: true });
  await mkdir(dirname(binPath), { recursive: true });
  requirePnpmCommand(
    commands,
    ["exec", "bun", "build", config.entrypoint, "--target", "node", "--outfile", bundlePath],
    packageDirectory,
  );
  await writeFile(binPath, `#!/usr/bin/env node\nimport "../dist/cli.js";\n`, "utf8");
  await chmod(binPath, 0o755);
  await writeFile(
    join(stageDirectory, "package.json"),
    `${JSON.stringify(createNodePackageManifest(config), null, 2)}\n`,
    "utf8",
  );
  requirePnpmCommand(
    commands,
    ["pack", "--pack-destination", workspace.artifactDirectory],
    stageDirectory,
  );
  const tarballPath = await findOnlyTarball(workspace.artifactDirectory);
  const cleanProject = join(workspace.workingDirectory, "clean-node-project");
  await mkdir(cleanProject);
  await writeFile(
    join(cleanProject, "package.json"),
    `${JSON.stringify({
      name: "eden-package-smoke",
      packageManager: `pnpm@${packagingVersions.pnpm}`,
      private: true,
      type: "module",
    })}\n`,
    "utf8",
  );
  requirePnpmCommand(commands, ["add", tarballPath, "--prod", "--ignore-scripts"], cleanProject);
  const installedBin = join(
    cleanProject,
    "node_modules",
    "@eden",
    "terminal-spike-ink-node",
    "bin",
    `${config.executableName}.js`,
  );
  await smokeArtifact(process.execPath, [installedBin], cleanProject, commands);
  return {
    artifact: await describePackageArtifact("tarball", tarballPath),
    installedSizeBytes: await measureDirectorySize(cleanProject),
  };
}

async function describePackageArtifact(
  kind: PackageArtifact["kind"],
  path: string,
): Promise<PackageArtifact> {
  const content = await readFile(path);
  const metadata = await stat(path);
  return {
    kind,
    path,
    sha256: createHash("sha256").update(content).digest("hex"),
    sizeBytes: metadata.size,
  };
}

function createNodePackageManifest(config: CandidatePackageConfig): object {
  return {
    bin: { [config.executableName]: `bin/${config.executableName}.js` },
    engines: { node: "24.15.0" },
    name: "@eden/terminal-spike-ink-node",
    type: "module",
    version: "0.0.0",
  };
}

async function findOnlyTarball(directory: string): Promise<string> {
  const tarballs = (await readdir(directory)).filter((entry) => entry.endsWith(".tgz"));
  if (tarballs.length !== 1 || tarballs[0] === undefined) {
    throw new Error(`Expected one tarball in ${directory}, found ${tarballs.length}`);
  }
  return join(directory, basename(tarballs[0]));
}

async function smokeArtifact(
  command: string,
  prefixArguments: readonly string[],
  cwd: string,
  commands: PackageCommandResult[],
): Promise<void> {
  requirePackageCommand(commands, command, [...prefixArguments, "--help"], cwd);
  requirePackageCommand(commands, command, [...prefixArguments, "--invalid"], cwd, 2);
  const interactiveResult = await runInteractivePackageSmoke(command, prefixArguments, cwd);
  commands.push(interactiveResult);
  if (interactiveResult.exitCode !== 0 || !interactiveResult.stdout.includes("status: pending")) {
    throw new Error(
      `Packaged renderer smoke failed with exit ${interactiveResult.exitCode}\n${interactiveResult.stderr}`,
    );
  }
}

import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { capturePnpmCommand, type PackageCommandResult } from "./package-command.ts";

export type ProductionDependency = {
  readonly name: string;
  readonly version: string;
};

export function collectProductionDependencyGraph(
  commands: PackageCommandResult[],
  packageName: string,
  repoRoot: string,
): readonly ProductionDependency[] {
  const capture = capturePnpmCommand(
    commands,
    ["--filter", packageName, "list", "--prod", "--depth", "Infinity", "--json"],
    repoRoot,
  );
  if (capture.result.exitCode !== 0) {
    throw new Error(`Unable to resolve the production dependency graph for ${packageName}`);
  }
  const graph = parseProductionDependencyGraph(capture.stdout);
  if (graph.length === 0) {
    throw new Error(`Production dependency graph for ${packageName} is empty`);
  }
  return graph;
}

export function parseProductionDependencyGraph(output: string): readonly ProductionDependency[] {
  const parsed: unknown = JSON.parse(output);
  if (!Array.isArray(parsed)) {
    throw new Error("Expected pnpm list to return an array");
  }
  const dependencies = new Map<string, ProductionDependency>();
  for (const root of parsed) {
    visitDependencySet(readRecordField(root, "dependencies"), dependencies);
    visitDependencySet(readRecordField(root, "optionalDependencies"), dependencies);
  }
  return [...dependencies.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
  );
}

export async function measureDirectorySize(directory: string): Promise<number> {
  let sizeBytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      sizeBytes += await measureDirectorySize(path);
    } else {
      sizeBytes += (await lstat(path)).size;
    }
  }
  return sizeBytes;
}

function visitDependencySet(
  value: Record<string, unknown> | null,
  dependencies: Map<string, ProductionDependency>,
): void {
  if (value === null) {
    return;
  }
  for (const [name, dependency] of Object.entries(value)) {
    if (!isRecord(dependency)) {
      continue;
    }
    const version = dependency.version;
    if (typeof version === "string") {
      dependencies.set(`${name}@${version}`, { name, version });
    }
    visitDependencySet(readRecordField(dependency, "dependencies"), dependencies);
    visitDependencySet(readRecordField(dependency, "optionalDependencies"), dependencies);
  }
}

function readRecordField(value: unknown, field: string): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const fieldValue = value[field];
  return isRecord(fieldValue) ? fieldValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

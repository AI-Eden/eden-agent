import { readFile } from "node:fs/promises";
import type { RuntimeVersions } from "./measurement-options.ts";
import {
  type CandidatePackageId,
  candidatePackageIds,
  getCandidatePackageConfig,
  parseCandidatePackageId,
} from "./package-config.ts";

export type ArtifactEvidence = {
  readonly artifactSha256: string;
  readonly artifactSizeBytes: number;
  readonly candidateId: CandidatePackageId;
  readonly installedSizeBytes: number;
  readonly sourceDirty: boolean;
};

export class ArtifactEvidenceError extends Error {
  readonly name = "ArtifactEvidenceError";
}

export async function readArtifactEvidenceSet(
  paths: readonly string[],
  runtimeVersions: RuntimeVersions,
  sourceCommit: string,
): Promise<ReadonlyMap<CandidatePackageId, ArtifactEvidence>> {
  const evidence = new Map<CandidatePackageId, ArtifactEvidence>();
  for (const path of paths) {
    const parsed = parseArtifactEvidence(await readFile(path, "utf8"), path);
    if (parsed.sourceCommit !== sourceCommit) {
      throw new ArtifactEvidenceError(
        `Artifact ${parsed.candidateId} uses commit ${parsed.sourceCommit}; expected ${sourceCommit}`,
      );
    }
    const runtime = getCandidatePackageConfig(parsed.candidateId).runtime;
    if (parsed.runtimeVersion !== runtimeVersions[runtime]) {
      throw new ArtifactEvidenceError(
        `Artifact ${parsed.candidateId} uses ${runtime} ${parsed.runtimeVersion}; expected ${runtimeVersions[runtime]}`,
      );
    }
    if (evidence.has(parsed.candidateId)) {
      throw new ArtifactEvidenceError(`Duplicate artifact evidence for ${parsed.candidateId}`);
    }
    evidence.set(parsed.candidateId, {
      artifactSha256: parsed.artifactSha256,
      artifactSizeBytes: parsed.artifactSizeBytes,
      candidateId: parsed.candidateId,
      installedSizeBytes: parsed.installedSizeBytes,
      sourceDirty: parsed.sourceDirty,
    });
  }
  const missing = candidatePackageIds.filter((candidateId) => !evidence.has(candidateId));
  if (missing.length > 0) {
    throw new ArtifactEvidenceError(`Missing artifact evidence for ${missing.join(", ")}`);
  }
  return evidence;
}

type ParsedArtifactEvidence = ArtifactEvidence & {
  readonly runtimeVersion: string;
  readonly sourceCommit: string;
};

function parseArtifactEvidence(serialized: string, path: string): ParsedArtifactEvidence {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (cause: unknown) {
    if (cause instanceof SyntaxError) {
      throw new ArtifactEvidenceError(`Artifact evidence is not JSON: ${path}`, { cause });
    }
    throw cause;
  }
  const root = requireRecord(value, "artifact evidence");
  const candidateId = parseCandidatePackageId(requireString(root, "candidateId"));
  if (candidateId === null) {
    throw new ArtifactEvidenceError(`Unknown candidate in artifact evidence: ${path}`);
  }
  if (requireString(root, "status") !== "passed") {
    throw new ArtifactEvidenceError(`Artifact evidence did not pass: ${candidateId}`);
  }
  const artifact = requireRecord(root.artifact, "artifact");
  const deployment = requireRecord(root.deployment, "deployment");
  const source = requireRecord(root.source, "source");
  const versions = requireRecord(root.versions, "versions");
  const artifactSha256 = requireString(artifact, "sha256");
  if (!/^[a-f0-9]{64}$/u.test(artifactSha256)) {
    throw new ArtifactEvidenceError(`Artifact SHA-256 is invalid for ${candidateId}`);
  }
  const runtime = getCandidatePackageConfig(candidateId).runtime;
  return {
    artifactSha256,
    artifactSizeBytes: requirePositiveInteger(artifact, "sizeBytes"),
    candidateId,
    installedSizeBytes: requirePositiveInteger(deployment, "installedSizeBytes"),
    runtimeVersion: requireString(versions, runtime),
    sourceCommit: requireString(source, "commit"),
    sourceDirty: requireBoolean(source, "dirty"),
  };
}

function requireRecord(value: unknown, name: string): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new ArtifactEvidenceError(`${name} must be an object`);
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Readonly<Record<string, unknown>>, field: string): string {
  const value = record[field];
  if (typeof value !== "string") {
    throw new ArtifactEvidenceError(`${field} must be a string`);
  }
  return value;
}

function requireBoolean(record: Readonly<Record<string, unknown>>, field: string): boolean {
  const value = record[field];
  if (typeof value !== "boolean") {
    throw new ArtifactEvidenceError(`${field} must be a boolean`);
  }
  return value;
}

function requirePositiveInteger(record: Readonly<Record<string, unknown>>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new ArtifactEvidenceError(`${field} must be a positive integer`);
  }
  return value;
}

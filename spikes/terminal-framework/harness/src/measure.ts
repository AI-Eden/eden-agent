import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readArtifactEvidenceSet } from "./artifact-evidence.ts";
import {
  captureMeasurementEnvironment,
  captureMeasurementSource,
} from "./measurement-environment.ts";
import { MeasurementOptionsError, parseMeasurementOptions } from "./measurement-options.ts";
import {
  createFailedTrial,
  createMeasurementRecord,
  createPassedTrial,
  type MeasurementTrial,
} from "./measurement-record.ts";
import { validateMeasurementRecord } from "./measurement-schema.ts";
import { type CandidateId, candidateIds, runCandidateScenario } from "./pty.ts";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

async function main(): Promise<void> {
  const options = parseMeasurementOptions(process.argv.slice(2), repoRoot);
  const source = captureMeasurementSource(repoRoot);
  const environment = captureMeasurementEnvironment(options);
  const artifacts = await readArtifactEvidenceSet(
    options.artifactEvidence,
    options.runtimeVersions,
    source.commit,
  );
  await mkdir(options.outputDirectory, { recursive: true });
  const warmupMatrix = await runMatrixPhase("warmup", options.warmupCount);
  const trialMatrix = await runMatrixPhase("recorded", options.trialCount);
  const writtenRecords: string[] = [];
  for (const candidateId of candidateIds) {
    const artifact = artifacts.get(candidateId);
    if (artifact === undefined) {
      throw new TypeError(`Artifact evidence is unavailable for ${candidateId}`);
    }
    const warmups = warmupMatrix.get(candidateId);
    const trials = trialMatrix.get(candidateId);
    if (warmups === undefined || trials === undefined) {
      throw new TypeError(`Trial matrix is unavailable for ${candidateId}`);
    }
    const record = createMeasurementRecord({
      artifact,
      candidateId,
      environment,
      options,
      source,
      trials,
      warmups,
    });
    const filename = `${process.platform}-${process.arch}-${options.terminalId}-${candidateId}.json`;
    const outputPath = join(options.outputDirectory, filename);
    const temporaryPath = `${outputPath}.tmp`;
    await validateMeasurementRecord(record, filename);
    await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
    await rename(temporaryPath, outputPath);
    writtenRecords.push(filename);
  }

  process.stdout.write(`${JSON.stringify({ writtenRecords }, null, 2)}\n`, () => process.exit(0));
}

async function runMatrixPhase(
  phase: MeasurementTrial["phase"],
  count: number,
): Promise<ReadonlyMap<CandidateId, readonly MeasurementTrial[]>> {
  const matrix = new Map<CandidateId, MeasurementTrial[]>(
    candidateIds.map((candidateId) => [candidateId, []]),
  );
  for (let offset = 0; offset < count; offset++) {
    const rotation = offset % candidateIds.length;
    const round = [...candidateIds.slice(rotation), ...candidateIds.slice(0, rotation)];
    for (const candidateId of round) {
      const trials = matrix.get(candidateId);
      if (trials === undefined) {
        throw new TypeError(`Trial accumulator is unavailable for ${candidateId}`);
      }
      const startedAt = new Date();
      try {
        const result = await runCandidateScenario({ candidateId, scenario: "primary" });
        trials.push(createPassedTrial(result, phase, offset + 1));
      } catch (cause: unknown) {
        const failure = cause instanceof Error ? cause : new Error(String(cause));
        trials.push(createFailedTrial({ cause: failure, index: offset + 1, phase, startedAt }));
      }
    }
  }
  return matrix;
}

// node-pty 1.1.0 leaves its bundled-ConPTY worker ref'd after the PTY exits.
try {
  await main();
} catch (cause: unknown) {
  const error = cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
  const exitCode = cause instanceof MeasurementOptionsError ? 2 : 1;
  process.stderr.write(`${error}\n`, () => process.exit(exitCode));
}

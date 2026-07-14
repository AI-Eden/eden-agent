import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import type { ArtifactEvidence } from "./artifact-evidence.ts";
import type { MeasurementEnvironment, MeasurementSource } from "./measurement-environment.ts";
import type { MeasurementOptions } from "./measurement-options.ts";
import { summarizeMeasurements } from "./measurement-statistics.ts";
import type { CandidatePackageId } from "./package-config.ts";
import type { ProcessSmokeResult } from "./pty.ts";

export type MeasurementTrial =
  | {
      readonly durationMs: number;
      readonly endedAt: string;
      readonly exitCode: number;
      readonly index: number;
      readonly memory: ProcessSmokeResult["memory"];
      readonly outcome: "passed";
      readonly phase: "recorded" | "warmup";
      readonly shellSentinel: ProcessSmokeResult["shellSentinel"];
      readonly startedAt: string;
      readonly startupMs: number;
      readonly stateUpdateMs: number;
      readonly terminalCleanup: ProcessSmokeResult["terminalCleanup"];
      readonly transcriptBytes: number;
      readonly transcriptSha256: string;
    }
  | {
      readonly endedAt: string;
      readonly error: {
        readonly message: string;
        readonly name: string;
      };
      readonly index: number;
      readonly outcome: "failed";
      readonly phase: "recorded" | "warmup";
      readonly startedAt: string;
    };

export type MeasurementRecord = {
  readonly artifact: {
    readonly installedSizeBytes: number;
    readonly sha256: string;
    readonly sizeBytes: number;
  };
  readonly candidateId: CandidatePackageId;
  readonly command: string;
  readonly environment: MeasurementEnvironment;
  readonly fixtureId: string;
  readonly hardGateObservations: {
    readonly automatedPrimary: "failed" | "passed";
    readonly realTerminalQa: "not-run";
    readonly stressNavigation: "not-run";
  };
  readonly matchingSurface: {
    readonly cases: {
      readonly cancellationCleanup: "not-run";
      readonly chineseIme: "not-run";
      readonly graphemeEditing: "not-run";
      readonly largeDiff: "not-run";
      readonly largeOutput: "not-run";
      readonly navigationEscapeAlt: "not-run";
      readonly pasteAndMultiline: "not-run";
      readonly rapidResize: "not-run";
    };
    readonly notes: readonly string[];
    readonly observedAt: null;
    readonly operator: null;
    readonly status: "not-run";
    readonly terminal: {
      readonly enhancedProtocols: null;
      readonly font: null;
      readonly height: null;
      readonly locale: string;
      readonly name: string;
      readonly shell: string;
      readonly version: null;
      readonly width: null;
    };
  };
  readonly recordedAt: string;
  readonly schemaVersion: "1";
  readonly source: MeasurementSource & { readonly artifactDirty: boolean };
  readonly summary: {
    readonly stableResidentSetBytes: ReturnType<typeof summarizeMeasurements>;
    readonly startupMs: ReturnType<typeof summarizeMeasurements>;
    readonly stateUpdateMs: ReturnType<typeof summarizeMeasurements>;
  };
  readonly trialCount: number;
  readonly trials: readonly MeasurementTrial[];
  readonly viewport: {
    readonly columns: 100;
    readonly rows: 30;
  };
  readonly warmupCount: number;
  readonly warmups: readonly MeasurementTrial[];
};

type CreateMeasurementRecordInput = {
  readonly artifact: ArtifactEvidence;
  readonly candidateId: CandidatePackageId;
  readonly environment: MeasurementEnvironment;
  readonly options: MeasurementOptions;
  readonly source: MeasurementSource;
  readonly trials: readonly MeasurementTrial[];
  readonly warmups: readonly MeasurementTrial[];
};

export function createPassedTrial(
  result: ProcessSmokeResult,
  phase: MeasurementTrial["phase"],
  index: number,
): MeasurementTrial {
  if (
    result.exitCode !== 0 ||
    result.shellSentinel !== "observed" ||
    result.stateUpdateMs === null ||
    result.terminalCleanup !== "restored"
  ) {
    throw new RangeError(`Primary trial did not complete safely for ${result.candidateId}`);
  }
  return {
    durationMs: result.durationMs,
    endedAt: result.endedAt,
    exitCode: result.exitCode,
    index,
    memory: result.memory,
    outcome: "passed",
    phase,
    shellSentinel: result.shellSentinel,
    startedAt: result.startedAt,
    startupMs: result.startupMs,
    stateUpdateMs: result.stateUpdateMs,
    terminalCleanup: result.terminalCleanup,
    transcriptBytes: Buffer.byteLength(result.transcript),
    transcriptSha256: createHash("sha256").update(result.transcript).digest("hex"),
  };
}

export function createFailedTrial(input: {
  readonly cause: unknown;
  readonly index: number;
  readonly phase: MeasurementTrial["phase"];
  readonly startedAt: Date;
}): MeasurementTrial {
  const error = input.cause instanceof Error ? input.cause : new TypeError(String(input.cause));
  return {
    endedAt: new Date().toISOString(),
    error: { message: redactLocalPaths(error.message), name: error.name },
    index: input.index,
    outcome: "failed",
    phase: input.phase,
    startedAt: input.startedAt.toISOString(),
  };
}

export function createMeasurementRecord(input: CreateMeasurementRecordInput): MeasurementRecord {
  const passed = input.trials.filter(
    (trial): trial is Extract<MeasurementTrial, { readonly outcome: "passed" }> =>
      trial.outcome === "passed",
  );
  const failureCount = input.trials.length - passed.length;
  const observedMemory = passed.flatMap((trial) =>
    trial.memory.status === "observed" ? [trial.memory.residentSetBytes] : [],
  );
  return {
    artifact: {
      installedSizeBytes: input.artifact.installedSizeBytes,
      sha256: input.artifact.artifactSha256,
      sizeBytes: input.artifact.artifactSizeBytes,
    },
    candidateId: input.candidateId,
    command: createMeasurementCommand(input.options),
    environment: input.environment,
    fixtureId: input.options.fixtureId,
    hardGateObservations: {
      automatedPrimary: failureCount === 0 ? "passed" : "failed",
      realTerminalQa: "not-run",
      stressNavigation: "not-run",
    },
    matchingSurface: {
      cases: {
        cancellationCleanup: "not-run",
        chineseIme: "not-run",
        graphemeEditing: "not-run",
        largeDiff: "not-run",
        largeOutput: "not-run",
        navigationEscapeAlt: "not-run",
        pasteAndMultiline: "not-run",
        rapidResize: "not-run",
      },
      notes: [],
      observedAt: null,
      operator: null,
      status: "not-run",
      terminal: {
        enhancedProtocols: null,
        font: null,
        height: null,
        locale: input.environment.locale,
        name: input.environment.terminalId,
        shell: input.environment.shell,
        version: null,
        width: null,
      },
    },
    recordedAt: new Date().toISOString(),
    schemaVersion: "1",
    source: { ...input.source, artifactDirty: input.artifact.sourceDirty },
    summary: {
      stableResidentSetBytes: summarizeMeasurements(
        observedMemory,
        failureCount + passed.length - observedMemory.length,
      ),
      startupMs: summarizeMeasurements(
        passed.map((trial) => trial.startupMs),
        failureCount,
      ),
      stateUpdateMs: summarizeMeasurements(
        passed.map((trial) => trial.stateUpdateMs),
        failureCount,
      ),
    },
    trialCount: input.options.trialCount,
    trials: input.trials,
    viewport: { columns: 100, rows: 30 },
    warmupCount: input.options.warmupCount,
    warmups: input.warmups,
  };
}

function createMeasurementCommand(options: MeasurementOptions): string {
  return [
    "pnpm --filter @eden/terminal-spike-harness measure --",
    `--warmups ${options.warmupCount}`,
    `--trials ${options.trialCount}`,
    `--fixture ${options.fixtureId}`,
    `--runtime-versions node=${options.runtimeVersions.node},bun=${options.runtimeVersions.bun}`,
    `--terminal ${options.terminalId}`,
    `--host-load-policy ${JSON.stringify(options.hostLoadPolicy)}`,
    "--output-dir spikes/terminal-framework/results",
    ...options.artifactEvidence.map(() => "--artifact-evidence <package-result.json>"),
  ].join(" ");
}

function redactLocalPaths(message: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE;
  const withoutHome = home === undefined ? message : message.replaceAll(home, "<home>");
  return withoutHome.replaceAll(process.cwd(), "<cwd>");
}

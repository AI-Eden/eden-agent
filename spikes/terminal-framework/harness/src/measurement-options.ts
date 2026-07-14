import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { terminalSpikeFixture } from "@eden/terminal-spike-fixture";
import { candidateIds } from "./pty.ts";

export type RuntimeVersions = {
  readonly bun: string;
  readonly node: string;
};

export type MeasurementOptions = {
  readonly artifactEvidence: readonly string[];
  readonly fixtureId: string;
  readonly hostLoadPolicy: string;
  readonly outputDirectory: string;
  readonly runtimeVersions: RuntimeVersions;
  readonly terminalId: string;
  readonly trialCount: number;
  readonly warmupCount: number;
};

export class MeasurementOptionsError extends Error {
  readonly name = "MeasurementOptionsError";
}

const optionDefinitions = {
  "artifact-evidence": { multiple: true, type: "string" },
  fixture: { type: "string" },
  "host-load-policy": { type: "string" },
  "output-dir": { type: "string" },
  "runtime-versions": { type: "string" },
  terminal: { type: "string" },
  trials: { type: "string" },
  warmups: { type: "string" },
} as const;

export function parseMeasurementOptions(
  arguments_: readonly string[],
  pathBaseDirectory: string,
): MeasurementOptions {
  const values = parseOptionValues(arguments_);

  const missing = [
    ["artifact-evidence", values["artifact-evidence"]],
    ["fixture", values.fixture],
    ["host-load-policy", values["host-load-policy"]],
    ["output-dir", values["output-dir"]],
    ["runtime-versions", values["runtime-versions"]],
    ["terminal", values.terminal],
    ["trials", values.trials],
    ["warmups", values.warmups],
  ].flatMap(([name, value]) => (value === undefined ? [`--${name}`] : []));
  if (missing.length > 0) {
    throw new MeasurementOptionsError(`Missing required options: ${missing.join(", ")}`);
  }

  const artifactEvidence = values["artifact-evidence"];
  const fixtureId = values.fixture;
  const hostLoadPolicy = values["host-load-policy"];
  const outputDirectory = values["output-dir"];
  const runtimeVersions = values["runtime-versions"];
  const terminalId = values.terminal;
  const trials = values.trials;
  const warmups = values.warmups;
  if (
    artifactEvidence === undefined ||
    fixtureId === undefined ||
    hostLoadPolicy === undefined ||
    outputDirectory === undefined ||
    runtimeVersions === undefined ||
    terminalId === undefined ||
    trials === undefined ||
    warmups === undefined
  ) {
    throw new MeasurementOptionsError("Required measurement options were not parsed");
  }
  if (fixtureId !== terminalSpikeFixture.fixtureId) {
    throw new MeasurementOptionsError(
      `Expected fixture ${terminalSpikeFixture.fixtureId}, received ${fixtureId}`,
    );
  }
  if (artifactEvidence.length !== candidateIds.length) {
    throw new MeasurementOptionsError(
      `Expected ${candidateIds.length} --artifact-evidence values, received ${artifactEvidence.length}`,
    );
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(terminalId)) {
    throw new MeasurementOptionsError(`Terminal identity must be a lowercase slug: ${terminalId}`);
  }

  return {
    artifactEvidence: artifactEvidence.map((path) => resolve(pathBaseDirectory, path)),
    fixtureId,
    hostLoadPolicy,
    outputDirectory: resolve(pathBaseDirectory, outputDirectory),
    runtimeVersions: parseRuntimeVersions(runtimeVersions),
    terminalId,
    trialCount: parseCount("trials", trials, 1),
    warmupCount: parseCount("warmups", warmups, 0),
  };
}

function parseCount(name: string, value: string, minimum: number): number {
  if (!/^\d+$/u.test(value)) {
    throw new MeasurementOptionsError(`--${name} must be an integer, received ${value}`);
  }
  const count = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(count) || count < minimum) {
    throw new MeasurementOptionsError(`--${name} must be at least ${minimum}, received ${value}`);
  }
  return count;
}

function parseRuntimeVersions(value: string): RuntimeVersions {
  const entries = new Map(
    value.split(",").flatMap((entry) => {
      const separator = entry.indexOf("=");
      return separator === -1 ? [] : [[entry.slice(0, separator), entry.slice(separator + 1)]];
    }),
  );
  const bun = entries.get("bun");
  const node = entries.get("node");
  if (bun === undefined || node === undefined || entries.size !== 2) {
    throw new MeasurementOptionsError(
      `--runtime-versions must be node=<version>,bun=<version>, received ${value}`,
    );
  }
  if (bun !== "1.3.14" || node !== "v24.15.0") {
    throw new MeasurementOptionsError(
      `Expected runtime versions node=v24.15.0,bun=1.3.14, received ${value}`,
    );
  }
  return { bun, node };
}

function parseOptionValues(arguments_: readonly string[]) {
  const optionArguments = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  try {
    return parseArgs({ args: optionArguments, options: optionDefinitions, strict: true }).values;
  } catch (cause: unknown) {
    if (cause instanceof TypeError) {
      throw new MeasurementOptionsError(cause.message, { cause });
    }
    throw cause;
  }
}

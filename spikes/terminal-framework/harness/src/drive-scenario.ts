import { setTimeout as delay } from "node:timers/promises";
import type { IPty } from "node-pty";
import type { CandidateId, ProcessScenario } from "./pty.ts";
import { waitForExit, waitForNextData, waitForText } from "./pty-events.ts";

export type DrivenScenario = {
  readonly exitCode: number;
  readonly readiness: "not-applicable" | "observed";
  readonly readyAt: Date;
  readonly viewportSequence: readonly string[];
};

type DriveCandidateScenarioOptions = {
  readonly candidateId: CandidateId;
  readonly hasExited: () => boolean;
  readonly readTranscript: () => string;
  readonly scenario: ProcessScenario;
  readonly startedAt: Date;
  readonly terminal: IPty;
};

const endKey = "\u001B[F";
const viewportSequence = ["60x20", "100x30", "160x45"] as const;

function assertNeverScenario(scenario: never): never {
  throw new TypeError(`Unsupported process scenario: ${scenario}`);
}

function terminatePtyProcessGroup(terminal: IPty): void {
  if (process.platform === "win32") {
    terminal.kill();
    return;
  }
  try {
    process.kill(-terminal.pid, "SIGKILL");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return;
    }
    throw error;
  }
}

async function prepareInteractiveCandidate(options: DriveCandidateScenarioOptions): Promise<Date> {
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "approve: a",
    readTranscript: options.readTranscript,
    terminal: options.terminal,
  });
  const readyAt = new Date();
  const mediumFrame = waitForNextData(options.candidateId, options.terminal);
  options.terminal.resize(100, 30);
  await mediumFrame;
  const wideFrame = waitForNextData(options.candidateId, options.terminal);
  options.terminal.resize(160, 45);
  await wideFrame;
  return readyAt;
}

async function driveStressScenario(
  options: DriveCandidateScenarioOptions,
): Promise<DrivenScenario> {
  const readyAt = await prepareInteractiveCandidate(options);
  options.terminal.write("a");
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "approved",
    readTranscript: options.readTranscript,
    terminal: options.terminal,
  });
  const outputOffset = options.readTranscript().length;
  options.terminal.write("o");
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "focus: output",
    readTranscript: () => options.readTranscript().slice(outputOffset),
    terminal: options.terminal,
  });
  await delay(100);
  options.terminal.write(endKey);
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "output marker: output-09999",
    readTranscript: options.readTranscript,
    terminal: options.terminal,
  });
  const diffOffset = options.readTranscript().length;
  options.terminal.write("d");
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "focus: diff",
    readTranscript: () => options.readTranscript().slice(diffOffset),
    terminal: options.terminal,
  });
  await delay(100);
  options.terminal.write(endKey);
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "diff file: synthetic/file-20.ts",
    readTranscript: options.readTranscript,
    terminal: options.terminal,
  });
  const escapeOffset = options.readTranscript().length;
  options.terminal.write("\u001B");
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "progress",
    readTranscript: () => options.readTranscript().slice(escapeOffset),
    terminal: options.terminal,
  });
  options.terminal.write("\u0003");
  process.kill(options.terminal.pid, "SIGINT");
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "__EDEN_PROBE_INTERRUPT__=received",
    readTranscript: options.readTranscript,
    terminal: options.terminal,
  });
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "__EDEN_CANDIDATE_EXIT__=130",
    readTranscript: options.readTranscript,
    terminal: options.terminal,
  });
  if (!options.hasExited()) {
    terminatePtyProcessGroup(options.terminal);
  }
  return { exitCode: 130, readiness: "observed", readyAt, viewportSequence };
}

export async function driveCandidateScenario(
  options: DriveCandidateScenarioOptions,
): Promise<DrivenScenario> {
  switch (options.scenario) {
    case "invalid": {
      const exitCode = await waitForExit(options.candidateId, options.terminal);
      return {
        exitCode,
        readiness: "not-applicable",
        readyAt: options.startedAt,
        viewportSequence: [],
      };
    }
    case "cancel": {
      const exitPromise = waitForExit(options.candidateId, options.terminal);
      await waitForText({
        candidateId: options.candidateId,
        expectedText: "approve: a",
        readTranscript: options.readTranscript,
        terminal: options.terminal,
      });
      const readyAt = new Date();
      options.terminal.write("\u0003");
      const exitCode = await exitPromise;
      return { exitCode, readiness: "observed", readyAt, viewportSequence: ["60x20"] };
    }
    case "stress":
      return driveStressScenario(options);
    case "primary": {
      const exitPromise = waitForExit(options.candidateId, options.terminal);
      const readyAt = await prepareInteractiveCandidate(options);
      options.terminal.write("a");
      await waitForText({
        candidateId: options.candidateId,
        expectedText: "approved",
        readTranscript: options.readTranscript,
        terminal: options.terminal,
      });
      options.terminal.write("q");
      const exitCode = await exitPromise;
      return { exitCode, readiness: "observed", readyAt, viewportSequence };
    }
    default:
      return assertNeverScenario(options.scenario);
  }
}

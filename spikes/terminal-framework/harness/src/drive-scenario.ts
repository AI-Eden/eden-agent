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
  readonly readTranscript: () => string;
  readonly scenario: ProcessScenario;
  readonly shellChallengeInput: string;
  readonly shellExpectedResponse: string;
  readonly shellReadyMarker: string;
  readonly startedAt: Date;
  readonly terminal: IPty;
};

const endKey = "\u001B[F";
const viewportSequence = ["60x20", "100x30", "160x45"] as const;

function assertNeverScenario(scenario: never): never {
  throw new TypeError(`Unsupported process scenario: ${scenario}`);
}

function requestPtyCancellation(options: DriveCandidateScenarioOptions): void {
  options.terminal.write("\u0003");
  if (process.platform !== "win32") {
    const probePid = readNumericMarker(options.readTranscript(), "__EDEN_PROBE_PID__=");
    try {
      process.kill(probePid, "SIGINT");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
        throw error;
      }
    }
  }
}

function readNumericMarker(transcript: string, prefix: string): number {
  const match = transcript.match(new RegExp(`${prefix}(\\d+)`, "u"));
  if (match?.[1] === undefined) {
    throw new TypeError(`Missing numeric transcript marker: ${prefix}`);
  }
  return Number.parseInt(match[1], 10);
}

async function completeShellRecovery(options: DriveCandidateScenarioOptions): Promise<number> {
  await waitForText({
    candidateId: options.candidateId,
    expectedText: "__EDEN_CANDIDATE_EXIT__=",
    readTranscript: options.readTranscript,
    terminal: options.terminal,
  });
  const candidateExitCode = readNumericMarker(options.readTranscript(), "__EDEN_CANDIDATE_EXIT__=");
  await waitForText({
    candidateId: options.candidateId,
    expectedText: options.shellReadyMarker,
    readTranscript: options.readTranscript,
    terminal: options.terminal,
  });
  const responseOffset = options.readTranscript().length;
  const shellExit = waitForExit(options.candidateId, options.terminal);
  options.terminal.write(options.shellChallengeInput);
  await waitForText({
    candidateId: options.candidateId,
    expectedText: options.shellExpectedResponse,
    readTranscript: () => options.readTranscript().slice(responseOffset),
    terminal: options.terminal,
  });
  const shellExitCode = await shellExit;
  if (shellExitCode !== candidateExitCode) {
    throw new TypeError(
      `Parent shell exited with ${shellExitCode}; expected candidate status ${candidateExitCode}`,
    );
  }
  return candidateExitCode;
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
  requestPtyCancellation(options);
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
  const exitCode = await completeShellRecovery(options);
  return { exitCode, readiness: "observed", readyAt, viewportSequence };
}

export async function driveCandidateScenario(
  options: DriveCandidateScenarioOptions,
): Promise<DrivenScenario> {
  switch (options.scenario) {
    case "invalid": {
      const exitCode = await completeShellRecovery(options);
      return {
        exitCode,
        readiness: "not-applicable",
        readyAt: options.startedAt,
        viewportSequence: [],
      };
    }
    case "cancel": {
      await waitForText({
        candidateId: options.candidateId,
        expectedText: "approve: a",
        readTranscript: options.readTranscript,
        terminal: options.terminal,
      });
      const readyAt = new Date();
      requestPtyCancellation(options);
      const exitCode = await completeShellRecovery(options);
      return { exitCode, readiness: "observed", readyAt, viewportSequence: ["60x20"] };
    }
    case "stress":
      return driveStressScenario(options);
    case "primary": {
      const readyAt = await prepareInteractiveCandidate(options);
      options.terminal.write("a");
      await waitForText({
        candidateId: options.candidateId,
        expectedText: "approved",
        readTranscript: options.readTranscript,
        terminal: options.terminal,
      });
      options.terminal.write("q");
      const exitCode = await completeShellRecovery(options);
      return { exitCode, readiness: "observed", readyAt, viewportSequence };
    }
    default:
      return assertNeverScenario(options.scenario);
  }
}

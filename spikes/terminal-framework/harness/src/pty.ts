import { fileURLToPath } from "node:url";
import { terminalSpikeFixture } from "@eden/terminal-spike-fixture";
import { spawn } from "node-pty";
import { driveCandidateScenario } from "./drive-scenario.ts";

export const candidateIds = ["ink-node", "ink-bun", "opentui-bun"] as const;

export type CandidateId = (typeof candidateIds)[number];
export type ProcessScenario = "cancel" | "invalid" | "primary" | "stress";

export type ProcessSmokeResult = {
  readonly candidateId: CandidateId;
  readonly durationMs: number;
  readonly endedAt: string;
  readonly exitCode: number;
  readonly fixtureId: string;
  readonly readiness: "not-applicable" | "observed";
  readonly readyAt: string;
  readonly scenario: ProcessScenario;
  readonly shellSentinel: "missing" | "observed";
  readonly startedAt: string;
  readonly terminalCleanup: "failed" | "restored";
  readonly terminalModeAfter: string;
  readonly terminalModeBefore: string;
  readonly transcript: string;
  readonly viewportSequence: readonly string[];
};

type RunCandidateScenarioOptions = {
  readonly candidateId: CandidateId;
  readonly scenario: ProcessScenario;
};

const transcriptLimit = 128 * 1024;
const probePath = fileURLToPath(new URL("./probe.ts", import.meta.url));
const harnessRoot = fileURLToPath(new URL("../", import.meta.url));

type CompletedProcessObservation = {
  readonly candidateId: CandidateId;
  readonly exitCode: number;
  readonly readiness: ProcessSmokeResult["readiness"];
  readonly readyAt: Date;
  readonly scenario: ProcessScenario;
  readonly startedAt: Date;
  readonly transcript: string;
  readonly viewportSequence: readonly string[];
};

function createProcessSmokeResult(observation: CompletedProcessObservation): ProcessSmokeResult {
  const readyAt = new Date(
    Math.max(observation.startedAt.getTime(), observation.readyAt.getTime()),
  );
  const endedAt = new Date(Math.max(readyAt.getTime(), Date.now()));
  const terminalModeBefore = readTranscriptMarker(
    observation.transcript,
    "__EDEN_TERMINAL_MODE_BEFORE__=",
  );
  const terminalModeAfter = readTranscriptMarker(
    observation.transcript,
    "__EDEN_TERMINAL_MODE_AFTER__=",
  );
  const cursorRestored =
    !observation.transcript.includes("\u001B[?25l") ||
    observation.transcript.lastIndexOf("\u001B[?25h") >
      observation.transcript.lastIndexOf("\u001B[?25l");
  const alternateScreenRestored =
    !observation.transcript.includes("\u001B[?1049h") ||
    observation.transcript.lastIndexOf("\u001B[?1049l") >
      observation.transcript.lastIndexOf("\u001B[?1049h");

  return {
    candidateId: observation.candidateId,
    durationMs: endedAt.getTime() - observation.startedAt.getTime(),
    endedAt: endedAt.toISOString(),
    exitCode: observation.exitCode,
    fixtureId: terminalSpikeFixture.fixtureId,
    readiness: observation.readiness,
    readyAt: readyAt.toISOString(),
    scenario: observation.scenario,
    shellSentinel: observation.transcript.includes("EDEN_TUI_RESTORED") ? "observed" : "missing",
    startedAt: observation.startedAt.toISOString(),
    terminalCleanup:
      cursorRestored &&
      alternateScreenRestored &&
      terminalModeBefore !== "missing" &&
      terminalModeBefore === terminalModeAfter
        ? "restored"
        : "failed",
    terminalModeAfter,
    terminalModeBefore,
    transcript: observation.transcript,
    viewportSequence: observation.viewportSequence,
  };
}

function readTranscriptMarker(transcript: string, prefix: string): string {
  const markerLine = transcript.split(/\r?\n/u).find((line) => line.includes(prefix));
  return markerLine === undefined
    ? "missing"
    : markerLine.slice(markerLine.indexOf(prefix) + prefix.length);
}

export async function runCandidateScenario(
  options: RunCandidateScenarioOptions,
): Promise<ProcessSmokeResult> {
  const startedAt = new Date();
  let transcript = "";
  let exited = false;
  const terminal = spawn(
    process.execPath,
    ["--import", "tsx", probePath, options.candidateId, options.scenario],
    {
      cols: 60,
      cwd: harnessRoot,
      env: process.env,
      name: "xterm-256color",
      rows: 20,
    },
  );
  const outputSubscription = terminal.onData((data) => {
    transcript = `${transcript}${data}`.slice(-transcriptLimit);
  });
  const exitSubscription = terminal.onExit(() => {
    exited = true;
  });

  try {
    const drivenScenario = await driveCandidateScenario({
      candidateId: options.candidateId,
      hasExited: () => exited,
      readTranscript: () => transcript,
      scenario: options.scenario,
      startedAt,
      terminal,
    });
    return createProcessSmokeResult({
      candidateId: options.candidateId,
      ...drivenScenario,
      scenario: options.scenario,
      startedAt,
      transcript,
    });
  } finally {
    outputSubscription.dispose();
    exitSubscription.dispose();
    if (!exited) {
      terminal.kill();
    }
  }
}

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CandidateId, ProcessScenario } from "./pty.ts";

type CreateShellSessionOptions = {
  readonly candidateId: CandidateId;
  readonly challenge: string;
  readonly commandInterpreter?: string | undefined;
  readonly nodeExecutable: string;
  readonly platform: NodeJS.Platform;
  readonly probePath: string;
  readonly scenario: ProcessScenario;
};

export type ShellSession = {
  readonly arguments: string[];
  readonly challengeInput: string;
  readonly cleanup: () => void;
  readonly command: string;
  readonly expectedResponse: string;
  readonly readyMarker: string;
};

export function createShellSession(options: CreateShellSessionOptions): ShellSession {
  const probeArguments = [
    options.nodeExecutable,
    "--import",
    "tsx",
    options.probePath,
    options.candidateId,
    options.scenario,
  ];
  const expectedResponse = `EDEN_TUI_RESTORED_${options.challenge}`;
  const readyMarker = "__EDEN_PARENT_SHELL_READY__";
  if (options.platform === "win32") {
    const directory = mkdtempSync(join(tmpdir(), "eden-parent-shell-"));
    const scriptPath = join(directory, "parent-shell.cmd");
    const probeCommand = probeArguments.map(quoteBatchArgument).join(" ");
    writeFileSync(
      scriptPath,
      `@echo off\r\nsetlocal EnableExtensions DisableDelayedExpansion\r\n${probeCommand}\r\nset "eden_status=%errorlevel%"\r\necho ${readyMarker}\r\nset /p "eden_challenge="\r\necho EDEN_TUI_RESTORED_%eden_challenge%\r\nexit /b %eden_status%\r\n`,
      "utf8",
    );
    return {
      arguments: ["/D", "/Q", "/C", scriptPath],
      challengeInput: `${options.challenge}\r`,
      cleanup: () => rmSync(directory, { force: true, recursive: true }),
      command: options.commandInterpreter ?? "cmd.exe",
      expectedResponse,
      readyMarker,
    };
  }

  const probeCommand = probeArguments.map(quotePosixArgument).join(" ");
  const script = `trap : INT; ${probeCommand}; eden_status=$?; printf '${readyMarker}\\n'; IFS= read -r eden_challenge; printf 'EDEN_TUI_RESTORED_%s\\n' "$eden_challenge"; exit "$eden_status"`;
  return {
    arguments: ["-c", script],
    challengeInput: `${options.challenge}\n`,
    cleanup: () => undefined,
    command: "/bin/sh",
    expectedResponse,
    readyMarker,
  };
}

function quoteBatchArgument(value: string): string {
  if (/["\r\n]/u.test(value)) {
    throw new TypeError("Windows batch arguments cannot contain quotes or newlines");
  }
  return `"${value.replaceAll("%", "%%")}"`;
}

function quotePosixArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

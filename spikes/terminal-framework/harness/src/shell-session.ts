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
    const probeCommand = probeArguments.map(quoteCmdArgument).join(" ");
    const script = `"${probeCommand} & set "eden_status=!errorlevel!" & echo ${readyMarker} & set /p "eden_challenge=" & echo EDEN_TUI_RESTORED_!eden_challenge! & exit /b !eden_status!"`;
    return {
      arguments: ["/D", "/Q", "/V:ON", "/S", "/C", script],
      challengeInput: `${options.challenge}\r`,
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
    command: "/bin/sh",
    expectedResponse,
    readyMarker,
  };
}

function quoteCmdArgument(value: string): string {
  if (value.includes('"')) {
    throw new TypeError("Windows shell arguments cannot contain a double quote");
  }
  return `"${value}"`;
}

function quotePosixArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

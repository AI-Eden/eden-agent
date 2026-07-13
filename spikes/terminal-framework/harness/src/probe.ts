import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type CandidateId, candidateIds, type ProcessScenario } from "./pty.ts";

const workspaceRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const binName = process.platform === "win32" ? "bun.CMD" : "bun";
const inkRoot = resolve(workspaceRoot, "spikes/terminal-framework/ink");
const openTuiRoot = resolve(workspaceRoot, "spikes/terminal-framework/opentui");

type CandidateLaunch = {
  readonly arguments: readonly string[];
  readonly command: string;
  readonly cwd: string;
};

const windowsConsoleModeScript = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class EdenConsoleMode { [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int id); [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr handle, out uint mode); }'
[uint32]$inputMode = 0
[uint32]$outputMode = 0
$inputOk = [EdenConsoleMode]::GetConsoleMode([EdenConsoleMode]::GetStdHandle(-10), [ref]$inputMode)
$outputOk = [EdenConsoleMode]::GetConsoleMode([EdenConsoleMode]::GetStdHandle(-11), [ref]$outputMode)
if (-not ($inputOk -and $outputOk)) { exit 1 }
Write-Output ([string]$inputMode + ':' + [string]$outputMode)
`;

function readTerminalModeFingerprint(): string {
  const snapshot =
    process.platform === "win32"
      ? spawnSync(
          "powershell.exe",
          ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsConsoleModeScript],
          {
            encoding: "utf8",
            stdio: ["inherit", "pipe", "pipe"],
          },
        )
      : spawnSync("stty", ["-g"], {
          encoding: "utf8",
          stdio: ["inherit", "pipe", "pipe"],
        });
  if (snapshot.error !== undefined) {
    throw snapshot.error;
  }
  if (snapshot.status !== 0 || snapshot.stdout.trim().length === 0) {
    throw new TypeError(`Unable to capture terminal mode: ${snapshot.stderr.trim()}`);
  }
  return createHash("sha256").update(snapshot.stdout.trim()).digest("hex");
}

function parseCandidateId(value: string | undefined): CandidateId {
  const candidateId = candidateIds.find((candidate) => candidate === value);
  if (candidateId === undefined) {
    throw new TypeError(`Unknown terminal candidate: ${value ?? "missing"}`);
  }
  return candidateId;
}

function parseScenario(value: string | undefined): ProcessScenario {
  if (value === "cancel" || value === "invalid" || value === "primary" || value === "stress") {
    return value;
  }
  throw new TypeError(`Unknown process scenario: ${value ?? "missing"}`);
}

function getCandidateLaunch(candidateId: CandidateId): CandidateLaunch {
  switch (candidateId) {
    case "ink-node":
      return {
        arguments: ["--import", "tsx", "src/cli.tsx"],
        command: process.execPath,
        cwd: inkRoot,
      };
    case "ink-bun":
      return {
        arguments: ["src/cli.tsx"],
        command: resolve(inkRoot, "node_modules/.bin", binName),
        cwd: inkRoot,
      };
    case "opentui-bun":
      return {
        arguments: ["src/cli.tsx"],
        command: resolve(openTuiRoot, "node_modules/.bin", binName),
        cwd: openTuiRoot,
      };
  }
}

const scenario = parseScenario(process.argv[3]);
const launch = getCandidateLaunch(parseCandidateId(process.argv[2]));
const terminalModeBefore = readTerminalModeFingerprint();
process.stdout.write(`__EDEN_TERMINAL_MODE_BEFORE__=${terminalModeBefore}\n`);
const candidateArguments =
  scenario === "invalid" ? [...launch.arguments, "--unknown"] : launch.arguments;
let activeChild: ReturnType<typeof spawn> | undefined;
let cancellationEscalation: "none" | "sigkill" | "sigterm" = "none";
let cancellationRequested = false;
let escalationTimer: ReturnType<typeof setTimeout> | undefined;
let killTimer: ReturnType<typeof setTimeout> | undefined;
const relayChildCancellation = () => {
  if (cancellationRequested) {
    return;
  }
  cancellationRequested = true;
  process.stderr.write("\n__EDEN_PROBE_INTERRUPT__=received\n");
  activeChild?.kill("SIGINT");
  escalationTimer = setTimeout(() => {
    cancellationEscalation = "sigterm";
    process.stderr.write("\n__EDEN_PROBE_ESCALATION__=sigterm\n");
    activeChild?.kill("SIGTERM");
    killTimer = setTimeout(() => {
      cancellationEscalation = "sigkill";
      const signalSent = activeChild?.kill("SIGKILL") ?? false;
      process.stderr.write(
        `\n__EDEN_PROBE_ESCALATION__=sigkill:${signalSent ? "sent" : "missing"}\n`,
      );
    }, 250);
  }, 250);
};
process.on("SIGINT", relayChildCancellation);
let exitCode: number;
try {
  exitCode = await new Promise<number>((resolveExitCode, reject) => {
    const child = spawn(launch.command, candidateArguments, {
      cwd: launch.cwd,
      env: process.env,
      stdio: "inherit",
    });
    activeChild = child;
    process.stdout.write(`__EDEN_CANDIDATE_PID__=${child.pid ?? "missing"}\n`);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolveExitCode(cancellationRequested ? 130 : (code ?? (signal === "SIGINT" ? 130 : 1)));
    });
  });
} finally {
  clearTimeout(escalationTimer);
  clearTimeout(killTimer);
  process.off("SIGINT", relayChildCancellation);
}

const terminalModeAfter = readTerminalModeFingerprint();
process.stdout.write(
  `\n__EDEN_CANCELLATION_ESCALATION__=${cancellationEscalation}\n__EDEN_CANDIDATE_EXIT__=${exitCode}\n__EDEN_TERMINAL_MODE_AFTER__=${terminalModeAfter}\nEDEN_TUI_RESTORED\n`,
);
process.exitCode = exitCode;

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type SnapshotOptions = {
  readonly encoding: "utf8";
  readonly env: NodeJS.ProcessEnv;
  readonly stdio: ["inherit", "inherit" | "pipe", "pipe"];
  readonly timeout: number;
  readonly windowsHide: boolean;
};

type SnapshotResult = {
  readonly error?: Error | undefined;
  readonly status: number | null;
  readonly stderr: string;
  readonly stdout: string;
};

type SnapshotRunner = (
  command: string,
  arguments_: readonly string[],
  options: SnapshotOptions,
) => SnapshotResult;

const windowsConsoleModeScript = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class EdenConsoleMode { [DllImport("kernel32.dll")] public static extern IntPtr GetStdHandle(int id); [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(IntPtr handle, out uint mode); }'
[uint32]$inputMode = 0
[uint32]$outputMode = 0
$inputOk = [EdenConsoleMode]::GetConsoleMode([EdenConsoleMode]::GetStdHandle(-10), [ref]$inputMode)
$outputOk = [EdenConsoleMode]::GetConsoleMode([EdenConsoleMode]::GetStdHandle(-11), [ref]$outputMode)
if (-not ($inputOk -and $outputOk)) { exit 1 }
[System.IO.File]::WriteAllText($env:EDEN_CONSOLE_MODE_PATH, ([string]$inputMode + ':' + [string]$outputMode))
`;

const runSnapshot: SnapshotRunner = (command, arguments_, options) =>
  spawnSync(command, arguments_, options);

function captureWindowsConsoleMode(runner: SnapshotRunner): string {
  const snapshotDirectory = mkdtempSync(join(tmpdir(), "eden-console-mode-"));
  const snapshotPath = join(snapshotDirectory, "mode.txt");
  try {
    const snapshot = runner(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsConsoleModeScript],
      {
        encoding: "utf8",
        env: { ...process.env, EDEN_CONSOLE_MODE_PATH: snapshotPath },
        stdio: ["inherit", "inherit", "pipe"],
        timeout: 5_000,
        windowsHide: true,
      },
    );
    if (snapshot.error !== undefined) {
      throw snapshot.error;
    }
    if (snapshot.status !== 0) {
      throw new TypeError(`Unable to capture terminal mode: ${snapshot.stderr.trim()}`);
    }
    return readFileSync(snapshotPath, "utf8").trim();
  } finally {
    rmSync(snapshotDirectory, { force: true, recursive: true });
  }
}

export function captureTerminalModeFingerprint(
  platform: NodeJS.Platform = process.platform,
  runner: SnapshotRunner = runSnapshot,
): string {
  const terminalMode =
    platform === "win32" ? captureWindowsConsoleMode(runner) : captureUnixTerminalMode(runner);
  if (terminalMode.length === 0) {
    throw new TypeError("Unable to capture terminal mode: empty snapshot");
  }
  return createHash("sha256").update(terminalMode).digest("hex");
}

function captureUnixTerminalMode(runner: SnapshotRunner): string {
  const snapshot = runner("stty", ["-g"], {
    encoding: "utf8",
    env: process.env,
    stdio: ["inherit", "pipe", "pipe"],
    timeout: 5_000,
    windowsHide: true,
  });
  if (snapshot.error !== undefined) {
    throw snapshot.error;
  }
  if (snapshot.status !== 0 || snapshot.stdout.trim().length === 0) {
    throw new TypeError(`Unable to capture terminal mode: ${snapshot.stderr.trim()}`);
  }
  return snapshot.stdout.trim();
}

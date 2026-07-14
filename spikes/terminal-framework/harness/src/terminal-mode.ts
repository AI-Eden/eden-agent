import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPackageCommandEnvironment } from "./package-command.ts";

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

const windowsConsoleModeSource = `
using System;
using System.IO;
using System.Runtime.InteropServices;

public static class EdenConsoleMode {
  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr GetStdHandle(int id);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetConsoleMode(IntPtr handle, out uint mode);

  public static int Main(string[] arguments) {
    if (arguments.Length != 1) return 2;
    uint inputMode;
    uint outputMode;
    if (!GetConsoleMode(GetStdHandle(-10), out inputMode)) return 1;
    if (!GetConsoleMode(GetStdHandle(-11), out outputMode)) return 1;
    File.WriteAllText(arguments[0], inputMode + ":" + outputMode);
    return 0;
  }
}
`;

const windowsCompilerScript = `
param([string]$SourcePath, [string]$OutputPath)
Add-Type -Path $SourcePath -OutputAssembly $OutputPath -OutputType ConsoleApplication
`;

const windowsProcessedLineAndEchoInputMask = 0x0007;
const windowsConsoleHelperCompilationTimeoutMs = 60_000;

let preparedWindowsHelper:
  | { readonly directory: string; readonly executablePath: string }
  | undefined;

const runSnapshot: SnapshotRunner = (command, arguments_, options) =>
  spawnSync(command, arguments_, options);

function captureWindowsConsoleMode(runner: SnapshotRunner, helperPath: string): string {
  const snapshotDirectory = mkdtempSync(join(tmpdir(), "eden-console-mode-"));
  const snapshotPath = join(snapshotDirectory, "mode.txt");
  try {
    const snapshot = runner(helperPath, [snapshotPath], {
      encoding: "utf8",
      env: createPackageCommandEnvironment(process.env),
      stdio: ["inherit", "inherit", "pipe"],
      timeout: 5_000,
      windowsHide: true,
    });
    if (snapshot.error !== undefined) {
      throw snapshot.error;
    }
    if (snapshot.status !== 0) {
      throw new TypeError(`Unable to capture terminal mode: ${snapshot.stderr.trim()}`);
    }
    return normalizeWindowsConsoleMode(readFileSync(snapshotPath, "utf8").trim());
  } finally {
    rmSync(snapshotDirectory, { force: true, recursive: true });
  }
}

function normalizeWindowsConsoleMode(mode: string): string {
  const match = /^(\d+):(\d+)$/u.exec(mode);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new TypeError(`Unable to capture terminal mode: invalid Windows snapshot ${mode}`);
  }
  const inputMode = Number.parseInt(match[1], 10) & windowsProcessedLineAndEchoInputMask;
  return `${inputMode}:${match[2]}`;
}

export function captureTerminalModeFingerprint(
  platform: NodeJS.Platform = process.platform,
  runner: SnapshotRunner = runSnapshot,
  windowsHelperPath: string | undefined = process.env.EDEN_CONSOLE_MODE_HELPER,
): string {
  const terminalMode =
    platform === "win32"
      ? captureWindowsConsoleMode(runner, requireWindowsHelperPath(windowsHelperPath))
      : captureUnixTerminalMode(runner);
  if (terminalMode.length === 0) {
    throw new TypeError("Unable to capture terminal mode: empty snapshot");
  }
  return createHash("sha256").update(terminalMode).digest("hex");
}

function requireWindowsHelperPath(helperPath: string | undefined): string {
  if (helperPath === undefined) {
    throw new TypeError("Windows console-mode helper is unavailable");
  }
  return helperPath;
}

export function prepareWindowsConsoleModeHelper(
  platform: NodeJS.Platform = process.platform,
  existingHelperPath: string | undefined = process.env.EDEN_CONSOLE_MODE_HELPER,
): string | undefined {
  if (platform !== "win32") {
    return undefined;
  }
  if (existingHelperPath !== undefined) {
    return existingHelperPath;
  }
  if (preparedWindowsHelper !== undefined) {
    return preparedWindowsHelper.executablePath;
  }

  const directory = mkdtempSync(join(tmpdir(), "eden-console-helper-"));
  const compilerPath = join(directory, "compile.ps1");
  const executablePath = join(directory, "eden-console-mode.exe");
  const sourcePath = join(directory, "eden-console-mode.cs");
  try {
    writeFileSync(compilerPath, windowsCompilerScript, "utf8");
    writeFileSync(sourcePath, windowsConsoleModeSource, "utf8");
    const compilation = spawnSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-File",
        compilerPath,
        sourcePath,
        executablePath,
      ],
      {
        cwd: directory,
        encoding: "utf8",
        env: createPackageCommandEnvironment(process.env),
        timeout: windowsConsoleHelperCompilationTimeoutMs,
        windowsHide: true,
      },
    );
    if (compilation.error !== undefined) {
      throw compilation.error;
    }
    if (compilation.status !== 0) {
      throw new TypeError(`Unable to compile console-mode helper: ${compilation.stderr.trim()}`);
    }
    preparedWindowsHelper = { directory, executablePath };
    process.once("exit", () => rmSync(directory, { force: true, recursive: true }));
    return executablePath;
  } catch (error) {
    rmSync(directory, { force: true, recursive: true });
    throw error;
  }
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

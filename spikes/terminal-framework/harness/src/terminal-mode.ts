import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

type SnapshotOptions = {
  readonly encoding: "utf8";
  readonly stdio: ["ignore" | "inherit", "pipe", "pipe"];
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
Add-Type -TypeDefinition @'
using System;
using Microsoft.Win32.SafeHandles;
using System.Runtime.InteropServices;

public static class EdenConsoleMode {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool GetConsoleMode(SafeFileHandle handle, out uint mode);

  public static bool TryRead(string name, uint access, out uint mode) {
    using (SafeFileHandle handle = CreateFileW(name, access, 3, IntPtr.Zero, 3, 0, IntPtr.Zero)) {
      mode = 0;
      return !handle.IsInvalid && GetConsoleMode(handle, out mode);
    }
  }
}
'@
[uint32]$inputMode = 0
[uint32]$outputMode = 0
$inputOk = [EdenConsoleMode]::TryRead('CONIN$', 2147483648, [ref]$inputMode)
$outputOk = [EdenConsoleMode]::TryRead('CONOUT$', 2147483648, [ref]$outputMode)
if (-not ($inputOk -and $outputOk)) { exit 1 }
Write-Output ([string]$inputMode + ':' + [string]$outputMode)
`;

const runSnapshot: SnapshotRunner = (command, arguments_, options) =>
  spawnSync(command, arguments_, options);

export function captureTerminalModeFingerprint(
  platform: NodeJS.Platform = process.platform,
  runner: SnapshotRunner = runSnapshot,
): string {
  const snapshot =
    platform === "win32"
      ? runner(
          "powershell.exe",
          ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", windowsConsoleModeScript],
          {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 5_000,
            windowsHide: true,
          },
        )
      : runner("stty", ["-g"], {
          encoding: "utf8",
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
  return createHash("sha256").update(snapshot.stdout.trim()).digest("hex");
}

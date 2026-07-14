import { spawnSync } from "node:child_process";
import type { IPty } from "node-pty";

type WindowsProcessTreeTerminator = (pid: number) => void;

type TaskkillOptions = {
  readonly encoding: "utf8";
  readonly stdio: ["ignore", "pipe", "pipe"];
  readonly timeout: number;
  readonly windowsHide: boolean;
};

type TaskkillResult = {
  readonly error?: Error | undefined;
  readonly status: number | null;
  readonly stderr: string;
};

type TaskkillRunner = (
  command: string,
  arguments_: readonly string[],
  options: TaskkillOptions,
) => TaskkillResult;

const runTaskkill: TaskkillRunner = (command, arguments_, options) =>
  spawnSync(command, arguments_, options);

export const windowsProcessTreeTerminationTimeoutMs = 5_000;

export function shouldUseBundledConpty(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32";
}

export function terminateWindowsProcessTree(
  pid: number,
  runner: TaskkillRunner = runTaskkill,
  probeProcess: typeof process.kill = process.kill,
): void {
  const result = runner("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: windowsProcessTreeTerminationTimeoutMs,
    windowsHide: true,
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status === 0) {
    return;
  }
  try {
    probeProcess(pid, 0);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return;
    }
    throw error;
  }
  throw new Error(
    `taskkill failed with status ${result.status ?? "missing"}: ${result.stderr.trim().slice(0, 4_096)}`,
  );
}

export function terminatePtyProcessGroup(
  terminal: Pick<IPty, "kill" | "pid">,
  sendSignal: typeof process.kill = process.kill,
  platform: NodeJS.Platform = process.platform,
  terminateWindowsTree: WindowsProcessTreeTerminator = terminateWindowsProcessTree,
): void {
  if (platform === "win32") {
    try {
      terminateWindowsTree(terminal.pid);
    } finally {
      terminal.kill();
    }
    return;
  }
  try {
    sendSignal(-terminal.pid, "SIGKILL");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") {
      return;
    }
    if (error instanceof Error && "code" in error && error.code === "EPERM") {
      terminal.kill();
      return;
    }
    throw error;
  }
}

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { join } from "node:path";

export type NativeProcessRequest = {
  readonly arguments: readonly string[];
  readonly cwd: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly executable: string;
  readonly maxStderrBytes: number;
  readonly maxStdoutBytes: number;
  readonly timeoutMs: number;
};

export type NativeProcessObservation =
  | {
      readonly exitCode: number;
      readonly status: "exited";
      readonly stderr: Uint8Array;
      readonly stdout: Uint8Array;
    }
  | {
      readonly status:
        | "aborted"
        | "cleanup-failed"
        | "output-overflow"
        | "spawn-failed"
        | "timed-out";
    };

export interface NativeProcessPort {
  run(request: NativeProcessRequest, signal?: AbortSignal): Promise<NativeProcessObservation>;
}

type TaskkillResult = {
  readonly error?: Error | undefined;
  readonly status: number | null;
};

type TaskkillRunner = (
  command: string,
  arguments_: readonly string[],
  options: {
    readonly stdio: "ignore";
    readonly timeout: number;
    readonly windowsHide: boolean;
  },
) => TaskkillResult;

const runTaskkill: TaskkillRunner = (command, arguments_, options) =>
  spawnSync(command, arguments_, options);

export function terminateNativeProcessTree(
  child: Pick<ChildProcess, "kill" | "pid">,
  platform: NodeJS.Platform = process.platform,
  taskkill: TaskkillRunner = runTaskkill,
  probeProcess: typeof process.kill = process.kill,
): boolean {
  const pid = child.pid;
  if (pid === undefined) return true;
  if (platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
      return true;
    } catch {
      // Fall through to the direct child handle when process-group signaling is unavailable.
    }
    return child.kill("SIGKILL");
  }
  const systemRoot = process.env.SystemRoot ?? process.env.WINDIR;
  const executable =
    systemRoot === undefined ? "taskkill.exe" : join(systemRoot, "System32", "taskkill.exe");
  const result = taskkill(executable, ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    timeout: 5_000,
    windowsHide: true,
  });
  if (result.error === undefined && result.status === 0) return true;
  try {
    probeProcess(pid, 0);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return true;
  }
  child.kill("SIGKILL");
  return false;
}

function validRequest(request: NativeProcessRequest): boolean {
  return (
    request.executable.length > 0 &&
    request.cwd.length > 0 &&
    Number.isSafeInteger(request.maxStdoutBytes) &&
    request.maxStdoutBytes > 0 &&
    Number.isSafeInteger(request.maxStderrBytes) &&
    request.maxStderrBytes > 0 &&
    Number.isSafeInteger(request.timeoutMs) &&
    request.timeoutMs > 0 &&
    request.arguments.every((value) => !value.includes("\0")) &&
    Object.entries(request.environment).every(
      ([name, value]) => name.length > 0 && !name.includes("\0") && !value.includes("\0"),
    )
  );
}

export class NativeProcessRunner implements NativeProcessPort {
  async run(
    request: NativeProcessRequest,
    signal?: AbortSignal,
  ): Promise<NativeProcessObservation> {
    if (!validRequest(request)) return { status: "spawn-failed" };
    if (signal?.aborted === true) return { status: "aborted" };
    return new Promise((resolve) => {
      let settled = false;
      let stopped: Exclude<NativeProcessObservation["status"], "exited"> | null = null;
      let stdoutBytes = 0;
      let stderrBytes = 0;
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      const child = spawn(request.executable, [...request.arguments], {
        cwd: request.cwd,
        detached: process.platform !== "win32",
        env: { ...request.environment },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      const finish = (result: NativeProcessObservation) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        resolve(result);
      };
      const stop = (status: Exclude<NativeProcessObservation["status"], "exited">) => {
        if (stopped !== null) return;
        stopped = terminateNativeProcessTree(child) ? status : "cleanup-failed";
      };
      const abort = () => stop("aborted");
      const timer = setTimeout(() => stop("timed-out"), request.timeoutMs);
      signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => {
        stdoutBytes += chunk.byteLength;
        if (stdoutBytes > request.maxStdoutBytes) stop("output-overflow");
        else stdout.push(chunk);
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderrBytes += chunk.byteLength;
        if (stderrBytes > request.maxStderrBytes) stop("output-overflow");
        else stderr.push(chunk);
      });
      child.once("error", () => finish({ status: "spawn-failed" }));
      child.once("close", (code) => {
        if (stopped !== null) {
          finish({ status: stopped });
          return;
        }
        finish({
          exitCode: code ?? 1,
          status: "exited",
          stderr: Buffer.concat(stderr),
          stdout: Buffer.concat(stdout),
        });
      });
    });
  }
}

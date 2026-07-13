import { spawnSync } from "node:child_process";

export type PackageCommandResult = {
  readonly arguments: readonly string[];
  readonly command: string;
  readonly cwd: string;
  readonly durationMs: number;
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};

export type PackageCommandInvocation = {
  readonly arguments: readonly string[];
  readonly command: string;
};

export type PackageCommandCapture = {
  readonly result: PackageCommandResult;
  readonly stdout: string;
};

type PnpmRuntime = {
  readonly nodeExecutable: string;
  readonly npmExecPath: string | undefined;
  readonly platform: NodeJS.Platform;
};

const commandTimeoutMs = 120_000;
const commandBufferLimit = 4 * 1024 * 1024;
const outputLimit = 32 * 1024;
const allowedEnvironmentKeys = new Set(
  [
    "APPDATA",
    "CI",
    "COLORTERM",
    "ComSpec",
    "COREPACK_HOME",
    "COREPACK_ROOT",
    "HOME",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "PATH",
    "PATHEXT",
    "PNPM_HOME",
    "SystemDrive",
    "SystemRoot",
    "TEMP",
    "TERM",
    "TMP",
    "TMPDIR",
    "USERPROFILE",
    "WINDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
  ].map((key) => key.toUpperCase()),
);
const secretEnvironmentKey = /(?:AUTH|COOKIE|CREDENTIAL|KEY|PASSWORD|SECRET|TOKEN)/iu;

export function createPackageCommandEnvironment(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] =>
        allowedEnvironmentKeys.has(entry[0].toUpperCase()) && entry[1] !== undefined,
    ),
  );
}

export function resolvePnpmInvocation(
  arguments_: readonly string[],
  runtime: PnpmRuntime = {
    nodeExecutable: process.execPath,
    npmExecPath: process.env.npm_execpath,
    platform: process.platform,
  },
): PackageCommandInvocation {
  if (runtime.platform !== "win32") {
    return { arguments: arguments_, command: "pnpm" };
  }
  if (runtime.npmExecPath === undefined) {
    throw new Error("Windows packaging must run through a pnpm lifecycle script");
  }
  return {
    arguments: [runtime.npmExecPath, ...arguments_],
    command: runtime.nodeExecutable,
  };
}

export function runPackageCommand(
  command: string,
  arguments_: readonly string[],
  cwd: string,
): PackageCommandResult {
  return capturePackageCommand(command, arguments_, cwd).result;
}

export function capturePackageCommand(
  command: string,
  arguments_: readonly string[],
  cwd: string,
): PackageCommandCapture {
  const startedAt = performance.now();
  const completed = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: createPackageCommandEnvironment(process.env),
    maxBuffer: commandBufferLimit,
    shell: false,
    timeout: commandTimeoutMs,
  });
  const errorText = completed.error?.message ?? "";
  const stderr = redactPackageOutput(`${completed.stderr ?? ""}${errorText}`);
  const stdout = redactPackageOutput(completed.stdout ?? "");

  return {
    result: {
      arguments: arguments_,
      command,
      cwd,
      durationMs: Math.round(performance.now() - startedAt),
      exitCode: completed.status ?? 1,
      stderr: stderr.slice(-outputLimit),
      stdout: stdout.slice(-outputLimit),
    },
    stdout,
  };
}

export function capturePnpmCommand(
  commands: PackageCommandResult[],
  arguments_: readonly string[],
  cwd: string,
): PackageCommandCapture {
  const invocation = resolvePnpmInvocation(arguments_);
  const capture = capturePackageCommand(invocation.command, invocation.arguments, cwd);
  commands.push(capture.result);
  return capture;
}

export function runPnpmCommand(
  commands: PackageCommandResult[],
  arguments_: readonly string[],
  cwd: string,
): PackageCommandResult {
  const invocation = resolvePnpmInvocation(arguments_);
  const result = runPackageCommand(invocation.command, invocation.arguments, cwd);
  commands.push(result);
  return result;
}

export function requirePackageCommand(
  commands: PackageCommandResult[],
  command: string,
  arguments_: readonly string[],
  cwd: string,
  expectedExitCode = 0,
): PackageCommandResult {
  const result = runPackageCommand(command, arguments_, cwd);
  commands.push(result);
  return requireExpectedExit(result, expectedExitCode);
}

export function requirePnpmCommand(
  commands: PackageCommandResult[],
  arguments_: readonly string[],
  cwd: string,
  expectedExitCode = 0,
): PackageCommandResult {
  return requireExpectedExit(runPnpmCommand(commands, arguments_, cwd), expectedExitCode);
}

export function redactPackageOutput(output: string): string {
  let redacted = output;
  for (const [key, value] of Object.entries(process.env)) {
    if (secretEnvironmentKey.test(key) && value !== undefined && value.length >= 8) {
      redacted = redacted.replaceAll(value, "[REDACTED]");
    }
  }
  return redacted;
}

function requireExpectedExit(
  result: PackageCommandResult,
  expectedExitCode: number,
): PackageCommandResult {
  if (result.exitCode !== expectedExitCode) {
    throw new Error(
      `${result.command} ${result.arguments.join(" ")} exited ${result.exitCode}; expected ${expectedExitCode}\n${result.stderr}`,
    );
  }
  return result;
}

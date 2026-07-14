import { spawn } from "node-pty";
import {
  createInteractiveTerminalEnvironment,
  type PackageCommandResult,
  redactPackageOutput,
} from "./package-command.ts";
import { shouldUseBundledConpty, terminatePtyProcessGroup } from "./pty-cleanup.ts";

const outputLimit = 32 * 1024;
const inputReadyMarker = "__EDEN_INPUT_READY__";
const timeoutMs = 15_000;

export async function runInteractivePackageSmoke(
  command: string,
  arguments_: readonly string[],
  cwd: string,
): Promise<PackageCommandResult> {
  const startedAt = performance.now();
  const environment = createInteractiveTerminalEnvironment(process.env);
  environment.EDEN_TERMINAL_SPIKE_PROBE = "1";
  const terminal = spawn(command, [...arguments_], {
    cols: 60,
    cwd,
    env: environment,
    name: "xterm-256color",
    rows: 20,
    useConptyDll: shouldUseBundledConpty(),
  });
  let complete = false;
  let sentExit = false;
  let transcript = "";

  return new Promise((resolve) => {
    const finish = (exitCode: number, stderr: string) => {
      if (complete) {
        return;
      }
      complete = true;
      clearTimeout(timeout);
      outputSubscription.dispose();
      exitSubscription.dispose();
      resolve({
        arguments: arguments_,
        command,
        cwd,
        durationMs: Math.round(performance.now() - startedAt),
        exitCode,
        stderr,
        stdout: redactPackageOutput(transcript).slice(-outputLimit),
      });
    };
    const outputSubscription = terminal.onData((data) => {
      transcript = `${transcript}${data}`.slice(-outputLimit);
      if (!sentExit && transcript.includes(inputReadyMarker)) {
        sentExit = true;
        terminal.write("q");
      }
    });
    const exitSubscription = terminal.onExit((event) => {
      if (shouldUseBundledConpty()) {
        terminal.kill();
      }
      finish(event.exitCode, sentExit ? "" : "Packaged renderer exited before readiness");
    });
    const timeout = setTimeout(() => {
      terminatePtyProcessGroup(terminal);
      finish(
        1,
        `Timed out waiting for packaged renderer ${sentExit ? "exit" : "readiness"} after ${timeoutMs}ms`,
      );
    }, timeoutMs);
  });
}

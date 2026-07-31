#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { loadApplicationAssets } from "@eden/coding-runtime/application-assets";

import { helpText, parseArgs } from "./args.ts";

async function confirmDockerDiagnosticProbe(): Promise<"approve" | "deny"> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "deny";
  const { createInterface } = await import("node:readline/promises");
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  try {
    const answer = await prompt.question('Type "approve" to authorize this exact probe: ');
    return answer.trim() === "approve" ? "approve" : "deny";
  } finally {
    prompt.close();
  }
}

const parsed = await parseArgs(process.argv.slice(2));

if (!parsed.ok) {
  process.stderr.write(`${JSON.stringify(parsed.error)}\n`);
  process.exitCode = 2;
} else if (parsed.value.mode === "help") {
  process.stdout.write(helpText);
} else {
  const stateDirectory = process.env.EDEN_STATE_DIR ?? join(homedir(), ".eden-agent");
  const environmentBase = {
    cwd: process.cwd(),
    io: {
      stderr: (value: string) => process.stderr.write(value),
      stdout: (value: string) => process.stdout.write(value),
    },
    stateDirectory,
  };
  if (parsed.value.mode === "doctor") {
    const { runDockerDoctor } = await import("./doctor.ts");
    process.exitCode = await runDockerDoctor(parsed.value, environmentBase);
  } else if (parsed.value.mode === "doctor-probe") {
    const [
      { DockerCliDiagnosticProbePort, DockerCliDoctorPort, NativeProcessRunner },
      { runDockerDiagnosticProbe },
    ] = await Promise.all([import("@eden/coding-runtime"), import("./doctor-probe.ts")]);
    const invocationId = randomUUID();
    const nativeProcess = new NativeProcessRunner();
    process.exitCode = await runDockerDiagnosticProbe(parsed.value, {
      clock: () => new Date().toISOString(),
      confirm: confirmDockerDiagnosticProbe,
      effectId: `effect-probe-${invocationId}`,
      executionPort: new DockerCliDiagnosticProbePort({
        cwd: environmentBase.cwd,
        ...(parsed.value.dockerContext === undefined
          ? {}
          : { dockerContext: parsed.value.dockerContext }),
        nativeProcess,
      }),
      id: () => `probe-runtime-${randomUUID()}`,
      identity: {
        actionId: `action-docker-probe-${invocationId}`,
        approvalId: `approval-probe-${invocationId}`,
        eventId: `event-probe-approval-${invocationId}`,
        probeId: `probe-${invocationId}`,
        revision: 1,
      },
      io: environmentBase.io,
      observedAt: new Date().toISOString(),
      port: new DockerCliDoctorPort({
        cwd: environmentBase.cwd,
        ...(parsed.value.dockerContext === undefined
          ? {}
          : { dockerContext: parsed.value.dockerContext }),
        nativeProcess,
      }),
      recoveryEventId: `event-probe-recovery-${invocationId}`,
      stateDirectory,
    });
  } else {
    const repositoryTools = loadApplicationAssets(dirname(process.execPath));
    if (parsed.value.mode === "headless") {
      const { runHeadless } = await import("./headless.ts");
      process.exitCode = await runHeadless(parsed.value, {
        ...environmentBase,
        repositoryTools: await repositoryTools,
      });
    } else if (parsed.value.mode === "run-list" || parsed.value.mode === "run-show") {
      const { runHistory } = await import("./run-history.ts");
      const controller = new AbortController();
      const abort = () => controller.abort();
      process.once("SIGINT", abort);
      const historyProbe = process.env.EDEN_HISTORY_PROBE;
      if (historyProbe === "1" || historyProbe === "abort") {
        process.stderr.write("__EDEN_HISTORY_READY__\n");
        if (historyProbe === "abort") controller.abort();
      }
      try {
        process.exitCode = await runHistory(
          parsed.value,
          { ...environmentBase, repositoryTools: await repositoryTools },
          controller.signal,
        );
      } finally {
        process.removeListener("SIGINT", abort);
      }
    } else if (parsed.value.mode === "profile-list" || parsed.value.mode === "profile-check") {
      const { runProviderProfiles } = await import("./provider-profiles.ts");
      process.exitCode = await runProviderProfiles(parsed.value, {
        ...environmentBase,
        repositoryTools: await repositoryTools,
      });
    } else {
      try {
        const { runTui } = await import("./tui-runner.tsx");
        process.exitCode = await runTui({
          cwd: process.cwd(),
          onReady:
            process.env.EDEN_TUI_PROBE === "1"
              ? () => {
                  process.stderr.write("__EDEN_INPUT_READY__\n");
                }
              : undefined,
          repositoryTools,
          stateDirectory,
        });
      } catch {
        process.stderr.write(
          `${JSON.stringify({
            code: "runtime_failure",
            message: "The terminal interface could not start without exposing local state details.",
            recoverability: "fatal",
            suggestedActions: ["Inspect the state directory and retry."],
          })}\n`,
        );
        process.exitCode = 1;
      }
    }
  }
}

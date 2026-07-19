#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";

import { helpText, parseArgs } from "./args.ts";
import { runHeadless } from "./headless.ts";
import { runProviderProfiles } from "./provider-profiles.ts";
import { runHistory } from "./run-history.ts";
import { runTui } from "./tui-runner.tsx";

const parsed = parseArgs(process.argv.slice(2));

if (!parsed.ok) {
  process.stderr.write(`${JSON.stringify(parsed.error)}\n`);
  process.exitCode = 2;
} else if (parsed.value.mode === "help") {
  process.stdout.write(helpText);
} else {
  const stateDirectory = process.env.EDEN_STATE_DIR ?? join(homedir(), ".eden-agent");
  const environment = {
    cwd: process.cwd(),
    io: {
      stderr: (value: string) => process.stderr.write(value),
      stdout: (value: string) => process.stdout.write(value),
    },
    stateDirectory,
  };
  if (parsed.value.mode === "headless") {
    process.exitCode = await runHeadless(parsed.value, environment);
  } else if (parsed.value.mode === "run-list" || parsed.value.mode === "run-show") {
    const controller = new AbortController();
    const abort = () => controller.abort();
    process.once("SIGINT", abort);
    const historyProbe = process.env.EDEN_HISTORY_PROBE;
    if (historyProbe === "1" || historyProbe === "abort") {
      process.stderr.write("__EDEN_HISTORY_READY__\n");
      if (historyProbe === "abort") controller.abort();
    }
    try {
      process.exitCode = await runHistory(parsed.value, environment, controller.signal);
    } finally {
      process.removeListener("SIGINT", abort);
    }
  } else if (parsed.value.mode === "profile-list" || parsed.value.mode === "profile-check") {
    process.exitCode = await runProviderProfiles(parsed.value, environment);
  } else {
    try {
      process.exitCode = await runTui({
        cwd: process.cwd(),
        onReady:
          process.env.EDEN_TUI_PROBE === "1"
            ? () => {
                process.stderr.write("__EDEN_INPUT_READY__\n");
              }
            : undefined,
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

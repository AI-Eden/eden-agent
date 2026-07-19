#!/usr/bin/env node

import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { loadApplicationAssets } from "@eden/coding-runtime/application-assets";

import { helpText, parseArgs } from "./args.ts";

const parsed = parseArgs(process.argv.slice(2));

if (!parsed.ok) {
  process.stderr.write(`${JSON.stringify(parsed.error)}\n`);
  process.exitCode = 2;
} else if (parsed.value.mode === "help") {
  process.stdout.write(helpText);
} else {
  const stateDirectory = process.env.EDEN_STATE_DIR ?? join(homedir(), ".eden-agent");
  const repositoryTools = loadApplicationAssets(dirname(process.execPath));
  const environmentBase = {
    cwd: process.cwd(),
    io: {
      stderr: (value: string) => process.stderr.write(value),
      stdout: (value: string) => process.stdout.write(value),
    },
    stateDirectory,
  };
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

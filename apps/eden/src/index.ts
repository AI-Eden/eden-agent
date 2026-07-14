#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";

import { helpText, parseArgs } from "./args.ts";
import { runHeadless } from "./headless.ts";
import { runTui } from "./tui-runner.tsx";

const parsed = parseArgs(process.argv.slice(2));

if (!parsed.ok) {
  process.stderr.write(`${JSON.stringify(parsed.error)}\n`);
  process.exitCode = 2;
} else if (parsed.value.mode === "help") {
  process.stdout.write(helpText);
} else {
  const stateDirectory = process.env.EDEN_STATE_DIR ?? join(homedir(), ".eden-agent");
  process.exitCode =
    parsed.value.mode === "headless"
      ? await runHeadless(parsed.value, {
          cwd: process.cwd(),
          io: {
            stderr: (value) => process.stderr.write(value),
            stdout: (value) => process.stdout.write(value),
          },
          stateDirectory,
        })
      : await runTui({
          cwd: process.cwd(),
          onReady:
            process.env.EDEN_TUI_PROBE === "1"
              ? () => {
                  process.stderr.write("__EDEN_INPUT_READY__\n");
                }
              : undefined,
          stateDirectory,
        });
}

import { spawnSync } from "node:child_process";
import { prepareWindowsConsoleModeHelper } from "./terminal-mode.ts";

const environment = { ...process.env };
const windowsConsoleModeHelper = prepareWindowsConsoleModeHelper();
if (windowsConsoleModeHelper !== undefined) {
  environment.EDEN_CONSOLE_MODE_HELPER = windowsConsoleModeHelper;
}

const testRun = spawnSync(
  process.execPath,
  ["--import", "tsx", "--test", "--test-concurrency=1", "--test-force-exit", "test/*.test.ts"],
  {
    encoding: "utf8",
    env: environment,
    stdio: "inherit",
    windowsHide: true,
  },
);
if (testRun.error !== undefined) {
  throw testRun.error;
}
process.exitCode = testRun.status ?? 1;

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createInteractiveTerminalEnvironment,
  createPackageCommandEnvironment,
  resolvePnpmInvocation,
  runPackageCommand,
} from "../src/package-command.ts";

describe("package command observation", () => {
  it("records a command that cannot be spawned", () => {
    // Given a package tool is unavailable on one matrix runner.
    // When the harness attempts to run that missing executable.
    const result = runPackageCommand("eden-command-that-does-not-exist", [], process.cwd());

    // Then the matrix result preserves a bounded failure instead of throwing while logging it.
    assert.equal(result.exitCode, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /ENOENT|not found/u);
  });

  it("runs the Windows pnpm JavaScript entrypoint without a command shell", () => {
    // Given the lifecycle exposes pnpm's JavaScript entrypoint on Windows.
    // When the harness resolves a package-manager invocation.
    const invocation = resolvePnpmInvocation(["--version"], {
      nodeExecutable: "C:\\nodejs\\node.exe",
      npmExecPath: "C:\\pnpm\\pnpm.mjs",
      platform: "win32",
    });

    // Then Node receives the entrypoint and arguments directly without cmd.exe quoting.
    assert.deepEqual(invocation, {
      arguments: ["C:\\pnpm\\pnpm.mjs", "--version"],
      command: "C:\\nodejs\\node.exe",
    });
  });

  it("removes secret-bearing environment variables from package children", () => {
    // Given the parent process has required system paths and unrelated credentials.
    // When the harness creates the child-process environment.
    const environment = createPackageCommandEnvironment({
      HOME: "/home/runner",
      Path: "C:\\Windows\\System32",
      PROVIDER_API_KEY: "secret-canary-value",
    });

    // Then required paths remain available and the credential is not inherited.
    assert.deepEqual(environment, {
      HOME: "/home/runner",
      Path: "C:\\Windows\\System32",
    });
  });

  it("keeps real PTY children interactive under an outer CI runner", () => {
    // Given the automation process marks its own environment as non-interactive CI.
    // When the harness creates the environment for a child attached to a real PTY.
    const environment = createInteractiveTerminalEnvironment({
      CI: "true",
      GITHUB_TOKEN: "secret-canary-value",
      PATH: "/usr/bin",
    });

    // Then Ink sees the documented interactive opt-out and credentials remain excluded.
    assert.deepEqual(environment, { CI: "false", PATH: "/usr/bin" });
  });
});

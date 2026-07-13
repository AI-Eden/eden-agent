import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

async function runCli(...arguments_: readonly string[]) {
  const process = Bun.spawn([Bun.which("bun") ?? "bun", "src/cli.tsx", ...arguments_], {
    cwd: packageRoot,
    stderr: "pipe",
    stdout: "pipe",
  });
  const [exitCode, stderr, stdout] = await Promise.all([
    process.exited,
    new Response(process.stderr).text(),
    new Response(process.stdout).text(),
  ]);
  return { exitCode, stderr, stdout };
}

describe("OpenTUI spike CLI", () => {
  it("documents the launch command without starting the native renderer", async () => {
    // Given a non-interactive request for the spike launch contract.
    // When the CLI is invoked with the standard help flag.
    const result = await runCli("--help");

    // Then it succeeds and reports the Bun-only matching-surface command.
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: bun src/cli.tsx");
    expect(result.stdout).toContain("q       Exit normally");
    expect(result.stdout).toContain("Ctrl+C  Cancel with exit code 130");
  });

  it("rejects an unknown option before starting the native renderer", async () => {
    // Given an unsupported command-line option.
    // When the CLI validates its non-interactive launch boundary.
    const result = await runCli("--unknown");

    // Then it fails predictably and points back to the help contract.
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown option: --unknown");
    expect(result.stderr).toContain("Run with --help for usage.");
  });
});

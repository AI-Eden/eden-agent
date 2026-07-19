import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const warmupCount = 1;
const trialCount = 5;
const timerAllowanceMs = 2;
const timeoutMs = 15_000;

function percentile(values, ratio) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
}

function summarize(values) {
  return {
    maximumMs: Math.max(...values),
    medianMs: percentile(values, 0.5),
    minimumMs: Math.min(...values),
    p95Ms: percentile(values, 0.95),
  };
}

function threshold(summary) {
  return Math.max(summary.p95Ms * 1.25, summary.p95Ms + timerAllowanceMs);
}

async function runTrial(spawn, executable, phase, index) {
  const directory = await mkdtemp(join(tmpdir(), "eden-r2-r1-baseline-"));
  const workspace = join(directory, "workspace");
  const stateDirectory = join(directory, "state");
  await mkdir(workspace);
  const startedAt = new Date();
  const started = performance.now();
  let inputStarted = null;
  let inputToRenderMs = null;
  let startupMs = null;
  let transcript = "";
  let settled = false;

  try {
    const result = await new Promise((resolveTrial) => {
      const terminal = spawn(executable, [], {
        cols: 100,
        cwd: workspace,
        env: {
          ...process.env,
          EDEN_STATE_DIR: stateDirectory,
          EDEN_TUI_PROBE: "1",
        },
        name: "xterm-256color",
        rows: 30,
      });
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        terminal.kill();
        resolveTrial({ error: "timeout", outcome: "failed" });
      }, timeoutMs);

      terminal.onData((chunk) => {
        transcript = `${transcript}${chunk}`.slice(-2 * 1024 * 1024);
        if (startupMs === null && transcript.includes("__EDEN_INPUT_READY__")) {
          startupMs = performance.now() - started;
          inputStarted = performance.now();
          terminal.write("t");
        }
        if (
          inputStarted !== null &&
          inputToRenderMs === null &&
          transcript.includes("trust: trusted")
        ) {
          inputToRenderMs = performance.now() - inputStarted;
          terminal.write("\u0003");
        }
      });

      terminal.onExit(({ exitCode, signal }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (startupMs === null || inputToRenderMs === null || exitCode !== 130) {
          resolveTrial({
            error: `incomplete trial: startup=${String(startupMs)} input=${String(inputToRenderMs)} exit=${String(exitCode)} signal=${String(signal)}`,
            outcome: "failed",
          });
          return;
        }
        resolveTrial({
          durationMs: performance.now() - started,
          exitCode,
          inputToRenderMs,
          outcome: "passed",
          startupMs,
        });
      });
    });

    return {
      ...result,
      endedAt: new Date().toISOString(),
      index,
      phase,
      startedAt: startedAt.toISOString(),
    };
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

const executable = resolve(process.argv[2] ?? "");
const outputPath = resolve(process.argv[3] ?? "");
const sourceSha = process.argv[4];
if (sourceSha === undefined || !/^[0-9a-f]{40}$/u.test(sourceSha)) {
  throw new Error("The R1 baseline requires one exact source SHA.");
}
const executableMetadata = await stat(executable);
if (!executableMetadata.isFile()) throw new Error("The R1 executable is unavailable.");

const requireFromHarness = createRequire(
  new URL("../spikes/terminal-framework/harness/package.json", import.meta.url),
);
const { spawn } = requireFromHarness("node-pty");
const trials = [];
for (let index = 1; index <= warmupCount + trialCount; index += 1) {
  trials.push(
    await runTrial(spawn, executable, index <= warmupCount ? "warmup" : "recorded", index),
  );
}

const recorded = trials.filter((trial) => trial.phase === "recorded");
const passed = recorded.filter((trial) => trial.outcome === "passed");
if (passed.length !== trialCount) {
  throw new Error(
    `The R1 baseline retained ${String(trialCount - passed.length)} failed trial(s).`,
  );
}
const startup = summarize(passed.map((trial) => trial.startupMs));
const input = summarize(passed.map((trial) => trial.inputToRenderMs));
const evidence = {
  artifact: { pathClass: "workspace-build", sizeBytes: executableMetadata.size },
  command:
    "node scripts/r2-r1-baseline.mjs apps/eden/dist/eden docs/benchmark-results/2026-07-19-r2-r1-baseline-linux-x64.json <exact-sha>",
  environment: {
    architecture: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
    operatingSystem: platform(),
    release: release(),
    terminal: "node-pty xterm-256color 100x30",
  },
  fixture: {
    inputAction: "grant exact-workspace trust with the t key",
    scrollToRender: "not-run",
    viewport: "100x30",
  },
  recordedAt: new Date().toISOString(),
  schemaVersion: 1,
  source: { sha: sourceSha },
  summary: {
    failuresRetained: recorded.length - passed.length,
    inputToRenderMs: input,
    startupMs: startup,
  },
  thresholds: {
    coldStandaloneStartAbsoluteMs: 2000,
    inputToRenderAbsoluteMs: 100,
    inputToRenderRegressionMs: threshold(input),
    scrollToRender: "not-run",
    startupRegressionMs: threshold(startup),
    timerAllowanceMs,
  },
  trialCount,
  trials,
  warmupCount,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, status: "passed" })}\n`);

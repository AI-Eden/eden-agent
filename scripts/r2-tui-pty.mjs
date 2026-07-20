import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { cpus, platform, release, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";

const timeoutMs = 15_000;
const warmupCount = 1;
const trialCount = 5;
const timerAllowanceMs = 2;
const startupRegressionMs = 244;
const inputRegressionMs = 357;

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

function validateEvidence(evidence, enforceControlledRegression = true) {
  if (evidence.warmupCount !== warmupCount || evidence.trialCount !== trialCount) {
    throw new Error("R2 PTY evidence must retain one warm-up and five measured trials.");
  }
  if (evidence.summary.failuresRetained !== 0) {
    throw new Error("R2 PTY evidence retained a failed measured trial.");
  }
  if (evidence.summary.startupMs.p95Ms > 2_000) {
    throw new Error("R2 PTY cold startup exceeded the absolute 2 second ceiling.");
  }
  if (enforceControlledRegression && evidence.summary.startupMs.p95Ms > startupRegressionMs) {
    throw new Error(
      `R2 PTY cold startup ${evidence.summary.startupMs.p95Ms.toFixed(2)} ms exceeded the frozen ${startupRegressionMs} ms regression threshold.`,
    );
  }
  if (enforceControlledRegression && evidence.summary.inputToRenderMs.p95Ms > inputRegressionMs) {
    throw new Error(
      `R2 PTY trust input ${evidence.summary.inputToRenderMs.p95Ms.toFixed(2)} ms exceeded the frozen ${inputRegressionMs} ms regression threshold.`,
    );
  }
  if (evidence.summary.inputToRenderMs.p95Ms > 100) {
    throw new Error(
      `R2 PTY trust input ${evidence.summary.inputToRenderMs.p95Ms.toFixed(2)} ms exceeded the independent 100 ms ceiling.`,
    );
  }
  if (enforceControlledRegression && evidence.summary.durableTrustMs.p95Ms > inputRegressionMs) {
    throw new Error(
      `R2 PTY durable trust ${evidence.summary.durableTrustMs.p95Ms.toFixed(2)} ms exceeded the frozen ${inputRegressionMs} ms regression threshold.`,
    );
  }
  for (const viewport of ["60x20", "80x24", "100x30"]) {
    const row = evidence.matchingSurface.find((candidate) => candidate.viewport === viewport);
    if (row?.status !== "passed") throw new Error(`Missing passing PTY row for ${viewport}.`);
  }
  if (evidence.failureJourney.status !== "passed") {
    throw new Error("The real PTY failure journey did not pass.");
  }
  if (evidence.terminalRestoration !== "restored") {
    throw new Error("The real PTY did not restore the parent terminal.");
  }
}

if (process.argv[2] === "--self-test") {
  const timing = { maximumMs: 10, medianMs: 8, minimumMs: 6, p95Ms: 10 };
  validateEvidence({
    failureJourney: { status: "passed" },
    matchingSurface: ["60x20", "80x24", "100x30"].map((viewport) => ({
      status: "passed",
      viewport,
    })),
    summary: {
      durableTrustMs: timing,
      failuresRetained: 0,
      inputToRenderMs: timing,
      startupMs: timing,
    },
    terminalRestoration: "restored",
    trialCount,
    warmupCount,
  });
  for (const mutation of [
    { summary: { failuresRetained: 1, inputToRenderMs: timing, startupMs: timing } },
    {
      summary: {
        failuresRetained: 0,
        inputToRenderMs: { ...timing, p95Ms: 101 },
        startupMs: timing,
      },
    },
    { matchingSurface: [{ status: "passed", viewport: "60x20" }] },
  ]) {
    let rejected = false;
    try {
      validateEvidence({
        failureJourney: { status: "passed" },
        matchingSurface: ["60x20", "80x24", "100x30"].map((viewport) => ({
          status: "passed",
          viewport,
        })),
        summary: {
          durableTrustMs: timing,
          failuresRetained: 0,
          inputToRenderMs: timing,
          startupMs: timing,
        },
        terminalRestoration: "restored",
        trialCount,
        warmupCount,
        ...mutation,
      });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("R2 PTY evidence self-test accepted invalid evidence.");
  }
  validateEvidence(
    {
      failureJourney: { status: "passed" },
      matchingSurface: ["60x20", "80x24", "100x30"].map((viewport) => ({
        status: "passed",
        viewport,
      })),
      summary: {
        durableTrustMs: { ...timing, p95Ms: 500 },
        failuresRetained: 0,
        inputToRenderMs: timing,
        startupMs: { ...timing, p95Ms: 500 },
      },
      terminalRestoration: "restored",
      trialCount,
      warmupCount,
    },
    false,
  );
  await new Promise((resolveWrite, rejectWrite) => {
    process.stdout.write(`${JSON.stringify({ status: "passed" })}\n`, (error) => {
      if (error === null || error === undefined) resolveWrite();
      else rejectWrite(error);
    });
  });
  process.exit(0);
}

const executable = resolve(process.argv[2] ?? "");
const outputPath = resolve(process.argv[3] ?? "");
const sourceSha = process.argv[4];
const evidenceMode = process.argv[5] ?? "--controlled";
if (sourceSha === undefined || !/^[0-9a-f]{40}$/u.test(sourceSha)) {
  throw new Error("R2 PTY evidence requires one exact source SHA.");
}
if (evidenceMode !== "--controlled" && evidenceMode !== "--functional-only") {
  throw new Error("R2 PTY evidence mode must be --controlled or --functional-only.");
}
if (platform() !== "linux") {
  throw new Error(
    "This evidence command currently records Linux only; other platforms are not-run.",
  );
}
const executableMetadata = await stat(executable);
if (!executableMetadata.isFile()) throw new Error("R2 PTY requires one packaged executable.");

const requireFromHarness = createRequire(
  new URL("../spikes/terminal-framework/harness/package.json", import.meta.url),
);
const { spawn } = requireFromHarness("node-pty");
const { terminatePtyProcessGroup } = await import(
  "../spikes/terminal-framework/harness/dist/src/pty-cleanup.js"
);

function screenText(transcript, columns, rows) {
  const cells = Array.from({ length: rows }, () => Array.from({ length: columns }, () => " "));
  let row = 0;
  let column = 0;
  let savedRow = 0;
  let savedColumn = 0;
  const clear = () => {
    for (const line of cells) line.fill(" ");
    row = 0;
    column = 0;
  };
  for (let index = 0; index < transcript.length; ) {
    const character = transcript[index];
    if (character === "\u001B") {
      if (transcript[index + 1] === "]") {
        const bell = transcript.indexOf("\u0007", index + 2);
        const terminator = transcript.indexOf("\u001B\\", index + 2);
        const end =
          bell === -1 ? terminator : terminator === -1 ? bell : Math.min(bell, terminator);
        index = end === -1 ? transcript.length : end + (end === terminator ? 2 : 1);
        continue;
      }
      if (["P", "X", "^", "_"].includes(transcript[index + 1] ?? "")) {
        const terminator = transcript.indexOf("\u001B\\", index + 2);
        index = terminator === -1 ? transcript.length : terminator + 2;
        continue;
      }
      const match = /^([0-9;?]*)([ -/]*)?([@-~])/u.exec(transcript.slice(index + 2));
      if (match !== null) {
        const final = match[3];
        const parameters = match[1]
          .replace(/^\?/u, "")
          .split(";")
          .map((value) => (value === "" ? 0 : Number.parseInt(value, 10)));
        const first = parameters[0] ?? 0;
        if ((final === "H" || final === "f") && !match[1].startsWith("?")) {
          row = Math.max(0, Math.min(rows - 1, (parameters[0] || 1) - 1));
          column = Math.max(0, Math.min(columns - 1, (parameters[1] || 1) - 1));
        } else if (final === "A") row = Math.max(0, row - (first || 1));
        else if (final === "B") row = Math.min(rows - 1, row + (first || 1));
        else if (final === "C") column = Math.min(columns - 1, column + (first || 1));
        else if (final === "D") column = Math.max(0, column - (first || 1));
        else if (final === "G") column = Math.max(0, Math.min(columns - 1, (first || 1) - 1));
        else if (final === "d") row = Math.max(0, Math.min(rows - 1, (first || 1) - 1));
        else if (final === "J" && (first === 2 || first === 3)) clear();
        else if (final === "K")
          cells[row]?.fill(" ", first === 1 ? 0 : column, first === 1 ? column + 1 : undefined);
        else if (final === "X")
          cells[row]?.fill(" ", column, Math.min(columns, column + (first || 1)));
        else if (final === "s" && !match[1].startsWith("?")) {
          savedRow = row;
          savedColumn = column;
        } else if (final === "u" && !match[1].startsWith("?")) {
          row = savedRow;
          column = savedColumn;
        }
        index += match[0].length + 2;
        continue;
      }
      index += 2;
      continue;
    }
    if (character === "\r") column = 0;
    else if (character === "\n") {
      row = Math.min(rows - 1, row + 1);
      column = 0;
    } else if (character === "\b") column = Math.max(0, column - 1);
    else if (character !== undefined && character >= " ") {
      cells[row][column] = character;
      column += 1;
      if (column >= columns) {
        column = 0;
        row = Math.min(rows - 1, row + 1);
      }
    }
    index += 1;
  }
  return cells.map((line) => line.join("").trimEnd()).join("\n");
}

async function waitFor(read, predicate, label) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    const value = read();
    if (predicate(value)) return { durationMs: performance.now() - started, value };
    await delay(5);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function quotePosix(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function restored(transcript) {
  const before = /__EDEN_MODE_BEFORE__=([^\r\n]+)/u.exec(transcript)?.[1];
  const after = /__EDEN_MODE_AFTER__=([^\r\n]+)/u.exec(transcript)?.[1];
  const cursor =
    !transcript.includes("\u001B[?25l") ||
    transcript.lastIndexOf("\u001B[?25h") > transcript.lastIndexOf("\u001B[?25l");
  const alternate =
    !transcript.includes("\u001B[?1049h") ||
    transcript.lastIndexOf("\u001B[?1049l") > transcript.lastIndexOf("\u001B[?1049h");
  return before !== undefined && before === after && cursor && alternate;
}

async function runMatchingSurface(width, height, index) {
  const root = await mkdtemp(join(tmpdir(), "eden-r2-pty-match-"));
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  await mkdir(workspace);
  const challenge = randomUUID().replaceAll("-", "");
  const sentinel = `EDEN_R2_TUI_RESTORED_${challenge}`;
  const shellScript = `trap : INT; before=$(stty -g); ${quotePosix(executable)}; code=$?; after=$(stty -g); printf '__EDEN_MODE_BEFORE__=%s\\n' "$before"; printf '__EDEN_MODE_AFTER__=%s\\n' "$after"; printf '__EDEN_CANDIDATE_EXIT__=%s\\n' "$code"; printf '__EDEN_PARENT_READY__\\n'; IFS= read -r token; printf 'EDEN_R2_TUI_RESTORED_%s\\n' "$token"; exit "$code"`;
  let transcript = "";
  let columns = width;
  let rows = height;
  let exited = false;
  const terminal = spawn("/bin/sh", ["-c", shellScript], {
    cols: columns,
    cwd: workspace,
    env: {
      ...process.env,
      CI: "false",
      EDEN_STATE_DIR: stateDirectory,
      EDEN_TUI_PROBE: "1",
      TERM: "xterm-256color",
    },
    name: "xterm-256color",
    rows,
  });
  const data = terminal.onData((chunk) => {
    transcript = `${transcript}${chunk}`.slice(-2 * 1_048_576);
  });
  const exit = new Promise((resolveExit) =>
    terminal.onExit(({ exitCode }) => {
      exited = true;
      resolveExit(exitCode);
    }),
  );
  const screen = () => screenText(transcript, columns, rows);
  try {
    await waitFor(
      () => transcript,
      (value) => value.includes("__EDEN_INPUT_READY__"),
      "input readiness",
    );
    await waitFor(screen, (value) => value.includes("trust: restricted"), "restricted authority");
    terminal.write("?");
    await waitFor(screen, (value) => value.includes("Shortcut help"), "shortcut help");
    await delay(100);
    terminal.write("?");
    await waitFor(screen, (value) => !value.includes("Shortcut help"), "shortcut help close");
    await delay(100);
    terminal.write("\u0010");
    await waitFor(screen, (value) => value.includes("focus: overlay.palette"), "command palette");
    terminal.write("\u001B[B");
    await delay(100);
    terminal.write("\u001B");
    await waitFor(screen, (value) => !value.includes("focus: overlay.palette"), "palette close");
    await delay(100);
    terminal.write("t");
    await waitFor(screen, (value) => value.includes("trust: trusted"), "trusted authority");
    terminal.write("\t");
    await waitFor(screen, (value) => value.includes("focus: workspace.history"), "Tab focus");
    await delay(100);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      terminal.write("\u001B[Z");
      await delay(100);
      if (screen().includes("focus: workspace.composer")) break;
    }
    await waitFor(
      screen,
      (value) => value.includes("focus: workspace.composer"),
      "Shift+Tab focus",
    );
    for (const [nextColumns, nextRows] of [
      [60, 20],
      [80, 24],
      [100, 30],
      [width, height],
    ]) {
      terminal.resize(nextColumns, nextRows);
      columns = nextColumns;
      rows = nextRows;
      await delay(20);
    }
    terminal.write("\r");
    await waitFor(screen, (value) => value.includes("Enter submits"), "composer focus");
    const cjkTask = `检查仓库说明与长内容-${index}`;
    terminal.write(`\u001B[200~${cjkTask}\u001B[201~`);
    await waitFor(
      screen,
      (value) => [..."检查仓库说明与长内容"].every((character) => value.includes(character)),
      "CJK bracketed paste",
    );
    terminal.write("\u0010");
    await waitFor(screen, (value) => value.includes("focus: overlay.palette"), "composer Ctrl+P");
    await delay(100);
    terminal.write("\u001B");
    await waitFor(
      screen,
      (value) => !value.includes("focus: overlay.palette"),
      "composer palette close",
    );
    terminal.write("\u0003");
    await waitFor(
      () => transcript,
      (value) => value.includes("__EDEN_PARENT_READY__"),
      "parent shell",
    );
    terminal.write(`${challenge}\n`);
    await waitFor(
      () => transcript,
      (value) => value.includes(sentinel),
      "parent shell sentinel",
    );
    const exitCode = await exit;
    if (exitCode !== 130 || !restored(transcript)) {
      throw new Error(`PTY ${width}x${height} exit/restoration mismatch.`);
    }
    return {
      cjkBracketedPaste: "observed",
      commandPalette: "observed",
      focusPreservedAcrossResize: screen().includes("focus: workspace.composer"),
      frameSha256: createHash("sha256").update(screen()).digest("hex"),
      help: "observed",
      keyboardOnly: true,
      resizeSequence: ["60x20", "80x24", "100x30", `${width}x${height}`],
      status: "passed",
      terminalRestoration: "restored",
      viewport: `${width}x${height}`,
    };
  } catch (error) {
    throw new Error(`${String(error)}\nLast ${width}x${height} screen:\n${screen()}`);
  } finally {
    data.dispose();
    if (!exited) terminatePtyProcessGroup(terminal);
    await rm(root, { force: true, recursive: true });
  }
}

async function runFailureJourney() {
  const root = await mkdtemp(join(tmpdir(), "eden-r2-pty-failure-"));
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  const emptyPath = join(root, "empty-path");
  await mkdir(workspace);
  await mkdir(emptyPath);
  let transcript = "";
  const terminal = spawn(executable, [], {
    cols: 60,
    cwd: workspace,
    env: {
      ...process.env,
      EDEN_STATE_DIR: stateDirectory,
      EDEN_TUI_PROBE: "1",
      PATH: emptyPath,
      TERM: "xterm-256color",
    },
    name: "xterm-256color",
    rows: 20,
  });
  const data = terminal.onData(
    (chunk) => (transcript = `${transcript}${chunk}`.slice(-2 * 1_048_576)),
  );
  const exit = new Promise((resolveExit) =>
    terminal.onExit(({ exitCode }) => resolveExit(exitCode)),
  );
  const screen = () => screenText(transcript, 60, 20);
  try {
    await waitFor(
      () => transcript,
      (value) => value.includes("__EDEN_INPUT_READY__"),
      "failure readiness",
    );
    await waitFor(screen, (value) => value.includes("Git blocked"), "missing Git failure");
    terminal.write("?");
    await waitFor(screen, (value) => value.includes("Shortcut help"), "failure help");
    terminal.write("\u0003");
    const exitCode = await exit;
    if (exitCode !== 130) throw new Error(`Failure journey exited ${exitCode}.`);
    return {
      errorRecovery: "observed",
      exitCode,
      failure: "missing compatible host Git",
      status: "passed",
      viewport: "60x20",
    };
  } catch (error) {
    throw new Error(`${String(error)}\nLast failure screen:\n${screen()}`);
  } finally {
    data.dispose();
    await rm(root, { force: true, recursive: true });
  }
}

async function runLatencyTrial(phase, index) {
  const root = await mkdtemp(join(tmpdir(), "eden-r2-pty-latency-"));
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  await mkdir(workspace);
  let transcript = "";
  let acknowledgementObservedAt = null;
  let completionObservedAt = null;
  let inputStartedAt = null;
  let startupObservedAt = null;
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const terminal = spawn(executable, [], {
    cols: 100,
    cwd: workspace,
    env: {
      ...process.env,
      EDEN_STATE_DIR: stateDirectory,
      EDEN_TUI_PROBE: "1",
      TERM: "xterm-256color",
    },
    name: "xterm-256color",
    rows: 30,
  });
  const data = terminal.onData((chunk) => {
    transcript = `${transcript}${chunk}`.slice(-2 * 1_048_576);
    const observedAt = performance.now();
    if (startupObservedAt === null && transcript.includes("__EDEN_INPUT_READY__")) {
      startupObservedAt = observedAt;
    }
    if (
      inputStartedAt !== null &&
      acknowledgementObservedAt === null &&
      transcript.includes("authority update: trust awaiting durable commit")
    ) {
      acknowledgementObservedAt = observedAt;
    }
    if (
      inputStartedAt !== null &&
      completionObservedAt === null &&
      transcript.includes("trust: trusted")
    ) {
      completionObservedAt = observedAt;
    }
  });
  const exit = new Promise((resolveExit) =>
    terminal.onExit(({ exitCode }) => resolveExit(exitCode)),
  );
  try {
    await waitFor(
      () => transcript,
      (value) => value.includes("__EDEN_INPUT_READY__"),
      "latency startup",
    );
    inputStartedAt = performance.now();
    terminal.write("t");
    await waitFor(
      () => transcript,
      (value) => value.includes("authority update: trust awaiting durable commit"),
      "latency trust acknowledgement",
    );
    await waitFor(
      () => transcript,
      (value) => value.includes("trust: trusted"),
      "latency trust render",
    );
    if (
      startupObservedAt === null ||
      acknowledgementObservedAt === null ||
      completionObservedAt === null
    ) {
      throw new Error("The latency markers were not timestamped by the PTY data callback.");
    }
    terminal.write("\u0003");
    const exitCode = await exit;
    return {
      endedAt: new Date().toISOString(),
      durableTrustMs: completionObservedAt - inputStartedAt,
      exitCode,
      index,
      inputToRenderMs: acknowledgementObservedAt - inputStartedAt,
      outcome: exitCode === 130 ? "passed" : "failed",
      phase,
      startedAt,
      startupMs: startupObservedAt - started,
      totalMs: performance.now() - started,
    };
  } catch (error) {
    terminatePtyProcessGroup(terminal);
    return {
      endedAt: new Date().toISOString(),
      error: String(error),
      index,
      outcome: "failed",
      phase,
      startedAt,
    };
  } finally {
    data.dispose();
    await rm(root, { force: true, recursive: true });
  }
}

const matchingSurface = [];
for (const [index, [width, height]] of [
  [60, 20],
  [80, 24],
  [100, 30],
].entries()) {
  matchingSurface.push(await runMatchingSurface(width, height, index + 1));
}
const failureJourney = await runFailureJourney();
const trials = [];
for (let index = 1; index <= warmupCount + trialCount; index += 1) {
  trials.push(await runLatencyTrial(index <= warmupCount ? "warmup" : "recorded", index));
}
const recorded = trials.filter((trial) => trial.phase === "recorded");
const passed = recorded.filter((trial) => trial.outcome === "passed");
const summary = {
  durableTrustMs: summarize(passed.map((trial) => trial.durableTrustMs)),
  failuresRetained: recorded.length - passed.length,
  inputToRenderMs: summarize(passed.map((trial) => trial.inputToRenderMs)),
  startupMs: summarize(passed.map((trial) => trial.startupMs)),
};
const evidence = {
  artifact: {
    pathClass: "workspace-build",
    sha256: createHash("sha256")
      .update(await readFile(executable))
      .digest("hex"),
    sizeBytes: executableMetadata.size,
  },
  command:
    "node scripts/r2-tui-pty.mjs apps/eden/dist/eden <output.json> <exact-sha> [--controlled|--functional-only]",
  environment: {
    architecture: process.arch,
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
    operatingSystem: platform(),
    release: release(),
    terminal: "node-pty xterm-256color",
  },
  failureJourney,
  fixture: {
    content: "deterministic fake runtime plus missing host Git failure",
    controlledStartupComparison:
      evidenceMode === "--controlled" ? "enforced" : "not-run-cross-machine",
    scrollToRender: "not-run",
  },
  matchingSurface,
  recordedAt: new Date().toISOString(),
  schemaVersion: 1,
  source: { sha: sourceSha },
  summary,
  terminalRestoration: matchingSurface.every((row) => row.terminalRestoration === "restored")
    ? "restored"
    : "failed",
  thresholds: {
    coldStandaloneStartAbsoluteMs: 2_000,
    inputToRenderAbsoluteMs: 100,
    inputToRenderRegressionMs: inputRegressionMs,
    scrollToRender: "not-run",
    startupRegressionMs,
    timerAllowanceMs,
  },
  trialCount,
  trials,
  warmupCount,
};
await mkdir(dirname(outputPath), { recursive: true });
try {
  validateEvidence(evidence, evidenceMode === "--controlled");
} catch (error) {
  await writeFile(
    outputPath,
    `${JSON.stringify({ ...evidence, status: "failed", validationError: String(error) }, null, 2)}\n`,
    "utf8",
  );
  throw error;
}
await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ outputPath, status: "passed" })}\n`);

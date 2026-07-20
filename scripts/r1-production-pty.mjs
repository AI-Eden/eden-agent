import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve, win32 } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const eventTimeoutMs = 15_000;
const transcriptLimit = 2 * 1_048_576;
const supportRows = [
  { id: "real-terminal-app", status: "not-run" },
  { id: "windows-terminal", status: "not-run" },
  { id: "powershell-ime", status: "not-run" },
  { id: "signing", status: "not-run" },
  { id: "installer", status: "not-run" },
  { id: "release-support", status: "not-run" },
];
const requiredEvidenceIds = [
  "model-causality",
  "workspace-trust",
  "bounded-history",
  "journal-byte-limit",
  "journal-record-byte-limit",
  "journal-record-limit",
  "catalog-byte-budget",
  "catalog-record-budget",
  "history-abort",
  "linked-and-replaced-history",
  "missing-history-no-write",
  "corrupt-history",
  "workspace-isolation",
  "production-pty-success",
  "production-pty-history",
];

function validateRequiredRows(rows) {
  const expected = new Set(requiredEvidenceIds);
  const seen = new Set();
  for (const row of rows) {
    if (!expected.has(row.id)) throw new Error(`Unknown required evidence row: ${row.id}.`);
    if (seen.has(row.id)) throw new Error(`Duplicate required evidence row: ${row.id}.`);
    seen.add(row.id);
    if (row.required !== true || row.status !== "passed") {
      throw new Error(`Required evidence row did not pass: ${row.id}.`);
    }
  }
  const missing = requiredEvidenceIds.find((id) => !seen.has(id));
  if (missing !== undefined) {
    throw new Error(`Missing required evidence row: ${missing}.`);
  }
}

function packageManagerInvocation(
  platform = process.platform,
  pnpmHome = process.env.PNPM_HOME,
  nodeExecutable = process.execPath,
) {
  if (platform !== "win32") return { arguments: ["--version"], command: "pnpm" };
  if (pnpmHome === undefined) {
    throw new Error("Windows package-manager evidence requires PNPM_HOME.");
  }
  return {
    arguments: [win32.resolve(pnpmHome, "..", "pnpm", "bin", "pnpm.cjs"), "--version"],
    command: nodeExecutable,
  };
}

if (process.argv[2] === "--self-test") {
  const passing = requiredEvidenceIds.map((id) => ({ id, required: true, status: "passed" }));
  validateRequiredRows(passing);
  for (const rows of [
    passing.slice(1),
    [...passing, passing[0]],
    [...passing, { id: "injected-required-row", required: true, status: "passed" }],
    passing.map((row, index) => (index === 0 ? { ...row, status: "not-run" } : row)),
  ]) {
    let rejected = false;
    try {
      validateRequiredRows(rows);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("Required-row evidence self-test accepted invalid truth.");
  }
  const windowsPackageManager = packageManagerInvocation(
    "win32",
    "C:\\runner\\setup-pnpm\\node_modules\\.bin",
    "C:\\nodejs\\node.exe",
  );
  if (
    windowsPackageManager.command !== "C:\\nodejs\\node.exe" ||
    windowsPackageManager.arguments.join("|") !==
      "C:\\runner\\setup-pnpm\\node_modules\\pnpm\\bin\\pnpm.cjs|--version"
  ) {
    throw new Error("Windows package-manager command did not use pnpm's JavaScript entrypoint.");
  }
  const posixPackageManager = packageManagerInvocation("linux");
  if (
    posixPackageManager.command !== "pnpm" ||
    posixPackageManager.arguments.join(" ") !== "--version"
  ) {
    throw new Error("POSIX package-manager command unexpectedly changed.");
  }
  const createInputProbe = (handleWrite) => {
    let transcript = "";
    let writes = 0;
    const listeners = new Set();
    const publish = (value) => {
      transcript = value;
      for (const listener of listeners) listener(value);
    };
    return {
      get writes() {
        return writes;
      },
      publish,
      session: {
        columns: 60,
        get transcript() {
          return transcript;
        },
        rows: 20,
        terminal: {
          onData(listener) {
            listeners.add(listener);
            return { dispose: () => listeners.delete(listener) };
          },
          write() {
            writes += 1;
            handleWrite({ publish, writes });
          },
        },
      },
    };
  };
  const delayedProbe = createInputProbe(({ publish, writes }) => {
    if (writes === 1) setTimeout(() => publish("Delayed target"), 150);
  });
  await pressAcknowledgedInputUntilScreenText(delayedProbe.session, "input", "Delayed target");
  if (delayedProbe.writes !== 1) {
    throw new Error("Delayed rendering repeated an already accepted PTY input.");
  }
  let outputPending = true;
  const settledProbe = createInputProbe(({ publish }) =>
    publish(outputPending ? "Premature input" : "Settled target"),
  );
  setTimeout(() => {
    outputPending = false;
    settledProbe.publish("Initial render complete");
  }, 20);
  await pressAcknowledgedInputUntilScreenText(settledProbe.session, "input", "Settled target", 40);
  if (settledProbe.writes !== 1) {
    throw new Error("Settled PTY input was not sent exactly once.");
  }
  const retriedProbe = createInputProbe(({ publish, writes }) => {
    if (writes === 2) publish("Retried target");
  });
  await pressAcknowledgedInputUntilScreenText(
    retriedProbe.session,
    "input",
    "Retried target",
    10,
    10,
  );
  if (retriedProbe.writes !== 2) {
    throw new Error("Unacknowledged PTY input did not receive one bounded retry.");
  }
  process.stdout.write(`${JSON.stringify({ status: "passed" })}\n`);
  process.exit(0);
}

const executable = resolve(process.argv[2] ?? "");
const evidenceDirectory = resolve(
  process.argv[3] ?? "docs/evidence/r1-exit-closure/production-pty",
);
const executableMetadata = await stat(executable);
if (!executableMetadata.isFile())
  throw new Error("Production PTY requires one packaged executable.");
await mkdir(evidenceDirectory, { recursive: true });

const requireFromHarness = createRequire(
  new URL("../spikes/terminal-framework/harness/package.json", import.meta.url),
);
const { spawn } = requireFromHarness("node-pty");
const { shouldUseBundledConpty, terminatePtyProcessGroup } = await import(
  "../spikes/terminal-framework/harness/dist/src/pty-cleanup.js"
);

function commandOutput(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", timeout: 30_000 });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${arguments_.join(" ")} exited ${result.status}.`);
  }
  return result.stdout.trim();
}

function runBinary(arguments_, cwd, stateDirectory) {
  return spawnSync(executable, arguments_, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, EDEN_STATE_DIR: stateDirectory },
    timeout: 30_000,
  });
}

function quotePosix(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function quoteBatch(value) {
  if (/["\r\n]/u.test(value)) throw new Error("Windows batch path contains unsupported bytes.");
  return `"${value.replaceAll("%", "%%")}"`;
}

function normalizeWindowsMode(source) {
  const match = /^(\d+):(\d+)$/u.exec(source.trim());
  if (match?.[1] === undefined || match[2] === undefined) return "missing";
  return `${Number.parseInt(match[1], 10) & 0x0007}:${match[2]}`;
}

async function createShellSession() {
  const challenge = randomUUID().replaceAll("-", "");
  const expectedSentinel = `EDEN_TUI_RESTORED_${challenge}`;
  const readyMarker = "__EDEN_PARENT_SHELL_READY__";
  if (process.platform === "win32") {
    const helperModule = await import(
      "../spikes/terminal-framework/harness/dist/src/terminal-mode.js"
    );
    const helper = helperModule.prepareWindowsConsoleModeHelper();
    if (helper === undefined) throw new Error("Windows console-mode helper is unavailable.");
    const directory = await mkdtemp(join(tmpdir(), "eden-r1-pty-shell-"));
    const beforePath = join(directory, "before.txt");
    const afterPath = join(directory, "after.txt");
    const scriptPath = join(directory, "parent.cmd");
    await writeFile(
      scriptPath,
      `@echo off\r\nsetlocal EnableExtensions DisableDelayedExpansion\r\n${quoteBatch(helper)} ${quoteBatch(beforePath)}\r\n${quoteBatch(executable)}\r\nset "eden_status=%errorlevel%"\r\n${quoteBatch(helper)} ${quoteBatch(afterPath)}\r\necho __EDEN_CANDIDATE_EXIT__=%eden_status%\r\necho ${readyMarker}\r\nset /p "eden_challenge="\r\necho EDEN_TUI_RESTORED_%eden_challenge%\r\nexit /b %eden_status%\r\n`,
      "utf8",
    );
    return {
      afterPath,
      arguments: ["/D", "/Q", "/C", scriptPath],
      beforePath,
      challengeInput: `${challenge}\r`,
      cleanup: () => rm(directory, { force: true, recursive: true }),
      command: process.env.ComSpec ?? process.env.COMSPEC ?? "cmd.exe",
      expectedSentinel,
      readyMarker,
    };
  }
  const script = `trap : INT; eden_before=$(stty -g); ${quotePosix(executable)}; eden_status=$?; eden_after=$(stty -g); printf '__EDEN_TERMINAL_MODE_BEFORE__=%s\\n' "$eden_before"; printf '__EDEN_TERMINAL_MODE_AFTER__=%s\\n' "$eden_after"; printf '__EDEN_CANDIDATE_EXIT__=%s\\n' "$eden_status"; printf '${readyMarker}\\n'; IFS= read -r eden_challenge; printf 'EDEN_TUI_RESTORED_%s\\n' "$eden_challenge"; exit "$eden_status"`;
  return {
    afterPath: null,
    arguments: ["-c", script],
    beforePath: null,
    challengeInput: `${challenge}\n`,
    cleanup: async () => undefined,
    command: "/bin/sh",
    expectedSentinel,
    readyMarker,
  };
}

function waitForText(session, expected, offset = 0) {
  if (session.transcript.slice(offset).includes(expected)) return Promise.resolve();
  return new Promise((resolveWait, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`Timed out waiting for ${expected}.`));
    }, eventTimeoutMs);
    const subscription = session.terminal.onData(() => {
      if (!session.transcript.slice(offset).includes(expected)) return;
      clearTimeout(timer);
      subscription.dispose();
      resolveWait();
    });
  });
}

function waitForExit(terminal) {
  return new Promise((resolveExit, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error("Timed out waiting for the PTY shell to exit."));
    }, eventTimeoutMs);
    const subscription = terminal.onExit(({ exitCode }) => {
      clearTimeout(timer);
      subscription.dispose();
      resolveExit(exitCode);
    });
  });
}

function waitForScreenText(session, expected) {
  const visible = () =>
    screenText(session.transcript, session.columns, session.rows).includes(expected);
  if (visible()) return Promise.resolve();
  return new Promise((resolveWait, reject) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`Timed out waiting for visible ${expected}.`));
    }, eventTimeoutMs);
    const subscription = session.terminal.onData(() => {
      if (!visible()) return;
      clearTimeout(timer);
      subscription.dispose();
      resolveWait();
    });
  });
}

function waitForTerminalQuiet(session, quietMs) {
  return new Promise((resolveWait, reject) => {
    let quietTimer;
    const deadline = setTimeout(() => {
      clearTimeout(quietTimer);
      subscription.dispose();
      reject(new Error("Timed out waiting for a stable terminal input boundary."));
    }, eventTimeoutMs);
    const settle = () => {
      clearTimeout(deadline);
      subscription.dispose();
      resolveWait();
    };
    const armQuietTimer = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(settle, quietMs);
    };
    const subscription = session.terminal.onData(armQuietTimer);
    armQuietTimer();
  });
}

function waitForTerminalActivity(session, previousTranscript, timeoutMs) {
  if (session.transcript !== previousTranscript) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      resolveWait(false);
    }, timeoutMs);
    const subscription = session.terminal.onData(() => {
      if (session.transcript === previousTranscript) return;
      clearTimeout(timer);
      subscription.dispose();
      resolveWait(true);
    });
  });
}

// An accepted arrow must never be repeated: a delayed redraw would skip the intended history row.
async function pressAcknowledgedInputUntilScreenText(
  session,
  input,
  expected,
  quietMs = 250,
  activityTimeoutMs = 2_000,
) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await waitForTerminalQuiet(session, quietMs);
    const previousTranscript = session.transcript;
    session.terminal.write(input);
    if (!(await waitForTerminalActivity(session, previousTranscript, activityTimeoutMs))) continue;
    await waitForScreenText(session, expected);
    return;
  }
  throw new Error(`Input did not reach visible state ${expected}.`);
}

async function pressUntilScreenText(session, input, expected) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    session.terminal.write(input);
    await delay(100);
    if (screenText(session.transcript, session.columns, session.rows).includes(expected)) return;
  }
  throw new Error(`Input did not reach visible state ${expected}.`);
}

function readMarker(transcript, prefix) {
  const line = transcript.split(/\r?\n/u).find((value) => value.includes(prefix));
  return line === undefined ? "missing" : line.slice(line.indexOf(prefix) + prefix.length).trim();
}

function terminalRestored(transcript, before, after) {
  const cursor =
    !transcript.includes("\u001B[?25l") ||
    transcript.lastIndexOf("\u001B[?25h") > transcript.lastIndexOf("\u001B[?25l");
  const alternate =
    !transcript.includes("\u001B[?1049h") ||
    transcript.lastIndexOf("\u001B[?1049l") > transcript.lastIndexOf("\u001B[?1049h");
  return cursor && alternate && before !== "missing" && before === after;
}

async function modePair(shell, transcript) {
  if (shell.beforePath !== null && shell.afterPath !== null) {
    return {
      after: normalizeWindowsMode(await readFile(shell.afterPath, "utf8")),
      before: normalizeWindowsMode(await readFile(shell.beforePath, "utf8")),
    };
  }
  return {
    after: readMarker(transcript, "__EDEN_TERMINAL_MODE_AFTER__="),
    before: readMarker(transcript, "__EDEN_TERMINAL_MODE_BEFORE__="),
  };
}

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
        else if (final === "K") {
          if (first === 1) cells[row]?.fill(" ", 0, column + 1);
          else if (first === 2) cells[row]?.fill(" ");
          else cells[row]?.fill(" ", column);
        } else if (final === "X") {
          cells[row]?.fill(" ", column, Math.min(columns, column + (first || 1)));
        } else if (final === "s" && !match[1].startsWith("?")) {
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
  return `${cells.map((line) => line.join("").trimEnd()).join("\n")}\n`;
}

async function captureFrame(session, name, writeText = true) {
  const columns = session.columns;
  const rows = session.rows;
  await delay(150);
  const rawPath = join(evidenceDirectory, `${name}.ansi`);
  const textPath = join(evidenceDirectory, `${name}.txt`);
  await writeFile(rawPath, session.transcript, "utf8");
  if (writeText) {
    await writeFile(textPath, screenText(session.transcript, columns, rows), "utf8");
  }
  return {
    columns,
    name,
    rawFile: basename(rawPath),
    rows,
    ...(writeText ? { textFile: basename(textPath) } : {}),
  };
}

async function runScenario(options) {
  const shell = await createShellSession();
  const environment = {
    ...process.env,
    CI: "false",
    EDEN_STATE_DIR: options.stateDirectory,
    EDEN_TUI_PROBE: "1",
    TERM: "xterm-256color",
  };
  let transcript = "";
  let exited = false;
  const terminal = spawn(shell.command, shell.arguments, {
    cols: options.columns,
    cwd: options.workspace,
    env: environment,
    name: "xterm-256color",
    rows: options.rows,
    useConptyDll: process.platform === "win32",
  });
  const subscription = terminal.onData((data) => {
    transcript = `${transcript}${data}`.slice(-transcriptLimit);
  });
  const exitSubscription = terminal.onExit(() => {
    exited = true;
  });
  const session = {
    columns: options.columns,
    get transcript() {
      return transcript;
    },
    rows: options.rows,
    terminal,
  };
  try {
    const frames = await options.drive(session);
    await waitForText(session, shell.readyMarker);
    const exitCode = Number.parseInt(readMarker(transcript, "__EDEN_CANDIDATE_EXIT__="), 10);
    const shellExit = waitForExit(terminal);
    terminal.write(shell.challengeInput);
    await waitForText(session, shell.expectedSentinel);
    const observedShellExit = await shellExit;
    const modes = await modePair(shell, transcript);
    const restored = terminalRestored(transcript, modes.before, modes.after);
    if (exitCode !== options.expectedExit || observedShellExit !== options.expectedExit) {
      throw new Error(
        `${options.id} exited candidate=${exitCode} shell=${observedShellExit}; expected ${options.expectedExit}.`,
      );
    }
    if (!restored || !transcript.includes(shell.expectedSentinel)) {
      throw new Error(`${options.id} did not restore the terminal and parent shell.`);
    }
    return {
      exitCode,
      frames,
      id: options.id,
      ptySizes: options.sizes,
      shellSentinel: "observed",
      status: "passed",
      terminalModeAfter: modes.after,
      terminalModeBefore: modes.before,
      terminalRestoration: "restored",
    };
  } catch (error) {
    await writeFile(join(evidenceDirectory, `${options.id}-failure.ansi`), transcript, "utf8");
    await writeFile(
      join(evidenceDirectory, `${options.id}-failure.txt`),
      screenText(transcript, session.columns, session.rows),
      "utf8",
    );
    throw error;
  } finally {
    subscription.dispose();
    exitSubscription.dispose();
    try {
      if (!exited) terminatePtyProcessGroup(terminal);
      else if (shouldUseBundledConpty()) terminal.kill();
    } finally {
      await shell.cleanup();
    }
  }
}

async function seedHistory(workspace, stateDirectory) {
  for (let index = 0; index < 33; index += 1) {
    const arguments_ = ["exec", "--json"];
    if (index === 0) arguments_.push("--trust-workspace");
    arguments_.push("--approve-fake-action", `History task ${index.toString().padStart(2, "0")}`);
    const result = runBinary(arguments_, workspace, stateDirectory);
    if (result.status !== 0) throw new Error(`History seed ${index} failed.`);
  }
  const listed = runBinary(["run", "list", "--json"], workspace, stateDirectory);
  if (listed.status !== 0) throw new Error("History seed catalog failed.");
  const catalog = JSON.parse(listed.stdout.trim());
  const corruptDirectory = join(
    stateDirectory,
    "runs",
    "v1",
    catalog.workspace.workspaceId,
    "run-corrupt-pty",
  );
  await mkdir(corruptDirectory, { recursive: true });
  await writeFile(join(corruptDirectory, "journal.jsonl"), '{"journalVersion":\n', "utf8");
  const updated = runBinary(["run", "list", "--json"], workspace, stateDirectory);
  if (updated.status !== 0) throw new Error("Updated history seed catalog failed.");
  return JSON.parse(updated.stdout.trim());
}

function historyEntryLabel(entry) {
  return entry.availability === "unavailable"
    ? `> ${entry.runId} · unavailable`
    : `> ${entry.task}`;
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "eden-r1-production-pty-"));
process.on("exit", () => rmSync(temporaryRoot, { force: true, recursive: true }));
const successWorkspace = join(temporaryRoot, "success-workspace");
const successState = join(temporaryRoot, "success-state");
const historyWorkspace = join(temporaryRoot, "history-workspace");
const historyState = join(temporaryRoot, "history-state");
await mkdir(successWorkspace);
await mkdir(historyWorkspace);
const historyCatalog = await seedHistory(historyWorkspace, historyState);

const success = await runScenario({
  columns: 100,
  drive: async (session) => {
    await waitForText(session, "__EDEN_INPUT_READY__");
    session.terminal.write("t");
    await waitForScreenText(session, "trust: trusted");
    await waitForScreenText(session, "Enter focuses task");
    await pressUntilScreenText(session, "\t", "focus: workspace.composer");
    await pressUntilScreenText(session, "\r", "Enter submits");
    session.terminal.write("Complete the production PTY fake task");
    await waitForScreenText(session, "Complete the production PTY fake task");
    session.terminal.write("\r");
    await waitForScreenText(session, "approval: pending");
    session.terminal.write("a");
    await waitForScreenText(session, "outcome: succeeded");
    const frames = [await captureFrame(session, "tui-success-100x30")];
    session.terminal.write("q");
    return frames;
  },
  expectedExit: 0,
  id: "tui-success",
  rows: 30,
  sizes: ["100x30"],
  stateDirectory: successState,
  workspace: successWorkspace,
});

const history = await runScenario({
  columns: 60,
  drive: async (session) => {
    await waitForText(session, "__EDEN_INPUT_READY__");
    session.terminal.write("h");
    await waitForScreenText(session, "Current-workspace history");
    for (const entry of historyCatalog.entries.slice(1)) {
      await pressAcknowledgedInputUntilScreenText(session, "\u001B[B", historyEntryLabel(entry));
    }
    session.terminal.write("\r");
    await waitForScreenText(session, "run_history_unavailable");
    const frames = [await captureFrame(session, "history-unavailable-60x20", false)];
    session.terminal.write("b");
    await waitForScreenText(session, "history runs: 34");
    session.terminal.write("h");
    await waitForScreenText(session, "Current-workspace history");
    const taskZeroIndex = historyCatalog.entries.findIndex(
      (entry) => entry.availability === "available" && entry.task === "History task 00",
    );
    if (taskZeroIndex < 0) throw new Error("History task 00 is missing from the seed catalog.");
    for (let index = historyCatalog.entries.length - 2; index >= taskZeroIndex; index -= 1) {
      await pressAcknowledgedInputUntilScreenText(
        session,
        "\u001B[A",
        historyEntryLabel(historyCatalog.entries[index]),
      );
    }
    frames.push(await captureFrame(session, "history-window-60x20"));
    session.terminal.write("\r");
    await waitForScreenText(session, "task: History task 00");
    frames.push(await captureFrame(session, "history-inspection-60x20", false));
    session.terminal.resize(100, 30);
    session.columns = 100;
    session.rows = 30;
    await delay(250);
    frames.push(await captureFrame(session, "history-inspection-100x30"));
    session.terminal.write("b");
    await waitForScreenText(session, "history runs: 34");
    session.terminal.write("\u0003");
    return frames;
  },
  expectedExit: 130,
  id: "tui-history-cancel",
  rows: 20,
  sizes: ["60x20", "100x30"],
  stateDirectory: historyState,
  workspace: historyWorkspace,
});

const standalonePath = join(evidenceDirectory, "standalone.json");
const standalone = JSON.parse(await readFile(standalonePath, "utf8"));
if (standalone.status !== "passed") throw new Error("Standalone evidence did not pass.");
if (
  standalone.sourceBoundary?.copiedArtifactOutsideCheckout !== true ||
  standalone.sourceBoundary?.originalArtifactNotExecuted !== true ||
  standalone.sourceBoundary?.sourceEntriesUnavailable !== true
) {
  throw new Error("Standalone source-unavailability evidence did not pass.");
}
if (
  standalone.historySideEffects?.newEffectReceipts !== 0 ||
  standalone.historySideEffects?.stateDigestChanged !== false
) {
  throw new Error("Standalone read-only history changed state or dispatched effects.");
}
const artifactSha256 = createHash("sha256")
  .update(await readFile(executable))
  .digest("hex");
const requiredRows = [
  ...standalone.rows.map((row) => ({ ...row, required: true })),
  { id: "production-pty-success", required: true, status: success.status },
  { id: "production-pty-history", required: true, status: history.status },
];
validateRequiredRows(requiredRows);
const packageManager = packageManagerInvocation();
const manifest = {
  artifact: {
    artifactSha256,
    fileName: basename(executable),
    sizeBytes: executableMetadata.size,
  },
  decodedCounts: standalone.decodedCounts,
  exitTable: [
    ...standalone.exitTable,
    { expected: 0, id: success.id, observed: success.exitCode },
    { expected: 130, id: history.id, observed: history.exitCode },
  ],
  pty: [success, history],
  ptySizes: ["100x30", "60x20"],
  requiredRows,
  schemaVersion: 1,
  shellSentinel: "observed",
  source: {
    dirty: commandOutput("git", ["status", "--porcelain"]).length > 0,
    sha: commandOutput("git", ["rev-parse", "HEAD"]),
  },
  sourceBoundary: standalone.sourceBoundary,
  status: "passed",
  supportRows,
  historySideEffects: standalone.historySideEffects,
  terminalRestoration: "restored",
  versions: {
    bun: commandOutput(resolve("apps/eden/node_modules/bun/bin/bun.exe"), ["--version"]),
    node: process.version,
    pnpm: commandOutput(packageManager.command, packageManager.arguments),
  },
};
await writeFile(join(evidenceDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await new Promise((resolveWrite, rejectWrite) => {
  process.stdout.write(
    `${JSON.stringify({ artifactSha256, evidenceDirectory, status: "passed" })}\n`,
    (error) => {
      if (error !== null && error !== undefined) rejectWrite(error);
      else resolveWrite();
    },
  );
});
process.exit(0);

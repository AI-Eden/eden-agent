import { strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { terminalScreenText } from "./terminal-screen.mjs";

const timeoutMs = 30_000;
const viewports = [
  { columns: 60, rows: 20, viewport: "60x20" },
  { columns: 80, rows: 24, viewport: "80x24" },
  { columns: 100, rows: 30, viewport: "100x30" },
];
const requiredTools = [
  "list_files",
  "read_file",
  "anchor_edit",
  "write_file",
  "run_command",
  "git_diff",
];

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function hashFile(path) {
  return hashBytes(await readFile(path));
}

function validateEvidence(evidence) {
  const activeInputMode = evidence.milestone === "R3-B";
  if (evidence.status !== "passed" || !/^[a-f0-9]{40}$/u.test(evidence.sourceSha)) {
    throw new Error("R3 packaged TUI evidence requires passing status and one exact source SHA.");
  }
  if (
    evidence.package?.copied !== true ||
    evidence.provider?.kind !== "local_openai_compatible_fixture" ||
    evidence.provider.externalNetwork !== false ||
    evidence.provider.secretCanaryExposed !== false ||
    evidence.verifierSuccessClaimed !== false
  ) {
    throw new Error("R3 packaged TUI evidence widened its package, provider, or completion claim.");
  }
  if (evidence.journeys.length !== viewports.length) {
    throw new Error("R3 packaged TUI evidence requires exactly three viewport journeys.");
  }
  for (const expected of viewports) {
    const journey = evidence.journeys.find((candidate) => candidate.viewport === expected.viewport);
    if (
      journey?.status !== "passed" ||
      journey.terminalOutcome !== "completed" ||
      journey.terminalRestoration !== "restored" ||
      journey.exitCode !== 0 ||
      journey.oracle?.testExitCode !== 0 ||
      journey.budget?.actionProposals !== 3 ||
      journey.budget.modelSteps !== (activeInputMode ? 8 : 7) ||
      journey.budget.toolCalls !== 6 ||
      journey.exactUsageAttempts !== (activeInputMode ? 8 : 7) ||
      JSON.stringify(journey.tools) !== JSON.stringify(requiredTools)
    ) {
      throw new Error(`R3 packaged TUI journey is incomplete for ${expected.viewport}.`);
    }
    if (
      activeInputMode &&
      (journey.activeInput?.acceptedCount !== 2 ||
        journey.activeInput.pending !== 0 ||
        JSON.stringify(journey.activeInput.sources) !== JSON.stringify(["steer", "queue"]) ||
        journey.activeInput.cjkMultiline !== true)
    ) {
      throw new Error(`R3-B active input evidence is incomplete for ${expected.viewport}.`);
    }
  }
  if (activeInputMode && !evidence.journeys.some((journey) => journey.rapidResize === "passed")) {
    throw new Error("R3-B copied TUI evidence requires one rapid resize row.");
  }
}

if (process.argv[2] === "--self-test") {
  const evidence = {
    journeys: viewports.map(({ viewport }) => ({
      budget: { actionProposals: 3, modelSteps: 7, toolCalls: 6 },
      exactUsageAttempts: 7,
      exitCode: 0,
      oracle: { testExitCode: 0 },
      status: "passed",
      terminalOutcome: "completed",
      terminalRestoration: "restored",
      tools: requiredTools,
      viewport,
    })),
    package: { copied: true },
    provider: {
      externalNetwork: false,
      kind: "local_openai_compatible_fixture",
      secretCanaryExposed: false,
    },
    sourceSha: "a".repeat(40),
    status: "passed",
    verifierSuccessClaimed: false,
  };
  validateEvidence(evidence);
  const r3bEvidence = {
    ...evidence,
    journeys: evidence.journeys.map((journey, index) => ({
      ...journey,
      activeInput: {
        acceptedCount: 2,
        cjkMultiline: true,
        pending: 0,
        sources: ["steer", "queue"],
      },
      budget: { ...journey.budget, modelSteps: 8 },
      exactUsageAttempts: 8,
      rapidResize: index === 0 ? "passed" : "not-run",
    })),
    milestone: "R3-B",
  };
  validateEvidence(r3bEvidence);
  let invalidR3bRejected = false;
  try {
    validateEvidence({
      ...r3bEvidence,
      journeys: r3bEvidence.journeys.map((journey, index) =>
        index === 0 ? { ...journey, activeInput: { ...journey.activeInput, pending: 1 } } : journey,
      ),
    });
  } catch {
    invalidR3bRejected = true;
  }
  if (!invalidR3bRejected) {
    throw new Error("R3-B packaged TUI evidence accepted incomplete active input.");
  }
  for (const mutation of [
    { journeys: evidence.journeys.slice(1) },
    { provider: { ...evidence.provider, externalNetwork: true } },
    {
      journeys: evidence.journeys.map((journey, index) =>
        index === 0 ? { ...journey, terminalOutcome: "succeeded" } : journey,
      ),
    },
  ]) {
    let rejected = false;
    try {
      validateEvidence({ ...evidence, ...mutation });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("R3 packaged TUI evidence accepted an invalid mutation.");
  }
  process.stdout.write(`${JSON.stringify({ status: "passed" })}\n`);
  process.exit(0);
}

if (process.platform !== "linux") {
  throw new Error("R3 copied packaged TUI evidence currently names Linux/WSL2 only.");
}

const source = resolve(process.argv[2] ?? "apps/eden/dist");
const evidenceMode = process.argv[5] ?? "--r3-a";
if (evidenceMode !== "--r3-a" && evidenceMode !== "--r3-b") {
  throw new Error("R3 copied packaged TUI evidence mode must be --r3-a or --r3-b.");
}
const activeInputMode = evidenceMode === "--r3-b";
const outputPath = resolve(
  process.argv[3] ??
    (activeInputMode
      ? "docs/benchmark-results/2026-08-11-r3-b-packaged-tui-local.json"
      : "docs/benchmark-results/2026-08-11-r3-a-packaged-tui-local.json"),
);
const sourceSha = process.argv[4] ?? "";
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) {
  throw new Error("R3 copied packaged TUI evidence requires one exact source SHA.");
}

const root = await mkdtemp(join(tmpdir(), "eden-r3-packaged-tui-"));
const archive = join(root, "copied-package");
const executable = join(archive, "eden");
const requireFromHarness = createRequire(
  new URL("../spikes/terminal-framework/harness/package.json", import.meta.url),
);
const { spawn } = requireFromHarness("node-pty");
const { terminatePtyProcessGroup } = await import(
  "../spikes/terminal-framework/harness/dist/src/pty-cleanup.js"
);

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    timeout: timeoutMs,
    ...options,
  });
  if (result.error !== undefined) throw result.error;
  return result;
}

function git(cwd, ...arguments_) {
  const result = run("git", arguments_, {
    cwd,
    env: {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH,
    },
  });
  if (result.status !== 0) throw new Error(`git ${arguments_.join(" ")} failed.`);
  return result.stdout;
}

function quotePosix(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function scan(directory, needle) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await scan(path, needle)) return true;
    } else if (entry.isFile() && (await readFile(path)).includes(Buffer.from(needle))) {
      return true;
    }
  }
  return false;
}

async function waitFor(read, predicate, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }
  const current = read();
  const diagnostic = typeof current === "string" ? current : JSON.stringify(current);
  throw new Error(
    `Timed out waiting for ${label}: ${diagnostic.replaceAll(/\s+/gu, " ").slice(-4_000)}`,
  );
}

function streamChunk(delta, finishReason = null, usage) {
  return `data: ${JSON.stringify({
    choices: [{ delta, finish_reason: finishReason, index: 0 }],
    created: 1,
    id: "chatcmpl-r3-packaged",
    model: "r3-local-fixture",
    object: "chat.completion.chunk",
    ...(usage === undefined ? {} : { usage }),
  })}\n\n`;
}

async function providerFixture(secret, commandProgram, withActiveInput) {
  let readinessRequests = 0;
  let taskRequests = 0;
  let authorizationMatched = true;
  let secretEnteredPrompt = false;
  let parallelRequested = false;
  let queueObserved = false;
  let releaseFirstTask = () => undefined;
  let resolveFirstTaskStarted = () => undefined;
  let steerObserved = false;
  const firstTaskRelease = new Promise((resolveRelease) => {
    releaseFirstTask = resolveRelease;
  });
  const firstTaskStarted = new Promise((resolveStarted) => {
    resolveFirstTaskStarted = resolveStarted;
  });
  const observations = [
    ["call-list", "list_files", { continuation: null, path: "." }, "Inspect repository files."],
    [
      "call-read",
      "read_file",
      { maxBytes: 1_024, offset: 0, path: "answer.cjs" },
      "Read the failing source.",
    ],
    [
      "call-edit",
      "anchor_edit",
      {
        path: "answer.cjs",
        replacements: [
          {
            expectedOccurrences: 1,
            newText: "module.exports = 42;",
            oldText: "module.exports = 41;",
          },
        ],
      },
      "Propose the known correction.",
    ],
    [
      "call-create",
      "write_file",
      { content: "created\n", path: "created.txt" },
      "Create the expected fixture file.",
    ],
    [
      "call-command",
      "run_command",
      {
        args: ["--test", "answer.test.cjs"],
        cwd: ".",
        network: "host_unrestricted",
        program: commandProgram,
        reason: "Run the deterministic repository test fixture.",
        timeoutMs: 10_000,
      },
      "Run the exact deterministic test.",
    ],
    ["call-diff", "git_diff", { continuation: null, path: "." }, "Inspect the final tracked diff."],
  ];
  const server = createServer((request, response) => {
    authorizationMatched &&= request.headers.authorization === `Bearer ${secret}`;
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => (body += chunk));
    request.on("end", async () => {
      secretEnteredPrompt ||= body.includes(secret);
      steerObserved ||= body.includes("Steer 中文") && body.includes("second line");
      queueObserved ||= body.includes("Queue after current answer.");
      const parsed = JSON.parse(body);
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "x-request-id": `request-r3-${readinessRequests + taskRequests + 1}`,
      });
      if (parsed.max_tokens === 8) {
        readinessRequests += 1;
        response.end(
          [
            streamChunk({ content: "EDEN_READY_V1" }),
            streamChunk({}, "stop"),
            "data: [DONE]\n\n",
          ].join(""),
        );
        return;
      }
      parallelRequested ||= parsed.parallel_tool_calls !== false;
      const index = taskRequests++;
      if (withActiveInput && index === 0) {
        resolveFirstTaskStarted();
        await firstTaskRelease;
      }
      const usage = { completion_tokens: 5, prompt_tokens: 20 + index, total_tokens: 25 + index };
      const observation = observations[index];
      if (observation === undefined) {
        response.end(
          [
            streamChunk(
              {
                content:
                  "The approved edit, new file, command, and final diff are complete for review.",
              },
              "stop",
            ),
            `data: ${JSON.stringify({
              choices: [],
              created: 1,
              id: "chatcmpl-r3-packaged",
              model: "r3-local-fixture",
              object: "chat.completion.chunk",
              usage,
            })}\n\n`,
            "data: [DONE]\n\n",
          ].join(""),
        );
        return;
      }
      const [id, name, arguments_, text] = observation;
      response.end(
        [
          streamChunk(
            {
              content: text,
              tool_calls: [
                {
                  function: { arguments: JSON.stringify(arguments_), name },
                  id,
                  index: 0,
                  type: "function",
                },
              ],
            },
            "tool_calls",
          ),
          `data: ${JSON.stringify({
            choices: [],
            created: 1,
            id: "chatcmpl-r3-packaged",
            model: "r3-local-fixture",
            object: "chat.completion.chunk",
            usage,
          })}\n\n`,
          "data: [DONE]\n\n",
        ].join(""),
      );
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Missing fixture address.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: async () => {
      server.closeAllConnections();
      await new Promise((resolveClose) => server.close(resolveClose));
    },
    facts: () => ({
      authorizationMatched,
      parallelRequested,
      queueObserved,
      readinessRequests,
      secretEnteredPrompt,
      steerObserved,
      taskRequests,
    }),
    releaseFirstTask,
    waitForFirstTask: () => firstTaskStarted,
  };
}

async function journey({ columns, rows, viewport }) {
  const journeyRoot = join(root, viewport);
  const workspace = join(journeyRoot, "workspace");
  const stateDirectory = join(journeyRoot, "state");
  const binDirectory = join(journeyRoot, "bin");
  await mkdir(workspace, { recursive: true });
  await mkdir(binDirectory, { recursive: true });
  const commandProgram = "eden-node-fixture";
  const commandExecutable = join(binDirectory, commandProgram);
  await copyFile(process.execPath, commandExecutable);
  await chmod(commandExecutable, 0o755);
  await writeFile(join(workspace, "answer.cjs"), "module.exports = 41;\n", "utf8");
  await writeFile(
    join(workspace, "answer.test.cjs"),
    [
      "const assert = require('node:assert/strict');",
      "const { readFileSync } = require('node:fs');",
      "const test = require('node:test');",
      "test('packaged R3 correction', () => {",
      "  assert.equal(require('./answer.cjs'), 42);",
      "  assert.equal(readFileSync('created.txt', 'utf8'), 'created\\n');",
      "  assert.equal(process.env.EDEN_R3_SECRET_CANARY, undefined);",
      "});",
      "",
    ].join("\n"),
    "utf8",
  );
  git(workspace, "init", "--quiet");
  git(workspace, "config", "user.email", "acceptance@example.invalid");
  git(workspace, "config", "user.name", "Eden Acceptance");
  git(workspace, "add", "answer.cjs", "answer.test.cjs");
  git(workspace, "commit", "--quiet", "-m", "failing fixture");
  strictEqual(
    run(process.execPath, ["--test", "answer.test.cjs"], {
      cwd: workspace,
      env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH },
    }).status === 0,
    false,
  );

  const secret = `R3_PACKAGED_CANARY_${randomUUID()}`;
  const provider = await providerFixture(secret, commandProgram, activeInputMode);
  const restorationChallenge = randomUUID().replaceAll("-", "");
  const restorationSentinel = `EDEN_R3_TUI_RESTORED_${restorationChallenge}`;
  const parentReady = "__EDEN_R3_PARENT_READY__";
  const shellScript = `trap : INT; before=$(stty -g); ${quotePosix(executable)}; code=$?; after=$(stty -g); printf '__EDEN_R3_MODE_BEFORE__=%s\\n' "$before"; printf '__EDEN_R3_MODE_AFTER__=%s\\n' "$after"; printf '__EDEN_R3_CANDIDATE_EXIT__=%s\\n' "$code"; printf '${parentReady}\\n'; IFS= read -r token; printf 'EDEN_R3_TUI_RESTORED_%s\\n' "$token"; exit "$code"`;
  let transcript = "";
  let screenColumns = columns;
  let screenRows = rows;
  const screen = () => terminalScreenText(transcript, screenColumns, screenRows);
  const environment = {
    ...process.env,
    EDEN_R3_SECRET_CANARY: secret,
    EDEN_STATE_DIR: stateDirectory,
    EDEN_TUI_PROBE: "1",
    PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
    TERM: "xterm-256color",
  };
  const terminal = spawn("/bin/sh", ["-c", shellScript], {
    cols: columns,
    cwd: workspace,
    env: environment,
    name: "xterm-256color",
    rows,
  });
  const data = terminal.onData((chunk) => {
    transcript = `${transcript}${chunk}`.slice(-4 * 1_048_576);
  });
  let terminalExited = false;
  const exit = new Promise((resolveExit) =>
    terminal.onExit(({ exitCode }) => {
      terminalExited = true;
      resolveExit(exitCode);
    }),
  );
  try {
    await waitFor(
      () => transcript,
      (value) => value.includes("__EDEN_INPUT_READY__"),
      `${viewport} readiness`,
    );
    terminal.write("p");
    await waitFor(
      screen,
      (value) => value.includes("Provider profiles"),
      `${viewport} profile editor`,
    );
    const profile = `r3-local|${provider.baseUrl}|r3-local-fixture|custom|32768|1024|env:EDEN_R3_SECRET_CANARY`;
    terminal.write(`\u001B[200~${profile}\u001B[201~`);
    await waitFor(
      screen,
      (value) => value.includes("EDEN_R3_SECRET_CANARY"),
      `${viewport} complete profile draft`,
    );
    terminal.write("\r");
    await waitFor(
      screen,
      (value) => value.includes("profile: r3-local"),
      `${viewport} saved profile`,
    );
    terminal.write("c");
    await waitFor(
      screen,
      (value) => value.includes("confirm: y"),
      `${viewport} readiness confirmation`,
    );
    terminal.write("y");
    await waitFor(
      screen,
      (value) => value.includes("completion_ready"),
      `${viewport} completion readiness`,
    );
    terminal.write("t");
    await waitFor(
      screen,
      (value) => value.includes("trust: trusted"),
      `${viewport} workspace trust`,
    );
    for (let index = 0; index < 16; index += 1) {
      if (screen().includes("focus: workspace.composer")) break;
      terminal.write("\t");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
    }
    await waitFor(
      screen,
      (value) => value.includes("focus: workspace.composer"),
      `${viewport} composer focus`,
    );
    terminal.write("\r");
    await waitFor(screen, (value) => value.includes("Enter submits"), `${viewport} composer entry`);
    const task =
      "Correct the deterministic fixture, create the expected file, run its test, inspect the diff, and stop with completed review.";
    terminal.write(`\u001B[200~${task}\u001B[201~`);
    await waitFor(
      screen,
      (value) => value.includes("completed review"),
      `${viewport} complete task draft`,
    );
    terminal.write("\r");
    let rapidResize = "not-run";
    if (activeInputMode) {
      await provider.waitForFirstTask();
      await waitFor(
        screen,
        (value) => value.includes("STEER OR QUEUE"),
        `${viewport} active composer`,
      );
      terminal.write("\u001B[200~Steer 中文\nsecond line\u001B[201~");
      await waitFor(
        screen,
        (value) => value.includes("Steer ") && value.includes("second line"),
        `${viewport} CJK multiline steering draft`,
      );
      terminal.write("\r");
      await waitFor(
        screen,
        (value) => value.includes("pending 1") || value.includes("INPUT · 1 durable pending"),
        `${viewport} durable steering acceptance`,
      );
      terminal.write("\u001B[200~Queue after current answer.\u001B[201~");
      await waitFor(
        screen,
        (value) => value.includes("Queue after current answer."),
        `${viewport} queue draft`,
      );
      terminal.write("\u001B\r");
      await waitFor(
        screen,
        (value) => value.includes("pending 2") || value.includes("INPUT · 2 durable pending"),
        `${viewport} durable queue acceptance`,
      );
      if (viewport === "100x30") {
        for (const [nextColumns, nextRows] of [
          [60, 20],
          [80, 24],
          [100, 30],
        ]) {
          screenColumns = nextColumns;
          screenRows = nextRows;
          terminal.resize(nextColumns, nextRows);
          await waitFor(
            screen,
            (value) => value.includes("Eden R3-B") && value.includes("pending"),
            `${viewport} resize ${nextColumns}x${nextRows}`,
          );
        }
        rapidResize = "passed";
      }
      provider.releaseFirstTask();
    }
    const approveCurrent = async (label) => {
      if (!activeInputMode) {
        terminal.write("a");
        return;
      }
      terminal.write("\u0010");
      await waitFor(
        screen,
        (value) => value.includes("focus: overlay.palette"),
        `${viewport} ${label} approval palette`,
      );
      for (let index = 0; index < 6; index += 1) {
        terminal.write("\u001B[B");
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
      }
      terminal.write("\r");
    };
    await waitFor(
      () => ({ facts: provider.facts(), screen: screen() }),
      (value) =>
        value.facts.taskRequests >= 3 &&
        (value.screen.includes("approval: pending") ||
          value.screen.includes("URGENT · approval pending")),
      `${viewport} edit approval`,
    );
    await approveCurrent("edit");
    await waitFor(
      () => ({ facts: provider.facts(), screen: screen() }),
      (value) =>
        value.facts.taskRequests >= 4 &&
        (value.screen.includes("approval: pending") ||
          value.screen.includes("URGENT · approval pending")),
      `${viewport} create approval`,
    );
    await approveCurrent("create");
    await waitFor(
      () => ({ facts: provider.facts(), screen: screen() }),
      (value) =>
        value.facts.taskRequests >= 5 &&
        (value.screen.includes("approval: pending") ||
          value.screen.includes("URGENT · approval pending")),
      `${viewport} command approval`,
    );
    await approveCurrent("command");
    await waitFor(
      () => ({ facts: provider.facts(), screen: screen() }),
      (value) =>
        value.facts.taskRequests === (activeInputMode ? 8 : 7) &&
        (value.screen.includes("COMPLETE ANSWER") || /outcome:?\s*completed/iu.test(value.screen)),
      `${viewport} completed review`,
    );
    terminal.write("q");
    await waitFor(
      () => transcript,
      (value) => value.includes(parentReady),
      `${viewport} parent shell restoration boundary`,
    );
    terminal.write(`${restorationChallenge}\n`);
    const exitCode = await Promise.race([
      exit,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out exiting ${viewport}.`)), timeoutMs),
      ),
    ]);
    const catalogResult = run(executable, ["run", "list", "--json"], {
      cwd: workspace,
      env: environment,
    });
    if (catalogResult.status !== 0) throw new Error(`Run catalog failed for ${viewport}.`);
    const catalog = JSON.parse(catalogResult.stdout);
    const summary = catalog.entries.find((entry) => entry.availability === "available");
    if (summary === undefined) throw new Error(`No durable run for ${viewport}.`);
    const inspectionResult = run(executable, ["run", "show", "--json", summary.runId], {
      cwd: workspace,
      env: environment,
    });
    if (inspectionResult.status !== 0) throw new Error(`Run inspection failed for ${viewport}.`);
    const view = JSON.parse(inspectionResult.stdout).view;
    const oracle = run(process.execPath, ["--test", "answer.test.cjs"], {
      cwd: workspace,
      env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH },
    });
    const facts = provider.facts();
    const beforeMode = /__EDEN_R3_MODE_BEFORE__=([^\r\n]+)/u.exec(transcript)?.[1];
    const afterMode = /__EDEN_R3_MODE_AFTER__=([^\r\n]+)/u.exec(transcript)?.[1];
    const terminalRestoration =
      beforeMode !== undefined &&
      beforeMode === afterMode &&
      transcript.includes(restorationSentinel)
        ? "restored"
        : "failed";
    if (
      facts.readinessRequests !== 1 ||
      facts.taskRequests !== (activeInputMode ? 8 : 7) ||
      !facts.authorizationMatched ||
      facts.parallelRequested ||
      facts.secretEnteredPrompt ||
      (activeInputMode && (!facts.steerObserved || !facts.queueObserved))
    ) {
      throw new Error(`Provider fixture facts were invalid for ${viewport}.`);
    }
    if (
      transcript.includes(secret) ||
      (await scan(stateDirectory, secret)) ||
      (await scan(workspace, secret))
    ) {
      throw new Error(`Secret canary escaped its environment source for ${viewport}.`);
    }
    const tools = view.tools.map((tool) => tool.call.name);
    const exactUsageAttempts = view.attempts.filter(
      (attempt) => attempt.usage.state === "exact",
    ).length;
    const deliveredInputs = view.conversation.filter(
      (turn) => turn.role === "user" && "source" in turn,
    );
    return {
      ...(activeInputMode
        ? {
            activeInput: {
              acceptedCount: view.conversationInput.acceptedCount,
              cjkMultiline:
                deliveredInputs[0]?.content === "Steer 中文\nsecond line" &&
                deliveredInputs[1]?.content === "Queue after current answer.",
              pending: view.conversationInput.pending.length,
              sources: deliveredInputs.map((turn) => turn.source),
            },
            rapidResize,
          }
        : {}),
      budget: {
        actionProposals: view.codingBudget.usage.actionProposals,
        modelSteps: view.codingBudget.usage.modelSteps,
        toolCalls: view.codingBudget.usage.toolCalls,
      },
      exactUsageAttempts,
      exitCode,
      finalAnswerSha256: hashBytes(Buffer.from(view.terminalOutcome.answer)),
      oracle: {
        answerSha256: await hashFile(join(workspace, "answer.cjs")),
        createdSha256: await hashFile(join(workspace, "created.txt")),
        gitDiffSha256: hashBytes(
          Buffer.from(git(workspace, "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--")),
        ),
        testExitCode: oracle.status,
      },
      runId: view.runId,
      status: "passed",
      terminalOutcome: view.terminalOutcome.state,
      terminalRestoration,
      tools,
      transcriptSha256: hashBytes(Buffer.from(transcript)),
      viewport,
    };
  } catch (error) {
    await writeFile(
      `${outputPath}.error`,
      `${viewport}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
      "utf8",
    );
    throw error;
  } finally {
    data.dispose();
    if (!terminalExited) terminatePtyProcessGroup(terminal);
    provider.releaseFirstTask();
    await provider.close();
  }
}

try {
  await cp(source, archive, { recursive: true });
  const manifest = JSON.parse(await readFile(join(archive, "eden-assets.json"), "utf8"));
  for (const [name, descriptor] of [
    ["eden", manifest.application],
    ["rg", manifest.ripgrep],
    ["THIRD_PARTY_NOTICES.txt", manifest.notices],
  ]) {
    if (
      descriptor.path !== name ||
      descriptor.contentHash !== (await hashFile(join(archive, name)))
    ) {
      throw new Error(`Copied package manifest mismatch for ${name}.`);
    }
  }
  await chmod(executable, 0o755);
  await chmod(join(archive, "rg"), 0o755);
  if (!(await stat(executable)).isFile()) throw new Error("Copied package executable is missing.");
  const journeys = [];
  for (const viewport of viewports) journeys.push(await journey(viewport));
  const evidence = {
    journeys,
    package: {
      applicationHash: manifest.application.contentHash,
      copied: true,
      manifestHash: await hashFile(join(archive, "eden-assets.json")),
      sourceDirectory: basename(source),
      sourceTreeRequiredAtRuntime: false,
    },
    platform: { architecture: process.arch, os: process.platform },
    milestone: activeInputMode ? "R3-B" : "R3-A",
    provider: {
      externalNetwork: false,
      kind: "local_openai_compatible_fixture",
      readinessRequestsPerJourney: 1,
      secretCanaryExposed: false,
      taskRequestsPerJourney: activeInputMode ? 8 : 7,
    },
    sourceSha,
    status: "passed",
    verifierSuccessClaimed: false,
  };
  validateEvidence(evidence);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ evidence: outputPath, status: "passed" })}\n`);
} finally {
  await rm(root, { force: true, recursive: true });
}

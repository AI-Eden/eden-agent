import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  opendir,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";

import { paletteEntries } from "../apps/eden/src/tui-focus.ts";
import { decodeRunCatalog, decodeRunInspection } from "../packages/contracts/src/index.ts";
import {
  dockerRepositoryCheckEvidenceConstants,
  validateDockerRepositoryCheckEvidence,
} from "./r2-docker-repository-check-evidence.mjs";
import { terminalScreenText } from "./terminal-screen.mjs";

const timeoutMs = 60_000;
const contextPattern = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/u;
const imageReference =
  "ghcr.io/ai-eden/eden-node24-check@sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f";
const credentialName = "EDEN_ACCEPTANCE_KEY";
const rawOutputCanary = "RAW_REPOSITORY_OUTPUT_CANARY";

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function hashFile(path) {
  return hashBytes(await readFile(path));
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: null,
    maxBuffer: 2 * 1_048_576,
    ...options,
  });
  if (result.error !== undefined) throw result.error;
  return result;
}

function requireSuccess(command, arguments_, options = {}) {
  const result = run(command, arguments_, options);
  if (result.status !== 0) {
    throw new Error(
      `${basename(command)} failed with ${result.status}: ${Buffer.from(result.stderr).toString("utf8") || Buffer.from(result.stdout).toString("utf8")}`,
    );
  }
  return result;
}

function git(workspace, ...arguments_) {
  return Buffer.from(
    requireSuccess("git", arguments_, {
      cwd: workspace,
      env: {
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        LANG: "C",
        LC_ALL: "C",
        PATH: process.env.PATH,
      },
    }).stdout,
  ).toString("utf8");
}

function docker(context, ...arguments_) {
  return run("docker", ["--context", context, ...arguments_], {
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
  });
}

function dockerSuccess(context, ...arguments_) {
  const result = docker(context, ...arguments_);
  if (result.status !== 0) {
    throw new Error(
      `docker ${arguments_[0] ?? ""} failed with ${result.status}: ${Buffer.from(result.stderr).toString("utf8")}`,
    );
  }
  return result;
}

async function treeHash(root) {
  const rows = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, "en"));
    for (const entry of entries) {
      if (entry.name === ".git") continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const bytes = await readFile(path);
        rows.push(`${relative(root, path).replaceAll("\\", "/")}\0${bytes.byteLength}\0`);
        rows.push(bytes);
        rows.push("\0");
      }
    }
  }
  await visit(root);
  const digest = createHash("sha256");
  for (const row of rows) digest.update(row);
  return `sha256:${digest.digest("hex")}`;
}

async function scanFiles(directory, needle) {
  let handle;
  try {
    handle = await opendir(directory);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
  for await (const entry of handle) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await scanFiles(path, needle)) return true;
    } else if (entry.isFile() && (await readFile(path)).includes(Buffer.from(needle))) {
      return true;
    }
  }
  return false;
}

async function removeOwnedTree(directory) {
  async function makeWritable(path) {
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    await chmod(path, 0o700).catch(() => undefined);
    for (const entry of entries) {
      if (entry.isDirectory()) await makeWritable(join(path, entry.name));
    }
  }
  await makeWritable(directory);
  await rm(directory, { force: true, recursive: true });
}

async function waitFor(read, predicate, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  }
  throw new Error(
    `Timed out waiting for ${label}: ${read().replaceAll(/\s+/gu, " ").slice(-2_000)}`,
  );
}

function waitForTerminalQuiet(terminal, quietMs = 250) {
  return new Promise((resolveWait, reject) => {
    let quietTimer;
    const deadline = setTimeout(() => {
      clearTimeout(quietTimer);
      subscription.dispose();
      reject(new Error("Timed out waiting for a stable repository-check input boundary."));
    }, timeoutMs);
    const settle = () => {
      clearTimeout(deadline);
      subscription.dispose();
      resolveWait();
    };
    const armQuietTimer = () => {
      clearTimeout(quietTimer);
      quietTimer = setTimeout(settle, quietMs);
    };
    const subscription = terminal.onData(armQuietTimer);
    armQuietTimer();
  });
}

function waitForTerminalActivity(terminal, readTranscript, previousTranscript) {
  if (readTranscript() !== previousTranscript) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      resolveWait(false);
    }, 2_000);
    const subscription = terminal.onData(() => {
      if (readTranscript() === previousTranscript) return;
      clearTimeout(timer);
      subscription.dispose();
      resolveWait(true);
    });
  });
}

async function pressUntil(terminal, readTranscript, input, read, predicate, label) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (predicate(read())) return;
    await waitForTerminalQuiet(terminal);
    const previousTranscript = readTranscript();
    terminal.write(input);
    if (!(await waitForTerminalActivity(terminal, readTranscript, previousTranscript))) continue;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  await waitFor(read, predicate, label);
}

function activeRunPaletteMoveCount(commandId) {
  const index = paletteEntries({
    canQueueInput: true,
    canSteerInput: true,
    hasConversationInput: true,
    hasProfile: true,
    hasRepositoryReview: true,
    hasReview: true,
    hasTools: true,
    overlay: "palette",
    runState: "approval",
    surface: "workspace",
    workspaceState: "trusted",
  }).findIndex((entry) => entry.commandId === commandId);
  if (index >= 0) return index;
  throw new Error(`The active-run palette does not expose ${commandId}.`);
}

async function invokeActiveRunPaletteCommand(terminal, readTranscript, read, commandId, label) {
  await pressUntil(
    terminal,
    readTranscript,
    "\u0010",
    read,
    (value) => value.includes("focus: overlay.palette"),
    `${label} command palette`,
  );
  for (let index = 0; index < activeRunPaletteMoveCount(commandId); index += 1) {
    terminal.write("\u001B[B");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
  }
  terminal.write("\r");
  await waitFor(
    read,
    (value) => !value.includes("focus: overlay.palette"),
    `${label} command activation`,
  );
}

async function focusApprovalReview(terminal, readTranscript, read, label) {
  if (read().includes("focus: run.composer")) {
    await pressUntil(
      terminal,
      readTranscript,
      "\u001B",
      read,
      (value) => value.includes("focus: run.cancel"),
      `${label} leave active composer`,
    );
  }
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (read().includes("focus: run.approve")) return;
    terminal.write("\t");
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  await waitFor(read, (value) => value.includes("focus: run.approve"), `${label} approval review`);
}

async function resolveApprovalThroughPalette(terminal, readTranscript, read, decision, label) {
  await invokeActiveRunPaletteCommand(terminal, readTranscript, read, decision, label);
}

function compact(value) {
  return value.replaceAll(/\s+/gu, "");
}

async function findJournal(directory, runId) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (!entry.isDirectory()) continue;
    if (entry.name === runId) {
      const candidate = join(path, "journal.jsonl");
      if (
        await stat(candidate).then(
          (value) => value.isFile(),
          () => false,
        )
      )
        return candidate;
    }
    const nested = await findJournal(path, runId);
    if (nested !== null) return nested;
  }
  return null;
}

function parseJsonBytes(bytes, label) {
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    throw new Error(`Invalid JSON from ${label}.`);
  }
}

if (process.argv[2] === "--self-test") {
  if (!contextPattern.test("eden-r2-ci") || contextPattern.test("unix:///tmp/docker.sock")) {
    throw new Error("Repository-check acceptance context grammar is not closed.");
  }
  if (
    activeRunPaletteMoveCount("show-recovery") !== 4 ||
    activeRunPaletteMoveCount("approve") !== 6 ||
    activeRunPaletteMoveCount("deny") !== 7
  ) {
    throw new Error("Repository-check approval palette positions changed unexpectedly.");
  }
  process.stdout.write('{"status":"passed","test":"r2-docker-repository-check-driver"}\n');
  process.exit(0);
}

const source = resolve(process.argv[2] ?? "apps/eden/dist");
const outputPath = resolve(process.argv[3] ?? "r2-evidence/docker-repository-check.json");
const sourceSha = process.argv[4] ?? "0".repeat(40);
const contextFlag = process.argv[5];
const dockerContext = process.argv[6];
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) {
  throw new Error("Repository-check acceptance requires one exact source SHA.");
}
if (
  process.platform !== "linux" ||
  contextFlag !== "--docker-context" ||
  dockerContext === undefined
) {
  process.stdout.write(
    `${JSON.stringify({ reason: "linux_named_context_required", status: "not-run" })}\n`,
  );
  process.exit(0);
}
if (!contextPattern.test(dockerContext)) {
  throw new Error("Repository-check acceptance requires one safe named Docker context.");
}

const root = await mkdtemp(join(tmpdir(), "eden-r2-docker-acceptance-"));
await chmod(root, 0o711);
const archive = join(root, "archive");
const productionExecutable = join(archive, "eden");
const harnessExecutable = join(archive, "eden-repository-acceptance");
const fixtureSource = resolve("fixtures/repository-check-failing");
const fixtureSourceHash = await treeHash(fixtureSource);
const fixtureCredential = `FIXTURE_CREDENTIAL_${randomUUID()}`;
const secretCanary = `SECRET_CANARY_${randomUUID()}`;

function runJson(arguments_, workspace, stateDirectory) {
  const result = requireSuccess(productionExecutable, arguments_, {
    cwd: workspace,
    env: {
      ...process.env,
      [credentialName]: fixtureCredential,
      EDEN_STATE_DIR: stateDirectory,
    },
  });
  if (Buffer.from(result.stderr).byteLength !== 0) {
    throw new Error("Read-only packaged inspection wrote stderr.");
  }
  return parseJsonBytes(result.stdout, "packaged inspection");
}

async function setupWorkspace(name) {
  const scenarioRoot = join(root, name);
  const workspace = join(scenarioRoot, "workspace");
  const stateDirectory = join(scenarioRoot, "state");
  await cp(fixtureSource, workspace, { recursive: true });
  await chmod(workspace, 0o755);
  git(workspace, "init", "--quiet");
  git(workspace, "config", "user.email", "acceptance@example.invalid");
  git(workspace, "config", "user.name", "Eden Repository Acceptance");
  git(workspace, "add", ".");
  git(workspace, "commit", "--quiet", "-m", "fixed failing fixture");
  await writeFile(join(workspace, ".acceptance-secret"), `${secretCanary}\n`, { mode: 0o600 });
  return { stateDirectory, workspace };
}

function independentOracle(workspace, label) {
  const name = `eden-r2-oracle-${label}-${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  try {
    const result = docker(
      dockerContext,
      "run",
      "--rm",
      "--pull",
      "never",
      "--name",
      name,
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--memory",
      "268435456",
      "--memory-swap",
      "268435456",
      "--cpus",
      "1",
      "--pids-limit",
      "64",
      "--ulimit",
      "nofile=256:256",
      "--ulimit",
      "fsize=16777216:16777216",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,nodev,size=16777216",
      "--user",
      "65532:65532",
      "--mount",
      `type=bind,src=${workspace},dst=/workspace,readonly`,
      "--workdir",
      "/workspace",
      "--entrypoint",
      "/usr/local/bin/node",
      imageReference,
      "--test",
      "test/add.test.js",
    );
    if (result.status === null) throw new Error("Independent Docker oracle did not terminate.");
    return {
      exitCode: result.status,
      outcome: result.status === 0 ? "passed" : "failed",
      stderrSha256: hashBytes(result.stderr),
      stdoutSha256: hashBytes(result.stdout),
    };
  } finally {
    docker(dockerContext, "rm", "--force", name);
  }
}

let manifest;
let requireFromHarness;
try {
  await cp(source, archive, { recursive: true });
  manifest = JSON.parse(await readFile(join(archive, "eden-assets.json"), "utf8"));
  for (const [name, descriptor] of [
    ["eden", manifest.application],
    ["rg", manifest.ripgrep],
    ["THIRD_PARTY_NOTICES.txt", manifest.notices],
  ]) {
    if (
      descriptor.path !== name ||
      descriptor.contentHash !== (await hashFile(join(archive, name)))
    ) {
      throw new Error(`The copied archive manifest does not match ${name}.`);
    }
  }
  const compiled = requireSuccess(
    "pnpm",
    [
      "--filter",
      "@eden/cli",
      "exec",
      "bun",
      "build",
      "--compile",
      "--minify",
      "test-fixtures/repository-check-entry.ts",
      "--define",
      'process.env.OPENTUI_LIBC="glibc"',
      "--outfile",
      harnessExecutable,
    ],
    { cwd: resolve(".") },
  );
  if (Buffer.from(compiled.stderr).toString("utf8").includes("error")) {
    throw new Error("Repository-check acceptance harness compilation reported an error.");
  }
  await chmod(productionExecutable, 0o755);
  await chmod(harnessExecutable, 0o755);
  requireFromHarness = createRequire(
    new URL("../spikes/terminal-framework/harness/package.json", import.meta.url),
  );
  const { spawn } = requireFromHarness("node-pty");

  async function runTuiScenario(workspace, stateDirectory, modelScenario, label) {
    const existing = runJson(["run", "list", "--json"], workspace, stateDirectory);
    const decodedExisting = decodeRunCatalog(existing);
    if (!decodedExisting.ok) throw new Error(`${label} could not read its prior run catalog.`);
    const existingIds = new Set(decodedExisting.value.entries.map((entry) => entry.runId));
    const auditPath = join(dirname(stateDirectory), `${label}-model-audit.json`);
    let transcript = "";
    const initialColumns = 120;
    const rows = 100;
    let screenColumns = initialColumns;
    const screen = () => terminalScreenText(transcript, screenColumns, rows);
    let approvalText = "";
    const terminal = spawn(harnessExecutable, [], {
      cols: initialColumns,
      cwd: workspace,
      env: {
        ...process.env,
        [credentialName]: fixtureCredential,
        CI: "false",
        EDEN_REPOSITORY_CHECK_AUDIT_PATH: auditPath,
        EDEN_REPOSITORY_CHECK_DOCKER_CONTEXT: dockerContext,
        EDEN_REPOSITORY_CHECK_SCENARIO: modelScenario,
        EDEN_STATE_DIR: stateDirectory,
        TERM: "xterm-256color",
      },
      name: "xterm-256color",
      rows,
    });
    const data = terminal.onData((chunk) => {
      transcript = `${transcript}${chunk}`.slice(-4 * 1_048_576);
    });
    const exit = new Promise((resolveExit) =>
      terminal.onExit(({ exitCode }) => resolveExit(exitCode)),
    );
    try {
      await waitFor(
        () => transcript,
        (value) => value.includes("__EDEN_REPOSITORY_ACCEPTANCE_READY__"),
        `${label} readiness`,
      );
      await waitFor(
        screen,
        (value) => value.includes("trust: restricted") || value.includes("trust: trusted"),
        `${label} trust surface`,
      );
      if (screen().includes("trust: restricted")) {
        terminal.write("t");
        await waitFor(screen, (value) => value.includes("trust: trusted"), `${label} trust`);
      }
      if (screen().includes("Current-workspace history")) {
        await pressUntil(
          terminal,
          () => transcript,
          "b",
          screen,
          (value) => value.includes("Enter focuses task"),
          `${label} workspace return`,
        );
      }
      for (
        let index = 0;
        index < 16 && !screen().includes("focus: workspace.composer");
        index += 1
      ) {
        terminal.write("\t");
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
      }
      await waitFor(
        screen,
        (value) => value.includes("focus: workspace.composer"),
        `${label} composer`,
      );
      await pressUntil(
        terminal,
        () => transcript,
        "\r",
        screen,
        (value) => value.includes("Enter submits"),
        `${label} editor`,
      );
      const task = `Run the closed ${label} acceptance step.`;
      terminal.write(`\u001B[200~${task}\u001B[201~`);
      await waitFor(screen, (value) => value.includes(task), `${label} task`);
      terminal.write("\r");
      await waitFor(screen, (value) => value.includes("approval: pending"), `${label} approval`);
      const previousTranscript = transcript;
      screenColumns = 60;
      terminal.resize(screenColumns, rows);
      await waitForTerminalActivity(terminal, () => transcript, previousTranscript);
      await waitFor(
        screen,
        (value) => value.includes("view: recovery") && value.includes("Ctrl+P switches"),
        `${label} narrow approval layout`,
      );
      await invokeActiveRunPaletteCommand(
        terminal,
        () => transcript,
        screen,
        "show-recovery",
        `${label} recovery view`,
      );
      await focusApprovalReview(terminal, () => transcript, screen, label);
      const approvalFrames = [];
      for (let index = 0; index < 48; index += 1) {
        approvalFrames.push(screen());
        terminal.write("\u001B[B");
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
      }
      terminal.write("\u001B[F");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      approvalText = compact(approvalFrames.join("\n"));
      if (
        !approvalText.includes("digest:") ||
        !approvalText.includes("proposalrevision") ||
        !approvalText.includes("policy:")
      ) {
        throw new Error(
          `${label} did not display complete approval identity: ${approvalText.slice(-4_000)}`,
        );
      }
      if (
        modelScenario === "check-only" &&
        (!approvalText.includes("execution:dockercontainer") ||
          !approvalText.includes("networknone") ||
          !approvalText.includes(`context:${dockerContext}`) ||
          !approvalText.includes("usernstrue"))
      ) {
        throw new Error(
          `${label} did not display the closed Docker compatibility authority: ${approvalText.slice(-4_000)}`,
        );
      }
      await resolveApprovalThroughPalette(
        terminal,
        () => transcript,
        screen,
        "approve",
        `${label} approval`,
      );
      await waitFor(
        screen,
        (value) => compact(value).includes("outcome:completed"),
        `${label} completed non-success outcome`,
      );
      terminal.write("q");
      const exitCode = await Promise.race([
        exit,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Timed out exiting ${label}.`)), timeoutMs),
        ),
      ]);
      if (exitCode !== 0) throw new Error(`${label} exited with ${exitCode}.`);
    } finally {
      data.dispose();
      terminal.kill();
    }
    const modelAudit = JSON.parse(await readFile(auditPath, "utf8"));
    const current = decodeRunCatalog(runJson(["run", "list", "--json"], workspace, stateDirectory));
    if (!current.ok) throw new Error(`${label} produced an invalid run catalog.`);
    const summary = current.value.entries.find(
      (entry) => entry.availability === "available" && !existingIds.has(entry.runId),
    );
    if (summary?.availability !== "available") throw new Error(`${label} has no new durable run.`);
    const inspected = decodeRunInspection(
      runJson(["run", "show", "--json", summary.runId], workspace, stateDirectory),
    );
    if (!inspected.ok) throw new Error(`${label} produced an invalid run inspection.`);
    const journalPath = await findJournal(stateDirectory, summary.runId);
    if (journalPath === null) throw new Error(`${label} has no exact journal.`);
    const journalBytes = await readFile(journalPath);
    const records = journalBytes
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    return {
      approvalText,
      journalBytes,
      modelAudit,
      records,
      transcript,
      view: inspected.value.view,
    };
  }

  async function checkScenario(name, editScenario) {
    const { stateDirectory, workspace } = await setupWorkspace(name);
    const beforeSha256 = await hashFile(join(workspace, "src/add.js"));
    let edit = { performed: false };
    if (editScenario !== null) {
      const editRun = await runTuiScenario(workspace, stateDirectory, editScenario, `${name}-edit`);
      if (
        editRun.view.terminalOutcome?.state !== "completed" ||
        editRun.view.review === undefined
      ) {
        throw new Error(`${name} edit did not retain its completed review.`);
      }
      edit = {
        afterSha256: await hashFile(join(workspace, "src/add.js")),
        beforeSha256,
        performed: true,
        reviewOutcome: "completed",
      };
    }
    const oracle = independentOracle(workspace, name);
    const checkRun = await runTuiScenario(workspace, stateDirectory, "check-only", `${name}-check`);
    const repositoryCheck = checkRun.view.repositoryCheck;
    if (
      checkRun.view.terminalOutcome?.state !== "completed" ||
      repositoryCheck?.state !== "review" ||
      repositoryCheck.result === null ||
      repositoryCheck.receipt === null
    ) {
      throw new Error(`${name} did not retain one completed repository-check review.`);
    }
    const expectedOutcome = name === "correct-pass" ? "passed" : "failed";
    if (repositoryCheck.result.outcome !== expectedOutcome || oracle.outcome !== expectedOutcome) {
      throw new Error(
        `${name} disagrees with the fail/pass oracle: ${JSON.stringify({ cleanup: repositoryCheck.result.cleanup, oracle, outcome: repositoryCheck.result.outcome })}`,
      );
    }
    const localRawOutputVisible =
      Buffer.from(repositoryCheck.result.stdout, "base64").includes(Buffer.from(rawOutputCanary)) &&
      checkRun.transcript.includes(rawOutputCanary);
    const recordTypes = checkRun.records.map((record) => record.type);
    const approvalConsumed =
      recordTypes.filter((type) => type === "approval.consumed").length === 1;
    const completedCount = recordTypes.filter(
      (type) => type === "repository.check.completed",
    ).length;
    const receiptFiles = [];
    async function collectReceipts(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await collectReceipts(path);
        else if (entry.isFile() && entry.name === "receipt.json") receiptFiles.push(path);
      }
    }
    await collectReceipts(stateDirectory);
    const exactReceiptPresent = (
      await Promise.all(
        receiptFiles.map(async (path) =>
          (await readFile(path, "utf8")).includes(repositoryCheck.effectId),
        ),
      )
    ).some(Boolean);
    const objects = Buffer.from(
      dockerSuccess(
        dockerContext,
        "ps",
        "--all",
        "--filter",
        "label=eden.schema=eden.repository-check.v1",
        "--format",
        "{{.ID}}",
      ).stdout,
    )
      .toString("utf8")
      .trim()
      .split("\n")
      .filter(Boolean);
    const secretCanaryAbsent =
      !checkRun.transcript.includes(secretCanary) &&
      !checkRun.journalBytes.includes(Buffer.from(secretCanary)) &&
      !(await scanFiles(stateDirectory, secretCanary));
    const actionPresented = checkRun.records.find(
      (record) => record.type === "safe.action.proposed",
    );
    const actionDigest = actionPresented?.payload?.action?.digest;
    if (typeof actionDigest !== "string") throw new Error(`${name} has no durable action digest.`);
    return {
      actionDigest,
      approvalConsumed,
      catalogSha256: repositoryCheck.input.catalogSha256,
      cleanup: repositoryCheck.result.cleanup.status,
      containerId: repositoryCheck.receipt.container.id,
      dockerObjectsAfter: objects.length,
      duplicateExecutions: Math.max(0, completedCount - 1),
      edit,
      fixtureHead: git(workspace, "rev-parse", "HEAD").trim(),
      independentOracle: oracle,
      journalSha256: hashBytes(checkRun.journalBytes),
      lifecycle: repositoryCheck.lifecycle.map((entry) => entry.state),
      localRawOutputVisible,
      manifestDigest: repositoryCheck.input.manifestDigest,
      modelCalls: checkRun.modelAudit.modelCalls,
      providerCalls: checkRun.modelAudit.realProviderCalls,
      rawOutputWithheld: checkRun.modelAudit.rawOutputWithheld,
      receiptBeforeCleanup:
        exactReceiptPresent && repositoryCheck.result.cleanup.status === "complete",
      resultOutcome: repositoryCheck.result.outcome,
      secretCanaryAbsent,
      status: "passed",
      terminalOutcome: checkRun.view.terminalOutcome.state,
      transcriptSha256: hashBytes(checkRun.transcript),
    };
  }

  const version = parseJsonBytes(
    dockerSuccess(dockerContext, "version", "--format", "{{json .}}").stdout,
    "docker version",
  );
  const info = parseJsonBytes(
    dockerSuccess(dockerContext, "info", "--format", "{{json .}}").stdout,
    "docker info",
  );
  const context = parseJsonBytes(
    dockerSuccess(dockerContext, "context", "inspect", "--format", "{{json .}}", dockerContext)
      .stdout,
    "docker context",
  );
  const endpoint = context.Endpoints?.docker?.Host;
  if (typeof endpoint !== "string") throw new Error("Named Docker context has no endpoint.");
  const architecture =
    info.Architecture === "x86_64"
      ? "amd64"
      : info.Architecture === "aarch64"
        ? "arm64"
        : info.Architecture;
  const securityOptions = Array.isArray(info.SecurityOptions) ? info.SecurityOptions : [];
  const scenarios = {
    "correct-pass": await checkScenario("correct-pass", "correct-edit"),
    "initial-fail": await checkScenario("initial-fail", null),
    "wrong-fail": await checkScenario("wrong-fail", "wrong-edit"),
  };
  const credentialValueCaptured = await scanFiles(root, fixtureCredential);
  const evidence = {
    archive: {
      applicationHash: manifest.application.contentHash,
      harnessHash: await hashFile(harnessExecutable),
      noticesHash: manifest.notices.contentHash,
      ripgrepHash: manifest.ripgrep.contentHash,
      sourceTreeRequiredAtRuntime: false,
    },
    authority: {
      credential: "non-secret-fixture-only",
      credentialValueCaptured,
      externalNetwork: "not_requested",
      provider: "deterministic-local-fixture",
      verifierSuccessClaimed: false,
    },
    backend: {
      architecture,
      cgroupNamespace: securityOptions.some((value) => String(value).includes("cgroupns")),
      clientApiVersion: version.Client?.ApiVersion,
      clientVersion: version.Client?.Version,
      contextEndpointSha256: hashBytes(endpoint),
      contextName: dockerContext,
      daemonApiVersion: version.Server?.ApiVersion,
      daemonVersion: version.Server?.Version,
      osType: info.OSType,
      seccomp: securityOptions.some((value) => String(value).includes("seccomp")),
      userNamespace: securityOptions.some((value) => String(value).includes("userns")),
    },
    evidenceVersion: 1,
    fixture: {
      dependencyInstall: "not-run",
      network: "none",
      secretCanaryTracked: false,
      sourceTreeSha256: fixtureSourceHash,
    },
    rows: Object.fromEntries(
      dockerRepositoryCheckEvidenceConstants.requiredRows.map((row) => [row, "passed"]),
    ),
    scenarios,
    sourceSha,
    status: "passed",
    toolchain: {
      indexDigest: dockerRepositoryCheckEvidenceConstants.image.indexDigest,
      platformManifestDigest:
        architecture === "amd64"
          ? dockerRepositoryCheckEvidenceConstants.image.linuxAmd64ManifestDigest
          : dockerRepositoryCheckEvidenceConstants.image.linuxArm64ManifestDigest,
      pullPolicy: "never",
    },
  };
  if (
    JSON.stringify(evidence).includes(secretCanary) ||
    JSON.stringify(evidence).includes(fixtureCredential)
  ) {
    throw new Error("Repository-check evidence captured a canary value.");
  }
  validateDockerRepositoryCheckEvidence(evidence, sourceSha);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ evidence: outputPath, status: "passed" })}\n`);
} finally {
  await removeOwnedTree(root);
}
process.exit(0);

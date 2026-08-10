import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
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
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { terminalScreenText } from "./terminal-screen.mjs";

const credentialName = "EDEN_R3_REAL_PROVIDER_KEY";
const timeoutMs = 180_000;

class RealProviderRetryBoundaryError extends Error {
  constructor(code) {
    super("The real provider stopped at an explicit product retry boundary.");
    this.code = /^[a-z0-9_]{1,64}$/u.test(code) ? code : "unknown";
    this.name = "RealProviderRetryBoundaryError";
  }
}

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function hashFile(path) {
  return hashBytes(await readFile(path));
}

function validateEvidence(evidence) {
  const names = evidence.journey?.tools?.map((tool) => tool.name) ?? [];
  const editIndex = names.indexOf("anchor_edit");
  const createIndex = names.indexOf("write_file");
  const commandIndex = names.indexOf("run_command");
  const diffIndex = names.lastIndexOf("git_diff");
  const firstReadIndex = names.findIndex((name) =>
    ["list_files", "read_file", "search_repository", "git_status", "git_diff"].includes(name),
  );
  if (
    evidence.status !== "passed" ||
    !/^[a-f0-9]{40}$/u.test(evidence.sourceSha) ||
    evidence.package?.copied !== true ||
    evidence.provider?.externalNetwork !== true ||
    evidence.provider.kind !== "real_openai_compatible" ||
    evidence.provider.secretCanaryExposed !== false ||
    evidence.provider.tlsDisableEnvironmentForwarded !== false ||
    evidence.provider.tlsVerification !== "normal" ||
    evidence.journey?.terminalOutcome !== "completed" ||
    evidence.journey.terminalRestoration !== "restored" ||
    evidence.journey.oracle?.testExitCode !== 0 ||
    evidence.journey.exactUsageAttempts !== evidence.journey.attempts ||
    evidence.journey.approvals !== 3 ||
    firstReadIndex < 0 ||
    editIndex <= firstReadIndex ||
    createIndex <= editIndex ||
    commandIndex <= createIndex ||
    diffIndex <= commandIndex ||
    evidence.verifierSuccessClaimed !== false
  ) {
    throw new Error(
      "R3 real-provider evidence is incomplete, fake, secret-bearing, or overclaimed.",
    );
  }
}

function validateFailureEvidence(evidence) {
  if (
    evidence.status !== "failed" ||
    !/^[a-f0-9]{40}$/u.test(evidence.sourceSha) ||
    (evidence.package?.copied !== false && evidence.package?.copied !== true) ||
    evidence.provider?.kind !== "real_openai_compatible" ||
    typeof evidence.provider.externalNetworkAttempted !== "boolean" ||
    evidence.provider.tlsVerification !== "normal" ||
    (evidence.failure?.kind !== "acceptance_harness" &&
      evidence.failure?.kind !== "product_retry_boundary") ||
    !/^[a-z0-9_]{1,64}$/u.test(evidence.failure?.code ?? "") ||
    !/^[a-z0-9_]{1,64}$/u.test(evidence.failure?.stage ?? "") ||
    evidence.failure.retryPerformed !== false ||
    evidence.safety?.credentialIncluded !== false ||
    evidence.safety.rawProviderErrorIncluded !== false ||
    evidence.safety.tlsDisableEnvironmentForwarded !== false ||
    evidence.safety.transcriptIncluded !== false ||
    evidence.passingEvidenceEmitted !== false ||
    evidence.verifierSuccessClaimed !== false
  ) {
    throw new Error("R3 real-provider failure evidence is incomplete or secret-bearing.");
  }
}

async function writeFailureEvidence({
  baseUrl,
  error,
  externalNetworkAttempted,
  failureStage,
  model,
  outputPath,
  packageCopied,
  sourceSha,
  tlsDisableEnvironmentForwarded,
}) {
  const retryBoundary = error instanceof RealProviderRetryBoundaryError;
  const evidence = {
    failure: {
      code: retryBoundary ? error.code : "harness_error",
      diagnosticHash: hashBytes(Buffer.from(`${error?.name ?? "Error"}:${error?.message ?? ""}`)),
      kind: retryBoundary ? "product_retry_boundary" : "acceptance_harness",
      retryPerformed: false,
      stage: failureStage,
    },
    package: { copied: packageCopied },
    passingEvidenceEmitted: false,
    platform: { architecture: process.arch, os: process.platform },
    provider: {
      externalNetworkAttempted,
      kind: "real_openai_compatible",
      model,
      origin: new URL(baseUrl).origin,
      profileId: "r3-real",
      tlsVerification: "normal",
    },
    safety: {
      credentialIncluded: false,
      rawProviderErrorIncluded: false,
      tlsDisableEnvironmentForwarded,
      transcriptIncluded: false,
    },
    sourceSha,
    status: "failed",
    verifierSuccessClaimed: false,
  };
  validateFailureEvidence(evidence);
  const failurePath = `${outputPath}.failure.json`;
  await mkdir(resolve(failurePath, ".."), { recursive: true });
  await writeFile(failurePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stderr.write(
    `${JSON.stringify({ evidence: failurePath, failure: evidence.failure.code, status: "failed" })}\n`,
  );
}

if (process.argv[2] === "--self-test") {
  const evidence = {
    journey: {
      approvals: 3,
      attempts: 7,
      exactUsageAttempts: 7,
      oracle: { testExitCode: 0 },
      terminalOutcome: "completed",
      terminalRestoration: "restored",
      tools: [
        { name: "read_file" },
        { name: "anchor_edit" },
        { name: "write_file" },
        { name: "run_command" },
        { name: "git_diff" },
      ],
    },
    package: { copied: true },
    provider: {
      externalNetwork: true,
      kind: "real_openai_compatible",
      secretCanaryExposed: false,
      tlsDisableEnvironmentForwarded: false,
      tlsVerification: "normal",
    },
    sourceSha: "a".repeat(40),
    status: "passed",
    verifierSuccessClaimed: false,
  };
  validateEvidence(evidence);
  for (const mutation of [
    { provider: { ...evidence.provider, externalNetwork: false } },
    { journey: { ...evidence.journey, approvals: 2 } },
    {
      journey: {
        ...evidence.journey,
        tools: evidence.journey.tools.filter((tool) => tool.name !== "git_diff"),
      },
    },
  ]) {
    let rejected = false;
    try {
      validateEvidence({ ...evidence, ...mutation });
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("R3 real-provider evidence accepted an invalid mutation.");
  }
  process.stdout.write(`${JSON.stringify({ status: "passed" })}\n`);
  process.exit(0);
}

if (process.platform !== "linux") {
  throw new Error("R3 real-provider evidence currently names Linux/WSL2 only.");
}

const source = resolve(process.argv[2] ?? "apps/eden/dist");
const outputPath = resolve(
  process.argv[3] ?? "docs/benchmark-results/2026-08-11-r3-a-real-provider.json",
);
const sourceSha = process.argv[4] ?? "";
const baseUrl = process.argv[5] ?? "https://api.deepseek.com";
const model = process.argv[6] ?? "deepseek-v4-pro";
const credential = process.env[credentialName];
const childProcessEnvironment = { ...process.env };
delete childProcessEnvironment.NODE_TLS_REJECT_UNAUTHORIZED;
const tlsDisableEnvironmentForwarded = Object.hasOwn(
  childProcessEnvironment,
  "NODE_TLS_REJECT_UNAUTHORIZED",
);
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) {
  throw new Error("R3 real-provider evidence requires one exact source SHA.");
}
if (credential === undefined || credential.length < 8) {
  throw new Error(
    `R3 real-provider evidence requires ${credentialName} in the process environment.`,
  );
}
if (!baseUrl.startsWith("https://")) {
  throw new Error("R3 real-provider evidence requires a normal-TLS HTTPS base URL.");
}

const root = await mkdtemp(join(tmpdir(), "eden-r3-real-provider-"));
const archive = join(root, "copied-package");
const executable = join(archive, "eden");
const workspace = join(root, "workspace");
const stateDirectory = join(root, "state");
const binDirectory = join(root, "bin");
const commandProgram = "eden-node-fixture";
const commandExecutable = join(binDirectory, commandProgram);
const requireFromHarness = createRequire(
  new URL("../spikes/terminal-framework/harness/package.json", import.meta.url),
);
const { spawn } = requireFromHarness("node-pty");
const { terminatePtyProcessGroup } = await import(
  "../spikes/terminal-framework/harness/dist/src/pty-cleanup.js"
);
let externalNetworkAttempted = false;
let failureStage = "package_copy";
let packageCopied = false;

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    timeout: 30_000,
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

async function waitFor(read, predicate, label, limit = timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < limit) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  }
  const current = read();
  const diagnostic = typeof current === "string" ? current : JSON.stringify(current);
  throw new Error(
    `Timed out waiting for ${label}: ${diagnostic.replaceAll(/\s+/gu, " ").slice(-4_000)}`,
  );
}

function exactApprovedCall(view) {
  const requested = [...(view.tools ?? [])].reverse().find((tool) => tool.state === "requested");
  if (requested === undefined) throw new Error("Approval has no requested tool call.");
  const call = requested.call;
  if (
    call.name === "anchor_edit" &&
    call.arguments.path === "answer.cjs" &&
    JSON.stringify(call.arguments.replacements) ===
      JSON.stringify([
        {
          expectedOccurrences: 1,
          newText: "module.exports = 42;",
          oldText: "module.exports = 41;",
        },
      ])
  ) {
    return call;
  }
  if (
    call.name === "write_file" &&
    call.arguments.path === "created.txt" &&
    call.arguments.content === "created\n"
  ) {
    return call;
  }
  if (
    call.name === "run_command" &&
    call.arguments.program === commandProgram &&
    JSON.stringify(call.arguments.args) === JSON.stringify(["--test", "answer.test.cjs"]) &&
    call.arguments.cwd === "." &&
    call.arguments.network === "host_unrestricted" &&
    call.arguments.timeoutMs <= 10_000
  ) {
    return call;
  }
  throw new Error(`The real provider proposed an unapproved ${call.name} shape.`);
}

try {
  await cp(source, archive, { recursive: true });
  packageCopied = true;
  failureStage = "package_validation";
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
  failureStage = "fixture_setup";
  await mkdir(workspace);
  await mkdir(binDirectory);
  await copyFile(process.execPath, commandExecutable);
  await chmod(commandExecutable, 0o755);
  await writeFile(join(workspace, "answer.cjs"), "module.exports = 41;\n", "utf8");
  await writeFile(
    join(workspace, "answer.test.cjs"),
    [
      "const assert = require('node:assert/strict');",
      "const { readFileSync } = require('node:fs');",
      "const test = require('node:test');",
      "test('real-provider R3 correction', () => {",
      "  assert.equal(require('./answer.cjs'), 42);",
      "  assert.equal(readFileSync('created.txt', 'utf8'), 'created\\n');",
      `  assert.equal(process.env.${credentialName}, undefined);`,
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
  if (
    run(process.execPath, ["--test", "answer.test.cjs"], {
      cwd: workspace,
      env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH },
    }).status === 0
  ) {
    throw new Error("The independent real-provider fixture did not start failing.");
  }

  const restorationChallenge = randomUUID().replaceAll("-", "");
  const restorationSentinel = `EDEN_R3_REAL_RESTORED_${restorationChallenge}`;
  const parentReady = "__EDEN_R3_REAL_PARENT_READY__";
  const shellScript = `trap : INT; before=$(stty -g); ${quotePosix(executable)}; code=$?; after=$(stty -g); printf '__EDEN_R3_REAL_MODE_BEFORE__=%s\\n' "$before"; printf '__EDEN_R3_REAL_MODE_AFTER__=%s\\n' "$after"; printf '__EDEN_R3_REAL_CANDIDATE_EXIT__=%s\\n' "$code"; printf '${parentReady}\\n'; IFS= read -r token; printf 'EDEN_R3_REAL_RESTORED_%s\\n' "$token"; exit "$code"`;
  const environment = {
    ...childProcessEnvironment,
    [credentialName]: credential,
    EDEN_STATE_DIR: stateDirectory,
    EDEN_TUI_PROBE: "1",
    PATH: `${binDirectory}:${process.env.PATH ?? ""}`,
    TERM: "xterm-256color",
  };
  let transcript = "";
  const terminal = spawn("/bin/sh", ["-c", shellScript], {
    cols: 100,
    cwd: workspace,
    env: environment,
    name: "xterm-256color",
    rows: 30,
  });
  let terminalExited = false;
  const data = terminal.onData((chunk) => {
    transcript = `${transcript}${chunk}`.slice(-4 * 1_048_576);
  });
  const exit = new Promise((resolveExit) =>
    terminal.onExit(({ exitCode }) => {
      terminalExited = true;
      resolveExit(exitCode);
    }),
  );
  const screen = () => terminalScreenText(transcript, 100, 30);
  let finalView;
  let approvalCount = 0;
  const approvals = new Set();
  try {
    failureStage = "tui_startup";
    await waitFor(
      () => transcript,
      (value) => value.includes("__EDEN_INPUT_READY__"),
      "TUI readiness",
    );
    terminal.write("p");
    await waitFor(screen, (value) => value.includes("Provider profiles"), "profile editor");
    const profile = `r3-real|${baseUrl}|${model}|pay_as_you_go|128000|8192|env:${credentialName}`;
    terminal.write(`\u001B[200~${profile}\u001B[201~`);
    await waitFor(screen, (value) => value.includes(credentialName), "complete real profile draft");
    terminal.write("\r");
    await waitFor(screen, (value) => value.includes("profile: r3-real"), "saved real profile");
    terminal.write("c");
    await waitFor(screen, (value) => value.includes("confirm: y"), "real readiness confirmation");
    failureStage = "provider_readiness";
    externalNetworkAttempted = true;
    terminal.write("y");
    await waitFor(
      screen,
      (value) => value.includes("completion_ready"),
      "real completion readiness",
    );
    terminal.write("t");
    await waitFor(screen, (value) => value.includes("trust: trusted"), "workspace trust");
    for (let index = 0; index < 16; index += 1) {
      if (screen().includes("focus: workspace.composer")) break;
      terminal.write("\t");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 30));
    }
    await waitFor(screen, (value) => value.includes("focus: workspace.composer"), "composer focus");
    terminal.write("\r");
    await waitFor(screen, (value) => value.includes("Enter submits"), "composer entry");
    const task = [
      "Complete this exact bounded fixture without repository_check.",
      "First inspect answer.cjs with a read-only repository tool.",
      "Then call anchor_edit once to replace exactly module.exports = 41; with module.exports = 42; in answer.cjs.",
      "Then call write_file once to create created.txt with exactly created followed by one newline.",
      `Then call run_command once with program ${commandProgram}, args ["--test","answer.test.cjs"], cwd ., network host_unrestricted, timeout at most 10000, and no shell.`,
      "Then call git_diff for path . with continuation null and return a final answer with no tools.",
    ].join(" ");
    terminal.write(`\u001B[200~${task}\u001B[201~`);
    await waitFor(
      screen,
      (value) => value.includes("final answer with no tools"),
      "complete real task draft",
    );
    terminal.write("\r");

    failureStage = "coding_journey";
    finalView = await waitFor(
      () => {
        const catalog = run(executable, ["run", "list", "--json"], {
          cwd: workspace,
          env: environment,
        });
        if (catalog.status !== 0) return null;
        const summary = JSON.parse(catalog.stdout).entries.find(
          (entry) => entry.availability === "available",
        );
        if (summary === undefined) return null;
        const inspection = run(executable, ["run", "show", "--json", summary.runId], {
          cwd: workspace,
          env: environment,
        });
        return inspection.status === 0 ? JSON.parse(inspection.stdout).view : null;
      },
      (view) => {
        if (view === null) return false;
        if (view.retry?.available === true) {
          throw new RealProviderRetryBoundaryError(view.retry.reason?.code ?? "unknown");
        }
        if (view.approval !== null && !approvals.has(view.approval.approvalId)) {
          exactApprovedCall(view);
          approvals.add(view.approval.approvalId);
          approvalCount += 1;
          terminal.write("a");
        }
        return view.terminalOutcome !== null;
      },
      "real-provider terminal review",
    );
    if (finalView.terminalOutcome?.state !== "completed") {
      throw new Error(
        `Real-provider journey ended ${finalView.terminalOutcome?.state ?? "without outcome"}.`,
      );
    }
    failureStage = "terminal_restoration";
    terminal.write("q");
    await waitFor(
      () => transcript,
      (value) => value.includes(parentReady),
      "parent shell restoration",
    );
    terminal.write(`${restorationChallenge}\n`);
    const exitCode = await Promise.race([
      exit,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timed out exiting real-provider journey.")), 30_000),
      ),
    ]);
    const oracle = run(process.execPath, ["--test", "answer.test.cjs"], {
      cwd: workspace,
      env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH },
    });
    const beforeMode = /__EDEN_R3_REAL_MODE_BEFORE__=([^\r\n]+)/u.exec(transcript)?.[1];
    const afterMode = /__EDEN_R3_REAL_MODE_AFTER__=([^\r\n]+)/u.exec(transcript)?.[1];
    const terminalRestoration =
      beforeMode !== undefined &&
      beforeMode === afterMode &&
      transcript.includes(restorationSentinel)
        ? "restored"
        : "failed";
    if (
      transcript.includes(credential) ||
      (await scan(stateDirectory, credential)) ||
      (await scan(workspace, credential))
    ) {
      throw new Error("The real-provider credential escaped its environment source.");
    }
    const evidence = {
      journey: {
        approvals: approvalCount,
        attempts: finalView.attempts.length,
        budget: finalView.codingBudget.usage,
        exactUsageAttempts: finalView.attempts.filter((attempt) => attempt.usage.state === "exact")
          .length,
        exitCode,
        oracle: {
          answerSha256: await hashFile(join(workspace, "answer.cjs")),
          createdSha256: await hashFile(join(workspace, "created.txt")),
          gitDiffSha256: hashBytes(
            Buffer.from(git(workspace, "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--")),
          ),
          testExitCode: oracle.status,
        },
        runId: finalView.runId,
        terminalOutcome: finalView.terminalOutcome.state,
        terminalRestoration,
        tools: finalView.tools.map((tool) => ({
          name: tool.call.name,
          status: tool.result?.status ?? "requested",
          toolCallId: tool.call.toolCallId,
        })),
        transcriptSha256: hashBytes(Buffer.from(transcript)),
      },
      package: {
        applicationHash: manifest.application.contentHash,
        copied: true,
        manifestHash: await hashFile(join(archive, "eden-assets.json")),
        sourceDirectory: basename(source),
        sourceTreeRequiredAtRuntime: false,
      },
      platform: { architecture: process.arch, os: process.platform },
      provider: {
        baseUrl,
        externalNetwork: true,
        kind: "real_openai_compatible",
        model,
        profileId: "r3-real",
        secretCanaryExposed: false,
        tlsDisableEnvironmentForwarded,
        tlsVerification: "normal",
      },
      sourceSha,
      status: "passed",
      verifierSuccessClaimed: false,
    };
    failureStage = "evidence_validation";
    validateEvidence(evidence);
    await mkdir(resolve(outputPath, ".."), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ evidence: outputPath, status: "passed" })}\n`);
  } finally {
    data.dispose();
    if (!terminalExited) terminatePtyProcessGroup(terminal);
  }
} catch (error) {
  await writeFailureEvidence({
    baseUrl,
    error,
    externalNetworkAttempted,
    failureStage,
    model,
    outputPath,
    packageCopied,
    sourceSha,
    tlsDisableEnvironmentForwarded,
  });
  process.exitCode = 1;
} finally {
  await rm(root, { force: true, recursive: true });
}

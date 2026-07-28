import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { decodeRunCatalog, decodeRunInspection } from "../packages/contracts/src/index.ts";
import { validateSafeActuationEvidence } from "./r2-safe-actuation-evidence.mjs";
import { terminalScreenText } from "./terminal-screen.mjs";

const timeoutMs = 20_000;
const source = resolve(process.argv[2] ?? "apps/eden/dist");
const outputPath = resolve(
  process.argv[3] ?? "docs/benchmark-results/2026-07-28-r2-safe-actuation-local.json",
);
const sourceSha = process.argv[4] ?? "0".repeat(40);
if (!/^[a-f0-9]{40}$/u.test(sourceSha)) {
  throw new Error("Safe-actuation acceptance requires one exact source SHA.");
}

const applicationName = process.platform === "win32" ? "eden.exe" : "eden";
const harnessName =
  process.platform === "win32" ? "eden-safe-acceptance.exe" : "eden-safe-acceptance";
const ripgrepName = process.platform === "win32" ? "rg.exe" : "rg";
const root = await mkdtemp(join(tmpdir(), "eden-r2-safe-acceptance-"));
const archive = join(root, "archive");
const productionExecutable = join(archive, applicationName);
const harnessExecutable = join(archive, harnessName);
const fixtureCredential = `ACCEPTANCE_CANARY_${randomUUID()}`;

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function hashFile(path) {
  return hashBytes(await readFile(path));
}

function compactTerminal(value) {
  return value.replaceAll(/\s+/gu, "");
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    ...options,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${basename(command)} failed with ${result.status}: ${result.stderr || result.stdout}`,
    );
  }
  return result;
}

function git(workspace, ...arguments_) {
  return run("git", arguments_, {
    cwd: workspace,
    env: {
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      PATH: process.env.PATH,
    },
  }).stdout;
}

async function waitFor(read, predicate, label) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  }
  const tail = read().replaceAll(/\s+/gu, " ").slice(-2_000);
  throw new Error(`Timed out waiting for ${label}. Transcript tail: ${tail}`);
}

async function scanFiles(directory, needle) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (await scanFiles(path, needle)) return true;
    } else if (entry.isFile()) {
      const bytes = await readFile(path);
      if (bytes.includes(Buffer.from(needle))) return true;
    }
  }
  return false;
}

await cp(source, archive, { recursive: true });
const manifest = JSON.parse(await readFile(join(archive, "eden-assets.json"), "utf8"));
for (const [name, descriptor] of [
  [applicationName, manifest.application],
  [ripgrepName, manifest.ripgrep],
  ["THIRD_PARTY_NOTICES.txt", manifest.notices],
]) {
  if (
    descriptor.path !== name ||
    descriptor.contentHash !== (await hashFile(join(archive, name)))
  ) {
    throw new Error(`The copied archive manifest does not match ${name}.`);
  }
}

const buildArguments = ["build", "--compile", "--minify", "test-fixtures/safe-actuation-entry.ts"];
if (process.platform === "linux") {
  buildArguments.push("--define", 'process.env.OPENTUI_LIBC="glibc"');
}
buildArguments.push("--outfile", harnessExecutable);
run(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  ["--filter", "@eden/cli", "exec", "bun", ...buildArguments],
  { cwd: resolve(".") },
);
if (process.platform !== "win32") {
  await chmod(productionExecutable, 0o755);
  await chmod(harnessExecutable, 0o755);
}

const requireFromHarness = createRequire(
  new URL("../spikes/terminal-framework/harness/package.json", import.meta.url),
);
const { spawn } = requireFromHarness("node-pty");

function runJson(arguments_, workspace, stateDirectory) {
  const result = run(productionExecutable, arguments_, {
    cwd: workspace,
    env: {
      ...process.env,
      [credentialName]: fixtureCredential,
      EDEN_STATE_DIR: stateDirectory,
    },
  });
  if (result.stderr !== "") {
    throw new Error(`Read-only archive inspection wrote stderr: ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

const credentialName = "EDEN_ACCEPTANCE_KEY";

async function runScenario(name) {
  const scenarioRoot = join(root, name);
  const workspace = join(scenarioRoot, "workspace");
  const stateDirectory = join(scenarioRoot, "state");
  await mkdir(workspace, { recursive: true });
  git(workspace, "init", "--quiet");
  git(workspace, "config", "user.email", "acceptance@example.invalid");
  git(workspace, "config", "user.name", "Eden Acceptance");
  const base = name === "deny-narrow" ? "old one\nold two\n" : "base line\nold value\n";
  await writeFile(join(workspace, "tracked.txt"), base, "utf8");
  git(workspace, "add", "tracked.txt");
  git(workspace, "commit", "--quiet", "-m", "base");
  if (name === "pre-existing") {
    await writeFile(join(workspace, "tracked.txt"), "user dirty\nold value\n", "utf8");
  }
  const before = await readFile(join(workspace, "tracked.txt"));
  let transcript = "";
  const columns = name === "narrow-review" ? 60 : 120;
  const rows = name === "narrow-review" ? 20 : 60;
  const screen = () => terminalScreenText(transcript, columns, rows);
  const approvalSurface = {
    base: false,
    digest: false,
    isolation: false,
    lifetime: false,
    network: false,
    policy: false,
    reason: false,
    scope: false,
  };
  const observeApproval = () => {
    const compact = compactTerminal(screen());
    approvalSurface.base ||= compact.includes("base:tracked.txt");
    approvalSurface.digest ||= compact.includes("digest:");
    approvalSurface.isolation ||= compact.includes("isolationnone");
    approvalSurface.lifetime ||= compact.includes("proposalrevision");
    approvalSurface.network ||= compact.includes("not_requested");
    approvalSurface.policy ||= compact.includes("r2.anchor-edit.tracked-utf8");
    approvalSurface.reason ||= compact.includes("reason:TrackedUTF-8modifications");
    approvalSurface.scope ||= compact.includes("scope:tracked.txt");
  };
  const terminal = spawn(harnessExecutable, [], {
    cols: columns,
    cwd: workspace,
    env: {
      ...process.env,
      [credentialName]: fixtureCredential,
      CI: "false",
      EDEN_ACCEPTANCE_SCENARIO: name === "narrow-review" ? "approve" : name,
      EDEN_STATE_DIR: stateDirectory,
      TERM: "xterm-256color",
    },
    name: "xterm-256color",
    rows,
  });
  const data = terminal.onData((chunk) => {
    transcript = `${transcript}${chunk}`.slice(-2 * 1_048_576);
  });
  const exit = new Promise((resolveExit) =>
    terminal.onExit(({ exitCode }) => resolveExit(exitCode)),
  );
  try {
    await waitFor(
      () => transcript,
      (value) => value.includes("__EDEN_SAFE_ACCEPTANCE_READY__"),
      `${name} readiness`,
    );
    await waitFor(
      screen,
      (value) => value.includes("trust: restricted"),
      `${name} restricted authority`,
    );
    terminal.write("t");
    await waitFor(screen, (value) => value.includes("trust: trusted"), `${name} trusted authority`);
    for (let index = 0; index < 12; index += 1) {
      terminal.write("\t");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
      if (screen().includes("focus: workspace.composer")) break;
    }
    await waitFor(
      screen,
      (value) => value.includes("focus: workspace.composer"),
      `${name} composer focus`,
    );
    terminal.write("\r");
    await waitFor(screen, (value) => value.includes("Enter submits"), `${name} task editor`);
    terminal.write(`\u001B[200~Apply the bounded ${name} edit.\u001B[201~`);
    terminal.write("\r");
    await waitFor(screen, (value) => value.includes("approval: pending"), `${name} approval`);
    observeApproval();
    for (let index = 0; index < 16; index += 1) {
      const compact = compactTerminal(screen());
      if (compact.includes("digest:") && compact.includes("policy:")) break;
      terminal.write("\u001B[B");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
      observeApproval();
    }
    await waitFor(
      screen,
      (value) => {
        const compact = compactTerminal(value);
        return compact.includes("digest:") && compact.includes("policy:");
      },
      `${name} digest and policy`,
    );
    observeApproval();
    for (let index = 0; index < 16; index += 1) {
      const compact = compactTerminal(screen());
      if (compact.includes("proposalrevision") && compact.includes("isolationnone")) break;
      terminal.write("\u001B[B");
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
      observeApproval();
    }
    await waitFor(
      screen,
      (value) => {
        const compact = compactTerminal(value);
        return compact.includes("proposalrevision") && compact.includes("isolationnone");
      },
      `${name} lifetime and isolation`,
    );
    observeApproval();
    terminal.write("\u001B[F");
    await waitFor(
      screen,
      (value) => {
        const compact = compactTerminal(value);
        return compact.includes("not_requested") && compact.includes("base:tracked.txt");
      },
      `${name} complete approval authority`,
    );
    observeApproval();
    if (name === "stale") {
      await writeFile(join(workspace, "tracked.txt"), "concurrent user bytes\n", "utf8");
    }
    if (name === "deny-narrow") {
      terminal.write("d");
      await waitFor(
        screen,
        (value) => compactTerminal(value).includes("proposalrevision2"),
        "narrow child approval",
      );
      terminal.write("d");
      await waitFor(
        screen,
        (value) => compactTerminal(value).includes("deniallineagealreadyused"),
        "second denial closure",
      );
    } else {
      terminal.write("a");
      if (name === "stale") {
        await waitFor(
          screen,
          (value) => compactTerminal(value).includes("outcome:blocked"),
          "stale edit blocker",
        );
      } else {
        await waitFor(
          screen,
          (value) => compactTerminal(value).includes("SAFEACTUATIONREVIEW"),
          `${name} completed review`,
        );
        for (let index = 0; index < 24; index += 1) {
          terminal.write("\u001B[B");
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
          if (compactTerminal(screen()).includes("EDENCHANGE")) break;
        }
        await waitFor(
          screen,
          (value) => compactTerminal(value).includes("EDENCHANGE"),
          `${name} Eden patch review`,
        );
        for (let index = 0; index < 64; index += 1) {
          terminal.write("\u001B[B");
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
          if (compactTerminal(screen()).includes("CURRENTREPOSITORY")) break;
        }
        await waitFor(
          screen,
          (value) => compactTerminal(value).includes("CURRENTREPOSITORY"),
          `${name} current repository patch review`,
        );
      }
    }
    terminal.write("q");
    const exitCode = await Promise.race([
      exit,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timed out exiting ${name}.`)), timeoutMs),
      ),
    ]);
    if (exitCode !== 0) throw new Error(`${name} exited with ${exitCode}.`);
  } finally {
    data.dispose();
    terminal.kill();
  }

  const catalogValue = runJson(["run", "list", "--json"], workspace, stateDirectory);
  const catalog = decodeRunCatalog(catalogValue);
  if (!catalog.ok) throw new Error(`${name} produced an invalid run catalog.`);
  const summary = catalog.value.entries.find((entry) => entry.availability === "available");
  if (summary?.availability !== "available") throw new Error(`${name} has no durable run.`);
  const inspectionValue = runJson(
    ["run", "show", "--json", summary.runId],
    workspace,
    stateDirectory,
  );
  const inspection = decodeRunInspection(inspectionValue);
  if (!inspection.ok) throw new Error(`${name} produced an invalid run inspection.`);
  const view = inspection.value.view;
  const after = await readFile(join(workspace, "tracked.txt"));
  const blocked = name === "deny-narrow" || name === "stale";
  if (blocked) {
    if (view.terminalOutcome?.state !== "blocked" || view.review !== undefined) {
      throw new Error(`${name} did not remain a blocked non-review outcome.`);
    }
  } else {
    if (
      view.terminalOutcome?.state !== "completed" ||
      view.review?.edenPatch.state !== "complete" ||
      view.review.currentTrackedPatch.state !== "complete"
    ) {
      throw new Error(`${name} did not expose one complete non-success review.`);
    }
    if (name === "check-failure" && view.review.currentCheck.status !== "failed") {
      throw new Error("The check-failure scenario did not retain its failed check.");
    }
    if (
      name === "pre-existing" &&
      !view.review.changedFiles.some(
        (file) => file.path === "tracked.txt" && file.attribution === "both",
      )
    ) {
      throw new Error("The pre-existing scenario lost shared attribution.");
    }
  }
  if (
    name === "deny-narrow" &&
    (view.terminalOutcome?.state !== "blocked" ||
      view.terminalOutcome.error.code !== "denial_lineage_exhausted" ||
      !after.equals(before))
  ) {
    throw new Error("The denial scenario wrote bytes or lost lineage closure.");
  }
  if (
    name === "stale" &&
    (view.terminalOutcome?.state !== "blocked" ||
      view.terminalOutcome.error.code !== "effect_outcome_unknown" ||
      after.toString("utf8") !== "concurrent user bytes\n")
  ) {
    throw new Error(
      `The stale scenario did not preserve its exact blocker: state=${view.terminalOutcome?.state ?? "none"} code=${view.terminalOutcome?.state === "blocked" ? view.terminalOutcome.error.code : "none"} bytes=${JSON.stringify(after.toString("utf8"))}.`,
    );
  }
  if (
    transcript.includes(fixtureCredential) ||
    (await scanFiles(stateDirectory, fixtureCredential))
  ) {
    throw new Error(`${name} persisted or displayed the fixture credential.`);
  }
  if (/\bsucceeded\b|OS-isolated|sandboxed execution/iu.test(transcript)) {
    throw new Error(`${name} emitted a forbidden success or isolation claim.`);
  }
  return {
    approvalSurface,
    changedFileRows: view.review?.changedFiles ?? [],
    checks:
      view.review === undefined
        ? []
        : [
            ["baseline", view.review.baselineCheck.status],
            ["current", view.review.currentCheck.status],
          ],
    fileSha256: hashBytes(after),
    gitDiffSha256: hashBytes(
      git(workspace, "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--"),
    ),
    head: git(workspace, "rev-parse", "HEAD").trim(),
    outcome: view.terminalOutcome?.state ?? null,
    reviewHashes:
      view.review === undefined
        ? null
        : {
            eden: view.review.edenPatch,
            status: view.review.statusHash,
            tracked: view.review.currentTrackedPatch,
          },
    runId: view.runId,
    status: "passed",
    transcriptSha256: hashBytes(transcript),
    ...(view.review === undefined
      ? {}
      : {
          reviewAuthority: {
            actionDigest: view.review.actionDigest,
            approval: view.review.approval,
            executionMode: view.review.executionMode,
            isolation: view.review.isolation,
            network: view.review.network,
            policy: view.review.policy,
            residualRisk: view.review.residualRisk,
          },
        }),
  };
}

try {
  const scenarios = {};
  for (const name of [
    "approve",
    "deny-narrow",
    "stale",
    "pre-existing",
    "check-failure",
    "narrow-review",
  ]) {
    scenarios[name] = await runScenario(name);
  }
  const evidence = {
    archive: {
      applicationHash: manifest.application.contentHash,
      harnessHash: await hashFile(harnessExecutable),
      noticesHash: manifest.notices.contentHash,
      ripgrepHash: manifest.ripgrep.contentHash,
      sourceDirectory: basename(source),
      sourceTreeRequiredAtRuntime: false,
    },
    execution: {
      isolation: "none",
      mode: "trusted_host_policy_only",
      network: "not_requested",
      verifierSuccessClaimed: false,
    },
    platform: { architecture: process.arch, os: process.platform },
    provider: { credential: "non-secret-fixture-only", externalNetwork: "not_requested" },
    rows: {
      crashRecovery: "covered-by-real-runtime-test-not-run-in-packaged-pty",
      docker: "not-run",
      repositoryCodeChecks: "not-run",
    },
    scenarios,
    sourceSha,
    status: "passed",
  };
  validateSafeActuationEvidence(evidence);
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(
    `${JSON.stringify({ evidence: outputPath, scenarios: Object.keys(scenarios), status: "passed" })}\n`,
  );
} finally {
  await rm(root, { force: true, recursive: true });
}

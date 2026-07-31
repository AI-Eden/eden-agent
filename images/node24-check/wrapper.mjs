import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CONTROL_PATH = "/run/eden/request.json";
const RESULT_PATH = "/run/eden/result.json";
const WORKSPACE_ROOT = "/workspace";
const INTERNAL_RESULT_BYTES = 65_536;
const CONTROL_BYTES = 16_384;
const EXACT_ENVIRONMENT = Object.freeze({
  CI: "1",
  HOME: "/tmp/eden-home",
  LANG: "C.UTF-8",
  PATH: "/usr/local/bin:/usr/bin:/bin",
});
const REQUEST_KEYS = [
  "actionId",
  "budgets",
  "checkName",
  "effectId",
  "inputManifestDigest",
  "process",
  "requestVersion",
  "wrapperProtocolVersion",
];
const BUDGET_KEYS = ["stderrBytes", "stdoutBytes", "stopGraceMs", "timeoutMs"];
const PROCESS_KEYS = ["arguments", "cwd", "executable"];
const RESULT_KEYS = [
  "actionId",
  "checkName",
  "effectId",
  "endedAt",
  "exitCode",
  "inputManifestDigest",
  "outcome",
  "resultVersion",
  "startedAt",
  "stderr",
  "stderrByteLength",
  "stderrEncoding",
  "stderrSha256",
  "stdout",
  "stdoutByteLength",
  "stdoutEncoding",
  "stdoutSha256",
  "wrapperProtocolVersion",
  "wrapperReason",
];
const OUTCOMES = new Set([
  "passed",
  "failed",
  "timed_out",
  "cancelled",
  "output_overflow",
  "engine_failed",
]);
const REASONS = new Set([
  "process_exited",
  "wall_clock_exceeded",
  "cancel_requested",
  "stdout_overflow",
  "stderr_overflow",
  "spawn_failed",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function utf8Bytes(value) {
  return Buffer.byteLength(value, "utf8");
}

function isIdentifier(value, maximum = 256) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    utf8Bytes(value) <= maximum &&
    !value.includes("\0")
  );
}

function isDigest(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isContainerPath(value) {
  if (
    typeof value !== "string" ||
    !isAbsolute(value) ||
    value === "/" ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    utf8Bytes(value) > 256
  ) {
    return false;
  }
  return value
    .slice(1)
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isRepositoryDirectory(value) {
  if (value === ".") return true;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\") ||
    value.includes("\0") ||
    utf8Bytes(value) > 256
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isProcess(value) {
  return (
    hasExactKeys(value, PROCESS_KEYS) &&
    isContainerPath(value.executable) &&
    isRepositoryDirectory(value.cwd) &&
    Array.isArray(value.arguments) &&
    value.arguments.length <= 32 &&
    value.arguments.every(
      (argument) =>
        typeof argument === "string" && !argument.includes("\0") && utf8Bytes(argument) <= 256,
    ) &&
    value.arguments.reduce((total, argument) => total + utf8Bytes(argument), 0) <= 4_096
  );
}

export function decodeWrapperRequest(value) {
  if (
    !hasExactKeys(value, REQUEST_KEYS) ||
    value.requestVersion !== 1 ||
    value.wrapperProtocolVersion !== 1 ||
    !isIdentifier(value.actionId) ||
    !isIdentifier(value.effectId) ||
    typeof value.checkName !== "string" ||
    !/^[a-z][a-z0-9-]{0,63}$/u.test(value.checkName) ||
    !isDigest(value.inputManifestDigest) ||
    !hasExactKeys(value.budgets, BUDGET_KEYS) ||
    value.budgets.stdoutBytes !== 16_384 ||
    value.budgets.stderrBytes !== 16_384 ||
    value.budgets.timeoutMs !== 30_000 ||
    value.budgets.stopGraceMs !== 2_000 ||
    !isProcess(value.process)
  ) {
    return null;
  }
  return value;
}

function hash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function streamFields(bytes, name) {
  return {
    [name]: bytes.toString("base64"),
    [`${name}ByteLength`]: bytes.byteLength,
    [`${name}Encoding`]: "base64",
    [`${name}Sha256`]: hash(bytes),
  };
}

function createResult(
  request,
  startedAt,
  endedAt,
  outcome,
  wrapperReason,
  exitCode,
  stdout,
  stderr,
) {
  return {
    actionId: request.actionId,
    checkName: request.checkName,
    effectId: request.effectId,
    endedAt,
    exitCode,
    inputManifestDigest: request.inputManifestDigest,
    outcome,
    resultVersion: 1,
    startedAt,
    ...streamFields(stderr, "stderr"),
    ...streamFields(stdout, "stdout"),
    wrapperProtocolVersion: 1,
    wrapperReason,
  };
}

function signalProcessGroup(child, signal) {
  if (child.pid === undefined) return false;
  try {
    process.kill(-child.pid, signal);
    return true;
  } catch {
    try {
      return child.kill(signal);
    } catch {
      return false;
    }
  }
}

function workspaceCwd(root, cwd) {
  return cwd === "." ? root : join(root, ...cwd.split("/"));
}

export async function runRepositoryCheck(value, options = {}) {
  const request = decodeWrapperRequest(value);
  if (request === null) throw new Error("invalid_wrapper_request");
  const workspaceRoot = options.workspaceRoot ?? WORKSPACE_ROOT;
  const timeoutMs = options.timeoutMs ?? request.budgets.timeoutMs;
  const stopGraceMs = options.stopGraceMs ?? request.budgets.stopGraceMs;
  const signal = options.signal;
  const startedAt = new Date().toISOString();
  const empty = Buffer.alloc(0);

  if (signal?.aborted === true) {
    return createResult(
      request,
      startedAt,
      new Date().toISOString(),
      "cancelled",
      "cancel_requested",
      null,
      empty,
      empty,
    );
  }

  return new Promise((resolveResult) => {
    let child;
    let stopReason = null;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const stdout = [];
    const stderr = [];
    let timeout;
    let killTimer;
    let settled = false;

    const finish = (outcome, wrapperReason, exitCode, capturedStdout, capturedStderr) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killTimer);
      signal?.removeEventListener("abort", cancel);
      resolveResult(
        createResult(
          request,
          startedAt,
          new Date().toISOString(),
          outcome,
          wrapperReason,
          exitCode,
          capturedStdout,
          capturedStderr,
        ),
      );
    };

    const stop = (reason) => {
      if (stopReason !== null) return;
      stopReason = reason;
      signalProcessGroup(child, "SIGTERM");
      killTimer = setTimeout(() => signalProcessGroup(child, "SIGKILL"), stopGraceMs);
    };

    const cancel = () => stop("cancel_requested");

    try {
      child = spawn(request.process.executable, [...request.process.arguments], {
        cwd: workspaceCwd(workspaceRoot, request.process.cwd),
        detached: true,
        env: { ...EXACT_ENVIRONMENT },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      finish("engine_failed", "spawn_failed", null, empty, empty);
      return;
    }

    signal?.addEventListener("abort", cancel, { once: true });
    timeout = setTimeout(() => stop("wall_clock_exceeded"), timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > request.budgets.stdoutBytes) stop("stdout_overflow");
      else stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > request.budgets.stderrBytes) stop("stderr_overflow");
      else stderr.push(chunk);
    });
    child.once("error", () => finish("engine_failed", "spawn_failed", null, empty, empty));
    child.once("close", (code) => {
      if (stopReason === "wall_clock_exceeded") {
        finish("timed_out", stopReason, null, empty, empty);
        return;
      }
      if (stopReason === "cancel_requested") {
        finish("cancelled", stopReason, null, empty, empty);
        return;
      }
      if (stopReason === "stdout_overflow" || stopReason === "stderr_overflow") {
        finish("output_overflow", stopReason, null, empty, empty);
        return;
      }
      const output = Buffer.concat(stdout);
      const errorOutput = Buffer.concat(stderr);
      if (code === 0) {
        finish("passed", "process_exited", 0, output, errorOutput);
      } else {
        finish("failed", "process_exited", code ?? 1, output, errorOutput);
      }
    });
  });
}

function canonicalBase64(value) {
  return (
    typeof value === "string" &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value) &&
    Buffer.from(value, "base64").toString("base64") === value
  );
}

function isInternalResult(value) {
  if (
    !hasExactKeys(value, RESULT_KEYS) ||
    value.resultVersion !== 1 ||
    value.wrapperProtocolVersion !== 1 ||
    !isIdentifier(value.actionId) ||
    !isIdentifier(value.effectId) ||
    typeof value.checkName !== "string" ||
    !/^[a-z][a-z0-9-]{0,63}$/u.test(value.checkName) ||
    !isDigest(value.inputManifestDigest) ||
    !OUTCOMES.has(value.outcome) ||
    !REASONS.has(value.wrapperReason) ||
    !(value.exitCode === null || Number.isInteger(value.exitCode)) ||
    value.stderrEncoding !== "base64" ||
    value.stdoutEncoding !== "base64" ||
    !canonicalBase64(value.stderr) ||
    !canonicalBase64(value.stdout) ||
    !isDigest(value.stderrSha256) ||
    !isDigest(value.stdoutSha256)
  ) {
    return false;
  }
  const stdout = Buffer.from(value.stdout, "base64");
  const stderr = Buffer.from(value.stderr, "base64");
  return (
    stdout.byteLength === value.stdoutByteLength &&
    stderr.byteLength === value.stderrByteLength &&
    stdout.byteLength <= 16_384 &&
    stderr.byteLength <= 16_384 &&
    hash(stdout) === value.stdoutSha256 &&
    hash(stderr) === value.stderrSha256 &&
    Date.parse(value.endedAt) >= Date.parse(value.startedAt)
  );
}

export async function writeInternalResult(path, result) {
  if (!isInternalResult(result)) throw new Error("invalid_internal_result");
  const bytes = Buffer.from(`${JSON.stringify(result)}\n`);
  if (bytes.byteLength > INTERNAL_RESULT_BYTES) throw new Error("internal_result_overflow");
  await writeFile(path, bytes, { flag: "w", mode: 0o600 });
}

async function readControl(path) {
  const bytes = await readFile(path);
  if (bytes.byteLength > CONTROL_BYTES) throw new Error("wrapper_request_overflow");
  return decodeWrapperRequest(JSON.parse(bytes.toString("utf8")));
}

export async function main({
  controlPath = CONTROL_PATH,
  resultPath = RESULT_PATH,
  workspaceRoot = WORKSPACE_ROOT,
} = {}) {
  const request = await readControl(controlPath);
  if (request === null) throw new Error("invalid_wrapper_request");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.once("SIGINT", cancel);
  process.once("SIGTERM", cancel);
  try {
    const result = await runRepositoryCheck(request, {
      signal: controller.signal,
      workspaceRoot,
    });
    await writeInternalResult(resultPath, result);
  } finally {
    process.removeListener("SIGINT", cancel);
    process.removeListener("SIGTERM", cancel);
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.exitCode = 70;
  });
}

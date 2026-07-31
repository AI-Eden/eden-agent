import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import { decodeRepositoryCheckReceipt } from "@eden/contracts";

import {
  decodeRepositoryCheckInternalResult,
  type RepositoryCheckDurableReceipt,
  type RepositoryCheckExecutionPlan,
  type RepositoryCheckExecutionState,
} from "./repository-check-runner.ts";

const receiptByteLimit = 65_536;
const fatalUtf8 = new TextDecoder("utf-8", { fatal: true });

type RepositoryCheckFileStateOptions = {
  readonly cleanupStaging: () => Promise<unknown>;
  readonly effectDirectory: string;
  readonly plan: RepositoryCheckExecutionPlan;
  readonly validateStaging: () => Promise<boolean>;
  readonly workspace: string;
};

export type PrepareRepositoryCheckExecutionStateOptions = {
  readonly cleanupStaging: () => Promise<unknown>;
  readonly effectId: string;
  readonly plan: RepositoryCheckExecutionPlan;
  readonly stateDirectory: string;
  readonly validateStaging: () => Promise<boolean>;
  readonly workspace: string;
};

export type OpenRepositoryCheckExecutionStateOptions = PrepareRepositoryCheckExecutionStateOptions;

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function sameFile(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return (
    left.isFile() &&
    right.isFile() &&
    !left.isSymbolicLink() &&
    !right.isSymbolicLink() &&
    left.nlink === 1 &&
    right.nlink === 1 &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs
  );
}

async function safeRead(path: string, limit: number): Promise<Uint8Array | null | "unknown"> {
  try {
    const before = await lstat(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > limit) {
      return "unknown";
    }
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (!sameFile(before, opened)) return "unknown";
      const bytes = await handle.readFile();
      if (
        bytes.byteLength !== opened.size ||
        !sameFile(opened, await handle.stat()) ||
        !sameFile(opened, await lstat(path))
      ) {
        return "unknown";
      }
      return bytes;
    } finally {
      await handle.close();
    }
  } catch (error) {
    return isMissing(error) ? null : "unknown";
  }
}

function resultBytes(value: RepositoryCheckDurableReceipt["internalResult"]): Uint8Array {
  return Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
}

function resultDigest(value: RepositoryCheckDurableReceipt["internalResult"]): string {
  return `sha256:${createHash("sha256").update(resultBytes(value)).digest("hex")}`;
}

function receiptOutcomeMatches(
  internal: RepositoryCheckDurableReceipt["internalResult"],
  receipt: RepositoryCheckDurableReceipt["receipt"],
): boolean {
  return (
    receipt.resultOutcome === internal.outcome ||
    (receipt.resultOutcome === "oom" && internal.outcome === "engine_failed")
  );
}

async function removeExactRegularFile(path: string): Promise<boolean> {
  try {
    const metadata = await lstat(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) return false;
    await chmod(path, 0o600);
    await unlink(path);
    return true;
  } catch (error) {
    return isMissing(error);
  }
}

export class RepositoryCheckFileExecutionState implements RepositoryCheckExecutionState {
  readonly #cleanup: () => Promise<unknown>;
  readonly #effectDirectory: string;
  readonly #plan: RepositoryCheckExecutionPlan;
  readonly #validateStaging: () => Promise<boolean>;
  readonly paths: {
    readonly control: string;
    readonly result: string;
    readonly workspace: string;
  };
  readonly receiptPath: string;

  constructor(options: RepositoryCheckFileStateOptions) {
    this.#cleanup = options.cleanupStaging;
    this.#effectDirectory = options.effectDirectory;
    this.#plan = options.plan;
    this.#validateStaging = options.validateStaging;
    this.paths = {
      control: join(options.effectDirectory, "request.json"),
      result: join(options.effectDirectory, "result.json"),
      workspace: options.workspace,
    };
    this.receiptPath = join(options.effectDirectory, "receipt.json");
  }

  async validate(plan: RepositoryCheckExecutionPlan): Promise<boolean> {
    if (
      plan.actionDigest !== this.#plan.actionDigest ||
      plan.configDigest !== this.#plan.configDigest ||
      !(await this.#validateStaging())
    ) {
      return false;
    }
    const [control, result] = await Promise.all([
      safeRead(this.paths.control, 16_384),
      safeRead(this.paths.result, plan.action.budgets.internalResultBytes),
    ]);
    if (control === null || control === "unknown" || result === null || result === "unknown") {
      return false;
    }
    return (
      Buffer.from(control).equals(Buffer.from(`${JSON.stringify(plan.request)}\n`)) &&
      result.byteLength <= plan.action.budgets.internalResultBytes
    );
  }

  async readInternalResult(): Promise<{
    readonly bytes: Uint8Array;
    readonly value: RepositoryCheckDurableReceipt["internalResult"];
  } | null> {
    const bytes = await safeRead(this.paths.result, this.#plan.action.budgets.internalResultBytes);
    if (bytes === null || bytes === "unknown" || bytes.byteLength === 0) return null;
    try {
      const value: unknown = JSON.parse(fatalUtf8.decode(bytes));
      const decoded = decodeRepositoryCheckInternalResult(value, this.#plan);
      return decoded === null ? null : { bytes, value: decoded };
    } catch {
      return null;
    }
  }

  async readReceipt(): Promise<RepositoryCheckDurableReceipt | null | "unknown"> {
    const bytes = await safeRead(this.receiptPath, receiptByteLimit);
    if (bytes === null || bytes === "unknown") return bytes;
    try {
      const value: unknown = JSON.parse(fatalUtf8.decode(bytes));
      if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "internalResult,receipt" ||
        !("internalResult" in value) ||
        !("receipt" in value)
      ) {
        return "unknown";
      }
      const internal = decodeRepositoryCheckInternalResult(value.internalResult, this.#plan);
      const receipt = decodeRepositoryCheckReceipt(value.receipt);
      if (
        internal === null ||
        !receipt.ok ||
        receipt.value.actionId !== this.#plan.action.actionId ||
        receipt.value.effectId !== this.#plan.labels.effectId ||
        receipt.value.configDigest !== this.#plan.configDigest ||
        receipt.value.stagingIdentity !== this.#plan.action.staging.identity ||
        receipt.value.resultDigest !== resultDigest(internal) ||
        !receiptOutcomeMatches(internal, receipt.value)
      ) {
        return "unknown";
      }
      return { internalResult: internal, receipt: receipt.value };
    } catch {
      return "unknown";
    }
  }

  async recordReceipt(value: RepositoryCheckDurableReceipt): Promise<void> {
    const internal = decodeRepositoryCheckInternalResult(value.internalResult, this.#plan);
    const receipt = decodeRepositoryCheckReceipt(value.receipt);
    if (
      internal === null ||
      !receipt.ok ||
      receipt.value.configDigest !== this.#plan.configDigest ||
      receipt.value.resultDigest !== resultDigest(internal) ||
      !receiptOutcomeMatches(internal, receipt.value)
    ) {
      throw new Error("repository_check_receipt_invalid");
    }
    const bytes = Buffer.from(
      `${JSON.stringify({ internalResult: internal, receipt: receipt.value })}\n`,
    );
    if (bytes.byteLength > receiptByteLimit) throw new Error("repository_check_receipt_overflow");
    const handle = await open(this.receiptPath, "wx", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.chmod(0o400);
    } finally {
      await handle.close();
    }
  }

  async cleanupStaging(): Promise<boolean> {
    try {
      await this.#cleanup();
    } catch {
      return false;
    }
    const [control, result] = await Promise.all([
      removeExactRegularFile(this.paths.control),
      removeExactRegularFile(this.paths.result),
    ]);
    return control && result;
  }
}

export async function prepareRepositoryCheckExecutionState(
  options: PrepareRepositoryCheckExecutionStateOptions,
): Promise<RepositoryCheckFileExecutionState> {
  if (
    !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(options.effectId) ||
    options.effectId !== options.plan.labels.effectId ||
    !isAbsolute(options.workspace)
  ) {
    throw new Error("repository_check_state_identity_invalid");
  }
  const stateDirectory = resolve(options.stateDirectory);
  await mkdir(stateDirectory, { mode: 0o700, recursive: true });
  const resolvedState = await realpath(stateDirectory);
  const effects = join(resolvedState, "repository-check-effects");
  await mkdir(effects, { mode: 0o700, recursive: true });
  const effectsMetadata = await lstat(effects);
  if (!effectsMetadata.isDirectory() || effectsMetadata.isSymbolicLink()) {
    throw new Error("repository_check_state_directory_invalid");
  }
  const effectDirectory = join(effects, options.effectId);
  await mkdir(effectDirectory, { mode: 0o700 });
  const state = new RepositoryCheckFileExecutionState({
    cleanupStaging: options.cleanupStaging,
    effectDirectory,
    plan: options.plan,
    validateStaging: options.validateStaging,
    workspace: await realpath(options.workspace),
  });
  const request = await open(state.paths.control, "wx", 0o444);
  try {
    await request.writeFile(`${JSON.stringify(options.plan.request)}\n`, "utf8");
    await request.sync();
    await request.chmod(0o444);
  } finally {
    await request.close();
  }
  const result = await open(state.paths.result, "wx", 0o666);
  try {
    await result.sync();
    await result.chmod(0o666);
  } finally {
    await result.close();
  }
  return state;
}

export async function openRepositoryCheckExecutionState(
  options: OpenRepositoryCheckExecutionStateOptions,
): Promise<RepositoryCheckFileExecutionState | null> {
  if (
    !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(options.effectId) ||
    options.effectId !== options.plan.labels.effectId ||
    !isAbsolute(options.workspace)
  ) {
    throw new Error("repository_check_state_identity_invalid");
  }
  const stateDirectory = resolve(options.stateDirectory);
  let resolvedState: string;
  try {
    resolvedState = await realpath(stateDirectory);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  const effects = join(resolvedState, "repository-check-effects");
  const effectDirectory = join(effects, options.effectId);
  try {
    for (const path of [effects, effectDirectory]) {
      const metadata = await lstat(path);
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw new Error("repository_check_state_directory_invalid");
      }
    }
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  return new RepositoryCheckFileExecutionState({
    cleanupStaging: options.cleanupStaging,
    effectDirectory,
    plan: options.plan,
    validateStaging: options.validateStaging,
    workspace: await realpath(options.workspace),
  });
}

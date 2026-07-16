import { createHash } from "node:crypto";
import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";

import type { ProductError, ResolveWorkspaceTrustCommand, WorkspaceReview } from "@eden/contracts";
import {
  ensureStateSubdirectory,
  inspectStateSubdirectory,
  StatePathError,
} from "../state-path.ts";
import {
  invalidLoadedTrust,
  type LoadedTrust,
  loadTrust,
  type WorkspaceTrustRecord,
  writeTrustRecord,
} from "./trust-record.ts";
import {
  acquireWorkspaceLock,
  type WorkspaceLock,
  type WorkspaceLockTimer,
  WorkspaceStateLockError,
} from "./workspace-lock.ts";

export type WorkspaceIdentity = {
  readonly canonicalRoot: string;
  readonly name: string;
  readonly workspaceId: string;
};

export interface WorkspaceClock {
  now(): Date;
}

export type WorkspaceTrustServiceOptions = {
  readonly clock?: WorkspaceClock;
  readonly cwd: string;
  readonly stateDirectory: string;
  readonly timer?: WorkspaceLockTimer;
};

export class WorkspaceTrustError extends Error {
  readonly name = "WorkspaceTrustError";
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

function productError(
  code: string,
  message: string,
  recoverability: ProductError["recoverability"],
  suggestedAction: string,
): ProductError {
  return { code, message, recoverability, suggestedActions: [suggestedAction] };
}

function containsPath(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

export async function resolveWorkspaceIdentity(cwd: string): Promise<WorkspaceIdentity> {
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(cwd);
    if (!(await stat(canonicalRoot)).isDirectory())
      throw new Error("Workspace is not a directory.");
  } catch (error) {
    if (error instanceof WorkspaceTrustError) throw error;
    throw new WorkspaceTrustError(
      productError(
        "workspace_unavailable",
        "The selected workspace is not an available directory.",
        "reconfigure",
        "Select an existing workspace directory.",
      ),
    );
  }
  const workspaceId = createHash("sha256")
    .update(`eden-workspace-v1\0${canonicalRoot}`, "utf8")
    .digest("hex");
  return {
    canonicalRoot,
    name: basename(canonicalRoot) || canonicalRoot,
    workspaceId,
  };
}

async function resolveStateDirectory(
  stateDirectory: string,
  workspace: WorkspaceIdentity,
  readOnly: boolean,
): Promise<string> {
  const absolute = resolve(stateDirectory);
  if (containsPath(workspace.canonicalRoot, absolute)) {
    throw new WorkspaceTrustError(
      productError(
        "unsafe_state_directory",
        "The Eden state directory must be outside the selected workspace.",
        "reconfigure",
        "Choose a state directory outside the workspace.",
      ),
    );
  }
  let canonical: string;
  try {
    canonical = await realpath(absolute);
    if (!(await stat(canonical)).isDirectory()) {
      throw new WorkspaceTrustError(
        productError(
          "workspace_state_unavailable",
          "The Eden state directory is unavailable.",
          "reconfigure",
          "Choose an available state directory outside the workspace.",
        ),
      );
    }
  } catch (error) {
    if (error instanceof WorkspaceTrustError) throw error;
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw new WorkspaceTrustError(
        productError(
          "workspace_state_unavailable",
          "The Eden state directory is unavailable.",
          "reconfigure",
          "Choose an available state directory outside the workspace.",
        ),
      );
    }
    const missing: string[] = [];
    let ancestor = absolute;
    while (true) {
      try {
        await lstat(ancestor);
        break;
      } catch (ancestorError) {
        if (!(ancestorError instanceof Error && "code" in ancestorError)) throw ancestorError;
        if (ancestorError.code !== "ENOENT") throw ancestorError;
        const parent = dirname(ancestor);
        if (parent === ancestor) throw ancestorError;
        missing.unshift(basename(ancestor));
        ancestor = parent;
      }
    }
    const canonicalAncestor = await realpath(ancestor);
    canonical = resolve(canonicalAncestor, ...missing);
    if (containsPath(workspace.canonicalRoot, canonical)) {
      throw new WorkspaceTrustError(
        productError(
          "unsafe_state_directory",
          "The Eden state directory resolves inside the selected workspace.",
          "reconfigure",
          "Choose a state directory outside the workspace.",
        ),
      );
    }
    if (readOnly) return canonical;
    let current = canonicalAncestor;
    try {
      for (const segment of missing) {
        current = resolve(current, segment);
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (mkdirError) {
          if (
            !(mkdirError instanceof Error && "code" in mkdirError && mkdirError.code === "EEXIST")
          ) {
            throw mkdirError;
          }
        }
        const metadata = await lstat(current);
        if (!metadata.isDirectory() || metadata.isSymbolicLink())
          throw new Error("Invalid state path.");
      }
      canonical = await realpath(canonical);
    } catch {
      throw new WorkspaceTrustError(
        productError(
          "workspace_state_unavailable",
          "The Eden state directory is unavailable.",
          "reconfigure",
          "Choose an available state directory outside the workspace.",
        ),
      );
    }
  }
  if (containsPath(workspace.canonicalRoot, canonical)) {
    throw new WorkspaceTrustError(
      productError(
        "unsafe_state_directory",
        "The Eden state directory resolves inside the selected workspace.",
        "reconfigure",
        "Choose a state directory outside the workspace.",
      ),
    );
  }
  return canonical;
}

async function loadStoredTrust(
  stateDirectory: string,
  recordPath: string,
  identity: WorkspaceIdentity,
): Promise<LoadedTrust> {
  try {
    const state = await inspectStateSubdirectory(stateDirectory, ["workspace-trust", "v1"]);
    return state === "missing"
      ? { decision: "restricted", notice: null, revision: 0 }
      : loadTrust(recordPath, identity);
  } catch (error) {
    if (error instanceof StatePathError) return invalidLoadedTrust();
    throw error;
  }
}

function review(workspace: WorkspaceIdentity, trust: LoadedTrust): WorkspaceReview {
  const trusted = trust.decision === "trusted";
  return {
    authority: {
      network: "denied",
      processExecution: "fake-only",
      repositoryRead: "disabled",
      repositoryWrite: "denied",
      sandbox: "not-configured",
      taskStart: trusted ? "allowed" : "blocked",
    },
    nextActions: trusted
      ? ["Describe the deterministic fake task or restrict this workspace."]
      : ["Trust this exact workspace or exit."],
    notice: trust.notice,
    profile: { credentials: "not-required", provider: "deterministic-fake" },
    protocolVersion: 1,
    revision: trust.revision,
    workspace: {
      name: workspace.name,
      root: workspace.canonicalRoot,
      trust: trust.decision,
      workspaceId: workspace.workspaceId,
    },
  };
}

export class WorkspaceTrustService {
  readonly identity: WorkspaceIdentity;
  readonly stateDirectory: string;
  private readonly clock: WorkspaceClock;
  private readonly recordPath: string;
  private readonly requestedCwd: string;
  private readonly timer: WorkspaceLockTimer | undefined;
  private trust: LoadedTrust;

  private constructor(
    identity: WorkspaceIdentity,
    requestedCwd: string,
    recordPath: string,
    stateDirectory: string,
    clock: WorkspaceClock,
    trust: LoadedTrust,
    timer?: WorkspaceLockTimer,
  ) {
    this.identity = identity;
    this.requestedCwd = requestedCwd;
    this.recordPath = recordPath;
    this.stateDirectory = stateDirectory;
    this.clock = clock;
    this.trust = trust;
    this.timer = timer;
  }

  static async open(options: WorkspaceTrustServiceOptions): Promise<WorkspaceTrustService> {
    const identity = await resolveWorkspaceIdentity(options.cwd);
    const stateDirectory = await resolveStateDirectory(options.stateDirectory, identity, true);
    const recordPath = resolve(
      stateDirectory,
      "workspace-trust",
      "v1",
      `${identity.workspaceId}.json`,
    );
    const trust = await loadStoredTrust(stateDirectory, recordPath, identity);
    return new WorkspaceTrustService(
      identity,
      options.cwd,
      recordPath,
      stateDirectory,
      options.clock ?? { now: () => new Date() },
      trust,
      options.timer,
    );
  }

  getReview(): WorkspaceReview {
    return review(this.identity, this.trust);
  }

  async refresh(): Promise<WorkspaceReview> {
    this.trust = await loadStoredTrust(this.stateDirectory, this.recordPath, this.identity);
    return this.getReview();
  }

  private identityChanged(): WorkspaceTrustError {
    return new WorkspaceTrustError(
      productError(
        "workspace_identity_changed",
        "The workspace identity changed before the operation was applied.",
        "ask-user",
        "Review the current workspace identity before continuing.",
      ),
    );
  }

  private trustRequired(): WorkspaceTrustError {
    return new WorkspaceTrustError(
      productError(
        "workspace_trust_required",
        "Trust this exact workspace before starting a task.",
        "ask-user",
        "Review the workspace and explicitly grant trust.",
      ),
    );
  }

  private async ensureWritableStateDirectory(): Promise<void> {
    await resolveStateDirectory(this.stateDirectory, this.identity, false);
  }

  private async withLock<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lock: WorkspaceLock;
    try {
      lock = await acquireWorkspaceLock({
        acquiredAt: this.clock.now().toISOString(),
        stateDirectory: this.stateDirectory,
        workspaceId: this.identity.workspaceId,
        ...(signal === undefined ? {} : { signal }),
        ...(this.timer === undefined ? {} : { timer: this.timer }),
      });
    } catch (error) {
      if (error instanceof WorkspaceStateLockError) {
        throw new WorkspaceTrustError(error.productError);
      }
      throw error;
    }
    const result = await operation().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ error, ok: false as const }),
    );
    try {
      await lock.release();
    } catch {
      if (result.ok) {
        throw new WorkspaceTrustError(
          productError(
            "workspace_state_unavailable",
            "The workspace trust state is unavailable.",
            "reconfigure",
            "Inspect or choose another isolated state directory.",
          ),
        );
      }
    }
    if (!result.ok) throw result.error;
    return result.value;
  }

  async authorizeStart<T>(
    operation: (review: WorkspaceReview) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    const preflight = await loadStoredTrust(this.stateDirectory, this.recordPath, this.identity);
    this.trust = preflight;
    if (preflight.decision !== "trusted") throw this.trustRequired();
    return this.withLock(async () => {
      const currentIdentity = await resolveWorkspaceIdentity(this.requestedCwd);
      if (
        currentIdentity.workspaceId !== this.identity.workspaceId ||
        currentIdentity.canonicalRoot !== this.identity.canonicalRoot
      ) {
        throw this.identityChanged();
      }
      const current = await loadStoredTrust(this.stateDirectory, this.recordPath, this.identity);
      this.trust = current;
      if (current.decision !== "trusted") throw this.trustRequired();
      if (current.revision !== preflight.revision) {
        throw new WorkspaceTrustError(
          productError(
            "stale_revision",
            "The workspace trust revision changed before the run started.",
            "retry",
            "Refresh the workspace review and try again.",
          ),
        );
      }
      return operation(this.getReview());
    }, signal);
  }

  async resolve(
    command: ResolveWorkspaceTrustCommand,
    signal?: AbortSignal,
  ): Promise<WorkspaceReview> {
    const preflight = await loadStoredTrust(this.stateDirectory, this.recordPath, this.identity);
    this.trust = preflight;
    if (command.expectedRevision !== preflight.revision) {
      throw new WorkspaceTrustError(
        productError(
          "stale_revision",
          "The workspace trust revision is stale.",
          "retry",
          "Refresh the workspace review and try again.",
        ),
      );
    }
    const decision = command.decision === "trust" ? "trusted" : "restricted";
    if (decision === preflight.decision && preflight.notice === null) return this.getReview();
    await this.ensureWritableStateDirectory();
    return this.withLock(async () => {
      const currentIdentity = await resolveWorkspaceIdentity(this.requestedCwd);
      if (
        currentIdentity.workspaceId !== this.identity.workspaceId ||
        currentIdentity.canonicalRoot !== this.identity.canonicalRoot ||
        command.workspaceId !== this.identity.workspaceId
      ) {
        throw this.identityChanged();
      }
      const current = await loadStoredTrust(this.stateDirectory, this.recordPath, this.identity);
      this.trust = current;
      if (command.expectedRevision !== current.revision) {
        throw new WorkspaceTrustError(
          productError(
            "stale_revision",
            "The workspace trust revision is stale.",
            "retry",
            "Refresh the workspace review and try again.",
          ),
        );
      }
      if (decision === current.decision && current.notice === null) return this.getReview();
      if (current.revision >= Number.MAX_SAFE_INTEGER) {
        throw new WorkspaceTrustError(
          productError(
            "workspace_state_unavailable",
            "The workspace trust revision is exhausted.",
            "reconfigure",
            "Choose a new isolated state directory and review the workspace again.",
          ),
        );
      }
      const record = {
        canonicalRoot: this.identity.canonicalRoot,
        decidedAt: this.clock.now().toISOString(),
        decision,
        revision: current.revision + 1,
        version: 1,
        workspaceId: this.identity.workspaceId,
      } satisfies WorkspaceTrustRecord;
      try {
        await ensureStateSubdirectory(this.stateDirectory, ["workspace-trust", "v1"]);
        await writeTrustRecord(this.recordPath, record);
      } catch {
        throw new WorkspaceTrustError(
          productError(
            "workspace_state_unavailable",
            "The workspace trust state is unavailable.",
            "reconfigure",
            "Inspect or choose another isolated state directory.",
          ),
        );
      }
      this.trust = { decision, notice: null, revision: record.revision };
      return this.getReview();
    }, signal);
  }
}

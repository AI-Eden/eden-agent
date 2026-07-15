import { createHash } from "node:crypto";
import { mkdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

import type { ProductError, ResolveWorkspaceTrustCommand, WorkspaceReview } from "@eden/contracts";
import {
  type LoadedTrust,
  loadTrust,
  type WorkspaceTrustRecord,
  writeTrustRecord,
} from "./trust-record.ts";

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
  await mkdir(absolute, { mode: 0o700, recursive: true });
  const canonical = await realpath(absolute);
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
  private readonly clock: WorkspaceClock;
  private readonly recordPath: string;
  private readonly requestedCwd: string;
  private trust: LoadedTrust;

  private constructor(
    identity: WorkspaceIdentity,
    requestedCwd: string,
    recordPath: string,
    clock: WorkspaceClock,
    trust: LoadedTrust,
  ) {
    this.identity = identity;
    this.requestedCwd = requestedCwd;
    this.recordPath = recordPath;
    this.clock = clock;
    this.trust = trust;
  }

  static async open(options: WorkspaceTrustServiceOptions): Promise<WorkspaceTrustService> {
    const identity = await resolveWorkspaceIdentity(options.cwd);
    const stateDirectory = await resolveStateDirectory(options.stateDirectory, identity);
    const recordPath = resolve(
      stateDirectory,
      "workspace-trust",
      "v1",
      `${identity.workspaceId}.json`,
    );
    const trust = await loadTrust(recordPath, identity);
    return new WorkspaceTrustService(
      identity,
      options.cwd,
      recordPath,
      options.clock ?? { now: () => new Date() },
      trust,
    );
  }

  getReview(): WorkspaceReview {
    return review(this.identity, this.trust);
  }

  async resolve(command: ResolveWorkspaceTrustCommand): Promise<WorkspaceReview> {
    const currentIdentity = await resolveWorkspaceIdentity(this.requestedCwd);
    if (
      currentIdentity.workspaceId !== this.identity.workspaceId ||
      currentIdentity.canonicalRoot !== this.identity.canonicalRoot ||
      command.workspaceId !== this.identity.workspaceId
    ) {
      throw new WorkspaceTrustError(
        productError(
          "workspace_identity_changed",
          "The workspace identity changed before the trust decision was applied.",
          "ask-user",
          "Review the current workspace identity before choosing trust.",
        ),
      );
    }
    if (command.expectedRevision !== this.trust.revision) {
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
    if (decision === this.trust.decision && this.trust.notice === null) return this.getReview();
    const record = {
      canonicalRoot: this.identity.canonicalRoot,
      decidedAt: this.clock.now().toISOString(),
      decision,
      revision: this.trust.revision + 1,
      version: 1,
      workspaceId: this.identity.workspaceId,
    } satisfies WorkspaceTrustRecord;
    await writeTrustRecord(this.recordPath, record);
    this.trust = { decision, notice: null, revision: record.revision };
    return this.getReview();
  }
}

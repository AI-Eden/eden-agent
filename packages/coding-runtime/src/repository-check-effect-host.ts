import { createHash, randomUUID } from "node:crypto";

import type {
  ProductError,
  RepositoryCheckActionEnvelopeV1,
  RepositoryCheckLifecycleState,
} from "@eden/contracts";
import type { KernelEffect, KernelEvent } from "@eden/kernel";

import type { DockerDoctorPort } from "./docker-doctor.ts";
import {
  createSafeApproval,
  evaluateSafeActuationPolicy,
  safeActionDigest,
} from "./policy/index.ts";
import {
  observeRepositoryCheckDockerCompatibility,
  repositoryCheckDockerCompatibilityMatches,
} from "./repository-check-compatibility.ts";
import { repositoryCheckStagingIdentity } from "./repository-check-identity.ts";
import {
  createRepositoryCheckExecutionPlan,
  executeRepositoryCheck,
  type RepositoryCheckExecutionPort,
  recoverRepositoryCheck,
} from "./repository-check-runner.ts";
import {
  RepositoryCheckSnapshotError,
  type RepositoryCheckSnapshotService,
  reopenRepositoryCheckSnapshot,
} from "./repository-check-snapshot.ts";
import {
  openRepositoryCheckExecutionState,
  prepareRepositoryCheckExecutionState,
} from "./repository-check-state.ts";
import { repositoryCheckToolchainManifest } from "./repository-check-toolchain.ts";
import type { EffectHost, EffectObservationListener, ReconciliationResult } from "./runtime.ts";

type PrepareEffect = Extract<KernelEffect, { readonly type: "repository_check.prepare" }>;
type ExecuteEffect = Extract<KernelEffect, { readonly type: "repository_check.execute" }>;

export type RepositoryCheckEffectHostOptions = {
  readonly clock?: () => string;
  readonly doctor: DockerDoctorPort;
  readonly execution: RepositoryCheckExecutionPort;
  readonly id?: () => string;
  readonly snapshot: RepositoryCheckSnapshotService;
  readonly stateDirectory: string;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function blocked(code: string, message: string): ProductError {
  return {
    code,
    message,
    recoverability: "ask-user",
    suggestedActions: [
      "Run eden doctor and inspect the exact repository-check action before retrying.",
    ],
  };
}

function actionDisplay(action: RepositoryCheckActionEnvelopeV1): string {
  return `RepositoryCheck ${canonicalJson({
    budgets: action.budgets,
    checkName: action.operation.checkName,
    dockerCompatibility: action.dockerCompatibility,
    process: action.operation.process,
    repositorySnapshot: {
      byteLength: action.repositorySnapshot.byteLength,
      digest: action.repositorySnapshot.digest,
      fileCount: action.repositorySnapshot.fileCount,
    },
    toolchain: {
      imageIndexDigest: action.toolchain.imageIndexDigest,
      platformManifestDigest: action.toolchain.platformManifestDigest,
      profileRevision: action.toolchain.profileRevision,
      requestedPlatform: action.toolchain.requestedPlatform,
    },
  })}`;
}

export class RepositoryCheckEffectHost implements EffectHost {
  readonly #clock: () => string;
  readonly #doctor: DockerDoctorPort;
  readonly #execution: RepositoryCheckExecutionPort;
  readonly #id: () => string;
  readonly #snapshot: RepositoryCheckSnapshotService;
  readonly #stateDirectory: string;

  constructor(options: RepositoryCheckEffectHostOptions) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#doctor = options.doctor;
    this.#execution = options.execution;
    this.#id = options.id ?? (() => `receipt-${randomUUID()}`);
    this.#snapshot = options.snapshot;
    this.#stateDirectory = options.stateDirectory;
  }

  async execute(
    effect: KernelEffect,
    signal?: AbortSignal,
    observe?: EffectObservationListener,
  ): Promise<KernelEvent> {
    try {
      if (effect.type === "repository_check.prepare") {
        return await this.#prepare(effect, signal);
      }
      if (effect.type === "repository_check.execute") {
        return await this.#execute(effect, signal, observe);
      }
      throw new Error(`Unsupported repository-check effect: ${effect.type}`);
    } catch (error) {
      if (error instanceof RepositoryCheckSnapshotError) {
        return {
          error: blocked(error.code, error.message),
          type: "run.blocked",
        };
      }
      return {
        error: blocked(
          "repository_check_effect_failed",
          "The repository-check effect could not produce one complete closed observation.",
        ),
        type: "run.blocked",
      };
    }
  }

  async #compatibility(signal?: AbortSignal) {
    return observeRepositoryCheckDockerCompatibility(await this.#doctor.inspect(signal));
  }

  async #prepare(effect: PrepareEffect, signal?: AbortSignal): Promise<KernelEvent> {
    const compatibility = await this.#compatibility(signal);
    if (!compatibility.ok) return { error: compatibility.error, type: "run.blocked" };
    const selection = await this.#snapshot.resolve(effect.toolCall.arguments.checkName, signal);
    const captured = await this.#snapshot.capture(
      { catalogSha256: selection.catalog.sha256, head: selection.catalog.head },
      signal,
    );
    const requestedPlatform = `linux/${compatibility.value.daemon.architecture}` as
      | "linux/amd64"
      | "linux/arm64";
    const platformManifest = repositoryCheckToolchainManifest.platforms.find(
      (row) => row.platform === requestedPlatform,
    );
    if (platformManifest === undefined) {
      return {
        error: blocked(
          "repository_check_platform_unsupported",
          "The observed Docker architecture has no frozen toolchain platform.",
        ),
        type: "run.blocked",
      };
    }
    const actionId = `action-${effect.toolCall.toolCallId}`;
    const envelope: RepositoryCheckActionEnvelopeV1 = {
      actionId,
      actionVersion: 1,
      authority: {
        environmentClass: "closed_non_secret",
        executionMode: "docker_container",
        isolation: "linux_container",
        network: "none",
        policyVersion: 1,
        ruleSetRevision: "r2-docker-repository-check-v1",
      },
      baseSnapshots: [],
      budgets: {
        cpuCount: 1,
        fileDescriptors: 256,
        fileSizeBytes: 16_777_216,
        internalResultBytes: 65_536,
        memoryBytes: 268_435_456,
        memorySwapBytes: 268_435_456,
        pids: 64,
        snapshotFileBytes: 1_048_576,
        snapshotFiles: 64,
        stagingBytes: 8_388_608,
        stderrBytes: 16_384,
        stopGraceMs: 2_000,
        stdoutBytes: 16_384,
        timeoutMs: 30_000,
        tmpfsBytes: 16_777_216,
      },
      cwd: ".",
      dockerCompatibility: compatibility.value,
      kind: "repository_check_v1",
      lifetime: { kind: "single_use_proposal_revision", revision: effect.proposalRevision },
      mounts: {
        control: {
          access: "read_only",
          containerPath: "/run/eden/request.json",
          source: "closed_process_request",
        },
        result: {
          access: "read_write",
          containerPath: "/run/eden/result.json",
          source: "result_file",
        },
        temporary: {
          access: "read_write_tmpfs",
          containerPath: "/tmp",
          source: "tmpfs",
        },
        workspace: {
          access: "read_only",
          containerPath: "/workspace",
          source: "repository_snapshot",
        },
      },
      operation: { ...selection, type: "repository_check_v1" },
      profile: {
        autoRemove: false,
        capabilities: "drop_all",
        environment: {
          CI: "1",
          HOME: "/tmp/eden-home",
          LANG: "C.UTF-8",
          PATH: "/usr/local/bin:/usr/bin:/bin",
        },
        hostNamespaces: "none",
        linuxUser: 65_532,
        network: "none",
        noNewPrivileges: true,
        profileRevision: "r2-docker-profile-v1",
        restart: "disabled",
        rootFilesystem: "read_only",
        seccomp: "docker_default",
        sockets: "none",
        workspaceMount: "read_only",
      },
      proposalRevision: effect.proposalRevision,
      repositorySnapshot: captured.manifest,
      runId: effect.runId,
      scope: { capability: "repository.execute.named_check", paths: ["."] },
      staging: {
        identity: repositoryCheckStagingIdentity({
          effectId: effect.executionEffectId,
          inputManifestDigest: captured.manifest.digest,
          runId: effect.runId,
        }),
      },
      toolchain: {
        imageIndexDigest: repositoryCheckToolchainManifest.imageIndexDigest,
        nodeMajor: 24,
        platformManifestDigest: platformManifest.manifestDigest,
        platforms: repositoryCheckToolchainManifest.platforms,
        profileRevision: "r2-docker-profile-v1",
        requestedPlatform,
        toolchainId: "eden-node24-check-v1",
        wrapperContentHash: repositoryCheckToolchainManifest.wrapperContentHash,
        wrapperProtocolVersion: 1,
      },
      workspace: {
        canonicalRootHash: `sha256:${createHash("sha256")
          .update(`eden-canonical-root-v1\0${effect.workspace.root}`)
          .digest("hex")}`,
        workspaceId: effect.workspace.workspaceId,
      },
    };
    const policy = evaluateSafeActuationPolicy(envelope, this.#clock());
    if (policy.decision !== "ask") {
      return {
        error: blocked(
          "repository_check_policy_denied",
          "The exact repository-check action did not produce the required ask decision.",
        ),
        type: "run.blocked",
      };
    }
    const approval = createSafeApproval({
      approvalId: `approval-${effect.toolCall.toolCallId}`,
      envelope,
      expectedRevision: effect.expectedRevision,
    });
    return {
      action: {
        actionId,
        approvalId: approval.approvalId,
        canonicalDisplay: actionDisplay(envelope),
        cwd: ".",
        digest: safeActionDigest(envelope),
        reason: policy.reason,
        safeActuation: {
          approval: {
            actionDigest: approval.actionDigest,
            expectedRevision: approval.expectedRevision,
            proposalRevision: approval.proposalRevision,
            state: approval.state,
          },
          envelope,
          parentActionId: null,
          policy,
        },
        scope: `repository check ${JSON.stringify(effect.toolCall.arguments.checkName)}`,
      },
      effectId: effect.effectId,
      type: "safe.action.proposed",
    };
  }

  async #emitLifecycle(
    effect: ExecuteEffect,
    state: RepositoryCheckLifecycleState,
    observe?: EffectObservationListener,
  ): Promise<void> {
    await observe?.({
      actionId: effect.envelope.actionId,
      effectId: effect.effectId,
      observedAt: this.#clock(),
      state,
      type: "repository.check.lifecycle",
    });
  }

  async #openState(effect: ExecuteEffect) {
    const planned = createRepositoryCheckExecutionPlan(effect.envelope, effect.effectId);
    if (!planned.ok) return null;
    const staged = await reopenRepositoryCheckSnapshot({
      effectId: effect.effectId,
      manifest: effect.envelope.repositorySnapshot,
      stateDirectory: this.#stateDirectory,
    });
    const state = await openRepositoryCheckExecutionState({
      cleanupStaging: staged.cleanup,
      effectId: effect.effectId,
      plan: planned.plan,
      stateDirectory: this.#stateDirectory,
      validateStaging: staged.validate,
      workspace: staged.directory,
    });
    return state === null ? null : { plan: planned.plan, staged, state };
  }

  async #execute(
    effect: ExecuteEffect,
    signal?: AbortSignal,
    observe?: EffectObservationListener,
  ): Promise<KernelEvent> {
    const planned = createRepositoryCheckExecutionPlan(effect.envelope, effect.effectId);
    if (!planned.ok) {
      return {
        error: blocked(planned.code, "The repository-check action is invalid."),
        type: "run.blocked",
      };
    }
    let opened = await this.#openState(effect);
    let stagedForThisAttempt = false;
    if (opened === null) {
      const beforeStaging = await this.#compatibility(signal);
      if (
        !beforeStaging.ok ||
        !repositoryCheckDockerCompatibilityMatches(
          effect.envelope.dockerCompatibility,
          beforeStaging.value,
        )
      ) {
        return {
          error: blocked(
            "repository_check_docker_compatibility_stale",
            "Docker compatibility changed before repository staging.",
          ),
          type: "run.blocked",
        };
      }
      const selection = await this.#snapshot.resolve(effect.envelope.operation.checkName, signal);
      if (
        canonicalJson({ ...selection, type: "repository_check_v1" }) !==
        canonicalJson(effect.envelope.operation)
      ) {
        return {
          error: blocked(
            "repository_check_catalog_stale",
            "The selected repository-check catalog entry changed after approval.",
          ),
          type: "run.blocked",
        };
      }
      const staged = await this.#snapshot.stage(
        {
          catalogSha256: selection.catalog.sha256,
          effectId: effect.effectId,
          expectedManifest: effect.envelope.repositorySnapshot,
          head: selection.catalog.head,
        },
        signal,
      );
      const state = await prepareRepositoryCheckExecutionState({
        cleanupStaging: staged.cleanup,
        effectId: effect.effectId,
        plan: planned.plan,
        stateDirectory: this.#stateDirectory,
        validateStaging: staged.validate,
        workspace: staged.directory,
      });
      opened = { plan: planned.plan, staged, state };
      stagedForThisAttempt = true;
    }
    const beforeMutation = await this.#compatibility(signal);
    if (
      !beforeMutation.ok ||
      !repositoryCheckDockerCompatibilityMatches(
        effect.envelope.dockerCompatibility,
        beforeMutation.value,
      )
    ) {
      if (stagedForThisAttempt) await opened.state.cleanupStaging();
      return {
        error: blocked(
          "repository_check_docker_compatibility_stale",
          "Docker compatibility changed before container dispatch.",
        ),
        type: "run.blocked",
      };
    }
    const completed = await executeRepositoryCheck(
      { action: effect.envelope, effectId: effect.effectId },
      {
        clock: this.#clock,
        id: this.#id,
        observe: (state) => this.#emitLifecycle(effect, state, observe),
        port: this.#execution,
        state: opened.state,
      },
      signal,
    );
    return completed.ok
      ? completed.event
      : {
          error: blocked(completed.code, "The repository-check outcome is unknown or invalid."),
          type: "run.blocked",
        };
  }

  async reconcile(
    effect: KernelEffect,
    observe?: EffectObservationListener,
  ): Promise<ReconciliationResult> {
    if (effect.type === "repository_check.prepare") return { status: "not-started" };
    if (effect.type !== "repository_check.execute") return { status: "unknown" };
    const opened = await this.#openState(effect);
    if (opened === null) return { status: "not-started" };
    const compatibility = await this.#compatibility();
    if (
      !compatibility.ok ||
      !repositoryCheckDockerCompatibilityMatches(
        effect.envelope.dockerCompatibility,
        compatibility.value,
      )
    ) {
      return { status: "unknown" };
    }
    return recoverRepositoryCheck(
      { action: effect.envelope, dispatchStarted: true, effectId: effect.effectId },
      {
        clock: this.#clock,
        id: this.#id,
        observe: (state) => this.#emitLifecycle(effect, state, observe),
        port: this.#execution,
        state: opened.state,
      },
    ).then((result) =>
      result.status === "completed"
        ? { observation: result.event, status: "completed" as const }
        : {
            status:
              result.status === "not-started" ? ("not-started" as const) : ("unknown" as const),
          },
    );
  }
}

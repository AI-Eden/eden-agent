import { randomUUID } from "node:crypto";

import {
  type AgentClient,
  type DeleteProviderProfileCommand,
  decodeProductCommand,
  decodeResolveWorkspaceTrustCommand,
  type EventCursor,
  type ProductCommand,
  type ProductEvent,
  type ProductView,
  type ProviderProfileCatalog,
  type ProviderReadiness,
  type ProviderReadinessCommand,
  type ResolveWorkspaceTrustCommand,
  type RunCatalog,
  type RunId,
  RunIdSchema,
  type RunInspection,
  type SaveProviderProfileCommand,
  type SelectProviderProfileCommand,
  type WorkspaceReview,
} from "@eden/contracts";
import type { KernelEvent } from "@eden/kernel";
import type { ModelDriver } from "@eden/providers";
import Schema from "typebox/schema";

import {
  AgentClientError,
  assertCurrentRevision,
  clientError,
  openRunSession,
  type RunSession,
} from "./client-session.ts";
import { ProviderProfileStore, ProviderProfileStoreError } from "./profiles/index.ts";
import {
  ProviderReadinessError,
  ProviderReadinessService,
  type ProviderReadinessServiceOptions,
} from "./profiles/readiness.ts";
import { projectJournal } from "./projection.ts";
import { RunHistoryError, readRunCatalog, readRunInspection } from "./run-catalog.ts";
import type { RuntimeClock, RuntimeIdSource } from "./runtime.ts";
import {
  allocateStateSubdirectory,
  inspectStateSubdirectory,
  StatePathError,
} from "./state-path.ts";
import { WorkspaceTrustError, WorkspaceTrustService } from "./workspace/index.ts";

export { AgentClientError } from "./client-session.ts";

export type InProcessAgentClientOptions = {
  readonly clock?: RuntimeClock;
  readonly cwd: string;
  readonly idSource?: RuntimeIdSource;
  readonly modelDriver?: ModelDriver;
  readonly profileEnvironment?: Readonly<Record<string, string | undefined>>;
  readonly createReadinessProvider?: ProviderReadinessServiceOptions["createProvider"];
  readonly runId?: RunId;
  readonly stateDirectory: string;
};

function defaultIdSource(): RuntimeIdSource {
  return { next: randomUUID };
}

async function openSession(
  runId: RunId,
  stateDirectory: string,
  workspaceId: string,
  clock: RuntimeClock,
  idSource: RuntimeIdSource,
  cwd: string,
  modelDriver: ModelDriver | undefined,
  existing: boolean,
): Promise<RunSession> {
  try {
    if (existing) {
      const state = await inspectStateSubdirectory(stateDirectory, [
        "runs",
        "v1",
        workspaceId,
        runId,
      ]);
      if (state === "missing") throw clientError("run_not_found", `Run ${runId} was not found.`);
    } else {
      await allocateStateSubdirectory(stateDirectory, ["runs", "v1", workspaceId], runId);
    }
    return await openRunSession(
      runId,
      stateDirectory,
      workspaceId,
      clock,
      idSource,
      cwd,
      !existing,
      modelDriver,
    );
  } catch (error) {
    if (!existing && error instanceof Error && "code" in error && error.code === "EEXIST") {
      throw clientError("run_id_collision", `Run ${runId} already exists.`);
    }
    if (error instanceof StatePathError) {
      throw clientError("workspace_state_unavailable", "The Eden run state is unavailable.");
    }
    if (existing && error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw clientError("run_not_found", `Run ${runId} was not found.`);
    }
    throw error;
  }
}

const runIdValidator = Schema.Compile(RunIdSchema);

export class InProcessAgentClient implements AgentClient {
  private readonly clock: RuntimeClock;
  private readonly cwd: string;
  private readonly idSource: RuntimeIdSource;
  private readonly prefixGeneratedRunIds: boolean;
  private readonly readOnly: boolean;
  private readonly modelDriver: ModelDriver | undefined;
  private readonly profiles: ProviderProfileStore | null;
  private readonly readiness: ProviderReadinessService | null;
  private readonly stateDirectory: string;
  private readonly trust: WorkspaceTrustService;
  private readonly waiters = new Set<() => void>();
  private closed = false;
  private mutationTail: Promise<void> = Promise.resolve();
  private session: RunSession | null;

  private constructor(
    options: InProcessAgentClientOptions,
    stateDirectory: string,
    trust: WorkspaceTrustService,
    session: RunSession | null,
    profiles: ProviderProfileStore | null,
    readiness: ProviderReadinessService | null,
    prefixGeneratedRunIds: boolean,
    readOnly: boolean,
  ) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.cwd = trust.identity.canonicalRoot;
    this.idSource = options.idSource ?? defaultIdSource();
    this.prefixGeneratedRunIds = prefixGeneratedRunIds;
    this.readOnly = readOnly;
    this.modelDriver = options.modelDriver;
    this.profiles = profiles;
    this.readiness = readiness;
    this.stateDirectory = stateDirectory;
    this.trust = trust;
    this.session = session;
  }

  static async open(options: InProcessAgentClientOptions): Promise<InProcessAgentClient> {
    return InProcessAgentClient.openWithMode(options, false);
  }

  static async openReadOnly(
    options: Omit<InProcessAgentClientOptions, "runId">,
  ): Promise<InProcessAgentClient> {
    return InProcessAgentClient.openWithMode(options, true);
  }

  private static async openWithMode(
    options: InProcessAgentClientOptions,
    readOnly: boolean,
  ): Promise<InProcessAgentClient> {
    if (options.runId !== undefined && !runIdValidator.Check(options.runId)) {
      throw clientError(
        "invalid_run_id",
        "The supplied run ID does not match the path-safe product contract.",
      );
    }
    const clock = options.clock ?? { now: () => new Date() };
    const idSource = options.idSource ?? defaultIdSource();
    const prefixGeneratedRunIds = options.idSource === undefined;
    const trust = await WorkspaceTrustService.open({
      clock,
      cwd: options.cwd,
      stateDirectory: options.stateDirectory,
    });
    const stateDirectory = trust.stateDirectory;
    const profiles = readOnly
      ? null
      : await ProviderProfileStore.open({
          environment: options.profileEnvironment,
          stateDirectory,
        });
    const readiness =
      profiles === null
        ? null
        : new ProviderReadinessService({
            clock,
            createProvider: options.createReadinessProvider,
            profiles,
            stateDirectory,
          });
    if (readOnly && options.runId !== undefined) {
      throw clientError("read_only_client", "A read-only client cannot open an execution session.");
    }
    const session =
      options.runId === undefined
        ? null
        : await openSession(
            options.runId,
            stateDirectory,
            trust.identity.workspaceId,
            clock,
            idSource,
            trust.identity.canonicalRoot,
            options.modelDriver,
            true,
          );
    return new InProcessAgentClient(
      { ...options, clock, idSource },
      stateDirectory,
      trust,
      session,
      profiles,
      readiness,
      prefixGeneratedRunIds,
      readOnly,
    );
  }

  private ensureOpen(): void {
    if (this.closed) throw clientError("client_closed", "The agent client is closed.");
  }

  private requireProfiles(): ProviderProfileStore {
    if (this.profiles === null) {
      throw clientError("read_only_client", "Provider profiles are unavailable on this client.");
    }
    return this.profiles;
  }

  private requireReadiness(): ProviderReadinessService {
    if (this.readiness === null) {
      throw clientError("read_only_client", "Provider readiness is unavailable on this client.");
    }
    return this.readiness;
  }

  private requireSession(runId?: RunId): RunSession {
    const session = this.session;
    if (session === null || (runId !== undefined && runId !== session.runId)) {
      throw clientError(
        "run_not_found",
        `Run ${runId ?? "requested"} is not owned by this client.`,
      );
    }
    return session;
  }

  private notify(): void {
    for (const wake of this.waiters) wake();
    this.waiters.clear();
  }

  private async serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail;
    let release: () => void = () => undefined;
    this.mutationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async currentView(): Promise<ProductView> {
    return projectJournal(await this.requireSession().journal.readAll()).view;
  }

  private async driveEffects(signal?: AbortSignal): Promise<void> {
    const { engine } = this.requireSession();
    while (engine.state.phase !== "terminal") {
      const effect = await engine.requestNextEffect();
      if (effect === null) return;
      this.notify();
      await engine.settleInFlightEffect(signal);
      this.notify();
    }
  }

  async getWorkspaceReview(): Promise<WorkspaceReview> {
    this.ensureOpen();
    return this.workspaceReviewWithProfile(await this.trust.refresh());
  }

  private async workspaceReviewWithProfile(review: WorkspaceReview): Promise<WorkspaceReview> {
    if (this.profiles === null) return review;
    try {
      const catalog = await this.requireReadiness().decorateCatalog(await this.profiles.read());
      const active =
        catalog.profiles.find((profile) => profile.id === catalog.activeProfileId) ?? null;
      return {
        ...review,
        nextActions:
          active === null || active.credential.presence === "missing"
            ? [
                "Configure an active provider profile before a real repository task.",
                ...review.nextActions,
              ]
            : active.readiness !== "completion_ready"
              ? [
                  "Run the explicit provider readiness check before a real repository task.",
                  ...review.nextActions,
                ]
              : review.nextActions,
        profile:
          active === null || active.credential.presence === "missing"
            ? { active: null, state: "unconfigured" }
            : { active, state: "configured" },
      };
    } catch (error) {
      if (!(error instanceof ProviderProfileStoreError)) throw error;
      return {
        ...review,
        nextActions: [
          "Inspect or replace the local provider configuration before a real repository task.",
          ...review.nextActions,
        ],
        notice: review.notice ?? error.productError,
        profile: { active: null, state: "unconfigured" },
      };
    }
  }

  private async profileOperation(
    operation: (store: ProviderProfileStore) => Promise<ProviderProfileCatalog>,
  ): Promise<ProviderProfileCatalog> {
    this.ensureOpen();
    try {
      return await this.requireReadiness().decorateCatalog(await operation(this.requireProfiles()));
    } catch (error) {
      if (error instanceof ProviderProfileStoreError) {
        throw new AgentClientError(error.productError);
      }
      throw error;
    }
  }

  async getProviderProfiles(): Promise<ProviderProfileCatalog> {
    return this.profileOperation((store) => store.read());
  }

  async reloadProviderProfiles(): Promise<ProviderProfileCatalog> {
    return this.getProviderProfiles();
  }

  async getProviderReadiness(): Promise<ProviderReadiness> {
    this.ensureOpen();
    try {
      return await this.requireReadiness().read();
    } catch (error) {
      if (error instanceof ProviderProfileStoreError || error instanceof ProviderReadinessError) {
        throw new AgentClientError(error.productError);
      }
      throw error;
    }
  }

  async checkProviderReadiness(
    command: ProviderReadinessCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ProviderReadiness> {
    return this.serializeMutation(async () => {
      this.ensureOpen();
      if (options?.signal?.aborted === true) {
        throw clientError("operation_aborted", "The operation was aborted.", "retry");
      }
      try {
        return await this.requireReadiness().check(
          command,
          options?.signal ?? new AbortController().signal,
        );
      } catch (error) {
        if (error instanceof ProviderProfileStoreError || error instanceof ProviderReadinessError) {
          throw new AgentClientError(error.productError);
        }
        throw error;
      }
    });
  }

  async saveProviderProfile(command: SaveProviderProfileCommand): Promise<ProviderProfileCatalog> {
    return this.serializeMutation(() => this.profileOperation((store) => store.save(command)));
  }

  async selectProviderProfile(
    command: SelectProviderProfileCommand,
  ): Promise<ProviderProfileCatalog> {
    return this.serializeMutation(() => this.profileOperation((store) => store.select(command)));
  }

  async deleteProviderProfile(
    command: DeleteProviderProfileCommand,
  ): Promise<ProviderProfileCatalog> {
    return this.serializeMutation(() => this.profileOperation((store) => store.delete(command)));
  }

  async getRunCatalog(options?: { readonly signal?: AbortSignal }): Promise<RunCatalog> {
    this.ensureOpen();
    if (options?.signal?.aborted === true) {
      throw clientError("operation_aborted", "The operation was aborted.", "retry");
    }
    try {
      return await readRunCatalog({
        stateDirectory: this.stateDirectory,
        workspace: (await this.trust.refresh()).workspace,
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      if (error instanceof RunHistoryError) throw new AgentClientError(error.productError);
      throw clientError("run_history_unavailable", "The run history is unavailable.");
    }
  }

  async inspectRun(
    runId: RunId,
    options?: { readonly signal?: AbortSignal },
  ): Promise<RunInspection> {
    this.ensureOpen();
    if (options?.signal?.aborted === true) {
      throw clientError("operation_aborted", "The operation was aborted.", "retry");
    }
    try {
      return await readRunInspection({
        runId,
        stateDirectory: this.stateDirectory,
        workspace: (await this.trust.refresh()).workspace,
        ...(options?.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      if (error instanceof RunHistoryError) throw new AgentClientError(error.productError);
      throw clientError("run_history_unavailable", "The run history is unavailable.");
    }
  }

  async resolveWorkspaceTrust(
    command: ResolveWorkspaceTrustCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<WorkspaceReview> {
    return this.serializeMutation(() => this.resolveWorkspaceTrustExclusive(command, options));
  }

  private async resolveWorkspaceTrustExclusive(
    command: ResolveWorkspaceTrustCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<WorkspaceReview> {
    this.ensureOpen();
    if (this.readOnly) throw clientError("read_only_client", "This client is read-only.");
    if (options?.signal?.aborted === true)
      throw clientError("operation_aborted", "The operation was aborted.", "retry");
    const decoded = decodeResolveWorkspaceTrustCommand(command);
    if (!decoded.ok) throw new AgentClientError(decoded.error);
    try {
      return this.workspaceReviewWithProfile(
        await this.trust.resolve(decoded.value, options?.signal),
      );
    } catch (error) {
      if (error instanceof WorkspaceTrustError) throw new AgentClientError(error.productError);
      throw error;
    }
  }

  async submit(
    command: ProductCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ProductView> {
    return this.serializeMutation(() => this.submitExclusive(command, options));
  }

  private async submitExclusive(
    command: ProductCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ProductView> {
    this.ensureOpen();
    if (this.readOnly) throw clientError("read_only_client", "This client is read-only.");
    if (options?.signal?.aborted === true)
      throw clientError("operation_aborted", "The operation was aborted.", "retry");
    const decoded = decodeProductCommand(command);
    if (!decoded.ok) throw new AgentClientError(decoded.error);
    if (decoded.value.type === "run.start") {
      if (this.session !== null)
        throw clientError("run_already_started", "The run has already started.");
      const start = decoded.value;
      try {
        await this.trust.authorizeStart(async (review) => {
          const rawRunId = this.idSource.next();
          const runId = this.prefixGeneratedRunIds ? `run-${rawRunId}` : rawRunId;
          if (!runIdValidator.Check(runId)) {
            throw clientError(
              "invalid_run_id",
              "The generated run ID does not match the path-safe product contract.",
            );
          }
          const session = await openSession(
            runId,
            this.stateDirectory,
            this.trust.identity.workspaceId,
            this.clock,
            this.idSource,
            this.cwd,
            this.modelDriver,
            false,
          );
          const event: KernelEvent = {
            correlationId: decoded.value.commandId,
            runId,
            task: start.task,
            type: "run.started",
            workspace: { ...review.workspace, trust: "trusted" },
          };
          await session.engine.commit(event, start.commandId);
          this.session = session;
        }, options?.signal);
        await this.driveEffects(options?.signal);
      } catch (error) {
        if (error instanceof WorkspaceTrustError) throw new AgentClientError(error.productError);
        throw error;
      }
    } else {
      const session = this.requireSession(decoded.value.runId);
      const view = await this.currentView();
      assertCurrentRevision(decoded.value, view);
      switch (decoded.value.type) {
        case "approval.resolve":
          if (view.approval?.approvalId !== decoded.value.approvalId) {
            throw clientError(
              "approval_not_found",
              "The approval identity is not current.",
              "ask-user",
            );
          }
          await session.engine.commit(
            {
              approvalId: decoded.value.approvalId,
              decision: decoded.value.decision,
              type: "approval.resolved",
            },
            decoded.value.commandId,
          );
          this.notify();
          if (decoded.value.decision === "approve") await this.driveEffects(options?.signal);
          break;
        case "run.cancel":
          await session.engine.commit({ type: "run.cancelled" }, decoded.value.commandId);
          break;
        case "run.pause":
        case "run.resume":
          throw clientError(
            "unsupported_command",
            `${decoded.value.type} is outside the R1 fake-task slice.`,
          );
      }
    }
    this.notify();
    return this.currentView();
  }

  async getSnapshot(runId: RunId): Promise<ProductView> {
    this.ensureOpen();
    this.requireSession(runId);
    return this.currentView();
  }

  async *subscribe(
    runId: RunId,
    afterCursor?: EventCursor,
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<ProductEvent> {
    this.ensureOpen();
    const session = this.requireSession(runId);
    let cursor = afterCursor ?? -1;
    while (!this.closed && options?.signal?.aborted !== true) {
      const projected = projectJournal(await session.journal.readAll());
      for (const event of projected.events) {
        if (event.cursor > cursor) {
          cursor = event.cursor;
          yield event;
        }
      }
      if (projected.view.terminalOutcome !== null) return;
      await this.wait(options?.signal);
    }
  }

  private wait(signal?: AbortSignal): Promise<void> {
    if (this.closed || signal?.aborted === true) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        this.waiters.delete(wake);
        signal?.removeEventListener("abort", wake);
        resolve();
      };
      this.waiters.add(wake);
      signal?.addEventListener("abort", wake, { once: true });
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.notify();
  }
}

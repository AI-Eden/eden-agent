import { createHash, randomUUID } from "node:crypto";

import {
  type AgentClient,
  type DeleteProviderProfileCommand,
  decodeProductCommand,
  decodeResolveWorkspaceTrustCommand,
  type EventCursor,
  type ProductCommand,
  type ProductEvent,
  type ProductModelDelta,
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
import {
  type ModelDriver,
  type ModelStepDriver,
  type ModelVisibleTextListener,
  OpenAICompatibleProvider,
} from "@eden/providers";
import Schema from "typebox/schema";

import {
  AgentClientError,
  assertCurrentRevision,
  clientError,
  openRunSession,
  type RunSession,
} from "./client-session.ts";
import {
  ContextAdmissionError,
  ContextAdmissionService,
  type ContextAdmissionServiceOptions,
  type ContextItem,
} from "./context/index.ts";
import {
  ProviderProfileStore,
  ProviderProfileStoreError,
  type ResolvedProviderProfile,
} from "./profiles/index.ts";
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
import { RepositoryToolService, type RepositoryToolServiceOptions } from "./tools/index.ts";
import { WorkspaceTrustError, WorkspaceTrustService } from "./workspace/index.ts";

export { AgentClientError } from "./client-session.ts";

export type InProcessAgentClientOptions = {
  readonly clock?: RuntimeClock;
  readonly createModelProvider?: (resolved: ResolvedProviderProfile) => ModelStepDriver;
  readonly cwd: string;
  readonly idSource?: RuntimeIdSource;
  readonly modelDriver?: ModelDriver;
  readonly profileEnvironment?: Readonly<Record<string, string | undefined>>;
  readonly createReadinessProvider?: ProviderReadinessServiceOptions["createProvider"];
  readonly contextTokenEstimator?: ContextAdmissionServiceOptions["estimateTokens"];
  readonly runId?: RunId;
  readonly repositoryTools?: Omit<RepositoryToolServiceOptions, "workspaceRoot">;
  readonly realProviderRuns?: boolean | "when-configured";
  readonly stateDirectory: string;
};

function defaultIdSource(): RuntimeIdSource {
  return { next: randomUUID };
}

function durableContextItemId(item: ContextItem): string {
  if (item.source !== "repository_instruction") return item.contextItemId;
  return `instruction-${createHash("sha256")
    .update(item.scopePath)
    .update("\0")
    .update(item.content)
    .digest("hex")}`;
}

async function openSession(
  runId: RunId,
  stateDirectory: string,
  workspaceId: string,
  clock: RuntimeClock,
  idSource: RuntimeIdSource,
  cwd: string,
  modelDriver: ModelDriver | undefined,
  modelStepDriver: ModelStepDriver | undefined,
  onVisibleText: ModelVisibleTextListener | undefined,
  repositoryTools: Omit<RepositoryToolServiceOptions, "workspaceRoot">,
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
      repositoryTools,
      modelStepDriver,
      onVisibleText,
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
  private readonly context: ContextAdmissionService;
  private readonly createModelProvider: (resolved: ResolvedProviderProfile) => ModelStepDriver;
  private readonly cwd: string;
  private readonly idSource: RuntimeIdSource;
  private readonly prefixGeneratedRunIds: boolean;
  private readonly readOnly: boolean;
  private readonly realProviderRuns: boolean | "when-configured";
  private readonly modelDriver: ModelDriver | undefined;
  private readonly profiles: ProviderProfileStore | null;
  private readonly readiness: ProviderReadinessService | null;
  private readonly repositoryToolOptions: Omit<RepositoryToolServiceOptions, "workspaceRoot">;
  private repositoryTools: Promise<RepositoryToolService> | undefined;
  private readonly stateDirectory: string;
  private readonly trust: WorkspaceTrustService;
  private readonly waiters = new Set<() => void>();
  private readonly modelDeltaWaiters = new Set<() => void>();
  private readonly modelDeltas: ProductModelDelta[] = [];
  private modelDeltaCursor = 0;
  private closed = false;
  private mutationTail: Promise<void> = Promise.resolve();
  private session: RunSession | null;

  private constructor(
    options: InProcessAgentClientOptions,
    context: ContextAdmissionService,
    stateDirectory: string,
    trust: WorkspaceTrustService,
    session: RunSession | null,
    profiles: ProviderProfileStore | null,
    readiness: ProviderReadinessService | null,
    prefixGeneratedRunIds: boolean,
    readOnly: boolean,
  ) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.context = context;
    this.createModelProvider =
      options.createModelProvider ??
      ((resolved) =>
        new OpenAICompatibleProvider({
          apiKey: resolved.credential,
          baseUrl: resolved.profile.baseUrl,
          clock: this.clock,
          model: resolved.profile.model,
          profileId: resolved.profile.id,
        }));
    this.cwd = trust.identity.canonicalRoot;
    this.idSource = options.idSource ?? defaultIdSource();
    this.prefixGeneratedRunIds = prefixGeneratedRunIds;
    this.readOnly = readOnly;
    this.realProviderRuns = options.realProviderRuns ?? false;
    this.modelDriver = options.modelDriver;
    this.profiles = profiles;
    this.readiness = readiness;
    this.repositoryToolOptions = options.repositoryTools ?? {};
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
    const context = await ContextAdmissionService.open({
      estimateTokens: options.contextTokenEstimator,
      workspaceRoot: trust.identity.canonicalRoot,
    });
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
    let existingResolved: ResolvedProviderProfile | null = null;
    if (options.runId !== undefined && profiles !== null) {
      const catalog = await profiles.read();
      const wantsProvider =
        options.realProviderRuns === true ||
        (options.realProviderRuns === "when-configured" && catalog.activeProfileId !== null);
      if (wantsProvider) {
        existingResolved = await profiles.resolveActive();
        const ready = await readiness?.read();
        if (existingResolved === null || ready?.state !== "completion_ready") {
          throw clientError(
            "provider_completion_not_ready",
            "The active provider must remain completion-ready to recover this run.",
            "reconfigure",
          );
        }
      }
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
            existingResolved === null
              ? undefined
              : (
                  options.createModelProvider ??
                  ((resolved) =>
                    new OpenAICompatibleProvider({
                      apiKey: resolved.credential,
                      baseUrl: resolved.profile.baseUrl,
                      clock,
                      model: resolved.profile.model,
                      profileId: resolved.profile.id,
                    }))
                )(existingResolved),
            undefined,
            options.repositoryTools ?? {},
            true,
          );
    if (
      session !== null &&
      session.engine.state.phase !== "idle" &&
      "model" in session.engine.state
    ) {
      if (
        existingResolved === null ||
        session.engine.state.model.profileId !== existingResolved.profile.id ||
        session.engine.state.model.model !== existingResolved.profile.model
      ) {
        throw clientError(
          "provider_profile_changed",
          "The active provider profile no longer matches this durable run.",
          "reconfigure",
        );
      }
    }
    const client = new InProcessAgentClient(
      { ...options, clock, idSource },
      context,
      stateDirectory,
      trust,
      session,
      profiles,
      readiness,
      prefixGeneratedRunIds,
      readOnly,
    );
    if (
      session !== null &&
      session.engine.state.phase === "executing" &&
      "model" in session.engine.state
    ) {
      await client.driveEffects();
    }
    return client;
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
    for (const wake of this.modelDeltaWaiters) wake();
    this.modelDeltaWaiters.clear();
  }

  private publishModelDelta(runId: RunId, delta: Parameters<ModelVisibleTextListener>[0]): void {
    this.modelDeltas.push({
      attemptId: delta.attemptId,
      cursor: this.modelDeltaCursor,
      offset: delta.offset,
      outputIndex: delta.outputIndex,
      protocolVersion: 1,
      runId,
      text: delta.text,
    });
    this.modelDeltaCursor += 1;
    for (const wake of this.modelDeltaWaiters) wake();
    this.modelDeltaWaiters.clear();
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

  private async admitCurrentToolContext(session: RunSession): Promise<void> {
    const state = session.engine.state;
    if (
      state.phase !== "executing" ||
      !("model" in state) ||
      state.stage !== "model-ready" ||
      state.tool?.result?.status !== "succeeded"
    ) {
      return;
    }
    const result = state.tool.result;
    const paths = (() => {
      switch (result.name) {
        case "read_file":
          return [result.data.sourcePath];
        case "list_files":
          return result.data.entries.map((entry) => entry.path);
        case "search_repository":
          return result.data.matches.map((match) => match.path);
        case "git_status":
          return result.data.entries.length === 0
            ? ["."]
            : result.data.entries.map((entry) => entry.path);
      }
    })();
    const targets = [...new Set(paths)].slice(0, 256).map((relativePath) => ({
      activatedContextItemIds: [result.toolCallId],
      relativePath,
    }));
    try {
      const prepared = await this.context.prepare({
        items: [
          ...state.context
            .filter((item) => !item.contextItemId.startsWith("instruction-"))
            .map((item, order) => ({
              content: item.content,
              contextItemId: item.contextItemId,
              order,
              priority: "P0" as const,
              scopePath: ".",
              source: "durable_context",
            })),
          {
            content: state.task,
            contextItemId: "current-task",
            order: state.context.length,
            priority: "P0",
            scopePath: ".",
            source: "current_task",
          },
          {
            content: JSON.stringify(result),
            contextItemId: `tool-result-${result.toolCallId}`,
            order: state.context.length + 1,
            priority: "P1",
            scopePath: ".",
            source: "repository_tool_result",
          },
        ],
        limits: {
          contextWindowTokens: state.model.contextWindowTokens,
          maxOutputTokens: state.model.maxOutputTokens,
        },
        targets,
      });
      const currentToolContextId = `tool-result-${result.toolCallId}`;
      if (!prepared.selectedItems.some((item) => item.contextItemId === currentToolContextId)) {
        await session.engine.commit(
          {
            error: {
              code: "context_current_tool_omitted",
              message: "The current repository tool result does not fit the admitted context.",
              recoverability: "ask-user",
              suggestedActions: [
                "Start a narrower task or select a provider profile with a larger context window.",
              ],
            },
            type: "run.blocked",
          },
          result.toolCallId,
        );
        return;
      }
      await this.context.verifyInstructions(prepared.instructions);
      const existing = new Set(state.context.map((item) => item.contextItemId));
      for (const item of prepared.selectedItems) {
        if (item.source !== "repository_instruction") continue;
        const contextItemId = durableContextItemId(item);
        if (existing.has(contextItemId)) continue;
        await session.engine.commit(
          {
            item: { content: item.content, contextItemId },
            type: "model.context.committed",
          },
          result.toolCallId,
        );
        existing.add(contextItemId);
      }
    } catch (error) {
      if (!(error instanceof ContextAdmissionError)) throw error;
      await session.engine.commit(
        { error: error.productError, type: "run.blocked" },
        result.toolCallId,
      );
    }
  }

  private async driveEffects(signal?: AbortSignal): Promise<void> {
    const session = this.requireSession();
    const { engine } = session;
    while (engine.state.phase !== "terminal") {
      if (engine.state.phase === "executing" && engine.state.inFlightEffect !== null) {
        await engine.settleInFlightEffect(signal);
        await this.admitCurrentToolContext(session);
        this.notify();
        continue;
      }
      const effect = await engine.requestNextEffect();
      if (effect === null) return;
      this.notify();
      await engine.settleInFlightEffect(signal);
      await this.admitCurrentToolContext(session);
      this.notify();
    }
  }

  async getWorkspaceReview(): Promise<WorkspaceReview> {
    this.ensureOpen();
    return this.workspaceReviewWithProfile(await this.trust.refresh());
  }

  private async workspaceReviewWithProfile(review: WorkspaceReview): Promise<WorkspaceReview> {
    this.repositoryTools ??= RepositoryToolService.open({
      ...this.repositoryToolOptions,
      workspaceRoot: this.cwd,
    });
    const repository = await this.repositoryTools.then((tools) => tools.reviewCapabilities());
    const repositoryActions = [repository.ripgrep, repository.git].flatMap((capability) =>
      capability.state === "blocked" ? capability.error.suggestedActions : [],
    );
    const reviewed = {
      ...review,
      nextActions: [...repositoryActions, ...review.nextActions],
      repository,
    };
    if (this.profiles === null) return reviewed;
    try {
      const catalog = await this.requireReadiness().decorateCatalog(await this.profiles.read());
      const active =
        catalog.profiles.find((profile) => profile.id === catalog.activeProfileId) ?? null;
      let context = review.context;
      const contextActions: string[] = [];
      if (review.workspace.trust === "trusted" && active !== null) {
        try {
          context = (
            await this.context.prepare({
              items: [
                {
                  content: "Eden provider and host-authority contract v1.",
                  contextItemId: "provider-contract-v1",
                  order: 0,
                  priority: "P0",
                  scopePath: ".",
                  source: "provider_contract",
                },
                {
                  content: JSON.stringify({
                    trust: review.workspace.trust,
                    workspaceId: review.workspace.workspaceId,
                    workspaceRoot: review.workspace.root,
                  }),
                  contextItemId: "workspace-identity",
                  order: 1,
                  priority: "P0",
                  scopePath: ".",
                  source: "workspace_identity",
                },
              ],
              limits: {
                contextWindowTokens: active.contextWindowTokens,
                maxOutputTokens: active.maxOutputTokens,
              },
              targets: [
                {
                  activatedContextItemIds: ["workspace-review"],
                  relativePath: ".",
                },
              ],
            })
          ).summary;
        } catch (error) {
          if (!(error instanceof ContextAdmissionError)) throw error;
          context =
            error.summary ??
            ({
              blocker: error.productError,
              budget: null,
              instructions: [],
              items: [],
              state: "blocked",
            } as const);
          contextActions.push(...error.productError.suggestedActions);
        }
      }
      const profileActions =
        active === null || active.credential.presence === "missing"
          ? ["Configure an active provider profile before a real repository task."]
          : active.readiness !== "completion_ready"
            ? ["Run the explicit provider readiness check before a real repository task."]
            : [];
      return {
        ...reviewed,
        nextActions: [...contextActions, ...profileActions, ...reviewed.nextActions],
        context,
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
          const realProviderRun =
            this.realProviderRuns === true ||
            (this.realProviderRuns === "when-configured" &&
              (await this.requireProfiles().read()).activeProfileId !== null);
          let resolvedProfile: ResolvedProviderProfile | null = null;
          let preparedContext: Awaited<ReturnType<ContextAdmissionService["prepare"]>> | null =
            null;
          if (realProviderRun) {
            const reviewed = await this.workspaceReviewWithProfile(review);
            const active = "active" in reviewed.profile ? reviewed.profile.active : null;
            if (active === null || active.readiness !== "completion_ready") {
              throw clientError(
                "provider_completion_not_ready",
                "The active provider must pass the explicit completion readiness check.",
                "reconfigure",
                "Run the explicit provider readiness check before starting a repository task.",
              );
            }
            if (
              reviewed.repository?.ripgrep.state !== "ready" ||
              reviewed.repository.git.state !== "ready"
            ) {
              throw clientError(
                "repository_prerequisite_blocked",
                "The repository prerequisites are not ready.",
                "reconfigure",
                "Recheck the pinned ripgrep asset and compatible host Git.",
              );
            }
            resolvedProfile = await this.requireProfiles().resolveActive();
            if (
              resolvedProfile === null ||
              resolvedProfile.profile.id !== active.id ||
              resolvedProfile.profile.model !== active.model
            ) {
              throw clientError(
                "provider_profile_changed",
                "The active provider profile changed before the run could start.",
                "retry",
              );
            }
            try {
              preparedContext = await this.context.prepare({
                items: [
                  {
                    content:
                      "Eden owns the conversation, tool loop, retry policy, journal, and completion authority. Use only the enabled semantic repository tools and ground the final answer in their results.",
                    contextItemId: "provider-contract-v1",
                    order: 0,
                    priority: "P0",
                    scopePath: ".",
                    source: "provider_contract",
                  },
                  {
                    content: JSON.stringify({
                      trust: review.workspace.trust,
                      workspaceId: review.workspace.workspaceId,
                      workspaceRoot: review.workspace.root,
                    }),
                    contextItemId: "workspace-identity",
                    order: 1,
                    priority: "P0",
                    scopePath: ".",
                    source: "workspace_identity",
                  },
                  {
                    content:
                      "Enabled tools: list_files, read_file, search_repository, git_status. Tool arguments are closed and repository-relative.",
                    contextItemId: "repository-tools-v1",
                    order: 2,
                    priority: "P0",
                    scopePath: ".",
                    source: "tool_contract",
                  },
                  {
                    content: start.task,
                    contextItemId: "current-task",
                    order: 3,
                    priority: "P0",
                    scopePath: ".",
                    source: "current_task",
                  },
                ],
                limits: {
                  contextWindowTokens: resolvedProfile.profile.contextWindowTokens,
                  maxOutputTokens: resolvedProfile.profile.maxOutputTokens,
                },
                targets: [{ activatedContextItemIds: ["run-start"], relativePath: "." }],
              });
            } catch (error) {
              if (error instanceof ContextAdmissionError) {
                throw new AgentClientError(error.productError);
              }
              throw error;
            }
          }
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
            resolvedProfile === null ? undefined : this.createModelProvider(resolvedProfile),
            (delta) => this.publishModelDelta(runId, delta),
            this.repositoryToolOptions,
            false,
          );
          const event: KernelEvent = {
            correlationId: decoded.value.commandId,
            runId,
            task: start.task,
            type: "run.started",
            workspace: { ...review.workspace, trust: "trusted" },
            ...(resolvedProfile === null
              ? {}
              : {
                  model: {
                    contextWindowTokens: resolvedProfile.profile.contextWindowTokens,
                    maxOutputTokens: Math.min(resolvedProfile.profile.maxOutputTokens, 8_192),
                    model: resolvedProfile.profile.model,
                    profileId: resolvedProfile.profile.id,
                  },
                }),
          };
          await session.engine.commit(event, start.commandId);
          if (preparedContext !== null) {
            for (const item of preparedContext.selectedItems) {
              if (item.source === "current_task") continue;
              await session.engine.commit(
                {
                  item: { content: item.content, contextItemId: durableContextItemId(item) },
                  type: "model.context.committed",
                },
                start.commandId,
              );
            }
            try {
              await this.context.verifyInstructions(preparedContext.instructions);
            } catch (error) {
              if (!(error instanceof ContextAdmissionError)) throw error;
              await session.engine.commit(
                { error: error.productError, type: "run.blocked" },
                start.commandId,
              );
            }
          }
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
        case "model.retry":
          if (session.engine.state.phase !== "awaiting-retry") {
            throw clientError(
              "model_retry_unavailable",
              "No interrupted or unknown model attempt is awaiting retry.",
              "ask-user",
            );
          }
          await session.engine.commit({ type: "model.retry.requested" }, decoded.value.commandId);
          this.notify();
          await session.engine.settleInFlightEffect(options?.signal);
          await this.driveEffects(options?.signal);
          break;
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

  async *subscribeModelText(options?: {
    readonly signal?: AbortSignal;
  }): AsyncIterable<ProductModelDelta> {
    this.ensureOpen();
    let cursor = 0;
    while (!this.closed && options?.signal?.aborted !== true) {
      while (cursor < this.modelDeltas.length) {
        const delta = this.modelDeltas[cursor];
        cursor += 1;
        if (delta !== undefined) yield delta;
      }
      const state = this.session?.engine.state;
      if (state?.phase === "terminal") return;
      await this.waitForModelDelta(options?.signal);
    }
  }

  private waitForModelDelta(signal?: AbortSignal): Promise<void> {
    if (this.closed || signal?.aborted === true) return Promise.resolve();
    return new Promise((resolve) => {
      const wake = () => {
        this.modelDeltaWaiters.delete(wake);
        signal?.removeEventListener("abort", wake);
        resolve();
      };
      this.modelDeltaWaiters.add(wake);
      signal?.addEventListener("abort", wake, { once: true });
    });
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
    for (const wake of this.modelDeltaWaiters) wake();
    this.modelDeltaWaiters.clear();
  }
}

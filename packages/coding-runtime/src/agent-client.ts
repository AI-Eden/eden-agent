import { randomUUID } from "node:crypto";
import { realpath } from "node:fs/promises";

import {
  type AgentClient,
  decodeProductCommand,
  decodeResolveWorkspaceTrustCommand,
  type EventCursor,
  type ProductCommand,
  type ProductEvent,
  type ProductView,
  type ResolveWorkspaceTrustCommand,
  type RunId,
  type WorkspaceReview,
} from "@eden/contracts";
import type { KernelEvent } from "@eden/kernel";

import {
  AgentClientError,
  assertCurrentRevision,
  clientError,
  fakeAction,
  journalExists,
  journalPath,
  openRunSession,
  type RunSession,
} from "./client-session.ts";
import { projectJournal } from "./projection.ts";
import type { RuntimeClock, RuntimeIdSource } from "./runtime.ts";
import { WorkspaceTrustError, WorkspaceTrustService } from "./workspace/index.ts";

export { AgentClientError } from "./client-session.ts";

export type InProcessAgentClientOptions = {
  readonly clock?: RuntimeClock;
  readonly cwd: string;
  readonly idSource?: RuntimeIdSource;
  readonly runId?: RunId;
  readonly stateDirectory: string;
};

function defaultIdSource(): RuntimeIdSource {
  return { next: randomUUID };
}

async function openSession(
  runId: RunId,
  stateDirectory: string,
  clock: RuntimeClock,
  idSource: RuntimeIdSource,
  existing: boolean,
): Promise<RunSession> {
  const present = await journalExists(journalPath(stateDirectory, runId));
  if (existing && !present) throw clientError("run_not_found", `Run ${runId} was not found.`);
  if (!existing && present) throw clientError("run_id_collision", `Run ${runId} already exists.`);
  return openRunSession(runId, stateDirectory, clock, idSource);
}

export class InProcessAgentClient implements AgentClient {
  private readonly clock: RuntimeClock;
  private readonly cwd: string;
  private readonly idSource: RuntimeIdSource;
  private readonly stateDirectory: string;
  private readonly trust: WorkspaceTrustService;
  private readonly waiters = new Set<() => void>();
  private closed = false;
  private session: RunSession | null;

  private constructor(
    options: InProcessAgentClientOptions,
    stateDirectory: string,
    trust: WorkspaceTrustService,
    session: RunSession | null,
  ) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.cwd = trust.identity.canonicalRoot;
    this.idSource = options.idSource ?? defaultIdSource();
    this.stateDirectory = stateDirectory;
    this.trust = trust;
    this.session = session;
  }

  static async open(options: InProcessAgentClientOptions): Promise<InProcessAgentClient> {
    const clock = options.clock ?? { now: () => new Date() };
    const idSource = options.idSource ?? defaultIdSource();
    const trust = await WorkspaceTrustService.open({
      clock,
      cwd: options.cwd,
      stateDirectory: options.stateDirectory,
    });
    const stateDirectory = await realpath(options.stateDirectory);
    const session =
      options.runId === undefined
        ? null
        : await openSession(options.runId, stateDirectory, clock, idSource, true);
    return new InProcessAgentClient(
      { ...options, clock, idSource },
      stateDirectory,
      trust,
      session,
    );
  }

  private ensureOpen(): void {
    if (this.closed) throw clientError("client_closed", "The agent client is closed.");
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

  private async currentView(): Promise<ProductView> {
    return projectJournal(await this.requireSession().journal.readAll()).view;
  }

  private async driveEffects(): Promise<void> {
    const { engine } = this.requireSession();
    while (engine.state.phase !== "terminal") {
      const effect = await engine.requestNextEffect();
      if (effect === null) return;
      this.notify();
      await engine.settleInFlightEffect();
      this.notify();
    }
  }

  async getWorkspaceReview(): Promise<WorkspaceReview> {
    this.ensureOpen();
    return this.trust.getReview();
  }

  async resolveWorkspaceTrust(
    command: ResolveWorkspaceTrustCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<WorkspaceReview> {
    this.ensureOpen();
    if (options?.signal?.aborted === true)
      throw clientError("operation_aborted", "The operation was aborted.", "retry");
    const decoded = decodeResolveWorkspaceTrustCommand(command);
    if (!decoded.ok) throw new AgentClientError(decoded.error);
    try {
      return await this.trust.resolve(decoded.value);
    } catch (error) {
      if (error instanceof WorkspaceTrustError) throw new AgentClientError(error.productError);
      throw error;
    }
  }

  async submit(
    command: ProductCommand,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ProductView> {
    this.ensureOpen();
    if (options?.signal?.aborted === true)
      throw clientError("operation_aborted", "The operation was aborted.", "retry");
    const decoded = decodeProductCommand(command);
    if (!decoded.ok) throw new AgentClientError(decoded.error);
    if (decoded.value.type === "run.start") {
      if (this.session !== null)
        throw clientError("run_already_started", "The run has already started.");
      const review = this.trust.getReview();
      if (review.workspace.trust !== "trusted") {
        throw clientError(
          "workspace_trust_required",
          "Trust this exact workspace before starting a task.",
          "ask-user",
          "Review the workspace and explicitly grant trust.",
        );
      }
      const runId = this.idSource.next();
      this.session = await openSession(
        runId,
        this.stateDirectory,
        this.clock,
        this.idSource,
        false,
      );
      const event: KernelEvent = {
        action: fakeAction(runId, this.cwd),
        correlationId: decoded.value.commandId,
        runId,
        task: decoded.value.task,
        type: "run.started",
        workspace: { ...review.workspace, trust: "trusted" },
      };
      await this.session.engine.commit(event, decoded.value.commandId);
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
          if (decoded.value.decision === "approve") await this.driveEffects();
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

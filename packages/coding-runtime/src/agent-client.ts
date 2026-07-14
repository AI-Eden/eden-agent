import { randomUUID } from "node:crypto";
import { join } from "node:path";

import {
  type AgentClient,
  decodeProductCommand,
  type EventCursor,
  type ProductCommand,
  type ProductError,
  type ProductEvent,
  type ProductView,
  type RunId,
} from "@eden/contracts";
import type { Action, KernelEvent } from "@eden/kernel";

import { FakeToolHost } from "./fake-tool-host.ts";
import { FileJournal } from "./journal/index.ts";
import { type ProjectionContext, projectJournal } from "./projection.ts";
import { type RuntimeClock, RuntimeEngine, type RuntimeIdSource } from "./runtime.ts";

export type InProcessAgentClientOptions = {
  readonly clock?: RuntimeClock;
  readonly cwd: string;
  readonly idSource?: RuntimeIdSource;
  readonly runId: RunId;
  readonly stateDirectory: string;
  readonly workspace: ProductView["workspace"];
};

export class AgentClientError extends Error {
  readonly name = "AgentClientError";
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

function clientError(
  code: string,
  message: string,
  recoverability: ProductError["recoverability"] = "fatal",
): AgentClientError {
  return new AgentClientError({ code, message, recoverability, suggestedActions: [message] });
}

function fakeAction(runId: string, cwd: string): Action {
  return {
    actionId: `${runId}:fake-action`,
    approvalId: `${runId}:fake-approval`,
    canonicalDisplay: "Run the deterministic fake task",
    cwd,
    digest: `${runId}:fake-action-digest`,
    reason: "Exercise the R1 fake-task boundary without changing workspace files.",
    scope: "R1 demo state directory only",
  };
}

function defaultIdSource(): RuntimeIdSource {
  return { next: randomUUID };
}

function assertCurrentRevision(
  command: Exclude<ProductCommand, { readonly type: "run.start" }>,
  view: ProductView,
): void {
  if (command.runId !== view.runId) {
    throw clientError("run_not_found", `Run ${command.runId} is not owned by this client.`);
  }
  if (command.expectedRevision !== view.revision) {
    throw clientError("stale_revision", "The command revision is stale.", "retry");
  }
}

export class InProcessAgentClient implements AgentClient {
  private readonly context: ProjectionContext;
  private readonly cwd: string;
  private readonly engine: RuntimeEngine;
  private readonly journal: FileJournal;
  private readonly runId: RunId;
  private readonly waiters = new Set<() => void>();
  private closed = false;

  private constructor(
    runId: RunId,
    cwd: string,
    context: ProjectionContext,
    journal: FileJournal,
    engine: RuntimeEngine,
  ) {
    this.runId = runId;
    this.cwd = cwd;
    this.context = context;
    this.journal = journal;
    this.engine = engine;
  }

  static async open(options: InProcessAgentClientOptions): Promise<InProcessAgentClient> {
    const runDirectory = join(options.stateDirectory, "runs", options.runId);
    const journal = await FileJournal.open(join(runDirectory, "journal.jsonl"), options.runId);
    const host = new FakeToolHost(join(runDirectory, "receipts"));
    const engine = await RuntimeEngine.open(
      journal,
      host,
      options.clock ?? { now: () => new Date() },
      options.idSource ?? defaultIdSource(),
    );
    return new InProcessAgentClient(
      options.runId,
      options.cwd,
      { workspace: options.workspace },
      journal,
      engine,
    );
  }

  private ensureOpen(): void {
    if (this.closed) throw clientError("client_closed", "The agent client is closed.");
  }

  private notify(): void {
    for (const wake of this.waiters) wake();
    this.waiters.clear();
  }

  private async currentView(): Promise<ProductView> {
    return projectJournal(await this.journal.readAll(), this.context).view;
  }

  private async driveEffects(): Promise<void> {
    while (this.engine.state.phase !== "terminal") {
      const effect = await this.engine.requestNextEffect();
      if (effect === null) return;
      this.notify();
      await this.engine.settleInFlightEffect();
      this.notify();
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
      if (this.engine.state.phase !== "idle")
        throw clientError("run_already_started", "The run has already started.");
      const event: KernelEvent = {
        action: fakeAction(this.runId, this.cwd),
        correlationId: decoded.value.commandId,
        runId: this.runId,
        task: decoded.value.task,
        type: "run.started",
      };
      await this.engine.commit(event, decoded.value.commandId);
    } else {
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
          await this.engine.commit(
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
          await this.engine.commit({ type: "run.cancelled" }, decoded.value.commandId);
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
    if (runId !== this.runId)
      throw clientError("run_not_found", `Run ${runId} is not owned by this client.`);
    return this.currentView();
  }

  async *subscribe(
    runId: RunId,
    afterCursor?: EventCursor,
    options?: { readonly signal?: AbortSignal },
  ): AsyncIterable<ProductEvent> {
    this.ensureOpen();
    if (runId !== this.runId)
      throw clientError("run_not_found", `Run ${runId} is not owned by this client.`);
    let cursor = afterCursor ?? -1;
    while (!this.closed && options?.signal?.aborted !== true) {
      const projected = projectJournal(await this.journal.readAll(), this.context);
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

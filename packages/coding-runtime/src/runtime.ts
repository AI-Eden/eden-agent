import { decodeRepositoryToolCall } from "@eden/contracts";
import {
  decide,
  initialRunState,
  type KernelEffect,
  type KernelEvent,
  type RunState,
  reduce,
} from "@eden/kernel";
import type { ModelStepRequestV1 } from "@eden/providers/model-step";

import type { JournalPort, JournalRecordV1 } from "./journal/index.ts";
import { replayRecords } from "./replay.ts";

export type ReconciliationResult =
  | { readonly status: "completed"; readonly observation: KernelEvent }
  | { readonly status: "not-started" }
  | { readonly status: "unknown" };

export type EffectObservationListener = (event: KernelEvent) => Promise<void>;

export interface EffectHost {
  execute(
    effect: KernelEffect,
    signal?: AbortSignal,
    observe?: EffectObservationListener,
  ): Promise<KernelEvent>;
  reconcile(
    effect: KernelEffect,
    observe?: EffectObservationListener,
  ): Promise<ReconciliationResult>;
  executeModelAttempt?(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    request: ModelStepRequestV1,
    signal?: AbortSignal,
  ): Promise<KernelEvent>;
  reconcileModelAttempt?(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    attemptId: string,
  ): Promise<ReconciliationResult>;
}

export interface RuntimeClock {
  now(): Date;
}

export interface RuntimeIdSource {
  next(): string;
}

export type JournalRecordMetadata = {
  readonly causationId: string | null;
  readonly correlationId: string;
  readonly eventId: string;
  readonly recordedAt: Date;
  readonly runId: string;
  readonly sequence: number;
};

export function createJournalRecord(
  event: KernelEvent,
  metadata: JournalRecordMetadata,
): JournalRecordV1 {
  const { type, ...payload } = event;
  return {
    causationId: metadata.causationId,
    correlationId: metadata.correlationId,
    eventId: metadata.eventId,
    journalVersion: 1,
    payload,
    recordedAt: metadata.recordedAt.toISOString(),
    redaction: { fields: [], status: "not-required" },
    runId: metadata.runId,
    sequence: metadata.sequence,
    type,
  };
}

export class RuntimeEngine {
  private readonly clock: RuntimeClock;
  private readonly host: EffectHost;
  private readonly idSource: RuntimeIdSource;
  private readonly journal: JournalPort;
  private lastEventId: string | null;
  private sequence: number;
  private currentState: RunState;

  private constructor(
    journal: JournalPort,
    host: EffectHost,
    clock: RuntimeClock,
    idSource: RuntimeIdSource,
    state: RunState,
    sequence: number,
    lastEventId: string | null,
  ) {
    this.clock = clock;
    this.host = host;
    this.idSource = idSource;
    this.journal = journal;
    this.currentState = state;
    this.sequence = sequence;
    this.lastEventId = lastEventId;
  }

  static async open(
    journal: JournalPort,
    host: EffectHost,
    clock: RuntimeClock,
    idSource: RuntimeIdSource,
  ): Promise<RuntimeEngine> {
    const records = await journal.readAll();
    const state = records.length === 0 ? initialRunState : replayRecords(records).state;
    return new RuntimeEngine(
      journal,
      host,
      clock,
      idSource,
      state,
      records.length,
      records.at(-1)?.eventId ?? null,
    );
  }

  get state(): RunState {
    return this.currentState;
  }

  async commit(event: KernelEvent, causationId: string | null): Promise<void> {
    const transition = reduce(this.currentState, event);
    if (!transition.ok) {
      throw new Error(`Illegal transition: ${transition.error.eventType}`);
    }
    const runId =
      event.type === "run.started"
        ? event.runId
        : this.currentState.phase === "idle"
          ? ""
          : this.currentState.runId;
    const correlationId =
      event.type === "run.started"
        ? event.correlationId
        : this.currentState.phase === "idle"
          ? ""
          : this.currentState.correlationId;
    const eventId = this.idSource.next();
    await this.journal.append(
      createJournalRecord(event, {
        causationId,
        correlationId,
        eventId,
        recordedAt: this.clock.now(),
        runId,
        sequence: this.sequence,
      }),
    );
    this.currentState = transition.state;
    this.lastEventId = eventId;
    this.sequence += 1;
  }

  async requestNextEffect(): Promise<KernelEffect | null> {
    if (
      this.currentState.phase === "executing" &&
      this.currentState.stage === "approval-consume-ready" &&
      this.currentState.action !== null &&
      "safeActuation" in this.currentState.action
    ) {
      const approval = this.currentState.action.safeActuation.approval;
      await this.commit(
        {
          actionDigest: approval.actionDigest,
          approvalId: this.currentState.action.approvalId,
          expectedRevision: approval.expectedRevision,
          proposalRevision: approval.proposalRevision,
          type: "approval.consumed",
        },
        this.lastEventId,
      );
    }
    const effect = decide(this.currentState)[0];
    if (effect === undefined) {
      return null;
    }
    await this.commit({ effect, type: "effect.requested" }, this.lastEventId);
    return effect;
  }

  async markDispatchStarted(): Promise<void> {
    if (
      this.currentState.phase !== "executing" ||
      !(
        (this.currentState.stage === "safe-action-in-flight" &&
          (this.currentState.inFlightEffect?.type === "anchor_edit.execute" ||
            this.currentState.inFlightEffect?.type === "repository_check.execute")) ||
        (this.currentState.stage === "action-prepare-in-flight" &&
          (this.currentState.inFlightEffect?.type === "anchor_edit.prepare" ||
            this.currentState.inFlightEffect?.type === "repository_check.prepare")) ||
        (this.currentState.stage === "eden-patch-in-flight" &&
          this.currentState.inFlightEffect?.type === "review.eden_patch.capture") ||
        ((this.currentState.stage === "git-baseline-in-flight" ||
          this.currentState.stage === "git-current-in-flight") &&
          this.currentState.inFlightEffect?.type === "review.git_snapshot.capture") ||
        ((this.currentState.stage === "check-baseline-in-flight" ||
          this.currentState.stage === "check-current-in-flight") &&
          this.currentState.inFlightEffect?.type === "review.git_check.capture")
      )
    ) {
      throw new Error("No safe-actuation effect is ready for dispatch.");
    }
    if (this.currentState.dispatchStarted) return;
    await this.commit(
      {
        effectId: this.currentState.inFlightEffect.effectId,
        type: "effect.dispatch.started",
      },
      this.lastEventId,
    );
  }

  async settleInFlightEffect(signal?: AbortSignal): Promise<void> {
    if (this.currentState.phase !== "executing" || this.currentState.inFlightEffect === null) {
      return;
    }
    const effect = this.currentState.inFlightEffect;
    if (effect.type === "provider.model.step") {
      await this.settleModelEffect(effect, signal);
      return;
    }
    const observe: EffectObservationListener = (event) => this.commit(event, effect.effectId);
    const reconciled = await this.host.reconcile(effect, observe);
    switch (reconciled.status) {
      case "completed":
        await this.commit(reconciled.observation, effect.effectId);
        return;
      case "not-started": {
        if (
          (effect.type === "anchor_edit.prepare" ||
            effect.type === "repository_check.prepare" ||
            effect.type === "review.git_snapshot.capture" ||
            effect.type === "review.git_check.capture") &&
          this.currentState.phase === "executing" &&
          "dispatchStarted" in this.currentState &&
          this.currentState.dispatchStarted === true &&
          this.currentState.inFlightEffect?.effectId === effect.effectId
        ) {
          await this.commit(
            {
              error: {
                code: "effect_outcome_unknown",
                message: `The outcome of effect ${effect.effectId} could not be established.`,
                recoverability: "ask-user",
                suggestedActions: ["Inspect the run evidence before starting a new task."],
              },
              type: "run.blocked",
            },
            effect.effectId,
          );
          return;
        }
        if (
          effect.type === "anchor_edit.execute" ||
          effect.type === "anchor_edit.prepare" ||
          effect.type === "repository_check.execute" ||
          effect.type === "repository_check.prepare" ||
          effect.type === "review.eden_patch.capture" ||
          effect.type === "review.git_snapshot.capture" ||
          effect.type === "review.git_check.capture"
        ) {
          await this.markDispatchStarted();
        }
        const observation = await this.host.execute(effect, signal, observe);
        await this.commit(observation, effect.effectId);
        return;
      }
      case "unknown":
        await this.commit(
          {
            error: {
              code: "effect_outcome_unknown",
              message: `The outcome of effect ${effect.effectId} could not be established.`,
              recoverability: "ask-user",
              suggestedActions: ["Inspect the run evidence before starting a new task."],
            },
            type: "run.blocked",
          },
          effect.effectId,
        );
    }
  }

  private async settleModelEffect(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (
      this.host.executeModelAttempt === undefined ||
      this.host.reconcileModelAttempt === undefined
    ) {
      await this.commit(
        {
          error: {
            code: "provider_model_unavailable",
            message: "The provider model-step boundary is unavailable.",
            recoverability: "reconfigure",
            suggestedActions: ["Reconfigure the active provider and start a new task."],
          },
          type: "run.blocked",
        },
        effect.effectId,
      );
      return;
    }
    if (
      this.currentState.phase === "executing" &&
      "model" in this.currentState &&
      this.currentState.stage === "model-awaiting-attempt"
    ) {
      const modelStep = this.currentState.modelStep;
      const attemptsForStep = this.currentState.attempts.filter(
        (attempt) => attempt.step === modelStep,
      );
      const reason =
        attemptsForStep.length === 0
          ? "initial"
          : attemptsForStep.length === 1 &&
              attemptsForStep[0]?.observation?.status === "not_started"
            ? "automatic-not-started-retry"
            : "explicit-retry";
      const attemptId = `attempt-${this.idSource.next()}`;
      await this.commit(
        {
          attemptId,
          effectId: effect.effectId,
          reason,
          type: "model.attempt.started",
        },
        effect.effectId,
      );
      const state = this.currentState;
      if (state.phase !== "executing" || !("model" in state) || state.stage !== "model-in-flight") {
        throw new Error("The model attempt state changed before dispatch.");
      }
      const observation = await this.host.executeModelAttempt(
        effect,
        {
          attemptId,
          conversation: [
            ...state.context.map((item) => ({ content: item.content, role: "system" as const })),
            ...state.conversation.map((item) => {
              switch (item.role) {
                case "user":
                  return { content: item.content, role: "user" } as const;
                case "assistant":
                  return {
                    content: item.content,
                    privateContinuity: item.privateContinuity,
                    role: "assistant" as const,
                    toolCalls: item.toolCalls.map((call) => {
                      const decoded = decodeRepositoryToolCall(call);
                      if (!decoded.ok) {
                        throw new Error("The durable repository tool call is invalid.");
                      }
                      return decoded.value;
                    }),
                  };
                case "tool":
                  return {
                    content: JSON.stringify(item.result),
                    name: item.call.name,
                    role: "tool" as const,
                    toolCallId: item.call.toolCallId,
                  };
                default:
                  throw new Error("The durable model conversation contains an unknown role.");
              }
            }),
          ],
          enabledTools: [
            "list_files",
            "read_file",
            "search_repository",
            "git_status",
            "anchor_edit",
            "repository_check",
          ],
          maxOutputTokens: effect.maxOutputTokens,
          version: 1,
        },
        signal,
      );
      await this.commit(observation, effect.effectId);
      if (
        this.currentState.phase === "executing" &&
        "model" in this.currentState &&
        this.currentState.stage === "model-awaiting-attempt"
      ) {
        await this.settleModelEffect(effect, signal);
      }
      return;
    }
    if (
      this.currentState.phase !== "executing" ||
      !("model" in this.currentState) ||
      this.currentState.stage !== "model-in-flight"
    ) {
      return;
    }
    const attempt = this.currentState.attempts.at(-1);
    if (attempt === undefined || attempt.observation !== null) return;
    const reconciled = await this.host.reconcileModelAttempt(effect, attempt.attemptId);
    if (reconciled.status === "completed") {
      await this.commit(reconciled.observation, effect.effectId);
      return;
    }
    const status = reconciled.status === "not-started" ? "unknown" : reconciled.status;
    await this.commit(
      {
        effectId: effect.effectId,
        observation: {
          attemptId: attempt.attemptId,
          error: {
            code: "effect_outcome_unknown",
            message: "The provider attempt outcome could not be established after recovery.",
            recoverability: "ask-user",
            suggestedActions: ["Explicitly retry from the last committed conversation turn."],
          },
          status,
          version: 1,
        },
        type: "model.step.completed",
      },
      effect.effectId,
    );
  }
}

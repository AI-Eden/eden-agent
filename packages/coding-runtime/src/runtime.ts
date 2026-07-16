import {
  decide,
  initialRunState,
  type KernelEffect,
  type KernelEvent,
  type RunState,
  reduce,
} from "@eden/kernel";

import type { JournalPort, JournalRecordV1 } from "./journal/index.ts";
import { replayRecords } from "./replay.ts";

export type ReconciliationResult =
  | { readonly status: "completed"; readonly observation: KernelEvent }
  | { readonly status: "not-started" }
  | { readonly status: "unknown" };

export interface EffectHost {
  execute(effect: KernelEffect, signal?: AbortSignal): Promise<KernelEvent>;
  reconcile(effect: KernelEffect): Promise<ReconciliationResult>;
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
    const effect = decide(this.currentState)[0];
    if (effect === undefined) {
      return null;
    }
    await this.commit({ effect, type: "effect.requested" }, this.lastEventId);
    return effect;
  }

  async settleInFlightEffect(signal?: AbortSignal): Promise<void> {
    if (this.currentState.phase !== "executing" || this.currentState.inFlightEffect === null) {
      return;
    }
    const effect = this.currentState.inFlightEffect;
    const reconciled = await this.host.reconcile(effect);
    switch (reconciled.status) {
      case "completed":
        await this.commit(reconciled.observation, effect.effectId);
        return;
      case "not-started": {
        const observation = await this.host.execute(effect, signal);
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
}

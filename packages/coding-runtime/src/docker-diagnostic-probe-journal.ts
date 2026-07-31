import { constants } from "node:fs";
import { lstat, mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  type DockerDiagnosticProbeCleanupV1,
  type DockerDiagnosticProbeObservationsV1,
  type DockerDiagnosticProbeReceiptV1,
  type DockerDiagnosticProbeRecoveryRequiredV1,
  type DockerDiagnosticProbeRecoveryResolvedV1,
  decodeDockerDiagnosticProbeAction,
  decodeDockerDiagnosticProbeCleanup,
  decodeDockerDiagnosticProbeEvent,
  decodeDockerDiagnosticProbeObservations,
  decodeDockerDiagnosticProbeReceipt,
  decodeDockerDiagnosticProbeResult,
} from "@eden/contracts";

const MAX_RECORD_BYTES = 65_536;
const MAX_JOURNAL_BYTES = 1_048_576;
const MAX_RECORDS = 4_096;
const executionEventOrder = [
  "docker.probe.action.prepared",
  "docker.probe.approval.consumed",
  "docker.probe.effect.intent",
  "docker.probe.container.created",
  "docker.probe.dispatch.started",
  "docker.probe.receipt.recorded",
  "docker.probe.cleanup.recorded",
  "docker.probe.terminal",
] as const;

type JournalEventType = (typeof executionEventOrder)[number] | "docker.probe.recovery.closed";

export type DockerDiagnosticProbeRecoveryClosure = {
  readonly lastLifecycleState: "action_prepared" | "approval_consumed" | "effect_intent";
  readonly outcome: "not_started";
  readonly reason: "approval_not_consumed" | "pre_create_absent";
  readonly resolvedAt: string;
};

export type DockerDiagnosticProbeTerminalDraft = {
  readonly endedAt: string;
  readonly observations: DockerDiagnosticProbeObservationsV1;
  readonly outcome:
    | "passed"
    | "failed"
    | "timed_out"
    | "cancelled"
    | "oom"
    | "output_overflow"
    | "engine_failed"
    | "unknown";
  readonly startedAt: string;
};

type JournalEventInput = {
  readonly eventId: string;
  readonly payload: Record<string, unknown>;
  readonly probeId: string;
  readonly recordedAt: string;
  readonly redaction: "closed_no_raw_docker";
  readonly type: JournalEventType;
};

export type DockerDiagnosticProbeJournalRecord = JournalEventInput & {
  readonly journalVersion: 1;
  readonly sequence: number;
};

export type DockerDiagnosticProbeJournalProjection =
  | { readonly status: "empty" }
  | {
      readonly actionDigest: string;
      readonly actionId: string;
      readonly cleanup: DockerDiagnosticProbeCleanupV1 | null;
      readonly effectId: string;
      readonly lastLifecycleState: string;
      readonly probeId: string;
      readonly receipt: DockerDiagnosticProbeReceiptV1 | null;
      readonly recovery: DockerDiagnosticProbeRecoveryClosure | null;
      readonly revision: number;
      readonly status: "resolved" | "unresolved";
      readonly terminalDraft: DockerDiagnosticProbeTerminalDraft | null;
    };

export class DockerDiagnosticProbeJournalError extends Error {
  readonly code:
    | "journal_directory_invalid"
    | "journal_link_invalid"
    | "journal_locked"
    | "journal_permissions_invalid"
    | "journal_record_invalid"
    | "journal_sequence_invalid"
    | "journal_size_exceeded";

  constructor(
    code:
      | "journal_directory_invalid"
      | "journal_link_invalid"
      | "journal_locked"
      | "journal_permissions_invalid"
      | "journal_record_invalid"
      | "journal_sequence_invalid"
      | "journal_size_exceeded",
  ) {
    super(code);
    this.code = code;
    this.name = "DockerDiagnosticProbeJournalError";
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 256;
}

function isProbeId(value: unknown): value is string {
  return typeof value === "string" && /^probe-[a-z0-9][a-z0-9-]{0,121}$/u.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/u.test(value);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isDateTime(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function decodeTerminalDraft(
  value: unknown,
  receipt: DockerDiagnosticProbeReceiptV1,
): DockerDiagnosticProbeTerminalDraft | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["endedAt", "observations", "outcome", "startedAt"])
  ) {
    return null;
  }
  const observations = decodeDockerDiagnosticProbeObservations(value.observations);
  const outcomes = [
    "passed",
    "failed",
    "timed_out",
    "cancelled",
    "oom",
    "output_overflow",
    "engine_failed",
    "unknown",
  ] as const;
  if (
    !isDateTime(value.startedAt) ||
    !isDateTime(value.endedAt) ||
    Date.parse(value.endedAt) < Date.parse(value.startedAt) ||
    !observations.ok ||
    !outcomes.includes(value.outcome as (typeof outcomes)[number]) ||
    value.outcome !== receipt.resultOutcome ||
    observations.value[8].sha256 !== receipt.resultDigest
  ) {
    return null;
  }
  return {
    endedAt: value.endedAt,
    observations: observations.value,
    outcome: value.outcome as DockerDiagnosticProbeTerminalDraft["outcome"],
    startedAt: value.startedAt,
  };
}

function decodePayload(type: JournalEventType, payload: unknown): Record<string, unknown> | null {
  if (!isObject(payload)) return null;
  if (type === "docker.probe.action.prepared") {
    if (!hasExactKeys(payload, ["action", "actionDigest", "approvalId", "effectId"])) return null;
    return decodeDockerDiagnosticProbeAction(payload.action).ok &&
      isDigest(payload.actionDigest) &&
      isIdentifier(payload.approvalId) &&
      isIdentifier(payload.effectId)
      ? payload
      : null;
  }
  if (type === "docker.probe.approval.consumed") {
    if (!hasExactKeys(payload, ["actionDigest", "actionId", "approvalId", "decision"])) {
      return null;
    }
    return isDigest(payload.actionDigest) &&
      isIdentifier(payload.actionId) &&
      isIdentifier(payload.approvalId) &&
      payload.decision === "approve"
      ? payload
      : null;
  }
  if (type === "docker.probe.effect.intent") {
    if (!hasExactKeys(payload, ["actionId", "configDigest", "containerName", "effectId"])) {
      return null;
    }
    return isIdentifier(payload.actionId) &&
      isSha256(payload.configDigest) &&
      typeof payload.containerName === "string" &&
      /^eden-probe-[a-f0-9]{24}$/u.test(payload.containerName) &&
      isIdentifier(payload.effectId)
      ? payload
      : null;
  }
  if (type === "docker.probe.container.created") {
    if (!hasExactKeys(payload, ["container", "effectId", "labels"])) return null;
    const container = payload.container;
    return isObject(container) &&
      hasExactKeys(container, ["id", "name"]) &&
      typeof container.id === "string" &&
      /^[a-f0-9]{64}$/u.test(container.id) &&
      typeof container.name === "string" &&
      /^eden-probe-[a-f0-9]{24}$/u.test(container.name) &&
      isIdentifier(payload.effectId) &&
      isObject(payload.labels)
      ? payload
      : null;
  }
  if (type === "docker.probe.dispatch.started") {
    if (!hasExactKeys(payload, ["containerId", "effectId"])) return null;
    return typeof payload.containerId === "string" &&
      /^[a-f0-9]{64}$/u.test(payload.containerId) &&
      isIdentifier(payload.effectId)
      ? payload
      : null;
  }
  if (type === "docker.probe.receipt.recorded") {
    if (!hasExactKeys(payload, ["receipt", "terminalDraft"])) return null;
    const receipt = decodeDockerDiagnosticProbeReceipt(payload.receipt);
    return receipt.ok && decodeTerminalDraft(payload.terminalDraft, receipt.value) !== null
      ? payload
      : null;
  }
  if (type === "docker.probe.cleanup.recorded") {
    return hasExactKeys(payload, ["cleanup"]) &&
      decodeDockerDiagnosticProbeCleanup(payload.cleanup).ok
      ? payload
      : null;
  }
  if (type === "docker.probe.recovery.closed") {
    if (
      !hasExactKeys(payload, [
        "actionDigest",
        "actionId",
        "effectId",
        "lastLifecycleState",
        "outcome",
        "reason",
      ])
    ) {
      return null;
    }
    const state = payload.lastLifecycleState;
    const reason = payload.reason;
    return isDigest(payload.actionDigest) &&
      isIdentifier(payload.actionId) &&
      isIdentifier(payload.effectId) &&
      payload.outcome === "not_started" &&
      ((state === "action_prepared" && reason === "approval_not_consumed") ||
        ((state === "approval_consumed" || state === "effect_intent") &&
          reason === "pre_create_absent"))
      ? payload
      : null;
  }
  return hasExactKeys(payload, ["result"]) && decodeDockerDiagnosticProbeResult(payload.result).ok
    ? payload
    : null;
}

function decodeEvent(value: unknown): JournalEventInput | null {
  if (
    !isObject(value) ||
    !hasExactKeys(value, ["eventId", "payload", "probeId", "recordedAt", "redaction", "type"]) ||
    !isIdentifier(value.eventId) ||
    !isProbeId(value.probeId) ||
    !isDateTime(value.recordedAt) ||
    value.redaction !== "closed_no_raw_docker" ||
    ![...executionEventOrder, "docker.probe.recovery.closed"].includes(
      value.type as JournalEventType,
    )
  ) {
    return null;
  }
  const type = value.type as JournalEventType;
  const payload = decodePayload(type, value.payload);
  return payload === null
    ? null
    : {
        eventId: value.eventId,
        payload,
        probeId: value.probeId,
        recordedAt: value.recordedAt,
        redaction: value.redaction,
        type,
      };
}

function recordEffectId(record: DockerDiagnosticProbeJournalRecord): string | null {
  if (
    record.type === "docker.probe.action.prepared" ||
    record.type === "docker.probe.effect.intent" ||
    record.type === "docker.probe.container.created" ||
    record.type === "docker.probe.dispatch.started" ||
    record.type === "docker.probe.recovery.closed"
  ) {
    return typeof record.payload.effectId === "string" ? record.payload.effectId : null;
  }
  const nested =
    record.type === "docker.probe.receipt.recorded"
      ? record.payload.receipt
      : record.type === "docker.probe.cleanup.recorded"
        ? record.payload.cleanup
        : record.type === "docker.probe.terminal"
          ? record.payload.result
          : null;
  return isObject(nested) && typeof nested.effectId === "string" ? nested.effectId : null;
}

function validateSequence(records: readonly DockerDiagnosticProbeJournalRecord[]): void {
  let expectedIndex = 0;
  let activeActionDigest: string | null = null;
  let activeActionId: string | null = null;
  let activeEffectId: string | null = null;
  let activeProbeId: string | null = null;
  const eventIds = new Set<string>();
  for (const [index, record] of records.entries()) {
    if (record.sequence !== index + 1 || eventIds.has(record.eventId)) {
      throw new DockerDiagnosticProbeJournalError("journal_sequence_invalid");
    }
    eventIds.add(record.eventId);
    if (expectedIndex === 0) {
      if (record.type !== "docker.probe.action.prepared") {
        throw new DockerDiagnosticProbeJournalError("journal_sequence_invalid");
      }
      const action = decodeDockerDiagnosticProbeAction(record.payload.action);
      if (!action.ok) {
        throw new DockerDiagnosticProbeJournalError("journal_record_invalid");
      }
      activeProbeId = record.probeId;
      activeEffectId = recordEffectId(record);
      activeActionDigest = record.payload.actionDigest as string;
      activeActionId = action.value.actionId;
    }
    const effectId = recordEffectId(record);
    if (record.probeId !== activeProbeId) {
      throw new DockerDiagnosticProbeJournalError("journal_sequence_invalid");
    }
    if (effectId !== null && effectId !== activeEffectId) {
      throw new DockerDiagnosticProbeJournalError("journal_sequence_invalid");
    }
    if (record.type === "docker.probe.recovery.closed") {
      const allowedPrefix =
        (expectedIndex === 1 &&
          record.payload.lastLifecycleState === "action_prepared" &&
          record.payload.reason === "approval_not_consumed") ||
        (expectedIndex === 2 &&
          record.payload.lastLifecycleState === "approval_consumed" &&
          record.payload.reason === "pre_create_absent") ||
        (expectedIndex === 3 &&
          record.payload.lastLifecycleState === "effect_intent" &&
          record.payload.reason === "pre_create_absent");
      if (
        !allowedPrefix ||
        record.payload.actionDigest !== activeActionDigest ||
        record.payload.actionId !== activeActionId
      ) {
        throw new DockerDiagnosticProbeJournalError("journal_sequence_invalid");
      }
      expectedIndex = 0;
      activeEffectId = null;
      activeProbeId = null;
      activeActionDigest = null;
      activeActionId = null;
      continue;
    }
    if (record.type !== executionEventOrder[expectedIndex]) {
      throw new DockerDiagnosticProbeJournalError("journal_sequence_invalid");
    }
    expectedIndex += 1;
    if (expectedIndex === executionEventOrder.length) {
      expectedIndex = 0;
      activeEffectId = null;
      activeProbeId = null;
      activeActionDigest = null;
      activeActionId = null;
    }
  }
}

function decodeRecords(bytes: Uint8Array): readonly DockerDiagnosticProbeJournalRecord[] {
  if (bytes.byteLength > MAX_JOURNAL_BYTES) {
    throw new DockerDiagnosticProbeJournalError("journal_size_exceeded");
  }
  if (bytes.byteLength === 0) return [];
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.endsWith("\n")) {
    throw new DockerDiagnosticProbeJournalError("journal_record_invalid");
  }
  const lines = text.slice(0, -1).split("\n");
  if (lines.length > MAX_RECORDS) {
    throw new DockerDiagnosticProbeJournalError("journal_size_exceeded");
  }
  const records = lines.map((line, index) => {
    if (new TextEncoder().encode(`${line}\n`).byteLength > MAX_RECORD_BYTES) {
      throw new DockerDiagnosticProbeJournalError("journal_size_exceeded");
    }
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new DockerDiagnosticProbeJournalError("journal_record_invalid");
    }
    if (
      !isObject(value) ||
      !hasExactKeys(value, [
        "eventId",
        "journalVersion",
        "payload",
        "probeId",
        "recordedAt",
        "redaction",
        "sequence",
        "type",
      ]) ||
      value.journalVersion !== 1 ||
      value.sequence !== index + 1
    ) {
      throw new DockerDiagnosticProbeJournalError("journal_record_invalid");
    }
    const event = decodeEvent({
      eventId: value.eventId,
      payload: value.payload,
      probeId: value.probeId,
      recordedAt: value.recordedAt,
      redaction: value.redaction,
      type: value.type,
    });
    if (event === null) {
      throw new DockerDiagnosticProbeJournalError("journal_record_invalid");
    }
    return { ...event, journalVersion: 1 as const, sequence: index + 1 };
  });
  validateSequence(records);
  return records;
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const status = await lstat(path);
  if (!status.isDirectory() || status.isSymbolicLink()) {
    throw new DockerDiagnosticProbeJournalError("journal_directory_invalid");
  }
  if ((status.mode & 0o077) !== 0) {
    throw new DockerDiagnosticProbeJournalError("journal_permissions_invalid");
  }
}

async function assertPrivateJournal(path: string): Promise<void> {
  const status = await lstat(path);
  if (!status.isFile() || status.isSymbolicLink()) {
    throw new DockerDiagnosticProbeJournalError("journal_link_invalid");
  }
  if (status.nlink !== 1) {
    throw new DockerDiagnosticProbeJournalError("journal_link_invalid");
  }
  if ((status.mode & 0o777) !== 0o600) {
    throw new DockerDiagnosticProbeJournalError("journal_permissions_invalid");
  }
}

export function projectDockerDiagnosticProbeJournal(
  records: readonly DockerDiagnosticProbeJournalRecord[],
): DockerDiagnosticProbeJournalProjection {
  if (records.length === 0) return { status: "empty" };
  validateSequence(records);
  const sessionStart = records.findLastIndex(
    (record) => record.type === "docker.probe.action.prepared",
  );
  const session = records.slice(sessionStart);
  const prepared = session[0];
  if (prepared?.type !== "docker.probe.action.prepared") {
    throw new DockerDiagnosticProbeJournalError("journal_sequence_invalid");
  }
  const action = decodeDockerDiagnosticProbeAction(prepared.payload.action);
  if (!action.ok) {
    throw new DockerDiagnosticProbeJournalError("journal_record_invalid");
  }
  const receipt = session.find((record) => record.type === "docker.probe.receipt.recorded");
  const cleanup = session.find((record) => record.type === "docker.probe.cleanup.recorded");
  const recovery = session.find((record) => record.type === "docker.probe.recovery.closed");
  const last = session.at(-1);
  return {
    actionDigest: prepared.payload.actionDigest as string,
    actionId: action.value.actionId,
    cleanup: (cleanup?.payload.cleanup as DockerDiagnosticProbeCleanupV1 | undefined) ?? null,
    effectId: prepared.payload.effectId as string,
    lastLifecycleState: last?.type.replace("docker.probe.", "").replaceAll(".", "_") ?? "unknown",
    probeId: prepared.probeId,
    receipt: (receipt?.payload.receipt as DockerDiagnosticProbeReceiptV1 | undefined) ?? null,
    recovery:
      recovery === undefined
        ? null
        : {
            lastLifecycleState: recovery.payload
              .lastLifecycleState as DockerDiagnosticProbeRecoveryClosure["lastLifecycleState"],
            outcome: "not_started",
            reason: recovery.payload.reason as DockerDiagnosticProbeRecoveryClosure["reason"],
            resolvedAt: recovery.recordedAt,
          },
    revision: action.value.proposalRevision,
    status:
      last?.type === "docker.probe.terminal" || last?.type === "docker.probe.recovery.closed"
        ? "resolved"
        : "unresolved",
    terminalDraft:
      receipt === undefined
        ? null
        : (receipt.payload.terminalDraft as DockerDiagnosticProbeTerminalDraft),
  };
}

const recoveryStates = [
  "action_prepared",
  "approval_consumed",
  "effect_intent",
  "container_created",
  "dispatch_started",
  "receipt_recorded",
  "cleanup_recorded",
] as const;

export type DockerDiagnosticProbeRecoveryProjectionResult =
  | { readonly event: DockerDiagnosticProbeRecoveryRequiredV1; readonly ok: true }
  | { readonly code: "recovery_not_required" | "recovery_projection_invalid"; readonly ok: false };

export function createDockerDiagnosticProbeRecoveryRequiredEvent(
  projection: DockerDiagnosticProbeJournalProjection,
  eventId: string,
): DockerDiagnosticProbeRecoveryProjectionResult {
  if (projection.status !== "unresolved") {
    return { code: "recovery_not_required", ok: false };
  }
  if (!recoveryStates.includes(projection.lastLifecycleState as (typeof recoveryStates)[number])) {
    return { code: "recovery_projection_invalid", ok: false };
  }
  const event: DockerDiagnosticProbeRecoveryRequiredV1 = {
    actionDigest: projection.actionDigest,
    actionId: projection.actionId,
    cleanup: projection.cleanup,
    effectId: projection.effectId,
    error: {
      code: "docker_probe_recovery_required",
      message: "One exact diagnostic probe requires explicit recovery before a new proposal.",
      recoverability: "ask-user",
      suggestedActions: ["Run the interactive Docker probe command to reconcile this identity."],
    },
    eventId,
    lastLifecycleState: projection.lastLifecycleState as (typeof recoveryStates)[number],
    limitations: [
      "JSON recovery projection performs no Docker or filesystem mutation.",
      "No new probe may start until this exact identity is resolved.",
    ],
    nextAction: "Run eden doctor --probe-docker interactively.",
    probeId: projection.probeId,
    protocolVersion: 1,
    receipt: projection.receipt,
    revision: projection.revision,
    type: "docker.probe.recovery.required",
  };
  const decoded = decodeDockerDiagnosticProbeEvent(event);
  return decoded.ok && decoded.value.type === "docker.probe.recovery.required"
    ? { event: decoded.value, ok: true }
    : { code: "recovery_projection_invalid", ok: false };
}

export type DockerDiagnosticProbeRecoveryResolvedProjectionResult =
  | { readonly event: DockerDiagnosticProbeRecoveryResolvedV1; readonly ok: true }
  | { readonly code: "recovery_not_resolved" | "recovery_projection_invalid"; readonly ok: false };

export function createDockerDiagnosticProbeRecoveryResolvedEvent(
  projection: DockerDiagnosticProbeJournalProjection,
  eventId: string,
): DockerDiagnosticProbeRecoveryResolvedProjectionResult {
  if (projection.status !== "resolved" || projection.recovery === null) {
    return { code: "recovery_not_resolved", ok: false };
  }
  const event: DockerDiagnosticProbeRecoveryResolvedV1 = {
    actionDigest: projection.actionDigest,
    actionId: projection.actionId,
    effectId: projection.effectId,
    eventId,
    lastLifecycleState: projection.recovery.lastLifecycleState,
    limitations: [
      "No Docker inspection or mutation occurred.",
      "No execution receipt or cleanup claim was created.",
    ],
    nextAction: "The interactive invocation may propose a new exact diagnostic action.",
    outcome: "not_started",
    probeId: projection.probeId,
    protocolVersion: 1,
    reason: projection.recovery.reason,
    resolvedAt: projection.recovery.resolvedAt,
    revision: projection.revision,
    type: "docker.probe.recovery.resolved",
  };
  const decoded = decodeDockerDiagnosticProbeEvent(event);
  return decoded.ok && decoded.value.type === "docker.probe.recovery.resolved"
    ? { event: decoded.value, ok: true }
    : { code: "recovery_projection_invalid", ok: false };
}

export class DockerDiagnosticProbeJournal {
  readonly path: string;
  readonly #directory: string;
  readonly #lockPath: string;
  readonly #stateDirectory: string;

  constructor(options: { readonly stateDirectory: string }) {
    this.#stateDirectory = options.stateDirectory;
    this.#directory = join(options.stateDirectory, "diagnostics", "docker-probe-v1");
    this.path = join(this.#directory, "journal.jsonl");
    this.#lockPath = join(this.#directory, "journal.lock");
  }

  async #ensureDirectory(): Promise<void> {
    await mkdir(this.#stateDirectory, { mode: 0o700, recursive: true });
    await assertPrivateDirectory(this.#stateDirectory);
    await mkdir(this.#directory, { mode: 0o700, recursive: true });
    await assertPrivateDirectory(dirname(this.#directory));
    await assertPrivateDirectory(this.#directory);
  }

  async load(): Promise<readonly DockerDiagnosticProbeJournalRecord[]> {
    try {
      await assertPrivateJournal(this.path);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
      throw error;
    }
    return decodeRecords(await readFile(this.path));
  }

  async append(value: unknown): Promise<DockerDiagnosticProbeJournalRecord> {
    const event = decodeEvent(value);
    if (event === null) {
      throw new DockerDiagnosticProbeJournalError("journal_record_invalid");
    }
    await this.#ensureDirectory();
    const existing = await this.load();
    const record = {
      ...event,
      journalVersion: 1 as const,
      sequence: existing.length + 1,
    };
    validateSequence([...existing, record]);
    const line = `${JSON.stringify(record)}\n`;
    const bytes = new TextEncoder().encode(line);
    if (
      bytes.byteLength > MAX_RECORD_BYTES ||
      existing.length + 1 > MAX_RECORDS ||
      (await readFile(this.path).catch(() => new Uint8Array())).byteLength + bytes.byteLength >
        MAX_JOURNAL_BYTES
    ) {
      throw new DockerDiagnosticProbeJournalError("journal_size_exceeded");
    }
    const handle = await open(
      this.path,
      constants.O_APPEND | constants.O_CREAT | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    try {
      const status = await handle.stat();
      if (!status.isFile() || status.nlink !== 1) {
        throw new DockerDiagnosticProbeJournalError("journal_link_invalid");
      }
      if ((status.mode & 0o777) !== 0o600) {
        throw new DockerDiagnosticProbeJournalError("journal_permissions_invalid");
      }
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return record;
  }

  async acquireLock(): Promise<{ readonly release: () => Promise<void> }> {
    await this.#ensureDirectory();
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(
        this.#lockPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new DockerDiagnosticProbeJournalError("journal_locked");
      }
      throw error;
    }
    await handle.writeFile("eden-docker-diagnostic-probe-v1\n");
    await handle.sync();
    let released = false;
    return {
      release: async () => {
        if (released) return;
        released = true;
        await handle.close();
        await unlink(this.#lockPath);
      },
    };
  }
}

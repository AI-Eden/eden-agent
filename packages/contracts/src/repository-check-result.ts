import { createHash } from "node:crypto";

import Type from "typebox";
import Schema from "typebox/schema";

import type { DecodeResult, ProductError } from "./protocol.ts";
import { RepositoryCheckProcessSchema } from "./repository-check.ts";

const closed = { additionalProperties: false } as const;
const sha256Schema = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
const identifierSchema = Type.String({ maxLength: 256, minLength: 1 });
const actionIdSchema = identifierSchema;
const runIdSchema = Type.String({
  maxLength: 128,
  minLength: 5,
  pattern: "^run-[a-z0-9][a-z0-9-]{0,123}$",
});
const shortTextSchema = Type.String({ maxLength: 512, minLength: 1 });
const base64StreamSchema = Type.String({ maxLength: 21_848 });
const utf8 = new TextEncoder();
const productErrorSchema = Type.Object(
  {
    code: Type.String({ maxLength: 128, minLength: 1, pattern: "^[a-z][a-z0-9_]*$" }),
    message: Type.String({ maxLength: 4_096, minLength: 1 }),
    recoverability: Type.Union([
      Type.Literal("retry"),
      Type.Literal("reconfigure"),
      Type.Literal("ask-user"),
      Type.Literal("fatal"),
    ]),
    suggestedActions: Type.Array(shortTextSchema, { maxItems: 8 }),
  },
  closed,
);

function hash(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function decodeCanonicalBase64(value: string): Uint8Array | null {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
    return null;
  }
  const decoded = Buffer.from(value, "base64");
  return decoded.toString("base64") === value ? decoded : null;
}

export const RepositoryCheckOutcomeSchema = Type.Union([
  Type.Literal("passed"),
  Type.Literal("failed"),
  Type.Literal("timed_out"),
  Type.Literal("cancelled"),
  Type.Literal("oom"),
  Type.Literal("output_overflow"),
  Type.Literal("engine_failed"),
  Type.Literal("cleanup_failed"),
  Type.Literal("unknown"),
]);
export type RepositoryCheckOutcome = Type.Static<typeof RepositoryCheckOutcomeSchema>;

const RepositoryCheckLabelsSchema = Type.Object(
  {
    actionId: actionIdSchema,
    effectId: identifierSchema,
    imageIndexDigest: sha256Schema,
    inputManifestDigest: sha256Schema,
    platformManifestDigest: sha256Schema,
    profileRevision: Type.Literal("r2-docker-profile-v1"),
    runId: runIdSchema,
    schema: Type.Literal("eden.repository-check.v1"),
  },
  closed,
);

export const RepositoryCheckReceiptV1Schema = Type.Refine(
  Type.Object(
    {
      actionId: actionIdSchema,
      configDigest: sha256Schema,
      container: Type.Object(
        {
          id: Type.String({ pattern: "^[a-f0-9]{64}$" }),
          name: Type.String({
            maxLength: 128,
            minLength: 1,
            pattern: "^eden-check-[a-z0-9][a-z0-9-]*$",
          }),
        },
        closed,
      ),
      effectId: identifierSchema,
      labels: RepositoryCheckLabelsSchema,
      lifecycleState: Type.Literal("exited"),
      receiptId: identifierSchema,
      receiptVersion: Type.Literal(1),
      recordedAt: Type.String({ format: "date-time" }),
      resultDigest: sha256Schema,
      resultOutcome: RepositoryCheckOutcomeSchema,
      stagingIdentity: sha256Schema,
    },
    closed,
  ),
  (receipt) =>
    receipt.actionId === receipt.labels.actionId && receipt.effectId === receipt.labels.effectId,
);
export type RepositoryCheckReceiptV1 = Type.Static<typeof RepositoryCheckReceiptV1Schema>;

const CleanupTargetStateSchema = Type.Union([
  Type.Literal("removed"),
  Type.Literal("absent"),
  Type.Literal("failed"),
  Type.Literal("unknown"),
]);

export const RepositoryCheckCleanupV1Schema = Type.Refine(
  Type.Object(
    {
      actionId: actionIdSchema,
      cleanupVersion: Type.Literal(1),
      completedAt: Type.String({ format: "date-time" }),
      container: Type.Object(
        { id: Type.String({ pattern: "^[a-f0-9]{64}$" }), state: CleanupTargetStateSchema },
        closed,
      ),
      effectId: identifierSchema,
      error: Type.Union([productErrorSchema, Type.Null()]),
      receiptId: identifierSchema,
      staging: Type.Object({ identity: sha256Schema, state: CleanupTargetStateSchema }, closed),
      status: Type.Union([
        Type.Literal("complete"),
        Type.Literal("failed"),
        Type.Literal("unknown"),
      ]),
    },
    closed,
  ),
  (cleanup) => {
    const bothRemoved = [cleanup.container.state, cleanup.staging.state].every(
      (state) => state === "removed" || state === "absent",
    );
    if (cleanup.status === "complete") return bothRemoved && cleanup.error === null;
    if (cleanup.status === "failed") {
      return !bothRemoved && cleanup.error !== null;
    }
    return !bothRemoved && cleanup.error !== null;
  },
);
export type RepositoryCheckCleanupV1 = Type.Static<typeof RepositoryCheckCleanupV1Schema>;

const WrapperReasonSchema = Type.Union([
  Type.Literal("process_exited"),
  Type.Literal("wall_clock_exceeded"),
  Type.Literal("cancel_requested"),
  Type.Literal("oom_killed"),
  Type.Literal("stdout_overflow"),
  Type.Literal("stderr_overflow"),
  Type.Literal("docker_engine_failed"),
  Type.Literal("result_unavailable"),
]);

export const RepositoryCheckResultV1Schema = Type.Refine(
  Type.Object(
    {
      actionId: actionIdSchema,
      checkName: Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }),
      cleanup: RepositoryCheckCleanupV1Schema,
      effectId: identifierSchema,
      endedAt: Type.String({ format: "date-time" }),
      exitCode: Type.Union([Type.Integer({ maximum: 255, minimum: 0 }), Type.Null()]),
      imageIndexDigest: sha256Schema,
      inputManifestDigest: sha256Schema,
      outcome: RepositoryCheckOutcomeSchema,
      platformManifestDigest: sha256Schema,
      profileRevision: Type.Literal("r2-docker-profile-v1"),
      receiptId: identifierSchema,
      resultVersion: Type.Literal(1),
      startedAt: Type.String({ format: "date-time" }),
      stderr: base64StreamSchema,
      stderrByteLength: Type.Integer({ maximum: 16_384, minimum: 0 }),
      stderrEncoding: Type.Literal("base64"),
      stderrSha256: sha256Schema,
      stdout: base64StreamSchema,
      stdoutByteLength: Type.Integer({ maximum: 16_384, minimum: 0 }),
      stdoutEncoding: Type.Literal("base64"),
      stdoutSha256: sha256Schema,
      wrapperReason: WrapperReasonSchema,
    },
    closed,
  ),
  (result) => {
    const stdout = decodeCanonicalBase64(result.stdout);
    const stderr = decodeCanonicalBase64(result.stderr);
    if (stdout === null || stderr === null) return false;
    const identityMatches =
      result.actionId === result.cleanup.actionId &&
      result.effectId === result.cleanup.effectId &&
      result.receiptId === result.cleanup.receiptId;
    const streamsMatch =
      stdout.byteLength === result.stdoutByteLength &&
      stderr.byteLength === result.stderrByteLength &&
      stdout.byteLength <= 16_384 &&
      stderr.byteLength <= 16_384 &&
      result.stdoutSha256 === hash(stdout) &&
      result.stderrSha256 === hash(stderr);
    const timeOrder = Date.parse(result.endedAt) >= Date.parse(result.startedAt);
    const encodedFits = utf8.encode(JSON.stringify(result)).byteLength <= 65_536;
    if (!(identityMatches && streamsMatch && timeOrder && encodedFits)) return false;
    if (result.outcome === "passed") {
      return (
        result.exitCode === 0 &&
        result.wrapperReason === "process_exited" &&
        result.cleanup.status === "complete"
      );
    }
    if (result.outcome === "failed") {
      return (
        result.exitCode !== null &&
        result.exitCode !== 0 &&
        result.wrapperReason === "process_exited" &&
        result.cleanup.status === "complete"
      );
    }
    if (result.outcome === "cleanup_failed") {
      return result.cleanup.status === "failed";
    }
    return result.cleanup.status !== "failed";
  },
);
export type RepositoryCheckResultV1 = Type.Static<typeof RepositoryCheckResultV1Schema>;

const DockerDoctorDetailSchema = Type.Object(
  {
    name: Type.String({ maxLength: 64, minLength: 1, pattern: "^[A-Za-z][A-Za-z0-9]*$" }),
    value: Type.String({ maxLength: 512 }),
  },
  closed,
);

const DockerDoctorRowSchema = Type.Refine(
  Type.Object(
    {
      details: Type.Array(DockerDoctorDetailSchema, { maxItems: 16 }),
      id: Type.Union([
        Type.Literal("docker.client"),
        Type.Literal("docker.daemon"),
        Type.Literal("docker.context"),
        Type.Literal("docker.api"),
        Type.Literal("docker.backend"),
        Type.Literal("docker.platform"),
        Type.Literal("docker.image"),
        Type.Literal("docker.security"),
        Type.Literal("docker.resources"),
        Type.Literal("docker.staging"),
        Type.Literal("eden.state"),
        Type.Literal("docker.orphans"),
      ]),
      status: Type.Union([Type.Literal("ready"), Type.Literal("blocked"), Type.Literal("warning")]),
      summary: shortTextSchema,
    },
    closed,
  ),
  (row) => new Set(row.details.map((detail) => detail.name)).size === row.details.length,
);

export const DockerDoctorReportV1Schema = Type.Refine(
  Type.Object(
    {
      doctorVersion: Type.Literal(1),
      mode: Type.Literal("read_only"),
      mutation: Type.Literal("none"),
      observedAt: Type.String({ format: "date-time" }),
      rows: Type.Array(DockerDoctorRowSchema, { maxItems: 32, minItems: 1 }),
    },
    closed,
  ),
  (report) => new Set(report.rows.map((row) => row.id)).size === report.rows.length,
);
export type DockerDoctorReportV1 = Type.Static<typeof DockerDoctorReportV1Schema>;

export const RepositoryCheckLifecycleStateSchema = Type.Union([
  Type.Literal("awaiting_approval"),
  Type.Literal("preparing"),
  Type.Literal("creating"),
  Type.Literal("created"),
  Type.Literal("running"),
  Type.Literal("exited"),
  Type.Literal("result_decoded"),
  Type.Literal("cleaning"),
  Type.Literal("review"),
]);
export type RepositoryCheckLifecycleState = Type.Static<typeof RepositoryCheckLifecycleStateSchema>;

const RepositoryCheckLifecycleEntrySchema = Type.Object(
  {
    observedAt: Type.String({ format: "date-time" }),
    state: RepositoryCheckLifecycleStateSchema,
  },
  closed,
);

export const RepositoryCheckProductViewV1Schema = Type.Refine(
  Type.Object(
    {
      actionId: actionIdSchema,
      checkName: Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }),
      effectId: identifierSchema,
      input: Type.Object(
        {
          catalogSha256: sha256Schema,
          imageIndexDigest: sha256Schema,
          manifestDigest: sha256Schema,
          platformManifestDigest: sha256Schema,
          profileRevision: Type.Literal("r2-docker-profile-v1"),
        },
        closed,
      ),
      isolation: Type.Object(
        {
          network: Type.Literal("none"),
          rootFilesystem: Type.Literal("read_only"),
          workspaceMount: Type.Literal("read_only"),
        },
        closed,
      ),
      lifecycle: Type.Array(RepositoryCheckLifecycleEntrySchema, { maxItems: 16, minItems: 1 }),
      limitations: Type.Array(shortTextSchema, { maxItems: 8 }),
      nextActions: Type.Array(shortTextSchema, { maxItems: 8 }),
      process: RepositoryCheckProcessSchema,
      projectionVersion: Type.Literal(1),
      receipt: Type.Union([RepositoryCheckReceiptV1Schema, Type.Null()]),
      result: Type.Union([RepositoryCheckResultV1Schema, Type.Null()]),
      runId: runIdSchema,
      state: RepositoryCheckLifecycleStateSchema,
    },
    closed,
  ),
  (view) => {
    const last = view.lifecycle.at(-1);
    const lifecycleMatches = last?.state === view.state;
    if (view.state === "review") {
      return (
        lifecycleMatches &&
        view.result !== null &&
        view.receipt !== null &&
        view.actionId === view.result.actionId &&
        view.actionId === view.receipt.actionId &&
        view.effectId === view.result.effectId &&
        view.effectId === view.receipt.effectId
      );
    }
    return lifecycleMatches && view.result === null && view.receipt === null;
  },
);
export type RepositoryCheckProductViewV1 = Type.Static<typeof RepositoryCheckProductViewV1Schema>;

const receiptValidator = Schema.Compile(RepositoryCheckReceiptV1Schema);
const cleanupValidator = Schema.Compile(RepositoryCheckCleanupV1Schema);
const resultValidator = Schema.Compile(RepositoryCheckResultV1Schema);
const doctorValidator = Schema.Compile(DockerDoctorReportV1Schema);

function invalid(kind: string): ProductError {
  return {
    code: `invalid_${kind}`,
    message: `The ${kind.replaceAll("_", " ")} does not match the closed version-one contract.`,
    recoverability: "fatal",
    suggestedActions: ["Reject the value at the product boundary."],
  };
}

function decode<T>(
  kind: string,
  validator: { Check(value: unknown): value is T },
  value: unknown,
): DecodeResult<T> {
  return validator.Check(value) ? { ok: true, value } : { error: invalid(kind), ok: false };
}

export function decodeRepositoryCheckReceipt(
  value: unknown,
): DecodeResult<RepositoryCheckReceiptV1> {
  return decode("repository_check_receipt", receiptValidator, value);
}

export function decodeRepositoryCheckCleanup(
  value: unknown,
): DecodeResult<RepositoryCheckCleanupV1> {
  return decode("repository_check_cleanup", cleanupValidator, value);
}

export function decodeRepositoryCheckResult(value: unknown): DecodeResult<RepositoryCheckResultV1> {
  return decode("repository_check_result", resultValidator, value);
}

export function decodeDockerDoctorReport(value: unknown): DecodeResult<DockerDoctorReportV1> {
  return decode("docker_doctor_report", doctorValidator, value);
}

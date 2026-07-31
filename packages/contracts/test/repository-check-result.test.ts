import { deepStrictEqual, strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  decodeDockerDoctorReport,
  decodeRepositoryCheckCleanup,
  decodeRepositoryCheckReceipt,
  decodeRepositoryCheckResult,
} from "../src/index.ts";

const sha256 = (value: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const fixedSha256 = (character: string) => `sha256:${character.repeat(64)}`;

const receipt = {
  actionId: "action-repository-check-1",
  configDigest: fixedSha256("1"),
  container: {
    id: "a".repeat(64),
    name: "eden-check-effect-repository-check-1",
  },
  effectId: "effect-repository-check-1",
  labels: {
    actionId: "action-repository-check-1",
    effectId: "effect-repository-check-1",
    imageIndexDigest: fixedSha256("2"),
    inputManifestDigest: fixedSha256("3"),
    platformManifestDigest: fixedSha256("4"),
    profileRevision: "r2-docker-profile-v1",
    runId: "run-repository-check-1",
    schema: "eden.repository-check.v1",
  },
  lifecycleState: "exited",
  receiptId: "receipt-repository-check-1",
  receiptVersion: 1,
  recordedAt: "2026-07-30T02:00:01.000Z",
  resultDigest: fixedSha256("5"),
  resultOutcome: "passed",
  stagingIdentity: fixedSha256("6"),
};

const cleanup = {
  actionId: receipt.actionId,
  cleanupVersion: 1,
  completedAt: "2026-07-30T02:00:02.000Z",
  container: { id: receipt.container.id, state: "removed" },
  effectId: receipt.effectId,
  error: null,
  receiptId: receipt.receiptId,
  staging: { identity: receipt.stagingIdentity, state: "removed" },
  status: "complete",
};

const stdoutBytes = Buffer.from("all tests passed\n");
const stderrBytes = Buffer.alloc(0);
const stdout = stdoutBytes.toString("base64");
const stderr = stderrBytes.toString("base64");
const result = {
  actionId: receipt.actionId,
  checkName: "test",
  cleanup,
  effectId: receipt.effectId,
  endedAt: "2026-07-30T02:00:01.000Z",
  exitCode: 0,
  imageIndexDigest: receipt.labels.imageIndexDigest,
  inputManifestDigest: receipt.labels.inputManifestDigest,
  outcome: "passed",
  platformManifestDigest: receipt.labels.platformManifestDigest,
  profileRevision: receipt.labels.profileRevision,
  receiptId: receipt.receiptId,
  resultVersion: 1,
  startedAt: "2026-07-30T02:00:00.000Z",
  stderr,
  stderrByteLength: stderrBytes.byteLength,
  stderrEncoding: "base64",
  stderrSha256: sha256(stderrBytes),
  stdout,
  stdoutByteLength: stdoutBytes.byteLength,
  stdoutEncoding: "base64",
  stdoutSha256: sha256(stdoutBytes),
  wrapperReason: "process_exited",
};

const doctorReport = {
  doctorVersion: 1,
  mode: "read_only",
  mutation: "none",
  observedAt: "2026-07-30T02:01:00.000Z",
  rows: [
    {
      details: [
        { name: "clientVersion", value: "28.3.2" },
        { name: "reachable", value: "true" },
      ],
      id: "docker.client",
      status: "ready",
      summary: "Docker client is available.",
    },
    {
      details: [
        { name: "apiVersion", value: "1.51" },
        { name: "linuxContainers", value: "true" },
      ],
      id: "docker.backend",
      status: "ready",
      summary: "Linux-container backend is reachable.",
    },
    {
      details: [
        { name: "pullPolicy", value: "never" },
        { name: "present", value: "false" },
      ],
      id: "docker.image",
      status: "blocked",
      summary: "The exact local Eden toolchain image is absent.",
    },
  ],
};

describe("repository-check result, receipt, cleanup, and doctor contracts", () => {
  it("accepts one complete passed result and its durable lifecycle evidence", () => {
    deepStrictEqual(decodeRepositoryCheckReceipt(receipt), { ok: true, value: receipt });
    deepStrictEqual(decodeRepositoryCheckCleanup(cleanup), { ok: true, value: cleanup });
    deepStrictEqual(decodeRepositoryCheckResult(result), { ok: true, value: result });
  });

  it("rejects truncated, unhashed, or non-zero passed output", () => {
    strictEqual(decodeRepositoryCheckResult({ ...result, truncated: true }).ok, false);
    strictEqual(decodeRepositoryCheckResult({ ...result, stdoutByteLength: 3 }).ok, false);
    strictEqual(
      decodeRepositoryCheckResult({ ...result, stdoutSha256: fixedSha256("f") }).ok,
      false,
    );
    strictEqual(decodeRepositoryCheckResult({ ...result, exitCode: 1 }).ok, false);
  });

  it("preserves arbitrary output bytes and rejects malformed or non-canonical Base64", () => {
    const raw = Uint8Array.of(0xff, 0x00, 0x80, 0x0a);
    const encoded = Buffer.from(raw).toString("base64");
    strictEqual(
      decodeRepositoryCheckResult({
        ...result,
        stdout: encoded,
        stdoutByteLength: raw.byteLength,
        stdoutSha256: sha256(raw),
      }).ok,
      true,
    );
    for (const invalid of ["_", "AA", "AA===", "AA==\n", "ZE=="]) {
      strictEqual(decodeRepositoryCheckResult({ ...result, stdout: invalid }).ok, false);
    }
    strictEqual(decodeRepositoryCheckResult({ ...result, stdoutEncoding: "utf8" }).ok, false);
    strictEqual(decodeRepositoryCheckResult({ ...result, stderrEncoding: "utf8" }).ok, false);
  });

  it("makes cleanup failure explicit and rejects forged complete cleanup", () => {
    strictEqual(
      decodeRepositoryCheckCleanup({
        ...cleanup,
        container: { ...cleanup.container, state: "failed" },
      }).ok,
      false,
    );
    const cleanupFailed = {
      ...cleanup,
      container: { ...cleanup.container, state: "failed" },
      error: {
        code: "docker_remove_failed",
        message: "The exact owned container could not be removed.",
        recoverability: "retry",
        suggestedActions: ["Inspect the exact receipt."],
      },
      status: "failed",
    };
    strictEqual(decodeRepositoryCheckCleanup(cleanupFailed).ok, true);
    strictEqual(
      decodeRepositoryCheckResult({
        ...result,
        cleanup: cleanupFailed,
        outcome: "passed",
      }).ok,
      false,
    );
    strictEqual(
      decodeRepositoryCheckResult({
        ...result,
        cleanup: cleanupFailed,
        outcome: "cleanup_failed",
      }).ok,
      true,
    );
  });

  it("accepts a closed read-only doctor report and rejects remediation authority", () => {
    deepStrictEqual(decodeDockerDoctorReport(doctorReport), {
      ok: true,
      value: doctorReport,
    });
    strictEqual(decodeDockerDoctorReport({ ...doctorReport, mutation: "pull_image" }).ok, false);
    strictEqual(
      decodeDockerDoctorReport({
        ...doctorReport,
        rows: [...doctorReport.rows, doctorReport.rows[0]],
      }).ok,
      false,
    );
    strictEqual(
      decodeDockerDoctorReport({
        ...doctorReport,
        rows: [{ ...doctorReport.rows[0], command: "docker pull eden:latest" }],
      }).ok,
      false,
    );
  });
});

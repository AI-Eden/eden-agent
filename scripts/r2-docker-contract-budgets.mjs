import { createHash } from "node:crypto";

import { repositoryCheckActionFixture } from "../packages/contracts/test/repository-check-fixture.ts";

const kibibyte = 1024;
const mebibyte = 1024 * kibibyte;
const sha256 = (character) => `sha256:${character.repeat(64)}`;
const hashBytes = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export const r2DockerContractBudgets = Object.freeze({
  actionRecordFillRatio: 0.8,
  arguments: 32,
  argumentBytes: 4 * kibibyte,
  catalogBytes: 16 * kibibyte,
  catalogEntries: 16,
  fileBytes: 1 * mebibyte,
  files: 64,
  internalResultBytes: 64 * kibibyte,
  journalRecordBytes: 64 * kibibyte,
  journalRunBytes: 1 * mebibyte,
  manifestBytes: 24 * kibibyte,
  snapshotBytes: 8 * mebibyte,
  stderrBytes: 16 * kibibyte,
  stdoutBytes: 16 * kibibyte,
});

function maximumManifest() {
  const files = Array.from({ length: r2DockerContractBudgets.files }, (_, index) => ({
    byteLength: 128 * kibibyte,
    executable: index % 2 === 0,
    path: `src/${index.toString().padStart(2, "0")}-${"p".repeat(225)}.js`,
    sha256: sha256("a"),
  }));
  const body = {
    byteLength: r2DockerContractBudgets.snapshotBytes,
    fileCount: r2DockerContractBudgets.files,
    files,
    manifestVersion: 1,
  };
  return {
    ...body,
    digest: hashBytes(`eden.repository-snapshot.v1\0${canonicalJson(body)}`),
  };
}

function maximumProcess() {
  return {
    arguments: Array.from(
      { length: r2DockerContractBudgets.arguments },
      (_, index) => `arg-${index}-${"x".repeat(116)}`,
    ),
    cwd: ".",
    executable: "/usr/local/bin/node",
  };
}

export function createDockerSlice0Fixtures() {
  const manifest = maximumManifest();
  const process = maximumProcess();
  const catalog = {
    checks: [{ name: "test", process }],
    version: 1,
  };
  const action = {
    ...repositoryCheckActionFixture,
    actionId: "action-r2-docker-budget",
    lifetime: { kind: "single_use_proposal_revision", revision: 1 },
    operation: {
      catalog: {
        byteLength: Buffer.byteLength(JSON.stringify(catalog), "utf8"),
        dirty: true,
        head: "c".repeat(40),
        path: ".eden/checks/catalog.json",
        schemaVersion: 1,
        sha256: sha256("d"),
      },
      checkName: "test",
      process,
      type: "repository_check_v1",
    },
    proposalRevision: 1,
    repositorySnapshot: manifest,
    runId: "run-r2-docker-budget",
    staging: { identity: sha256("9") },
    workspace: {
      canonicalRootHash: sha256("2"),
      workspaceId: "workspace-r2-docker-budget",
    },
  };
  const result = {
    actionId: action.actionId,
    checkName: "test",
    cleanup: {
      actionId: action.actionId,
      cleanupVersion: 1,
      completedAt: "2026-07-30T00:00:31.000Z",
      container: { id: "a".repeat(64), state: "removed" },
      effectId: "effect-r2-docker-budget",
      error: null,
      receiptId: "receipt-r2-docker-budget",
      staging: { identity: action.staging.identity, state: "removed" },
      status: "complete",
    },
    effectId: "effect-r2-docker-budget",
    endedAt: "2026-07-30T00:00:30.000Z",
    exitCode: 0,
    imageIndexDigest: action.toolchain.imageIndexDigest,
    inputManifestDigest: manifest.digest,
    outcome: "passed",
    platformManifestDigest: action.toolchain.platformManifestDigest,
    profileRevision: action.profile.profileRevision,
    receiptId: "receipt-r2-docker-budget",
    resultVersion: 1,
    startedAt: "2026-07-30T00:00:00.000Z",
    stderr: Buffer.alloc(r2DockerContractBudgets.stderrBytes, "e").toString("base64"),
    stderrByteLength: r2DockerContractBudgets.stderrBytes,
    stderrEncoding: "base64",
    stderrSha256: hashBytes(Buffer.alloc(r2DockerContractBudgets.stderrBytes, "e")),
    stdout: Buffer.alloc(r2DockerContractBudgets.stdoutBytes, "o").toString("base64"),
    stdoutByteLength: r2DockerContractBudgets.stdoutBytes,
    stdoutEncoding: "base64",
    stdoutSha256: hashBytes(Buffer.alloc(r2DockerContractBudgets.stdoutBytes, "o")),
    wrapperReason: "process_exited",
  };
  return { action, catalog, manifest, result };
}

export function journalRecordBytes(type, payload, sequence = 0) {
  return Buffer.byteLength(
    `${JSON.stringify({
      causationId: null,
      correlationId: "run-r2-docker-budget",
      eventId: `event-r2-docker-${sequence}`,
      journalVersion: 1,
      payload,
      recordedAt: "2026-07-30T00:00:00.000Z",
      redaction: { fields: [], status: "not-required" },
      runId: "run-r2-docker-budget",
      sequence,
      type,
    })}\n`,
    "utf8",
  );
}

export function measureDockerSlice0Fixtures() {
  const fixtures = createDockerSlice0Fixtures();
  const argumentBytes = fixtures.catalog.checks[0].process.arguments.reduce(
    (total, argument) => total + Buffer.byteLength(argument, "utf8"),
    0,
  );
  const actionRecord = journalRecordBytes("repository.check.proposed", fixtures.action, 0);
  const resultRecord = journalRecordBytes("repository.check.completed", fixtures.result, 1);
  const smallLifecycleRecord = journalRecordBytes(
    "repository.check.lifecycle",
    {
      actionId: fixtures.action.actionId,
      containerId: "a".repeat(64),
      effectId: fixtures.result.effectId,
      state: "running",
    },
    2,
  );
  return {
    actionRecord,
    argumentBytes,
    catalog: Buffer.byteLength(JSON.stringify(fixtures.catalog), "utf8"),
    manifest: Buffer.byteLength(JSON.stringify(fixtures.manifest), "utf8"),
    resultRecord,
    run:
      actionRecord +
      resultRecord +
      16 * smallLifecycleRecord +
      journalRecordBytes("run.completed", { outcome: "completed" }, 18),
  };
}

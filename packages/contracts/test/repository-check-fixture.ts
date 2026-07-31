import { createHash } from "node:crypto";

import type { RepositoryCheckActionEnvelopeV1 } from "../src/index.ts";

const hash = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const manifestBody = {
  byteLength: 210,
  fileCount: 3,
  files: [
    {
      byteLength: 139,
      executable: false,
      path: ".eden/checks/catalog.json",
      sha256: hash("catalog"),
    },
    {
      byteLength: 42,
      executable: false,
      path: "package.json",
      sha256: hash("package"),
    },
    {
      byteLength: 29,
      executable: false,
      path: "test/failing.test.js",
      sha256: hash("test"),
    },
  ],
  manifestVersion: 1 as const,
};

const snapshotManifest = {
  ...manifestBody,
  digest: `sha256:${createHash("sha256")
    .update("eden.repository-snapshot.v1\0")
    .update(canonicalJson(manifestBody))
    .digest("hex")}`,
};

const effectId = "effect-repository-check-1";
const stagingIdentity = `sha256:${createHash("sha256")
  .update("eden.repository-check-staging.v1\0")
  .update(
    canonicalJson({
      effectId,
      inputManifestDigest: snapshotManifest.digest,
      runId: "run-repository-check-1",
    }),
  )
  .digest("hex")}`;

export const repositoryCheckActionFixture = {
  actionId: "action-repository-check-1",
  actionVersion: 1,
  authority: {
    environmentClass: "closed_non_secret",
    executionMode: "docker_container",
    isolation: "linux_container",
    network: "none",
    policyVersion: 1,
    ruleSetRevision: "r2-docker-repository-check-v1",
  },
  baseSnapshots: [],
  budgets: {
    cpuCount: 1,
    fileDescriptors: 256,
    fileSizeBytes: 16_777_216,
    internalResultBytes: 65_536,
    memoryBytes: 268_435_456,
    memorySwapBytes: 268_435_456,
    pids: 64,
    snapshotFileBytes: 1_048_576,
    snapshotFiles: 64,
    stagingBytes: 8_388_608,
    stderrBytes: 16_384,
    stopGraceMs: 2_000,
    stdoutBytes: 16_384,
    timeoutMs: 30_000,
    tmpfsBytes: 16_777_216,
  },
  cwd: ".",
  dockerCompatibility: {
    client: { apiVersion: "1.51", version: "29.6.2" },
    compatibilityVersion: 1,
    context: {
      endpointSha256: hash("unix:///tmp/eden-r2-goal/docker.sock"),
      name: "eden-r2-goal-pbfbmw",
    },
    daemon: {
      apiVersion: "1.51",
      architecture: "amd64",
      minimumApiVersion: "1.24",
      osType: "linux",
      version: "29.6.2",
    },
    features: {
      cgroupNamespace: true,
      cpuCfsPeriod: true,
      cpuCfsQuota: true,
      memoryLimit: true,
      pidsLimit: true,
      seccomp: true,
      swapLimit: true,
      userNamespace: true,
    },
    image: {
      architecture: "amd64",
      configDigest: "sha256:f175c02a2a6d4012c1d0852c82b03893810ee91803244a1699046d2eee7cc443",
      indexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
      manifestDigest: "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
      manifestEvidence: "frozen_config_mapping",
      operatingSystem: "linux",
    },
  },
  kind: "repository_check_v1",
  lifetime: { kind: "single_use_proposal_revision", revision: 7 },
  mounts: {
    control: {
      access: "read_only",
      containerPath: "/run/eden/request.json",
      source: "closed_process_request",
    },
    result: {
      access: "read_write",
      containerPath: "/run/eden/result.json",
      source: "result_file",
    },
    temporary: {
      access: "read_write_tmpfs",
      containerPath: "/tmp",
      source: "tmpfs",
    },
    workspace: {
      access: "read_only",
      containerPath: "/workspace",
      source: "repository_snapshot",
    },
  },
  operation: {
    catalog: {
      byteLength: 139,
      dirty: false,
      head: "7".repeat(40),
      path: ".eden/checks/catalog.json",
      schemaVersion: 1,
      sha256: hash("catalog"),
    },
    checkName: "test",
    process: {
      arguments: ["--test", "test/failing.test.js"],
      cwd: ".",
      executable: "/usr/local/bin/node",
    },
    type: "repository_check_v1",
  },
  profile: {
    autoRemove: false,
    capabilities: "drop_all",
    environment: {
      CI: "1",
      HOME: "/tmp/eden-home",
      LANG: "C.UTF-8",
      PATH: "/usr/local/bin:/usr/bin:/bin",
    },
    hostNamespaces: "none",
    linuxUser: 65_532,
    network: "none",
    noNewPrivileges: true,
    profileRevision: "r2-docker-profile-v1",
    restart: "disabled",
    rootFilesystem: "read_only",
    seccomp: "docker_default",
    sockets: "none",
    workspaceMount: "read_only",
  },
  proposalRevision: 7,
  repositorySnapshot: snapshotManifest,
  runId: "run-repository-check-1",
  scope: { capability: "repository.execute.named_check", paths: ["."] },
  staging: { identity: stagingIdentity },
  toolchain: {
    imageIndexDigest: "sha256:8421694e36135472ce9c40011ca9b8be22f1f2af643493d8fe6cb47954684d4f",
    nodeMajor: 24,
    platformManifestDigest:
      "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
    platforms: [
      {
        manifestDigest: "sha256:0157ea0bfdc08aaa026898d23edaff9336359024f25c49265a5276cb3c611cb2",
        platform: "linux/amd64",
      },
      {
        manifestDigest: "sha256:7977eb382ee08c4b3e2f6c32dbf47dec5fa38b2160bc46a3faf742171823d230",
        platform: "linux/arm64",
      },
    ],
    profileRevision: "r2-docker-profile-v1",
    requestedPlatform: "linux/amd64",
    toolchainId: "eden-node24-check-v1",
    wrapperContentHash: "sha256:0c669fe522a14c9afce051d98f57e373f9bb2b7fb0b5ef6fb2241b472a05a0c3",
    wrapperProtocolVersion: 1,
  },
  workspace: {
    canonicalRootHash: hash("workspace"),
    workspaceId: "workspace-repository-check-1",
  },
} satisfies RepositoryCheckActionEnvelopeV1;

export const repositoryCheckInternalResultFixture = {
  actionId: repositoryCheckActionFixture.actionId,
  checkName: "test",
  effectId,
  endedAt: "2026-08-01T03:00:01.000Z",
  exitCode: 1,
  inputManifestDigest: repositoryCheckActionFixture.repositorySnapshot.digest,
  outcome: "failed",
  resultVersion: 1,
  startedAt: "2026-08-01T03:00:00.000Z",
  stderr: "",
  stderrByteLength: 0,
  stderrEncoding: "base64",
  stderrSha256: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  stdout: "",
  stdoutByteLength: 0,
  stdoutEncoding: "base64",
  stdoutSha256: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  wrapperProtocolVersion: 1,
  wrapperReason: "process_exited",
} as const;

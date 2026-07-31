import { deepStrictEqual, strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  decodeActionEnvelope,
  decodeRepositorySnapshotManifest,
  decodeRepositoryToolchainManifest,
} from "../src/index.ts";

const sha256 = (character: string) => `sha256:${character.repeat(64)}`;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function snapshotDigest(snapshot: object): string {
  return `sha256:${createHash("sha256")
    .update("eden.repository-snapshot.v1\0")
    .update(canonicalJson(snapshot))
    .digest("hex")}`;
}

const snapshotManifestBody = {
  byteLength: 21,
  fileCount: 2,
  files: [
    {
      byteLength: 9,
      executable: false,
      path: "package.json",
      sha256: sha256("1"),
    },
    {
      byteLength: 12,
      executable: true,
      path: "scripts/check.mjs",
      sha256: sha256("2"),
    },
  ],
  manifestVersion: 1 as const,
};
const snapshotManifest = {
  ...snapshotManifestBody,
  digest: snapshotDigest(snapshotManifestBody),
};

const toolchainManifest = {
  imageIndexDigest: sha256("3"),
  manifestVersion: 1,
  nodeMajor: 24,
  paths: {
    control: "/run/eden/request.json",
    home: "/tmp/eden-home",
    nodeExecutable: "/usr/local/bin/node",
    result: "/run/eden/result.json",
    temporary: "/tmp",
    workspace: "/workspace",
    wrapper: "/opt/eden/wrapper.mjs",
  },
  platforms: [
    { manifestDigest: sha256("4"), platform: "linux/amd64" },
    { manifestDigest: sha256("5"), platform: "linux/arm64" },
  ],
  profileRevision: "r2-docker-profile-v1",
  toolchainId: "eden-node24-check-v1",
  wrapperContentHash: sha256("6"),
  wrapperProtocolVersion: 1,
};

const repositoryCheckAction = {
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
    context: { endpointSha256: sha256("b"), name: "eden-safe" },
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
      configDigest: sha256("c"),
      indexDigest: toolchainManifest.imageIndexDigest,
      manifestDigest: sha256("4"),
      manifestEvidence: "local_descriptor",
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
      dirty: true,
      head: "7".repeat(40),
      path: ".eden/checks/catalog.json",
      schemaVersion: 1,
      sha256: sha256("8"),
    },
    checkName: "test",
    process: {
      arguments: ["--test"],
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
    linuxUser: 10_001,
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
  staging: { identity: sha256("9") },
  toolchain: {
    imageIndexDigest: toolchainManifest.imageIndexDigest,
    nodeMajor: 24,
    platformManifestDigest: sha256("4"),
    platforms: toolchainManifest.platforms,
    profileRevision: toolchainManifest.profileRevision,
    requestedPlatform: "linux/amd64",
    toolchainId: "eden-node24-check-v1",
    wrapperContentHash: toolchainManifest.wrapperContentHash,
    wrapperProtocolVersion: 1,
  },
  workspace: {
    canonicalRootHash: sha256("a"),
    workspaceId: "workspace-repository-check-1",
  },
};

describe("repository-check snapshot, toolchain, and action contracts", () => {
  it("accepts one independently hashed, sorted snapshot manifest", () => {
    deepStrictEqual(decodeRepositorySnapshotManifest(snapshotManifest), {
      ok: true,
      value: snapshotManifest,
    });
  });

  it("rejects manifest order, counts, digest, paths, and unknown fields", () => {
    strictEqual(
      decodeRepositorySnapshotManifest({
        ...snapshotManifest,
        files: [...snapshotManifest.files].reverse(),
      }).ok,
      false,
    );
    strictEqual(decodeRepositorySnapshotManifest({ ...snapshotManifest, fileCount: 1 }).ok, false);
    strictEqual(
      decodeRepositorySnapshotManifest({ ...snapshotManifest, byteLength: 20 }).ok,
      false,
    );
    strictEqual(
      decodeRepositorySnapshotManifest({ ...snapshotManifest, digest: sha256("f") }).ok,
      false,
    );
    strictEqual(
      decodeRepositorySnapshotManifest({
        ...snapshotManifest,
        files: [{ ...snapshotManifest.files[0], path: "../secret" }],
      }).ok,
      false,
    );
    strictEqual(
      decodeRepositorySnapshotManifest({ ...snapshotManifest, truncated: true }).ok,
      false,
    );
  });

  it("accepts the pinned two-platform toolchain manifest and rejects mutable or mismatched shapes", () => {
    deepStrictEqual(decodeRepositoryToolchainManifest(toolchainManifest), {
      ok: true,
      value: toolchainManifest,
    });
    strictEqual(
      decodeRepositoryToolchainManifest({ ...toolchainManifest, image: "eden:latest" }).ok,
      false,
    );
    strictEqual(
      decodeRepositoryToolchainManifest({
        ...toolchainManifest,
        platforms: [toolchainManifest.platforms[0]],
      }).ok,
      false,
    );
    strictEqual(
      decodeRepositoryToolchainManifest({
        ...toolchainManifest,
        profileRevision: "repository-controlled",
      }).ok,
      false,
    );
    strictEqual(
      decodeRepositoryToolchainManifest({
        ...toolchainManifest,
        paths: { ...toolchainManifest.paths, nodeExecutable: "/nodejs/bin/node" },
      }).ok,
      false,
    );
    strictEqual(
      decodeRepositoryToolchainManifest({
        ...toolchainManifest,
        paths: { ...toolchainManifest.paths, wrapper: "/tmp/wrapper.mjs" },
      }).ok,
      false,
    );
  });

  it("accepts one exact repository_check_v1 action and rejects authority widening", () => {
    deepStrictEqual(decodeActionEnvelope(repositoryCheckAction), {
      ok: true,
      value: repositoryCheckAction,
    });
    strictEqual(
      decodeActionEnvelope({
        ...repositoryCheckAction,
        authority: { ...repositoryCheckAction.authority, network: "bridge" },
      }).ok,
      false,
    );
    strictEqual(
      decodeActionEnvelope({
        ...repositoryCheckAction,
        budgets: { ...repositoryCheckAction.budgets, timeoutMs: 60_000 },
      }).ok,
      false,
    );
    strictEqual(
      decodeActionEnvelope({
        ...repositoryCheckAction,
        profile: {
          ...repositoryCheckAction.profile,
          environment: { ...repositoryCheckAction.profile.environment, TOKEN: "secret" },
        },
      }).ok,
      false,
    );
    strictEqual(
      decodeActionEnvelope({
        ...repositoryCheckAction,
        toolchain: {
          ...repositoryCheckAction.toolchain,
          platformManifestDigest: toolchainManifest.platforms[1]?.manifestDigest,
        },
      }).ok,
      false,
    );
    strictEqual(
      decodeActionEnvelope({
        ...repositoryCheckAction,
        dockerCompatibility: {
          ...repositoryCheckAction.dockerCompatibility,
          context: {
            ...repositoryCheckAction.dockerCompatibility.context,
            endpoint: "unix:///var/run/docker.sock",
          },
        },
      }).ok,
      false,
    );
    strictEqual(
      decodeActionEnvelope({
        ...repositoryCheckAction,
        dockerCompatibility: {
          ...repositoryCheckAction.dockerCompatibility,
          image: {
            ...repositoryCheckAction.dockerCompatibility.image,
            manifestDigest: sha256("5"),
          },
        },
      }).ok,
      false,
    );
  });
});

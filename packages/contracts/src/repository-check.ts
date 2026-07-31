import { createHash } from "node:crypto";

import Type from "typebox";
import Schema from "typebox/schema";

import type { DecodeResult, ProductError } from "./protocol.ts";

const closed = { additionalProperties: false } as const;
const utf8 = new TextEncoder();

function utf8Bytes(value: string): number {
  return utf8.encode(value).byteLength;
}

function isNormalizedContainerPath(value: string): boolean {
  if (
    !value.startsWith("/") ||
    value === "/" ||
    value.endsWith("/") ||
    value.includes("\\") ||
    value.includes("\0") ||
    utf8Bytes(value) > 256
  ) {
    return false;
  }
  return value
    .slice(1)
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isNormalizedRepositoryDirectory(value: string): boolean {
  if (value === ".") return true;
  if (
    value.length === 0 ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\") ||
    value.includes("\0") ||
    utf8Bytes(value) > 256
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

const sha256Schema = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });

export const RepositoryCheckProcessSchema = Type.Refine(
  Type.Object(
    {
      arguments: Type.Array(Type.String({ maxLength: 256 }), { maxItems: 32 }),
      cwd: Type.String({ maxLength: 256, minLength: 1 }),
      executable: Type.String({ maxLength: 256, minLength: 1 }),
    },
    closed,
  ),
  (process) =>
    isNormalizedContainerPath(process.executable) &&
    isNormalizedRepositoryDirectory(process.cwd) &&
    process.arguments.every((argument) => !argument.includes("\0") && utf8Bytes(argument) <= 256) &&
    process.arguments.reduce((total, argument) => total + utf8Bytes(argument), 0) <= 4_096,
);
export type RepositoryCheckProcess = Type.Static<typeof RepositoryCheckProcessSchema>;

const RepositoryCheckCatalogEntrySchema = Type.Object(
  {
    name: Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }),
    process: RepositoryCheckProcessSchema,
  },
  closed,
);
export type RepositoryCheckCatalogEntry = Type.Static<typeof RepositoryCheckCatalogEntrySchema>;

export const RepositoryCheckCatalogV1Schema = Type.Refine(
  Type.Object(
    {
      checks: Type.Array(RepositoryCheckCatalogEntrySchema, { maxItems: 16, minItems: 1 }),
      version: Type.Literal(1),
    },
    closed,
  ),
  (catalog) =>
    new Set(catalog.checks.map((check) => check.name)).size === catalog.checks.length &&
    utf8Bytes(JSON.stringify(catalog)) <= 16_384,
);
export type RepositoryCheckCatalogV1 = Type.Static<typeof RepositoryCheckCatalogV1Schema>;

const catalogValidator = Schema.Compile(RepositoryCheckCatalogV1Schema);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    );
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function repositorySnapshotDigest(value: object): string {
  return `sha256:${createHash("sha256")
    .update("eden.repository-snapshot.v1\0")
    .update(canonicalJson(value))
    .digest("hex")}`;
}

function isSnapshotPath(value: string): boolean {
  return value !== "." && isNormalizedRepositoryDirectory(value);
}

const RepositorySnapshotPathSchema = Type.Refine(
  Type.String({ maxLength: 4_096, minLength: 1 }),
  isSnapshotPath,
);

export const RepositorySnapshotFileSchema = Type.Refine(
  Type.Object(
    {
      byteLength: Type.Integer({ maximum: 1_048_576, minimum: 0 }),
      executable: Type.Boolean(),
      path: RepositorySnapshotPathSchema,
      sha256: sha256Schema,
    },
    closed,
  ),
  () => true,
);
export type RepositorySnapshotFile = Type.Static<typeof RepositorySnapshotFileSchema>;

const RepositorySnapshotManifestBodySchema = Type.Object(
  {
    byteLength: Type.Integer({ maximum: 8_388_608, minimum: 0 }),
    fileCount: Type.Integer({ maximum: 64, minimum: 1 }),
    files: Type.Array(RepositorySnapshotFileSchema, { maxItems: 64, minItems: 1 }),
    manifestVersion: Type.Literal(1),
  },
  closed,
);

export const RepositorySnapshotManifestV1Schema = Type.Refine(
  Type.Object(
    {
      ...RepositorySnapshotManifestBodySchema.properties,
      digest: sha256Schema,
    },
    closed,
  ),
  (manifest) => {
    const { digest, ...body } = manifest;
    const paths = manifest.files.map((file) => file.path);
    return (
      manifest.fileCount === manifest.files.length &&
      manifest.byteLength === manifest.files.reduce((total, file) => total + file.byteLength, 0) &&
      paths.every((path, index) => index === 0 || (paths[index - 1] ?? "") < path) &&
      utf8Bytes(canonicalJson(manifest)) <= 24_576 &&
      digest === repositorySnapshotDigest(body)
    );
  },
);
export type RepositorySnapshotManifestV1 = Type.Static<typeof RepositorySnapshotManifestV1Schema>;

const RepositoryContainerPathsSchema = Type.Refine(
  Type.Object(
    {
      control: Type.String({ maxLength: 256, minLength: 1 }),
      home: Type.String({ maxLength: 256, minLength: 1 }),
      nodeExecutable: Type.String({ maxLength: 256, minLength: 1 }),
      result: Type.String({ maxLength: 256, minLength: 1 }),
      temporary: Type.String({ maxLength: 256, minLength: 1 }),
      workspace: Type.String({ maxLength: 256, minLength: 1 }),
      wrapper: Type.String({ maxLength: 256, minLength: 1 }),
    },
    closed,
  ),
  (paths) =>
    Object.values(paths).every(isNormalizedContainerPath) &&
    paths.workspace === "/workspace" &&
    paths.temporary === "/tmp" &&
    paths.home === "/tmp/eden-home" &&
    paths.control === "/run/eden/request.json" &&
    paths.result === "/run/eden/result.json" &&
    paths.nodeExecutable === "/usr/local/bin/node" &&
    paths.wrapper === "/opt/eden/wrapper.mjs",
);

export const RepositoryToolchainPlatformSchema = Type.Object(
  {
    manifestDigest: sha256Schema,
    platform: Type.Union([Type.Literal("linux/amd64"), Type.Literal("linux/arm64")]),
  },
  closed,
);

export const RepositoryToolchainManifestV1Schema = Type.Refine(
  Type.Object(
    {
      imageIndexDigest: sha256Schema,
      manifestVersion: Type.Literal(1),
      nodeMajor: Type.Literal(24),
      paths: RepositoryContainerPathsSchema,
      platforms: Type.Array(RepositoryToolchainPlatformSchema, { maxItems: 2, minItems: 2 }),
      profileRevision: Type.Literal("r2-docker-profile-v1"),
      toolchainId: Type.Literal("eden-node24-check-v1"),
      wrapperContentHash: sha256Schema,
      wrapperProtocolVersion: Type.Literal(1),
    },
    closed,
  ),
  (manifest) =>
    manifest.platforms[0]?.platform === "linux/amd64" &&
    manifest.platforms[1]?.platform === "linux/arm64" &&
    manifest.platforms[0].manifestDigest !== manifest.platforms[1].manifestDigest,
);
export type RepositoryToolchainManifestV1 = Type.Static<typeof RepositoryToolchainManifestV1Schema>;

export const RepositoryCheckOperationSchema = Type.Object(
  {
    catalog: Type.Object(
      {
        byteLength: Type.Integer({ maximum: 16_384, minimum: 1 }),
        dirty: Type.Boolean(),
        head: Type.String({ pattern: "^[a-f0-9]{40,64}$" }),
        path: Type.Literal(".eden/checks/catalog.json"),
        schemaVersion: Type.Literal(1),
        sha256: sha256Schema,
      },
      closed,
    ),
    checkName: Type.String({ pattern: "^[a-z][a-z0-9-]{0,63}$" }),
    process: RepositoryCheckProcessSchema,
    type: Type.Literal("repository_check_v1"),
  },
  closed,
);
export type RepositoryCheckOperation = Type.Static<typeof RepositoryCheckOperationSchema>;

export const RepositoryCheckToolchainIdentitySchema = Type.Refine(
  Type.Object(
    {
      imageIndexDigest: sha256Schema,
      nodeMajor: Type.Literal(24),
      platformManifestDigest: sha256Schema,
      platforms: Type.Array(RepositoryToolchainPlatformSchema, { maxItems: 2, minItems: 2 }),
      profileRevision: Type.Literal("r2-docker-profile-v1"),
      requestedPlatform: Type.Union([Type.Literal("linux/amd64"), Type.Literal("linux/arm64")]),
      toolchainId: Type.Literal("eden-node24-check-v1"),
      wrapperContentHash: sha256Schema,
      wrapperProtocolVersion: Type.Literal(1),
    },
    closed,
  ),
  (identity) =>
    identity.platforms[0]?.platform === "linux/amd64" &&
    identity.platforms[1]?.platform === "linux/arm64" &&
    identity.platforms.find((row) => row.platform === identity.requestedPlatform)
      ?.manifestDigest === identity.platformManifestDigest,
);

const dockerVersionSchema = Type.String({
  maxLength: 64,
  minLength: 1,
  pattern: "^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$",
});
const dockerApiVersionSchema = Type.String({ pattern: "^[0-9]+\\.[0-9]+$" });
const dockerArchitectureSchema = Type.Union([Type.Literal("amd64"), Type.Literal("arm64")]);

export const RepositoryCheckDockerCompatibilityV1Schema = Type.Refine(
  Type.Object(
    {
      client: Type.Object(
        {
          apiVersion: dockerApiVersionSchema,
          version: dockerVersionSchema,
        },
        closed,
      ),
      compatibilityVersion: Type.Literal(1),
      context: Type.Object(
        {
          endpointSha256: sha256Schema,
          name: Type.String({
            maxLength: 128,
            minLength: 1,
            pattern: "^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$",
          }),
        },
        closed,
      ),
      daemon: Type.Object(
        {
          apiVersion: dockerApiVersionSchema,
          architecture: dockerArchitectureSchema,
          minimumApiVersion: dockerApiVersionSchema,
          osType: Type.Literal("linux"),
          version: dockerVersionSchema,
        },
        closed,
      ),
      features: Type.Object(
        {
          cgroupNamespace: Type.Literal(true),
          cpuCfsPeriod: Type.Literal(true),
          cpuCfsQuota: Type.Literal(true),
          memoryLimit: Type.Literal(true),
          pidsLimit: Type.Literal(true),
          seccomp: Type.Literal(true),
          swapLimit: Type.Literal(true),
          userNamespace: Type.Literal(true),
        },
        closed,
      ),
      image: Type.Object(
        {
          architecture: dockerArchitectureSchema,
          configDigest: sha256Schema,
          indexDigest: sha256Schema,
          manifestDigest: sha256Schema,
          manifestEvidence: Type.Union([
            Type.Literal("frozen_config_mapping"),
            Type.Literal("local_descriptor"),
          ]),
          operatingSystem: Type.Literal("linux"),
        },
        closed,
      ),
    },
    closed,
  ),
  (compatibility) => compatibility.daemon.architecture === compatibility.image.architecture,
);
export type RepositoryCheckDockerCompatibilityV1 = Type.Static<
  typeof RepositoryCheckDockerCompatibilityV1Schema
>;

export const RepositoryCheckProfileSchema = Type.Object(
  {
    autoRemove: Type.Literal(false),
    capabilities: Type.Literal("drop_all"),
    environment: Type.Object(
      {
        CI: Type.Literal("1"),
        HOME: Type.Literal("/tmp/eden-home"),
        LANG: Type.Literal("C.UTF-8"),
        PATH: Type.Literal("/usr/local/bin:/usr/bin:/bin"),
      },
      closed,
    ),
    hostNamespaces: Type.Literal("none"),
    linuxUser: Type.Integer({ maximum: 2_147_483_647, minimum: 1 }),
    network: Type.Literal("none"),
    noNewPrivileges: Type.Literal(true),
    profileRevision: Type.Literal("r2-docker-profile-v1"),
    restart: Type.Literal("disabled"),
    rootFilesystem: Type.Literal("read_only"),
    seccomp: Type.Literal("docker_default"),
    sockets: Type.Literal("none"),
    workspaceMount: Type.Literal("read_only"),
  },
  closed,
);

export const RepositoryCheckBudgetsSchema = Type.Object(
  {
    cpuCount: Type.Literal(1),
    fileDescriptors: Type.Literal(256),
    fileSizeBytes: Type.Literal(16_777_216),
    internalResultBytes: Type.Literal(65_536),
    memoryBytes: Type.Literal(268_435_456),
    memorySwapBytes: Type.Literal(268_435_456),
    pids: Type.Literal(64),
    snapshotFileBytes: Type.Literal(1_048_576),
    snapshotFiles: Type.Literal(64),
    stagingBytes: Type.Literal(8_388_608),
    stderrBytes: Type.Literal(16_384),
    stopGraceMs: Type.Literal(2_000),
    stdoutBytes: Type.Literal(16_384),
    timeoutMs: Type.Literal(30_000),
    tmpfsBytes: Type.Literal(16_777_216),
  },
  closed,
);

export const RepositoryCheckMountsSchema = Type.Object(
  {
    control: Type.Object(
      {
        access: Type.Literal("read_only"),
        containerPath: Type.Literal("/run/eden/request.json"),
        source: Type.Literal("closed_process_request"),
      },
      closed,
    ),
    result: Type.Object(
      {
        access: Type.Literal("read_write"),
        containerPath: Type.Literal("/run/eden/result.json"),
        source: Type.Literal("result_file"),
      },
      closed,
    ),
    temporary: Type.Object(
      {
        access: Type.Literal("read_write_tmpfs"),
        containerPath: Type.Literal("/tmp"),
        source: Type.Literal("tmpfs"),
      },
      closed,
    ),
    workspace: Type.Object(
      {
        access: Type.Literal("read_only"),
        containerPath: Type.Literal("/workspace"),
        source: Type.Literal("repository_snapshot"),
      },
      closed,
    ),
  },
  closed,
);

export const RepositoryCheckStagingSchema = Type.Object({ identity: sha256Schema }, closed);

function invalid(kind: string): ProductError {
  return {
    code: `invalid_${kind}`,
    message: `The ${kind.replaceAll("_", " ")} does not match the closed version-one contract.`,
    recoverability: "reconfigure",
    suggestedActions: ["Use the exact application-owned repository-check contract."],
  };
}

export function decodeRepositoryCheckCatalog(
  value: unknown,
): DecodeResult<RepositoryCheckCatalogV1> {
  return catalogValidator.Check(value)
    ? { ok: true, value }
    : { error: invalid("repository_check_catalog"), ok: false };
}

const snapshotValidator = Schema.Compile(RepositorySnapshotManifestV1Schema);
const toolchainValidator = Schema.Compile(RepositoryToolchainManifestV1Schema);

export function decodeRepositorySnapshotManifest(
  value: unknown,
): DecodeResult<RepositorySnapshotManifestV1> {
  return snapshotValidator.Check(value)
    ? { ok: true, value }
    : { error: invalid("repository_snapshot_manifest"), ok: false };
}

export function decodeRepositoryToolchainManifest(
  value: unknown,
): DecodeResult<RepositoryToolchainManifestV1> {
  return toolchainValidator.Check(value)
    ? { ok: true, value }
    : { error: invalid("repository_toolchain_manifest"), ok: false };
}

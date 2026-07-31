import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve as resolvePath } from "node:path";

import {
  decodeRepositoryCheckCatalog,
  decodeRepositorySnapshotManifest,
  type RepositoryCheckProcess,
  type RepositorySnapshotFile,
  type RepositorySnapshotManifestV1,
} from "@eden/contracts";

import { type NativeProcessPort, NativeProcessRunner } from "./native-process.ts";

const catalogPath = ".eden/checks/catalog.json";
const gitTimeoutMs = 5_000;
const gitOutputBytes = 524_288;
const fatalUtf8 = new TextDecoder("utf-8", { fatal: true });

type SnapshotErrorCode =
  | "catalog_invalid"
  | "catalog_invalid_utf8"
  | "catalog_missing_check"
  | "catalog_stale"
  | "catalog_untracked"
  | "catalog_unsafe_file"
  | "git_head_invalid"
  | "git_unavailable"
  | "snapshot_budget_exceeded"
  | "snapshot_invalid_manifest"
  | "snapshot_path_invalid"
  | "snapshot_stale"
  | "snapshot_unsupported_entry"
  | "staging_identity_invalid"
  | "staging_path_unsafe"
  | "staging_unavailable";

export class RepositoryCheckSnapshotError extends Error {
  readonly code: SnapshotErrorCode;

  constructor(code: SnapshotErrorCode, message: string) {
    super(message);
    this.name = "RepositoryCheckSnapshotError";
    this.code = code;
  }
}

export type RepositoryCheckSelection = {
  readonly catalog: {
    readonly byteLength: number;
    readonly dirty: boolean;
    readonly head: string;
    readonly path: typeof catalogPath;
    readonly schemaVersion: 1;
    readonly sha256: string;
  };
  readonly checkName: string;
  readonly process: RepositoryCheckProcess;
};

export type StagedRepositorySnapshot = {
  readonly cleanup: () => Promise<void>;
  readonly directory: string;
  readonly manifest: RepositorySnapshotManifestV1;
  readonly validate: () => Promise<boolean>;
};

export type CapturedRepositorySnapshot = {
  readonly manifest: RepositorySnapshotManifestV1;
};

export type RepositoryCheckSnapshotServiceOptions = {
  readonly gitExecutable?: string;
  readonly hooks?: {
    readonly afterSourceRead?: ((path: string) => Promise<void>) | undefined;
  };
  readonly nativeProcess?: NativeProcessPort;
  readonly stateDirectory: string;
  readonly workspaceRoot: string;
};

export async function reopenRepositoryCheckSnapshot(input: {
  readonly effectId: string;
  readonly manifest: RepositorySnapshotManifestV1;
  readonly stateDirectory: string;
}): Promise<StagedRepositorySnapshot> {
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/u.test(input.effectId)) {
    throw new RepositoryCheckSnapshotError(
      "staging_identity_invalid",
      "The effect identity is not safe for staging.",
    );
  }
  const stateDirectory = resolvePath(input.stateDirectory);
  const directory = join(stateDirectory, "repository-check-staging", input.effectId);
  return {
    cleanup: async () => removeStaging(directory),
    directory,
    manifest: input.manifest,
    validate: () => validateStagedDirectory(directory, input.manifest),
  };
}

type TrackedEntry = {
  readonly executable: boolean;
  readonly path: string;
};

function hash(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

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

function manifestDigest(body: object): string {
  return `sha256:${createHash("sha256")
    .update("eden.repository-snapshot.v1\0")
    .update(canonicalJson(body))
    .digest("hex")}`;
}

function isNormalizedPath(path: string): boolean {
  return (
    path !== "." &&
    path.length > 0 &&
    path.length <= 4_096 &&
    !isAbsolute(path) &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !/^[A-Za-z]:/u.test(path) &&
    path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function sameIdentity(
  left: Awaited<ReturnType<typeof lstat>>,
  right: Awaited<ReturnType<typeof lstat>>,
): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    right.nlink === 1
  );
}

async function readSafeFile(
  path: string,
  unsafeCode: "catalog_unsafe_file" | "snapshot_unsupported_entry",
  staleCode: "catalog_stale" | "snapshot_stale",
): Promise<Uint8Array> {
  let before: Awaited<ReturnType<typeof lstat>>;
  try {
    before = await lstat(path);
  } catch {
    throw new RepositoryCheckSnapshotError(unsafeCode, "The tracked file is unavailable.");
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
    throw new RepositoryCheckSnapshotError(
      unsafeCode,
      "The tracked path is not one safe regular file.",
    );
  }
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || !sameIdentity(before, opened)) {
      throw new RepositoryCheckSnapshotError(staleCode, "The tracked file identity changed.");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const named = await lstat(path);
    if (
      !sameIdentity(opened, after) ||
      !sameIdentity(after, named) ||
      bytes.byteLength !== after.size
    ) {
      throw new RepositoryCheckSnapshotError(staleCode, "The tracked file changed while read.");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function removeStaging(directory: string): Promise<void> {
  const makeWritable = async (path: string): Promise<void> => {
    let entries: Dirent<string>[];
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch {
      return;
    }
    await chmod(path, 0o700);
    for (const entry of entries) {
      if (entry.isDirectory()) await makeWritable(join(path, entry.name));
    }
  };
  await makeWritable(directory);
  await rm(directory, { force: true, recursive: true });
}

async function validateStagedDirectory(
  directory: string,
  manifest: RepositorySnapshotManifestV1,
): Promise<boolean> {
  try {
    const root = await lstat(directory);
    if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o777) !== 0o555) return false;
    const expected = new Map(manifest.files.map((file) => [file.path, file]));
    const found = new Set<string>();
    const visit = async (path: string, prefix: string): Promise<boolean> => {
      const entries = await readdir(path, { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
        const absolutePath = join(path, entry.name);
        const metadata = await lstat(absolutePath);
        if (entry.isSymbolicLink() || metadata.isSymbolicLink()) return false;
        if (entry.isDirectory() && metadata.isDirectory()) {
          if ((metadata.mode & 0o777) !== 0o555 || !(await visit(absolutePath, relativePath))) {
            return false;
          }
          continue;
        }
        if (!entry.isFile() || !metadata.isFile() || metadata.nlink !== 1) return false;
        const row = expected.get(relativePath);
        if (
          row === undefined ||
          found.has(relativePath) ||
          (metadata.mode & 0o777) !== (row.executable ? 0o555 : 0o444)
        ) {
          return false;
        }
        const bytes = await readSafeFile(
          absolutePath,
          "snapshot_unsupported_entry",
          "snapshot_stale",
        );
        if (bytes.byteLength !== row.byteLength || hash(bytes) !== row.sha256) return false;
        found.add(relativePath);
      }
      return true;
    };
    return (await visit(directory, "")) && found.size === expected.size;
  } catch {
    return false;
  }
}

function gitEnvironment(): Readonly<Record<string, string>> {
  return {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_TERMINAL_PROMPT: "0",
    LANG: "C",
    LC_ALL: "C",
    PATH: process.env.PATH ?? "",
  };
}

export class RepositoryCheckSnapshotService {
  readonly #gitExecutable: string;
  readonly #hooks: NonNullable<RepositoryCheckSnapshotServiceOptions["hooks"]>;
  readonly #nativeProcess: NativeProcessPort;
  readonly #stateDirectory: string;
  readonly #workspaceRoot: string;

  constructor(options: RepositoryCheckSnapshotServiceOptions) {
    this.#gitExecutable = options.gitExecutable ?? "git";
    this.#hooks = options.hooks ?? {};
    this.#nativeProcess = options.nativeProcess ?? new NativeProcessRunner();
    this.#stateDirectory = resolvePath(options.stateDirectory);
    this.#workspaceRoot = resolvePath(options.workspaceRoot);
  }

  async #root(): Promise<string> {
    const root = await realpath(this.#workspaceRoot);
    const stateRelation = relative(root, this.#stateDirectory);
    if (stateRelation === "" || (!stateRelation.startsWith("..") && !isAbsolute(stateRelation))) {
      throw new RepositoryCheckSnapshotError(
        "staging_path_unsafe",
        "Repository-check staging must remain outside the workspace.",
      );
    }
    return root;
  }

  async #git(arguments_: readonly string[], signal?: AbortSignal): Promise<Uint8Array> {
    const observation = await this.#nativeProcess.run(
      {
        arguments: ["--no-pager", ...arguments_],
        cwd: await this.#root(),
        environment: gitEnvironment(),
        executable: this.#gitExecutable,
        maxStderrBytes: gitOutputBytes,
        maxStdoutBytes: gitOutputBytes,
        timeoutMs: gitTimeoutMs,
      },
      signal,
    );
    if (
      observation.status !== "exited" ||
      observation.exitCode !== 0 ||
      observation.stderr.byteLength !== 0
    ) {
      throw new RepositoryCheckSnapshotError("git_unavailable", "Git metadata is unavailable.");
    }
    return observation.stdout;
  }

  async #head(signal?: AbortSignal): Promise<string> {
    const head = fatalUtf8
      .decode(await this.#git(["rev-parse", "--verify", "HEAD"], signal))
      .trimEnd();
    if (!/^[a-f0-9]{40,64}$/u.test(head)) {
      throw new RepositoryCheckSnapshotError("git_head_invalid", "Git returned an invalid HEAD.");
    }
    return head;
  }

  async #tracked(signal?: AbortSignal): Promise<readonly TrackedEntry[]> {
    const raw = fatalUtf8.decode(await this.#git(["ls-files", "--stage", "-z"], signal));
    const entries: TrackedEntry[] = [];
    for (const row of raw.split("\0")) {
      if (row.length === 0) continue;
      const match = /^(100644|100755) [a-f0-9]{40,64} 0\t(.+)$/u.exec(row);
      if (match === null) {
        throw new RepositoryCheckSnapshotError(
          "snapshot_unsupported_entry",
          "The Git index contains an unsupported tracked entry.",
        );
      }
      const path = match[2] ?? "";
      if (!isNormalizedPath(path)) {
        throw new RepositoryCheckSnapshotError(
          "snapshot_path_invalid",
          "The Git index contains a non-portable path.",
        );
      }
      entries.push({ executable: match[1] === "100755", path });
    }
    entries.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    if (
      entries.length === 0 ||
      entries.length > 64 ||
      new Set(entries.map((entry) => entry.path)).size !== entries.length
    ) {
      throw new RepositoryCheckSnapshotError(
        "snapshot_budget_exceeded",
        "The tracked snapshot file-count budget is not satisfied.",
      );
    }
    return entries;
  }

  async resolve(checkName: string, signal?: AbortSignal): Promise<RepositoryCheckSelection> {
    const root = await this.#root();
    const entries = await this.#tracked(signal);
    if (!entries.some((entry) => entry.path === catalogPath)) {
      throw new RepositoryCheckSnapshotError(
        "catalog_untracked",
        "The repository-check catalog must be Git tracked.",
      );
    }
    const bytes = await readSafeFile(
      join(root, catalogPath),
      "catalog_unsafe_file",
      "catalog_stale",
    );
    if (bytes.byteLength > 16_384) {
      throw new RepositoryCheckSnapshotError("catalog_invalid", "The catalog exceeds 16 KiB.");
    }
    let text: string;
    try {
      text = fatalUtf8.decode(bytes);
    } catch {
      throw new RepositoryCheckSnapshotError(
        "catalog_invalid_utf8",
        "The repository-check catalog is not UTF-8.",
      );
    }
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw new RepositoryCheckSnapshotError("catalog_invalid", "The catalog is not valid JSON.");
    }
    const decoded = decodeRepositoryCheckCatalog(value);
    if (!decoded.ok) {
      throw new RepositoryCheckSnapshotError("catalog_invalid", decoded.error.message);
    }
    const selected = decoded.value.checks.find((check) => check.name === checkName);
    if (selected === undefined) {
      throw new RepositoryCheckSnapshotError(
        "catalog_missing_check",
        "The selected named check is absent.",
      );
    }
    const indexBytes = await this.#git(["show", `:${catalogPath}`], signal);
    const head = await this.#head(signal);
    const reread = await readSafeFile(
      join(root, catalogPath),
      "catalog_unsafe_file",
      "catalog_stale",
    );
    if (hash(bytes) !== hash(reread)) {
      throw new RepositoryCheckSnapshotError(
        "catalog_stale",
        "The catalog changed during selection.",
      );
    }
    return {
      catalog: {
        byteLength: bytes.byteLength,
        dirty: !Buffer.from(bytes).equals(Buffer.from(indexBytes)),
        head,
        path: catalogPath,
        schemaVersion: 1,
        sha256: hash(bytes),
      },
      checkName,
      process: selected.process,
    };
  }

  async capture(
    input: { readonly catalogSha256: string; readonly head: string },
    signal?: AbortSignal,
  ): Promise<CapturedRepositorySnapshot> {
    const root = await this.#root();
    if ((await this.#head(signal)) !== input.head) {
      throw new RepositoryCheckSnapshotError("snapshot_stale", "HEAD changed before capture.");
    }
    const currentCatalog = await readSafeFile(
      join(root, catalogPath),
      "catalog_unsafe_file",
      "catalog_stale",
    );
    if (hash(currentCatalog) !== input.catalogSha256) {
      throw new RepositoryCheckSnapshotError(
        "catalog_stale",
        "The catalog changed before snapshot capture.",
      );
    }
    const entries = await this.#tracked(signal);
    const captured = new Map<string, Uint8Array>();
    const files: RepositorySnapshotFile[] = [];
    let totalBytes = 0;
    for (const entry of entries) {
      if (signal?.aborted === true) {
        throw new RepositoryCheckSnapshotError("snapshot_stale", "Snapshot capture was cancelled.");
      }
      const bytes = await readSafeFile(
        join(root, entry.path),
        "snapshot_unsupported_entry",
        "snapshot_stale",
      );
      totalBytes += bytes.byteLength;
      if (bytes.byteLength > 1_048_576 || totalBytes > 8_388_608) {
        throw new RepositoryCheckSnapshotError(
          "snapshot_budget_exceeded",
          "The tracked snapshot byte budget is exceeded.",
        );
      }
      captured.set(entry.path, bytes);
      files.push({
        byteLength: bytes.byteLength,
        executable: entry.executable,
        path: entry.path,
        sha256: hash(bytes),
      });
    }
    for (const entry of entries) {
      const reread = await readSafeFile(
        join(root, entry.path),
        "snapshot_unsupported_entry",
        "snapshot_stale",
      );
      if (hash(reread) !== hash(captured.get(entry.path) ?? new Uint8Array())) {
        throw new RepositoryCheckSnapshotError(
          "snapshot_stale",
          "Tracked bytes changed during snapshot capture.",
        );
      }
    }
    if ((await this.#head(signal)) !== input.head) {
      throw new RepositoryCheckSnapshotError("snapshot_stale", "HEAD changed during capture.");
    }
    const body = {
      byteLength: totalBytes,
      fileCount: files.length,
      files,
      manifestVersion: 1 as const,
    };
    const decoded = decodeRepositorySnapshotManifest({ ...body, digest: manifestDigest(body) });
    if (!decoded.ok) {
      throw new RepositoryCheckSnapshotError("snapshot_invalid_manifest", decoded.error.message);
    }
    return { manifest: decoded.value };
  }

  async stage(
    input: {
      readonly catalogSha256: string;
      readonly effectId: string;
      readonly expectedManifest?: RepositorySnapshotManifestV1;
      readonly head: string;
    },
    signal?: AbortSignal,
  ): Promise<StagedRepositorySnapshot> {
    if (!/^[a-z0-9][a-z0-9-]{0,127}$/u.test(input.effectId)) {
      throw new RepositoryCheckSnapshotError(
        "staging_identity_invalid",
        "The effect identity is not safe for staging.",
      );
    }
    const root = await this.#root();
    if ((await this.#head(signal)) !== input.head) {
      throw new RepositoryCheckSnapshotError("snapshot_stale", "HEAD changed before staging.");
    }
    const currentCatalog = await readSafeFile(
      join(root, catalogPath),
      "catalog_unsafe_file",
      "catalog_stale",
    );
    if (hash(currentCatalog) !== input.catalogSha256) {
      throw new RepositoryCheckSnapshotError(
        "catalog_stale",
        "The catalog changed before staging.",
      );
    }
    const entries = await this.#tracked(signal);
    const directory = join(this.#stateDirectory, "repository-check-staging", input.effectId);
    await mkdir(dirname(directory), { mode: 0o700, recursive: true });
    try {
      await mkdir(directory, { mode: 0o700 });
    } catch {
      throw new RepositoryCheckSnapshotError(
        "staging_unavailable",
        "The deterministic staging directory is unavailable.",
      );
    }

    const files: RepositorySnapshotFile[] = [];
    let totalBytes = 0;
    try {
      for (const entry of entries) {
        if (signal?.aborted === true) {
          throw new RepositoryCheckSnapshotError(
            "snapshot_stale",
            "Snapshot staging was cancelled.",
          );
        }
        const source = join(root, entry.path);
        const bytes = await readSafeFile(source, "snapshot_unsupported_entry", "snapshot_stale");
        totalBytes += bytes.byteLength;
        if (bytes.byteLength > 1_048_576 || totalBytes > 8_388_608) {
          throw new RepositoryCheckSnapshotError(
            "snapshot_budget_exceeded",
            "The tracked snapshot byte budget is exceeded.",
          );
        }
        const target = join(directory, entry.path);
        await mkdir(dirname(target), { mode: 0o700, recursive: true });
        await writeFile(target, bytes, { flag: "wx", mode: entry.executable ? 0o555 : 0o444 });
        const copied = await readFile(target);
        await this.#hooks.afterSourceRead?.(entry.path);
        const revalidated = await readSafeFile(
          source,
          "snapshot_unsupported_entry",
          "snapshot_stale",
        );
        if (hash(copied) !== hash(bytes) || hash(revalidated) !== hash(bytes)) {
          throw new RepositoryCheckSnapshotError(
            "snapshot_stale",
            "Tracked bytes changed during staging.",
          );
        }
        files.push({
          byteLength: bytes.byteLength,
          executable: entry.executable,
          path: entry.path,
          sha256: hash(bytes),
        });
      }
      const body = {
        byteLength: totalBytes,
        fileCount: files.length,
        files,
        manifestVersion: 1 as const,
      };
      const manifest = { ...body, digest: manifestDigest(body) };
      const decoded = decodeRepositorySnapshotManifest(manifest);
      if (!decoded.ok) {
        throw new RepositoryCheckSnapshotError("snapshot_invalid_manifest", decoded.error.message);
      }
      if (
        input.expectedManifest !== undefined &&
        canonicalJson(decoded.value) !== canonicalJson(input.expectedManifest)
      ) {
        throw new RepositoryCheckSnapshotError(
          "snapshot_stale",
          "The tracked snapshot changed after approval.",
        );
      }
      const directories = new Set<string>([directory]);
      for (const file of files) {
        let current = dirname(join(directory, file.path));
        while (current.startsWith(directory) && current !== directory) {
          directories.add(current);
          current = dirname(current);
        }
      }
      for (const path of [...directories].sort((left, right) => right.length - left.length)) {
        await chmod(path, 0o555);
      }
      return {
        cleanup: async () => {
          await removeStaging(directory);
        },
        directory,
        manifest: decoded.value,
        validate: () => validateStagedDirectory(directory, decoded.value),
      };
    } catch (error) {
      await removeStaging(directory);
      throw error;
    }
  }
}

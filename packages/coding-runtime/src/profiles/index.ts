import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  type DeleteProviderProfileCommand,
  decodeDeleteProviderProfileCommand,
  decodeSaveProviderProfileCommand,
  decodeSelectProviderProfileCommand,
  type ProductError,
  type ProviderProfileCatalog,
  type ProviderProfileInput,
  ProviderProfileInputSchema,
  type SaveProviderProfileCommand,
  type SelectProviderProfileCommand,
} from "@eden/contracts";
import { parse, stringify } from "smol-toml";
import Schema from "typebox/schema";

import { acquireWorkspaceLock, WorkspaceStateLockError } from "../workspace/workspace-lock.ts";

export interface RunProfile {
  readonly name: "explore" | "plan" | "build" | "goal" | "review";
  readonly instructionRefs: readonly string[];
  readonly budgetId: string;
}

const configByteLimit = 64 * 1024;
const profileCountLimit = 32;
const profileValidator = Schema.Compile(ProviderProfileInputSchema);

type ProfileConfiguration = {
  readonly activeProfileId: string | null;
  readonly profiles: ReadonlyMap<string, ProviderProfileInput>;
  readonly revision: number;
};

export type ProviderProfileStoreOptions = {
  readonly beforeReplace?: (() => Promise<void>) | undefined;
  readonly environment?: Readonly<Record<string, string | undefined>> | undefined;
  readonly stateDirectory: string;
};

export type ResolvedProviderProfile = {
  readonly catalog: ProviderProfileCatalog;
  readonly credential: string;
  readonly profile: ProviderProfileInput;
};

export class ProviderProfileStoreError extends Error {
  readonly name = "ProviderProfileStoreError";
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

function storeError(
  code: string,
  message: string,
  recoverability: ProductError["recoverability"] = "reconfigure",
): ProviderProfileStoreError {
  return new ProviderProfileStoreError({
    code,
    message,
    recoverability,
    suggestedActions: ["Inspect the local provider configuration and retry."],
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return expected.length === actual.length && expected.every((key, index) => key === actual[index]);
}

function parseProfile(id: string, value: unknown): ProviderProfileInput {
  if (!isPlainObject(value))
    throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
  const expected = [
    "base_url",
    "billing_source",
    "context_window_tokens",
    "credential",
    "max_output_tokens",
    "model",
    "protocol",
    "reasoning_display",
  ];
  if (!hasExactKeys(value, expected) || !isPlainObject(value.credential)) {
    throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
  }
  const credential = value.credential;
  const normalizedCredential =
    credential.source === "environment" && hasExactKeys(credential, ["name", "source"])
      ? { name: credential.name, source: credential.source }
      : credential.source === "inline" && hasExactKeys(credential, ["source", "value"])
        ? { source: credential.source, value: credential.value }
        : null;
  const profile = {
    baseUrl: value.base_url,
    billingSource: value.billing_source,
    contextWindowTokens: value.context_window_tokens,
    credential: normalizedCredential,
    id,
    maxOutputTokens: value.max_output_tokens,
    model: value.model,
    protocol: value.protocol,
    reasoningDisplay: value.reasoning_display,
  };
  if (!profileValidator.Check(profile)) {
    throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
  }
  return profile;
}

function revisionFor(source: Uint8Array): number {
  const revision = Number.parseInt(
    createHash("sha256").update(source).digest("hex").slice(0, 13),
    16,
  );
  return revision === 0 ? 1 : revision;
}

function parseConfiguration(source: Uint8Array): ProfileConfiguration {
  let parsed: unknown;
  try {
    parsed = parse(new TextDecoder("utf-8", { fatal: true }).decode(source));
  } catch {
    throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
  }
  if (!isPlainObject(parsed)) {
    throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
  }
  const allowed =
    parsed.active_profile === undefined
      ? ["profiles", "version"]
      : ["active_profile", "profiles", "version"];
  if (!hasExactKeys(parsed, allowed) || parsed.version !== 1 || !isPlainObject(parsed.profiles)) {
    throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
  }
  const entries = Object.entries(parsed.profiles);
  if (entries.length > profileCountLimit) {
    throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
  }
  const profiles = new Map(entries.map(([id, value]) => [id, parseProfile(id, value)]));
  const activeProfileId = parsed.active_profile;
  if (
    (entries.length === 0 && activeProfileId !== undefined) ||
    (entries.length > 0 && (typeof activeProfileId !== "string" || !profiles.has(activeProfileId)))
  ) {
    throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
  }
  return {
    activeProfileId: typeof activeProfileId === "string" ? activeProfileId : null,
    profiles,
    revision: revisionFor(source),
  };
}

function serializedConfiguration(configuration: ProfileConfiguration): string {
  const profiles = Object.fromEntries(
    [...configuration.profiles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, profile]) => [
        id,
        {
          base_url: profile.baseUrl,
          billing_source: profile.billingSource,
          context_window_tokens: profile.contextWindowTokens,
          credential: profile.credential,
          max_output_tokens: profile.maxOutputTokens,
          model: profile.model,
          protocol: profile.protocol,
          reasoning_display: profile.reasoningDisplay,
        },
      ]),
  );
  return stringify({
    ...(configuration.activeProfileId === null
      ? {}
      : { active_profile: configuration.activeProfileId }),
    profiles,
    version: 1,
  });
}

export class ProviderProfileStore {
  private readonly beforeReplace: (() => Promise<void>) | undefined;
  private readonly configPath: string;
  private readonly environment: Readonly<Record<string, string | undefined>>;
  private readonly stateDirectory: string;

  private constructor(options: ProviderProfileStoreOptions) {
    this.beforeReplace = options.beforeReplace;
    this.environment = options.environment ?? process.env;
    this.stateDirectory = resolve(options.stateDirectory);
    this.configPath = join(this.stateDirectory, "config.toml");
  }

  static async open(options: ProviderProfileStoreOptions): Promise<ProviderProfileStore> {
    return new ProviderProfileStore(options);
  }

  private async ensureStateRoot(create: boolean): Promise<boolean> {
    try {
      if (create) await mkdir(this.stateDirectory, { mode: 0o700, recursive: true });
      const metadata = await lstat(this.stateDirectory);
      if (!metadata.isDirectory() || metadata.isSymbolicLink())
        throw new Error("invalid state root");
      if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
        throw new Error("unsafe state root mode");
      }
      return true;
    } catch (error) {
      if (!create && isNodeError(error) && error.code === "ENOENT") return false;
      throw storeError(
        "provider_configuration_unavailable",
        "The provider configuration is unavailable.",
      );
    }
  }

  private async load(): Promise<ProfileConfiguration> {
    if (!(await this.ensureStateRoot(false))) {
      return { activeProfileId: null, profiles: new Map(), revision: 0 };
    }
    try {
      const metadata = await lstat(this.configPath);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
        throw storeError(
          "invalid_provider_configuration",
          "The provider configuration is invalid.",
        );
      }
      if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
        throw storeError(
          "invalid_provider_configuration",
          "The provider configuration is invalid.",
        );
      }
      if (metadata.size > configByteLimit) {
        throw storeError(
          "invalid_provider_configuration",
          "The provider configuration is invalid.",
        );
      }
      const source = await readFile(this.configPath);
      if (source.byteLength > configByteLimit) {
        throw storeError(
          "invalid_provider_configuration",
          "The provider configuration is invalid.",
        );
      }
      return parseConfiguration(source);
    } catch (error) {
      if (error instanceof ProviderProfileStoreError) throw error;
      if (isNodeError(error) && error.code === "ENOENT") {
        return { activeProfileId: null, profiles: new Map(), revision: 0 };
      }
      throw storeError(
        "provider_configuration_unavailable",
        "The provider configuration is unavailable.",
      );
    }
  }

  private catalog(configuration: ProfileConfiguration): ProviderProfileCatalog {
    return {
      activeProfileId: configuration.activeProfileId,
      notice: null,
      profiles: [...configuration.profiles.values()]
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((profile) => ({
          ...profile,
          credential:
            profile.credential.source === "environment"
              ? {
                  name: profile.credential.name,
                  presence:
                    (this.environment[profile.credential.name]?.length ?? 0) === 0
                      ? "missing"
                      : "present",
                  source: "environment",
                }
              : { presence: "present", source: "inline" },
          readiness: "unverified",
        })),
      protocolVersion: 1,
      revision: configuration.revision,
    };
  }

  async read(): Promise<ProviderProfileCatalog> {
    return this.catalog(await this.load());
  }

  async resolveActive(): Promise<ResolvedProviderProfile | null> {
    const configuration = await this.load();
    if (configuration.activeProfileId === null) return null;
    const profile = configuration.profiles.get(configuration.activeProfileId);
    if (profile === undefined) return null;
    const credential =
      profile.credential.source === "inline"
        ? profile.credential.value
        : this.environment[profile.credential.name];
    if (credential === undefined || credential.length === 0) return null;
    return { catalog: this.catalog(configuration), credential, profile };
  }

  private assertRevision(expected: number, actual: number): void {
    if (expected !== actual)
      throw storeError("stale_revision", "The provider profile revision is stale.", "retry");
  }

  private async withMutationLock<T>(operation: () => Promise<T>): Promise<T> {
    await this.ensureStateRoot(true);
    let lock: Awaited<ReturnType<typeof acquireWorkspaceLock>>;
    try {
      lock = await acquireWorkspaceLock({
        acquiredAt: new Date().toISOString(),
        stateDirectory: this.stateDirectory,
        workspaceId: "provider-profiles",
      });
    } catch (error) {
      if (error instanceof WorkspaceStateLockError) {
        throw storeError(
          "provider_configuration_busy",
          "The provider configuration is busy or its coordination record is invalid.",
          "retry",
        );
      }
      throw error;
    }
    const result = await operation().then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ error, ok: false as const }),
    );
    try {
      await lock.release();
    } catch {
      if (result.ok) {
        throw storeError(
          "provider_configuration_unavailable",
          "The provider configuration is unavailable.",
        );
      }
    }
    if (!result.ok) throw result.error;
    return result.value;
  }

  private async persist(configuration: ProfileConfiguration): Promise<ProviderProfileCatalog> {
    await this.ensureStateRoot(true);
    const source = serializedConfiguration(configuration);
    const bytes = Buffer.from(source, "utf8");
    if (bytes.byteLength > configByteLimit) {
      throw storeError("invalid_provider_configuration", "The provider configuration is invalid.");
    }
    const temporaryPath = join(this.stateDirectory, `.config-${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await this.beforeReplace?.();
      await rename(temporaryPath, this.configPath);
      if (process.platform !== "win32") await chmod(this.configPath, 0o600);
      return this.catalog(parseConfiguration(bytes));
    } catch {
      throw storeError(
        "provider_configuration_unavailable",
        "The provider configuration is unavailable.",
      );
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async save(command: SaveProviderProfileCommand): Promise<ProviderProfileCatalog> {
    const decoded = decodeSaveProviderProfileCommand(command);
    if (!decoded.ok) {
      throw new ProviderProfileStoreError({
        ...decoded.error,
        suggestedActions: [...decoded.error.suggestedActions],
      });
    }
    return this.withMutationLock(async () => {
      const current = await this.load();
      this.assertRevision(decoded.value.expectedRevision, current.revision);
      const profiles = new Map(current.profiles);
      profiles.set(decoded.value.profile.id, decoded.value.profile);
      return this.persist({
        activeProfileId:
          decoded.value.select || current.activeProfileId === null
            ? decoded.value.profile.id
            : current.activeProfileId,
        profiles,
        revision: current.revision,
      });
    });
  }

  async select(command: SelectProviderProfileCommand): Promise<ProviderProfileCatalog> {
    const decoded = decodeSelectProviderProfileCommand(command);
    if (!decoded.ok) {
      throw new ProviderProfileStoreError({
        ...decoded.error,
        suggestedActions: [...decoded.error.suggestedActions],
      });
    }
    return this.withMutationLock(async () => {
      const current = await this.load();
      this.assertRevision(decoded.value.expectedRevision, current.revision);
      if (!current.profiles.has(decoded.value.profileId)) {
        throw storeError("provider_profile_not_found", "The provider profile was not found.");
      }
      return this.persist({ ...current, activeProfileId: decoded.value.profileId });
    });
  }

  async delete(command: DeleteProviderProfileCommand): Promise<ProviderProfileCatalog> {
    const decoded = decodeDeleteProviderProfileCommand(command);
    if (!decoded.ok) {
      throw new ProviderProfileStoreError({
        ...decoded.error,
        suggestedActions: [...decoded.error.suggestedActions],
      });
    }
    return this.withMutationLock(async () => {
      const current = await this.load();
      this.assertRevision(decoded.value.expectedRevision, current.revision);
      if (!current.profiles.has(decoded.value.profileId)) {
        throw storeError("provider_profile_not_found", "The provider profile was not found.");
      }
      if (current.activeProfileId === decoded.value.profileId && current.profiles.size > 1) {
        throw storeError(
          "active_profile_delete_requires_selection",
          "Select another provider profile before deleting the active profile.",
        );
      }
      const profiles = new Map(current.profiles);
      profiles.delete(decoded.value.profileId);
      return this.persist({
        activeProfileId: profiles.size === 0 ? null : current.activeProfileId,
        profiles,
        revision: current.revision,
      });
    });
  }
}

export * from "./readiness.ts";

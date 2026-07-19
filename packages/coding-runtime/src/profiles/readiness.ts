import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, lstat, open, readFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  decodeProviderReadinessCommand,
  type ProductError,
  type ProviderConnectionFailure,
  type ProviderProfileCatalog,
  type ProviderProfileInput,
  type ProviderProfileSummary,
  type ProviderReadiness,
  type ProviderReadinessCommand,
} from "@eden/contracts";
import {
  decodeProviderAdapterFailure,
  decodeProviderReadinessSuccess,
  OpenAICompatibleProvider,
  ProviderAdapterError,
  type ProviderAdapterFailure,
  type ProviderReadinessSuccess,
} from "@eden/providers";
import Type from "typebox";
import Schema from "typebox/schema";

import { acquireWorkspaceLock, WorkspaceStateLockError } from "../workspace/workspace-lock.ts";
import type { ProviderProfileStore, ResolvedProviderProfile } from "./index.ts";

const readinessByteLimit = 8 * 1024;
const closed = { additionalProperties: false } as const;
const ReadinessRecordSchema = Type.Object(
  {
    checkedAt: Type.String({ format: "date-time", maxLength: 128 }),
    fingerprint: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    salt: Type.String({ pattern: "^[a-f0-9]{64}$" }),
    version: Type.Literal(1),
  },
  closed,
);
type ReadinessRecord = Type.Static<typeof ReadinessRecordSchema>;
const recordValidator = Schema.Compile(ReadinessRecordSchema);

type ReadinessProvider = {
  checkReadiness(signal: AbortSignal): Promise<ProviderReadinessSuccess>;
};

export type ProviderReadinessServiceOptions = {
  readonly clock?: { readonly now: () => Date };
  readonly createProvider?: ((resolved: ResolvedProviderProfile) => ReadinessProvider) | undefined;
  readonly profiles: ProviderProfileStore;
  readonly stateDirectory: string;
};

export class ProviderReadinessError extends Error {
  readonly name = "ProviderReadinessError";
  readonly productError: ProductError;

  constructor(productError: ProductError) {
    super(productError.message);
    this.productError = productError;
  }
}

function readinessError(
  code: string,
  message: string,
  recoverability: ProductError["recoverability"] = "reconfigure",
): ProviderReadinessError {
  return new ProviderReadinessError({
    code,
    message,
    recoverability,
    suggestedActions: ["Reload the provider profile and retry the readiness check."],
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function fingerprint(profile: ProviderProfileInput, credential: string, salt: string): string {
  return createHash("sha256")
    .update(salt, "utf8")
    .update("\0", "utf8")
    .update(JSON.stringify(profile), "utf8")
    .update("\0", "utf8")
    .update(credential, "utf8")
    .digest("hex");
}

function activeSummary(catalog: ProviderProfileCatalog): ProviderProfileSummary | null {
  return catalog.profiles.find((profile) => profile.id === catalog.activeProfileId) ?? null;
}

function withReadiness(
  profile: ProviderProfileSummary,
  readiness: ProviderProfileSummary["readiness"],
): ProviderProfileSummary {
  return { ...profile, readiness };
}

function failureProjection(failure: ProviderAdapterFailure): ProviderConnectionFailure {
  return { ...failure, suggestedActions: [...failure.suggestedActions] };
}

function invalidReadinessFailure(
  profile: ProviderProfileSummary,
  checkedAt: string,
): ProviderConnectionFailure {
  return {
    checkedAt,
    code: "invalid_configuration",
    message: "The local provider readiness state is invalid.",
    model: profile.model,
    profileId: profile.id,
    recoverability: "reconfigure",
    requestId: null,
    statusFamily: null,
    suggestedActions: ["Remove the invalid readiness state and run an explicit check again."],
  };
}

export class ProviderReadinessService {
  private readonly clock: { readonly now: () => Date };
  private readonly createProvider: (resolved: ResolvedProviderProfile) => ReadinessProvider;
  private readonly path: string;
  private readonly profiles: ProviderProfileStore;
  private readonly stateDirectory: string;

  constructor(options: ProviderReadinessServiceOptions) {
    this.clock = options.clock ?? { now: () => new Date() };
    this.createProvider =
      options.createProvider ??
      ((resolved) =>
        new OpenAICompatibleProvider({
          apiKey: resolved.credential,
          baseUrl: resolved.profile.baseUrl,
          clock: this.clock,
          model: resolved.profile.model,
          profileId: resolved.profile.id,
        }));
    this.path = join(options.stateDirectory, "provider-readiness-v1.json");
    this.profiles = options.profiles;
    this.stateDirectory = options.stateDirectory;
  }

  private async loadRecord(): Promise<ReadinessRecord | null> {
    try {
      const metadata = await lstat(this.path);
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.nlink !== 1 ||
        metadata.size > readinessByteLimit ||
        (process.platform !== "win32" && (metadata.mode & 0o077) !== 0)
      ) {
        throw readinessError(
          "invalid_provider_readiness",
          "The provider readiness state is invalid.",
        );
      }
      const source = await readFile(this.path);
      if (source.byteLength > readinessByteLimit) {
        throw readinessError(
          "invalid_provider_readiness",
          "The provider readiness state is invalid.",
        );
      }
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(source));
      if (!recordValidator.Check(value)) {
        throw readinessError(
          "invalid_provider_readiness",
          "The provider readiness state is invalid.",
        );
      }
      return value;
    } catch (error) {
      if (error instanceof ProviderReadinessError) throw error;
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw readinessError(
        "invalid_provider_readiness",
        "The provider readiness state is invalid.",
      );
    }
  }

  private async persistRecord(record: ReadinessRecord): Promise<void> {
    const source = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(source, "utf8") > readinessByteLimit) {
      throw readinessError(
        "invalid_provider_readiness",
        "The provider readiness state is invalid.",
      );
    }
    const temporaryPath = join(this.stateDirectory, `.provider-readiness-${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(source, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.path);
      if (process.platform !== "win32") await chmod(this.path, 0o600);
    } catch {
      throw readinessError(
        "provider_readiness_unavailable",
        "The provider readiness state is unavailable.",
      );
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  private configured(
    catalog: ProviderProfileCatalog,
    profile: ProviderProfileSummary,
    failure: ProviderConnectionFailure | null = null,
  ): ProviderReadiness {
    return {
      checkedAt: failure?.checkedAt ?? null,
      error: failure,
      possibleChargeConfirmationRequired: true,
      profile: withReadiness(profile, "unverified"),
      protocolVersion: 1,
      revision: catalog.revision,
      state: "configured",
    };
  }

  async read(): Promise<ProviderReadiness> {
    const resolved = await this.profiles.resolveActive();
    const catalog = resolved?.catalog ?? (await this.profiles.read());
    const summary = activeSummary(catalog);
    if (summary === null || resolved === null) {
      return {
        checkedAt: null,
        error: null,
        possibleChargeConfirmationRequired: false,
        profile: null,
        protocolVersion: 1,
        revision: catalog.revision,
        state: "unconfigured",
      };
    }
    let record: ReadinessRecord | null;
    try {
      record = await this.loadRecord();
    } catch (error) {
      if (!(error instanceof ProviderReadinessError)) throw error;
      return this.configured(
        catalog,
        summary,
        invalidReadinessFailure(summary, this.clock.now().toISOString()),
      );
    }
    if (
      record === null ||
      record.fingerprint !== fingerprint(resolved.profile, resolved.credential, record.salt)
    ) {
      return this.configured(catalog, summary);
    }
    return {
      checkedAt: record.checkedAt,
      error: null,
      possibleChargeConfirmationRequired: false,
      profile: withReadiness(summary, "completion_ready"),
      protocolVersion: 1,
      revision: catalog.revision,
      state: "completion_ready",
    };
  }

  async decorateCatalog(catalog: ProviderProfileCatalog): Promise<ProviderProfileCatalog> {
    const readiness = await this.read();
    if (
      readiness.state !== "completion_ready" ||
      readiness.profile === null ||
      readiness.revision !== catalog.revision
    ) {
      return catalog;
    }
    return {
      ...catalog,
      profiles: catalog.profiles.map((profile) =>
        profile.id === readiness.profile?.id ? withReadiness(profile, "completion_ready") : profile,
      ),
    };
  }

  async check(command: ProviderReadinessCommand, signal: AbortSignal): Promise<ProviderReadiness> {
    const decoded = decodeProviderReadinessCommand(command);
    if (!decoded.ok) {
      throw new ProviderReadinessError({
        ...decoded.error,
        suggestedActions: [...decoded.error.suggestedActions],
      });
    }
    const resolved = await this.profiles.resolveActive();
    if (resolved === null) {
      throw readinessError(
        "provider_profile_unconfigured",
        "An active provider profile with a present credential is required.",
      );
    }
    if (
      decoded.value.expectedRevision !== resolved.catalog.revision ||
      decoded.value.profileId !== resolved.profile.id
    ) {
      throw readinessError("stale_revision", "The provider profile revision is stale.", "retry");
    }
    const summary = activeSummary(resolved.catalog);
    if (summary === null) {
      throw readinessError(
        "provider_profile_unconfigured",
        "An active provider profile is required.",
      );
    }
    let success: ProviderReadinessSuccess;
    try {
      success = await this.createProvider(resolved).checkReadiness(signal);
      const decodedSuccess = decodeProviderReadinessSuccess(success);
      if (
        !decodedSuccess.ok ||
        decodedSuccess.value.profileId !== resolved.profile.id ||
        decodedSuccess.value.model !== resolved.profile.model
      ) {
        throw readinessError(
          "provider_check_unavailable",
          "The provider check returned an invalid terminal value.",
          "retry",
        );
      }
    } catch (error) {
      if (!(error instanceof ProviderAdapterError)) {
        if (error instanceof ProviderReadinessError) throw error;
        throw readinessError(
          "provider_check_unavailable",
          "The provider check is unavailable.",
          "retry",
        );
      }
      const decodedFailure = decodeProviderAdapterFailure(error.failure);
      if (!decodedFailure.ok) {
        throw readinessError(
          "provider_check_unavailable",
          "The provider check returned an invalid failure value.",
          "retry",
        );
      }
      return this.configured(resolved.catalog, summary, failureProjection(decodedFailure.value));
    }

    let lock: Awaited<ReturnType<typeof acquireWorkspaceLock>>;
    try {
      lock = await acquireWorkspaceLock({
        acquiredAt: this.clock.now().toISOString(),
        signal,
        stateDirectory: this.stateDirectory,
        workspaceId: "provider-profiles",
      });
    } catch (error) {
      if (error instanceof WorkspaceStateLockError) {
        if (error.productError.code === "operation_aborted") {
          throw readinessError("operation_aborted", "The operation was aborted.", "retry");
        }
        throw readinessError("provider_configuration_busy", error.productError.message, "retry");
      }
      throw error;
    }
    const result = await (async () => {
      const current = await this.profiles.resolveActive();
      if (
        current === null ||
        current.catalog.revision !== resolved.catalog.revision ||
        current.profile.id !== resolved.profile.id ||
        current.credential !== resolved.credential
      ) {
        throw readinessError(
          "stale_revision",
          "The provider profile changed during the check.",
          "retry",
        );
      }
      const existing = await this.loadRecord();
      const salt = existing?.salt ?? randomBytes(32).toString("hex");
      await this.persistRecord({
        checkedAt: success.checkedAt,
        fingerprint: fingerprint(current.profile, current.credential, salt),
        salt,
        version: 1,
      });
    })().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ error, ok: false as const }),
    );
    try {
      await lock.release();
    } catch {
      if (result.ok) {
        throw readinessError(
          "provider_readiness_unavailable",
          "The provider readiness state is unavailable.",
        );
      }
    }
    if (!result.ok) throw result.error;
    return {
      checkedAt: success.checkedAt,
      error: null,
      possibleChargeConfirmationRequired: false,
      profile: withReadiness(summary, "completion_ready"),
      protocolVersion: 1,
      revision: resolved.catalog.revision,
      state: "completion_ready",
    };
  }
}

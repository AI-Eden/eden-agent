import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";
import Type from "typebox";
import Schema from "typebox/schema";

const closed = { additionalProperties: false } as const;

export const fixedReadinessPrompt =
  "Eden provider readiness check v1. Reply with exactly EDEN_READY_V1 and nothing else.";
export const fixedReadinessAnswer = "EDEN_READY_V1";

export const ProviderFailureCodeSchema = Type.Union([
  Type.Literal("invalid_configuration"),
  Type.Literal("authentication"),
  Type.Literal("billing_quota"),
  Type.Literal("unavailable_model"),
  Type.Literal("rate_limit"),
  Type.Literal("network"),
  Type.Literal("timeout"),
  Type.Literal("overload"),
  Type.Literal("provider_internal"),
  Type.Literal("protocol_incompatibility"),
  Type.Literal("cancellation"),
  Type.Literal("unknown"),
]);
export type ProviderFailureCode = Type.Static<typeof ProviderFailureCodeSchema>;

export const ProviderAdapterFailureSchema = Type.Object(
  {
    checkedAt: Type.String({ format: "date-time", maxLength: 128 }),
    code: ProviderFailureCodeSchema,
    message: Type.String({ maxLength: 512, minLength: 1 }),
    model: Type.String({ maxLength: 256, minLength: 1 }),
    profileId: Type.String({ maxLength: 64, minLength: 1 }),
    recoverability: Type.Union([
      Type.Literal("retry"),
      Type.Literal("reconfigure"),
      Type.Literal("ask-user"),
      Type.Literal("fatal"),
    ]),
    requestId: Type.Union([Type.String({ maxLength: 128, minLength: 1 }), Type.Null()]),
    statusFamily: Type.Union([Type.Literal("4xx"), Type.Literal("5xx"), Type.Null()]),
    suggestedActions: Type.Array(Type.String({ maxLength: 512, minLength: 1 }), {
      maxItems: 4,
    }),
  },
  closed,
);
export type ProviderAdapterFailure = Type.Static<typeof ProviderAdapterFailureSchema>;

export const ProviderReadinessSuccessSchema = Type.Object(
  {
    checkedAt: Type.String({ format: "date-time", maxLength: 128 }),
    model: Type.String({ maxLength: 256, minLength: 1 }),
    profileId: Type.String({ maxLength: 64, minLength: 1 }),
    requestId: Type.Union([Type.String({ maxLength: 128, minLength: 1 }), Type.Null()]),
    state: Type.Literal("completion_ready"),
  },
  closed,
);
export type ProviderReadinessSuccess = Type.Static<typeof ProviderReadinessSuccessSchema>;

export const ProviderCatalogSuccessSchema = Type.Object(
  {
    checkedAt: Type.String({ format: "date-time", maxLength: 128 }),
    model: Type.String({ maxLength: 256, minLength: 1 }),
    modelAvailable: Type.Boolean(),
    profileId: Type.String({ maxLength: 64, minLength: 1 }),
    requestId: Type.Union([Type.String({ maxLength: 128, minLength: 1 }), Type.Null()]),
    state: Type.Literal("catalog_reachable"),
  },
  closed,
);
export type ProviderCatalogSuccess = Type.Static<typeof ProviderCatalogSuccessSchema>;

const readinessValidator = Schema.Compile(ProviderReadinessSuccessSchema);
const catalogValidator = Schema.Compile(ProviderCatalogSuccessSchema);
const failureValidator = Schema.Compile(ProviderAdapterFailureSchema);

export function decodeProviderReadinessSuccess(
  value: unknown,
):
  | { readonly ok: true; readonly value: ProviderReadinessSuccess }
  | { readonly ok: false; readonly code: "invalid_provider_readiness" } {
  return readinessValidator.Check(value)
    ? { ok: true, value }
    : { code: "invalid_provider_readiness", ok: false };
}

export function decodeProviderAdapterFailure(
  value: unknown,
):
  | { readonly ok: true; readonly value: ProviderAdapterFailure }
  | { readonly ok: false; readonly code: "invalid_provider_failure" } {
  return failureValidator.Check(value)
    ? { ok: true, value }
    : { code: "invalid_provider_failure", ok: false };
}

export class ProviderAdapterError extends Error {
  readonly name = "ProviderAdapterError";
  readonly failure: ProviderAdapterFailure;

  constructor(failure: ProviderAdapterFailure) {
    super(failure.message);
    this.failure = failure;
  }
}

export type OpenAICompatibleProviderOptions = {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly clock?: { readonly now: () => Date };
  readonly model: string;
  readonly profileId: string;
  readonly timeoutMilliseconds?: number;
};

type FailureDescription = Pick<
  ProviderAdapterFailure,
  "code" | "message" | "recoverability" | "suggestedActions"
>;

const failureDescriptions: Readonly<Record<ProviderFailureCode, FailureDescription>> = {
  authentication: {
    code: "authentication",
    message: "The provider rejected the configured credential.",
    recoverability: "reconfigure",
    suggestedActions: ["Check the selected credential and retry the readiness check."],
  },
  billing_quota: {
    code: "billing_quota",
    message: "The provider reported a billing or quota restriction.",
    recoverability: "reconfigure",
    suggestedActions: ["Check provider billing or quota, then retry the readiness check."],
  },
  cancellation: {
    code: "cancellation",
    message: "The provider readiness check was cancelled.",
    recoverability: "retry",
    suggestedActions: ["Retry the readiness check when ready."],
  },
  invalid_configuration: {
    code: "invalid_configuration",
    message: "The provider configuration is invalid.",
    recoverability: "reconfigure",
    suggestedActions: ["Correct the selected provider profile and retry."],
  },
  network: {
    code: "network",
    message: "The provider could not be reached over the network.",
    recoverability: "retry",
    suggestedActions: ["Check the network and provider URL, then retry."],
  },
  overload: {
    code: "overload",
    message: "The provider is temporarily overloaded.",
    recoverability: "retry",
    suggestedActions: ["Wait and explicitly retry the readiness check."],
  },
  protocol_incompatibility: {
    code: "protocol_incompatibility",
    message: "The provider stream does not match the supported protocol.",
    recoverability: "reconfigure",
    suggestedActions: ["Check provider compatibility and the selected model."],
  },
  provider_internal: {
    code: "provider_internal",
    message: "The provider reported an internal failure.",
    recoverability: "retry",
    suggestedActions: ["Wait and explicitly retry the readiness check."],
  },
  rate_limit: {
    code: "rate_limit",
    message: "The provider rate limit blocked the readiness check.",
    recoverability: "retry",
    suggestedActions: ["Wait for the provider limit to reset, then retry."],
  },
  timeout: {
    code: "timeout",
    message: "The provider readiness check timed out.",
    recoverability: "retry",
    suggestedActions: ["Check provider availability and explicitly retry."],
  },
  unavailable_model: {
    code: "unavailable_model",
    message: "The selected model is unavailable for this credential.",
    recoverability: "reconfigure",
    suggestedActions: ["Select an available model and retry the readiness check."],
  },
  unknown: {
    code: "unknown",
    message: "The provider readiness check failed without a recognized category.",
    recoverability: "retry",
    suggestedActions: ["Inspect the provider account and explicitly retry."],
  },
};

function requestId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/u.test(value) ? value : null;
}

function statusFamily(status: number | undefined): "4xx" | "5xx" | null {
  if (status !== undefined && status >= 400 && status < 500) return "4xx";
  if (status !== undefined && status >= 500 && status < 600) return "5xx";
  return null;
}

function errorCode(error: unknown): ProviderFailureCode {
  if (error instanceof APIUserAbortError) return "cancellation";
  if (error instanceof APIConnectionTimeoutError) return "timeout";
  if (error instanceof APIConnectionError) return "network";
  if (!(error instanceof APIError)) return "protocol_incompatibility";
  const providerCode = typeof error.code === "string" ? error.code.toLowerCase() : "";
  if (providerCode.includes("quota") || error.status === 402) return "billing_quota";
  if (error.status === 401 || error.status === 403) return "authentication";
  if (error.status === 404) return "unavailable_model";
  if (error.status === 408) return "timeout";
  if (error.status === 429) return "rate_limit";
  if (error.status === 503) return "overload";
  if (error.status !== undefined && error.status >= 500 && error.status < 600) {
    return "provider_internal";
  }
  return "unknown";
}

export class OpenAICompatibleProvider {
  private readonly client: OpenAI;
  private readonly clock: { readonly now: () => Date };
  private readonly model: string;
  private readonly profileId: string;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl,
      logLevel: "off",
      maxRetries: 0,
      timeout: options.timeoutMilliseconds ?? 30_000,
    });
    this.clock = options.clock ?? { now: () => new Date() };
    this.model = options.model;
    this.profileId = options.profileId;
  }

  private failure(error: unknown): ProviderAdapterError {
    const code = errorCode(error);
    const description = failureDescriptions[code];
    const apiError = error instanceof APIError ? error : null;
    const failure: ProviderAdapterFailure = {
      ...description,
      checkedAt: this.clock.now().toISOString(),
      model: this.model,
      profileId: this.profileId,
      requestId: requestId(apiError?.requestID),
      statusFamily: statusFamily(apiError?.status),
    };
    if (!failureValidator.Check(failure)) {
      return new ProviderAdapterError({
        ...failureDescriptions.unknown,
        checkedAt: new Date(0).toISOString(),
        model: "invalid-model",
        profileId: "invalid-profile",
        requestId: null,
        statusFamily: null,
      });
    }
    return new ProviderAdapterError(failure);
  }

  async checkCatalog(signal: AbortSignal): Promise<ProviderCatalogSuccess> {
    try {
      signal.throwIfAborted();
      const { data: page, request_id: rawRequestId } = await this.client.models
        .list({ signal })
        .withResponse();
      const result: ProviderCatalogSuccess = {
        checkedAt: this.clock.now().toISOString(),
        model: this.model,
        modelAvailable: page.data.some((model) => model.id === this.model),
        profileId: this.profileId,
        requestId: requestId(rawRequestId),
        state: "catalog_reachable",
      };
      if (!catalogValidator.Check(result)) throw new Error("invalid provider catalog");
      return result;
    } catch (error) {
      throw this.failure(error);
    }
  }

  async checkReadiness(signal: AbortSignal): Promise<ProviderReadinessSuccess> {
    try {
      signal.throwIfAborted();
      const request = this.client.chat.completions.create(
        {
          max_tokens: 8,
          messages: [{ content: fixedReadinessPrompt, role: "user" }],
          model: this.model,
          stream: true,
        },
        { signal },
      );
      const { data: stream, request_id: rawRequestId } = await request.withResponse();
      let answer = "";
      let finished = false;
      for await (const chunk of stream) {
        if (chunk.choices.length !== 1) throw new Error("invalid choice count");
        const choice = chunk.choices[0];
        if (choice === undefined || choice.index !== 0) throw new Error("invalid choice index");
        const allowedDeltaKeys = new Set(["content", "refusal", "role"]);
        if (Object.keys(choice.delta).some((key) => !allowedDeltaKeys.has(key))) {
          throw new Error("unsupported readiness delta");
        }
        if (choice.delta.refusal !== undefined && choice.delta.refusal !== null) {
          throw new Error("readiness refusal");
        }
        if (typeof choice.delta.content === "string") answer += choice.delta.content;
        if (choice.finish_reason !== null) {
          if (choice.finish_reason !== "stop") throw new Error("invalid finish reason");
          finished = true;
        }
        if (Buffer.byteLength(answer, "utf8") > 64) throw new Error("oversized readiness answer");
      }
      if (!finished || answer !== fixedReadinessAnswer) throw new Error("invalid readiness answer");
      const result: ProviderReadinessSuccess = {
        checkedAt: this.clock.now().toISOString(),
        model: this.model,
        profileId: this.profileId,
        requestId: requestId(rawRequestId),
        state: "completion_ready",
      };
      if (!readinessValidator.Check(result)) throw new Error("invalid readiness result");
      return result;
    } catch (error) {
      throw this.failure(error);
    }
  }
}

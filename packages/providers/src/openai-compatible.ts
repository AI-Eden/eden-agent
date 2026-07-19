import { decodeRepositoryToolCall, type RepositoryToolCall } from "@eden/contracts";
import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIError,
  APIUserAbortError,
} from "openai";
import type {
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import Type from "typebox";
import Schema from "typebox/schema";

import type {
  ModelStepObservationV1,
  ModelStepRequestV1,
  ModelUsage,
  ModelVisibleTextListener,
} from "./model-step.ts";
import { decodeModelStepRequest } from "./model-step.ts";

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

type OpenAICompatibleReadinessRequest = ChatCompletionCreateParamsStreaming & {
  readonly thinking: { readonly type: "disabled" };
};

type OpenAICompatibleModelRequest = ChatCompletionCreateParamsStreaming & {
  readonly thinking: { readonly type: "disabled" };
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
      const body: OpenAICompatibleReadinessRequest = {
        max_tokens: 8,
        messages: [{ content: fixedReadinessPrompt, role: "user" }],
        model: this.model,
        stream: true,
        thinking: { type: "disabled" },
      };
      const request = this.client.chat.completions.create(body, { signal });
      const { data: stream, request_id: rawRequestId } = await request.withResponse();
      let answer = "";
      let finished = false;
      for await (const chunk of stream) {
        if (chunk.choices.length !== 1) throw new Error("invalid choice count");
        const choice = chunk.choices[0];
        if (choice === undefined || choice.index !== 0) throw new Error("invalid choice index");
        const delta = choice.delta as typeof choice.delta & {
          readonly reasoning_content?: unknown;
        };
        const allowedDeltaKeys = new Set(["content", "reasoning_content", "refusal", "role"]);
        if (Object.keys(choice.delta).some((key) => !allowedDeltaKeys.has(key))) {
          throw new Error("unsupported readiness delta");
        }
        if (delta.refusal !== undefined && delta.refusal !== null) {
          throw new Error("readiness refusal");
        }
        if (
          delta.reasoning_content !== undefined &&
          delta.reasoning_content !== null &&
          delta.reasoning_content !== ""
        ) {
          throw new Error("unexpected readiness reasoning");
        }
        if (typeof delta.content === "string") answer += delta.content;
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

  async completeModelStep(
    input: ModelStepRequestV1,
    signal: AbortSignal,
    onVisibleText?: ModelVisibleTextListener,
  ): Promise<ModelStepObservationV1> {
    let visibleText = "";
    let privateContinuity = "";
    let receivedApplicationDelta = false;
    try {
      signal.throwIfAborted();
      validateModelStepInput(input);
      const body: OpenAICompatibleModelRequest = {
        max_tokens: input.maxOutputTokens,
        messages: input.conversation.map(conversationMessage),
        model: this.model,
        parallel_tool_calls: false,
        stream: true,
        stream_options: { include_usage: true },
        thinking: { type: "disabled" },
        tools: input.enabledTools.map(repositoryTool),
      };
      const { data: stream, request_id: rawRequestId } = await this.client.chat.completions
        .create(body, { signal })
        .withResponse();
      const toolFragments = new Map<
        number,
        { arguments: string; id: string; name: string; type: string | null }
      >();
      let finishStatus: "stop" | "tool_calls" | null = null;
      let usage: ModelUsage | null = null;
      for await (const chunk of stream) {
        if (chunk.usage !== undefined && chunk.usage !== null) {
          usage = validatedUsage(chunk.usage);
        }
        if (chunk.choices.length === 0) continue;
        if (chunk.choices.length !== 1) throw new Error("invalid choice count");
        const choice = chunk.choices[0];
        if (choice === undefined || choice.index !== 0) throw new Error("invalid choice index");
        const delta = choice.delta as typeof choice.delta & {
          readonly reasoning_content?: unknown;
          readonly tool_calls?: readonly {
            readonly function?: { readonly arguments?: string; readonly name?: string };
            readonly id?: string;
            readonly index: number;
            readonly type?: string;
          }[];
        };
        const allowedDeltaKeys = new Set([
          "content",
          "reasoning_content",
          "refusal",
          "role",
          "tool_calls",
        ]);
        if (Object.keys(choice.delta).some((key) => !allowedDeltaKeys.has(key))) {
          throw new Error("unsupported model delta");
        }
        if (delta.refusal !== undefined && delta.refusal !== null) {
          throw new Error("model refusal is unsupported");
        }
        if (typeof delta.content === "string" && delta.content.length > 0) {
          receivedApplicationDelta = true;
          const offset = visibleText.length;
          visibleText += delta.content;
          if (Buffer.byteLength(visibleText, "utf8") > 32_768) {
            throw new Error("visible output exceeds the durable envelope");
          }
          onVisibleText?.({
            attemptId: input.attemptId,
            offset,
            outputIndex: 0,
            text: delta.content,
            version: 1,
          });
        }
        if (typeof delta.reasoning_content === "string" && delta.reasoning_content.length > 0) {
          receivedApplicationDelta = true;
          privateContinuity += delta.reasoning_content;
          if (Buffer.byteLength(privateContinuity, "utf8") > 8_192) {
            throw new Error("private continuity exceeds the durable envelope");
          }
        }
        for (const fragment of delta.tool_calls ?? []) {
          receivedApplicationDelta = true;
          if (!Number.isInteger(fragment.index) || fragment.index < 0 || fragment.index > 1) {
            throw new Error("invalid tool-call index");
          }
          const current = toolFragments.get(fragment.index) ?? {
            arguments: "",
            id: "",
            name: "",
            type: null,
          };
          if (fragment.id !== undefined) current.id += fragment.id;
          if (fragment.type !== undefined) current.type = fragment.type;
          if (fragment.function?.name !== undefined) current.name += fragment.function.name;
          if (fragment.function?.arguments !== undefined) {
            current.arguments += fragment.function.arguments;
          }
          if (
            Buffer.byteLength(current.arguments, "utf8") > 24_576 ||
            current.id.length > 256 ||
            current.name.length > 128
          ) {
            throw new Error("tool call exceeds the durable envelope");
          }
          toolFragments.set(fragment.index, current);
        }
        if (choice.finish_reason !== null) {
          if (choice.finish_reason !== "stop" && choice.finish_reason !== "tool_calls") {
            throw new Error("unsupported finish reason");
          }
          finishStatus = choice.finish_reason;
        }
      }
      if (finishStatus === null) throw new Error("model stream did not terminate");
      const toolCalls = [...toolFragments.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, fragment]) => decodeToolFragment(fragment));
      if (toolCalls.length > 1) throw new Error("parallel tool calls are unsupported");
      if ((finishStatus === "tool_calls") !== (toolCalls.length === 1)) {
        throw new Error("finish reason does not match tool output");
      }
      return {
        attemptId: input.attemptId,
        finishStatus,
        privateContinuity: privateContinuity.length === 0 ? null : privateContinuity,
        requestId: requestId(rawRequestId),
        status: "completed",
        text: visibleText,
        toolCalls,
        usage,
        version: 1,
      };
    } catch (error) {
      const code = errorCode(error);
      if (receivedApplicationDelta && visibleText.length > 0) {
        const cancellation = signal.aborted || code === "cancellation";
        return {
          attemptId: input.attemptId,
          error: {
            code: cancellation ? "cancellation" : "network",
            message: cancellation
              ? "The model attempt was cancelled after visible output."
              : "The provider stream was interrupted after visible output.",
            recoverability: "ask-user",
            suggestedActions: ["Explicitly retry from the last committed conversation turn."],
          },
          partialText: visibleText,
          status: "interrupted",
          version: 1,
        };
      }
      const description = failureDescriptions[code];
      return {
        attemptId: input.attemptId,
        error: {
          ...description,
          message:
            code === "protocol_incompatibility"
              ? "The provider model output did not match the supported protocol."
              : description.message.replace("readiness check", "model attempt"),
        },
        status: signal.aborted && !receivedApplicationDelta ? "not_started" : "unknown",
        version: 1,
      };
    }
  }
}

const repositoryToolDefinitions: Readonly<Record<RepositoryToolCall["name"], ChatCompletionTool>> =
  {
    git_status: {
      function: {
        description: "Return bounded structured Git status for the trusted repository.",
        name: "git_status",
        parameters: { additionalProperties: false, properties: {}, type: "object" },
        strict: true,
      },
      type: "function",
    },
    list_files: {
      function: {
        description: "List bounded files below one trusted repository-relative path.",
        name: "list_files",
        parameters: {
          additionalProperties: false,
          properties: {
            continuation: { anyOf: [{ type: "string" }, { type: "null" }] },
            path: { type: "string" },
          },
          required: ["continuation", "path"],
          type: "object",
        },
        strict: true,
      },
      type: "function",
    },
    read_file: {
      function: {
        description: "Read one bounded UTF-8 page from a trusted repository-relative file.",
        name: "read_file",
        parameters: {
          additionalProperties: false,
          properties: {
            maxBytes: { maximum: 24576, minimum: 1, type: "integer" },
            offset: { minimum: 0, type: "integer" },
            path: { type: "string" },
          },
          required: ["maxBytes", "offset", "path"],
          type: "object",
        },
        strict: true,
      },
      type: "function",
    },
    search_repository: {
      function: {
        description: "Search repository text with the pinned bounded search engine.",
        name: "search_repository",
        parameters: {
          additionalProperties: false,
          properties: {
            continuation: { anyOf: [{ minimum: 0, type: "integer" }, { type: "null" }] },
            path: { type: "string" },
            pattern: { type: "string" },
          },
          required: ["continuation", "path", "pattern"],
          type: "object",
        },
        strict: true,
      },
      type: "function",
    },
  };

function validateModelStepInput(input: ModelStepRequestV1): void {
  if (
    !decodeModelStepRequest(input).ok ||
    input.version !== 1 ||
    !/^[A-Za-z0-9._:-]{1,256}$/u.test(input.attemptId) ||
    !Number.isInteger(input.maxOutputTokens) ||
    input.maxOutputTokens < 1 ||
    input.maxOutputTokens > 8_192 ||
    input.conversation.length === 0 ||
    input.conversation.length > 64 ||
    input.enabledTools.length > 4 ||
    new Set(input.enabledTools).size !== input.enabledTools.length
  ) {
    throw new Error("invalid model-step input");
  }
}

function conversationMessage(
  item: ModelStepRequestV1["conversation"][number],
): ChatCompletionMessageParam {
  switch (item.role) {
    case "system":
    case "user":
      return { content: item.content, role: item.role };
    case "assistant":
      return {
        content: item.content,
        role: "assistant",
        ...(item.privateContinuity === null ? {} : { reasoning_content: item.privateContinuity }),
        tool_calls: item.toolCalls.map((call) => ({
          function: { arguments: JSON.stringify(call.arguments), name: call.name },
          id: call.toolCallId,
          type: "function",
        })),
      } as ChatCompletionMessageParam;
    case "tool":
      return { content: item.content, role: "tool", tool_call_id: item.toolCallId };
  }
}

function repositoryTool(name: RepositoryToolCall["name"]): ChatCompletionTool {
  const definition = repositoryToolDefinitions[name];
  if (definition === undefined) throw new Error("unsupported repository tool");
  return definition;
}

function decodeToolFragment(fragment: {
  readonly arguments: string;
  readonly id: string;
  readonly name: string;
  readonly type: string | null;
}): RepositoryToolCall {
  if (fragment.type !== null && fragment.type !== "function") {
    throw new Error("unsupported tool-call type");
  }
  let argumentsValue: unknown;
  try {
    argumentsValue = JSON.parse(fragment.arguments);
  } catch {
    throw new Error("malformed tool-call arguments");
  }
  const decoded = decodeRepositoryToolCall({
    arguments: argumentsValue,
    name: fragment.name,
    toolCallId: fragment.id,
  });
  if (!decoded.ok) throw new Error("invalid repository tool call");
  return decoded.value;
}

function validatedUsage(value: {
  readonly completion_tokens: number;
  readonly prompt_tokens: number;
  readonly total_tokens: number;
}): ModelUsage {
  const values = [value.completion_tokens, value.prompt_tokens, value.total_tokens];
  if (values.some((token) => !Number.isSafeInteger(token) || token < 0)) {
    throw new Error("invalid provider usage");
  }
  return {
    completionTokens: value.completion_tokens,
    promptTokens: value.prompt_tokens,
    totalTokens: value.total_tokens,
  };
}

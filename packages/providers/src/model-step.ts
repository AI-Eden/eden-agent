import {
  type RepositoryToolCall,
  RepositoryToolCallSchema,
  type RepositoryToolResult,
} from "@eden/contracts";
import Type from "typebox";
import Schema from "typebox/schema";

import type { ProviderAdapterFailure } from "./openai-compatible.ts";

export type ModelConversationItem =
  | { readonly content: string; readonly role: "system" | "user" }
  | {
      readonly content: string | null;
      readonly privateContinuity: string | null;
      readonly role: "assistant";
      readonly toolCalls: readonly RepositoryToolCall[];
    }
  | {
      readonly content: string;
      readonly name: RepositoryToolResult["name"];
      readonly role: "tool";
      readonly toolCallId: string;
    };

export type ModelStepRequestV1 = {
  readonly attemptId: string;
  readonly conversation: readonly ModelConversationItem[];
  readonly enabledTools: readonly RepositoryToolCall["name"][];
  readonly maxOutputTokens: number;
  readonly version: 1;
};

export type ModelVisibleTextDeltaV1 = {
  readonly attemptId: string;
  readonly offset: number;
  readonly outputIndex: 0;
  readonly text: string;
  readonly version: 1;
};

export type ModelUsage = {
  readonly completionTokens: number;
  readonly promptTokens: number;
  readonly totalTokens: number;
};

type AttemptError = Pick<
  ProviderAdapterFailure,
  "code" | "message" | "recoverability" | "suggestedActions"
>;

export type ModelStepObservationV1 =
  | {
      readonly attemptId: string;
      readonly finishStatus: "stop" | "tool_calls";
      readonly privateContinuity: string | null;
      readonly requestId: string | null;
      readonly status: "completed";
      readonly text: string;
      readonly toolCalls: readonly RepositoryToolCall[];
      readonly usage: ModelUsage | null;
      readonly version: 1;
    }
  | {
      readonly attemptId: string;
      readonly error: AttemptError;
      readonly status: "not_started" | "unknown";
      readonly version: 1;
    }
  | {
      readonly attemptId: string;
      readonly error: AttemptError;
      readonly partialText: string;
      readonly status: "interrupted";
      readonly version: 1;
    };

export type ModelVisibleTextListener = (delta: ModelVisibleTextDeltaV1) => void;

export interface ModelStepDriver {
  completeModelStep(
    input: ModelStepRequestV1,
    signal: AbortSignal,
    onVisibleText?: ModelVisibleTextListener,
  ): Promise<ModelStepObservationV1>;
}

const closed = { additionalProperties: false } as const;
const identifier = () => Type.String({ maxLength: 256, minLength: 1 });
const utf8Text = (maxBytes: number) =>
  Type.Refine(
    Type.String({ maxLength: maxBytes }),
    (value) => new TextEncoder().encode(value).byteLength <= maxBytes,
  );
const toolName = Type.Union([
  Type.Literal("list_files"),
  Type.Literal("read_file"),
  Type.Literal("search_repository"),
  Type.Literal("git_status"),
]);
const conversationItem = Type.Union([
  Type.Object(
    {
      content: utf8Text(32_768),
      role: Type.Union([Type.Literal("system"), Type.Literal("user")]),
    },
    closed,
  ),
  Type.Object(
    {
      content: Type.Union([utf8Text(32_768), Type.Null()]),
      privateContinuity: Type.Union([utf8Text(8_192), Type.Null()]),
      role: Type.Literal("assistant"),
      toolCalls: Type.Array(RepositoryToolCallSchema, { maxItems: 1 }),
    },
    closed,
  ),
  Type.Object(
    {
      content: utf8Text(32_768),
      name: toolName,
      role: Type.Literal("tool"),
      toolCallId: identifier(),
    },
    closed,
  ),
]);

export const ModelStepRequestV1Schema = Type.Object(
  {
    attemptId: identifier(),
    conversation: Type.Array(conversationItem, { maxItems: 272, minItems: 1 }),
    enabledTools: Type.Array(toolName, { maxItems: 4 }),
    maxOutputTokens: Type.Integer({ maximum: 8_192, minimum: 1 }),
    version: Type.Literal(1),
  },
  closed,
);

const attemptError = Type.Object(
  {
    code: Type.Union([
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
    ]),
    message: Type.String({ maxLength: 512, minLength: 1 }),
    recoverability: Type.Union([
      Type.Literal("retry"),
      Type.Literal("reconfigure"),
      Type.Literal("ask-user"),
      Type.Literal("fatal"),
    ]),
    suggestedActions: Type.Array(Type.String({ maxLength: 512, minLength: 1 }), {
      maxItems: 4,
    }),
  },
  closed,
);
const modelUsage = Type.Refine(
  Type.Object(
    {
      completionTokens: Type.Integer({ minimum: 0 }),
      promptTokens: Type.Integer({ minimum: 0 }),
      totalTokens: Type.Integer({ minimum: 0 }),
    },
    closed,
  ),
  (value) => value.totalTokens === value.promptTokens + value.completionTokens,
);
export const ModelStepObservationV1Schema = Type.Union([
  Type.Refine(
    Type.Object(
      {
        attemptId: identifier(),
        finishStatus: Type.Union([Type.Literal("stop"), Type.Literal("tool_calls")]),
        privateContinuity: Type.Union([Type.String({ maxLength: 8_192 }), Type.Null()]),
        requestId: Type.Union([Type.String({ maxLength: 128, minLength: 1 }), Type.Null()]),
        status: Type.Literal("completed"),
        text: Type.String({ maxLength: 32_768 }),
        toolCalls: Type.Array(RepositoryToolCallSchema, { maxItems: 1 }),
        usage: Type.Union([modelUsage, Type.Null()]),
        version: Type.Literal(1),
      },
      closed,
    ),
    (value) =>
      new TextEncoder().encode(value.text).byteLength <= 32_768 &&
      (value.privateContinuity === null ||
        new TextEncoder().encode(value.privateContinuity).byteLength <= 8_192) &&
      ((value.finishStatus === "stop" && value.toolCalls.length === 0) ||
        (value.finishStatus === "tool_calls" && value.toolCalls.length === 1)),
  ),
  Type.Object(
    {
      attemptId: identifier(),
      error: attemptError,
      status: Type.Union([Type.Literal("not_started"), Type.Literal("unknown")]),
      version: Type.Literal(1),
    },
    closed,
  ),
  Type.Refine(
    Type.Object(
      {
        attemptId: identifier(),
        error: attemptError,
        partialText: Type.String({ maxLength: 32_768 }),
        status: Type.Literal("interrupted"),
        version: Type.Literal(1),
      },
      closed,
    ),
    (value) => new TextEncoder().encode(value.partialText).byteLength <= 32_768,
  ),
]);

const requestValidator = Schema.Compile(ModelStepRequestV1Schema);
const observationValidator = Schema.Compile(ModelStepObservationV1Schema);

export function decodeModelStepRequest(value: unknown) {
  return requestValidator.Check(value)
    ? ({ ok: true, value } as const)
    : ({ code: "invalid_model_step_request", ok: false } as const);
}

export function decodeModelStepObservation(value: unknown) {
  return observationValidator.Check(value)
    ? ({ ok: true, value } as const)
    : ({ code: "invalid_model_step_observation", ok: false } as const);
}

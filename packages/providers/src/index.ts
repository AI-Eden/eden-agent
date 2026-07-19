import { RepositoryToolCallSchema, RepositoryToolResultSchema } from "@eden/contracts";
import Type from "typebox";
import Schema from "typebox/schema";

export * from "./model-step.ts";
export * from "./openai-compatible.ts";

const closed = { additionalProperties: false } as const;

export const FakeModelRequestV1Schema = Type.Object(
  {
    task: Type.String({ maxLength: 4_096, minLength: 1 }),
    toolResult: Type.Optional(RepositoryToolResultSchema),
    version: Type.Literal(1),
  },
  closed,
);

export const FakeModelResponseV1Schema = Type.Object(
  {
    proposal: Type.Union([
      Type.Object(
        {
          kind: Type.Literal("deterministic-fake-action"),
          summary: Type.Literal("Run the deterministic fake task"),
        },
        closed,
      ),
      Type.Object(
        { call: RepositoryToolCallSchema, kind: Type.Literal("repository-tool-call") },
        closed,
      ),
    ]),
    version: Type.Literal(1),
  },
  closed,
);

export type FakeModelRequestV1 = Type.Static<typeof FakeModelRequestV1Schema>;
export type FakeModelResponseV1 = Type.Static<typeof FakeModelResponseV1Schema>;

export type FakeModelDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: "invalid_fake_model_value" };

const requestValidator = Schema.Compile(FakeModelRequestV1Schema);
const responseValidator = Schema.Compile(FakeModelResponseV1Schema);

export function decodeFakeModelRequest(value: unknown): FakeModelDecodeResult<FakeModelRequestV1> {
  return requestValidator.Check(value)
    ? { ok: true, value }
    : { code: "invalid_fake_model_value", ok: false };
}

export function decodeFakeModelResponse(
  value: unknown,
): FakeModelDecodeResult<FakeModelResponseV1> {
  return responseValidator.Check(value)
    ? { ok: true, value }
    : { code: "invalid_fake_model_value", ok: false };
}

export interface ModelDriver {
  readonly id: string;
  complete(request: FakeModelRequestV1, signal: AbortSignal): Promise<FakeModelResponseV1>;
}

export class FakeModelDriver implements ModelDriver {
  readonly id = "fake";

  async complete(request: FakeModelRequestV1, signal: AbortSignal): Promise<FakeModelResponseV1> {
    signal.throwIfAborted();
    if (!decodeFakeModelRequest(request).ok) {
      throw new Error("The fake model request failed validation.");
    }
    if (request.toolResult === undefined) {
      if (request.task === "Search the repository for EDEN_NATIVE_SMOKE.") {
        return {
          proposal: {
            call: {
              arguments: { continuation: null, path: ".", pattern: "EDEN_NATIVE_SMOKE" },
              name: "search_repository",
              toolCallId: "fake-search-repository",
            },
            kind: "repository-tool-call",
          },
          version: 1,
        };
      }
      if (request.task === "Show the current repository status.") {
        return {
          proposal: {
            call: {
              arguments: {},
              name: "git_status",
              toolCallId: "fake-git-status",
            },
            kind: "repository-tool-call",
          },
          version: 1,
        };
      }
    }
    return {
      proposal: {
        kind: "deterministic-fake-action",
        summary: "Run the deterministic fake task",
      },
      version: 1,
    };
  }
}

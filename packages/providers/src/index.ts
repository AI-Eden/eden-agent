import Type from "typebox";
import Schema from "typebox/schema";

const closed = { additionalProperties: false } as const;

export const FakeModelRequestV1Schema = Type.Object(
  {
    task: Type.String({ maxLength: 4_096, minLength: 1 }),
    version: Type.Literal(1),
  },
  closed,
);

export const FakeModelResponseV1Schema = Type.Object(
  {
    proposal: Type.Object(
      {
        kind: Type.Literal("deterministic-fake-action"),
        summary: Type.Literal("Run the deterministic fake task"),
      },
      closed,
    ),
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
    return {
      proposal: {
        kind: "deterministic-fake-action",
        summary: "Run the deterministic fake task",
      },
      version: 1,
    };
  }
}

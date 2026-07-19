import Type from "typebox";
import Schema from "typebox/schema";

const closed = { additionalProperties: false } as const;
const safePositiveInteger = {
  maximum: Number.MAX_SAFE_INTEGER,
  minimum: 1,
} as const;
const ProfileIdSchema = Type.String({
  maxLength: 64,
  minLength: 1,
  pattern: "^[a-z0-9][a-z0-9-]{0,63}$",
});
const revisionSchema = Type.Integer({ maximum: Number.MAX_SAFE_INTEGER, minimum: 0 });
const commandIdSchema = Type.String({ maxLength: 256, minLength: 1 });
const environmentNameSchema = Type.String({
  maxLength: 128,
  minLength: 1,
  pattern: "^[A-Za-z_][A-Za-z0-9_]{0,127}$",
});
const protocolSchema = Type.Literal("openai_chat_completions");
const billingSourceSchema = Type.Union([
  Type.Literal("pay_as_you_go"),
  Type.Literal("subscription_api_key"),
  Type.Literal("custom"),
]);
const reasoningDisplaySchema = Type.Literal("off");
const readinessStateSchema = Type.Union([
  Type.Literal("unverified"),
  Type.Literal("catalog_reachable"),
  Type.Literal("completion_ready"),
]);
const baseUrlSchema = Type.Refine(Type.String({ maxLength: 2_048, minLength: 1 }), (value) => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
});

export const ProviderCredentialInputSchema = Type.Union([
  Type.Object({ name: environmentNameSchema, source: Type.Literal("environment") }, closed),
  Type.Object(
    { source: Type.Literal("inline"), value: Type.String({ maxLength: 8_192, minLength: 1 }) },
    closed,
  ),
]);
export type ProviderCredentialInput = Type.Static<typeof ProviderCredentialInputSchema>;

export const ProviderProfileInputSchema = Type.Object(
  {
    baseUrl: baseUrlSchema,
    billingSource: billingSourceSchema,
    contextWindowTokens: Type.Integer(safePositiveInteger),
    credential: ProviderCredentialInputSchema,
    id: ProfileIdSchema,
    maxOutputTokens: Type.Integer(safePositiveInteger),
    model: Type.String({ maxLength: 256, minLength: 1 }),
    protocol: protocolSchema,
    reasoningDisplay: reasoningDisplaySchema,
  },
  closed,
);
export type ProviderProfileInput = Type.Static<typeof ProviderProfileInputSchema>;

const ProviderCredentialSummarySchema = Type.Union([
  Type.Object(
    {
      name: environmentNameSchema,
      presence: Type.Union([Type.Literal("present"), Type.Literal("missing")]),
      source: Type.Literal("environment"),
    },
    closed,
  ),
  Type.Object({ presence: Type.Literal("present"), source: Type.Literal("inline") }, closed),
]);

export const ProviderProfileSummarySchema = Type.Object(
  {
    ...ProviderProfileInputSchema.properties,
    credential: ProviderCredentialSummarySchema,
    readiness: readinessStateSchema,
  },
  closed,
);
export type ProviderProfileSummary = Type.Static<typeof ProviderProfileSummarySchema>;

export const ProviderProfileCatalogSchema = Type.Object(
  {
    activeProfileId: Type.Union([ProfileIdSchema, Type.Null()]),
    notice: Type.Null(),
    profiles: Type.Array(ProviderProfileSummarySchema, { maxItems: 32 }),
    protocolVersion: Type.Literal(1),
    revision: revisionSchema,
  },
  closed,
);
export type ProviderProfileCatalog = Type.Static<typeof ProviderProfileCatalogSchema>;

export const ProviderProfileCheckSchema = Type.Refine(
  Type.Object(
    {
      profile: Type.Union([ProviderProfileSummarySchema, Type.Null()]),
      protocolVersion: Type.Literal(1),
      revision: revisionSchema,
      state: Type.Union([Type.Literal("unconfigured"), Type.Literal("configured")]),
    },
    closed,
  ),
  (value) =>
    (value.state === "unconfigured" && value.profile === null) ||
    (value.state === "configured" &&
      value.profile !== null &&
      value.profile.credential.presence === "present"),
);
export type ProviderProfileCheck = Type.Static<typeof ProviderProfileCheckSchema>;

export const ProviderConnectionFailureSchema = Type.Object(
  {
    checkedAt: Type.String({ format: "date-time", maxLength: 128 }),
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
    model: Type.String({ maxLength: 256, minLength: 1 }),
    profileId: ProfileIdSchema,
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
export type ProviderConnectionFailure = Type.Static<typeof ProviderConnectionFailureSchema>;

export const ProviderReadinessSchema = Type.Refine(
  Type.Object(
    {
      checkedAt: Type.Union([Type.String({ format: "date-time", maxLength: 128 }), Type.Null()]),
      error: Type.Union([ProviderConnectionFailureSchema, Type.Null()]),
      possibleChargeConfirmationRequired: Type.Boolean(),
      profile: Type.Union([ProviderProfileSummarySchema, Type.Null()]),
      protocolVersion: Type.Literal(1),
      revision: revisionSchema,
      state: Type.Union([
        Type.Literal("unconfigured"),
        Type.Literal("configured"),
        Type.Literal("catalog_reachable"),
        Type.Literal("completion_ready"),
      ]),
    },
    closed,
  ),
  (value) => {
    if (value.state === "unconfigured") {
      return (
        value.profile === null &&
        value.checkedAt === null &&
        value.error === null &&
        value.possibleChargeConfirmationRequired === false
      );
    }
    if (value.profile === null || value.profile.credential.presence !== "present") return false;
    if (value.state === "completion_ready") {
      return (
        value.profile.readiness === "completion_ready" &&
        value.checkedAt !== null &&
        value.error === null &&
        value.possibleChargeConfirmationRequired === false
      );
    }
    if (value.state === "catalog_reachable") {
      return (
        value.profile.readiness === "catalog_reachable" &&
        value.checkedAt !== null &&
        value.possibleChargeConfirmationRequired === true
      );
    }
    return (
      value.profile.readiness === "unverified" &&
      value.possibleChargeConfirmationRequired === true &&
      ((value.checkedAt === null && value.error === null) ||
        (value.checkedAt !== null && value.error !== null))
    );
  },
);
export type ProviderReadiness = Type.Static<typeof ProviderReadinessSchema>;

const profileCommandEnvelope = {
  commandId: commandIdSchema,
  expectedRevision: revisionSchema,
  protocolVersion: Type.Literal(1),
} as const;

export const SaveProviderProfileCommandSchema = Type.Object(
  {
    ...profileCommandEnvelope,
    profile: ProviderProfileInputSchema,
    select: Type.Boolean(),
    type: Type.Literal("provider.profile.save"),
  },
  closed,
);
export type SaveProviderProfileCommand = Type.Static<typeof SaveProviderProfileCommandSchema>;

export const SelectProviderProfileCommandSchema = Type.Object(
  {
    ...profileCommandEnvelope,
    profileId: ProfileIdSchema,
    type: Type.Literal("provider.profile.select"),
  },
  closed,
);
export type SelectProviderProfileCommand = Type.Static<typeof SelectProviderProfileCommandSchema>;

export const DeleteProviderProfileCommandSchema = Type.Object(
  {
    ...profileCommandEnvelope,
    profileId: ProfileIdSchema,
    type: Type.Literal("provider.profile.delete"),
  },
  closed,
);
export type DeleteProviderProfileCommand = Type.Static<typeof DeleteProviderProfileCommandSchema>;

export const ProviderReadinessCommandSchema = Type.Object(
  {
    ...profileCommandEnvelope,
    possibleChargeConfirmed: Type.Literal(true),
    profileId: ProfileIdSchema,
    type: Type.Literal("provider.readiness.check"),
  },
  closed,
);
export type ProviderReadinessCommand = Type.Static<typeof ProviderReadinessCommandSchema>;

type ProfileDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly recoverability: "reconfigure";
        readonly suggestedActions: readonly string[];
      };
      readonly ok: false;
    };

function decode<T>(
  validator: { Check(value: unknown): value is T },
  value: unknown,
): ProfileDecodeResult<T> {
  return validator.Check(value)
    ? { ok: true, value }
    : {
        error: {
          code: "invalid_provider_profile",
          message: "The provider profile value does not match the product contract.",
          recoverability: "reconfigure",
          suggestedActions: ["Correct the provider profile and retry."],
        },
        ok: false,
      };
}

const catalogValidator = Schema.Compile(ProviderProfileCatalogSchema);
const checkValidator = Schema.Compile(ProviderProfileCheckSchema);
const saveValidator = Schema.Compile(SaveProviderProfileCommandSchema);
const selectValidator = Schema.Compile(SelectProviderProfileCommandSchema);
const deleteValidator = Schema.Compile(DeleteProviderProfileCommandSchema);
const readinessProjectionValidator = Schema.Compile(ProviderReadinessSchema);
const readinessCommandValidator = Schema.Compile(ProviderReadinessCommandSchema);

export function decodeProviderProfileCatalog(
  value: unknown,
): ProfileDecodeResult<ProviderProfileCatalog> {
  return decode(catalogValidator, value);
}

export function decodeProviderProfileCheck(
  value: unknown,
): ProfileDecodeResult<ProviderProfileCheck> {
  return decode(checkValidator, value);
}

export function decodeSaveProviderProfileCommand(
  value: unknown,
): ProfileDecodeResult<SaveProviderProfileCommand> {
  return decode(saveValidator, value);
}

export function decodeSelectProviderProfileCommand(
  value: unknown,
): ProfileDecodeResult<SelectProviderProfileCommand> {
  return decode(selectValidator, value);
}

export function decodeDeleteProviderProfileCommand(
  value: unknown,
): ProfileDecodeResult<DeleteProviderProfileCommand> {
  return decode(deleteValidator, value);
}

export function decodeProviderReadiness(value: unknown): ProfileDecodeResult<ProviderReadiness> {
  return decode(readinessProjectionValidator, value);
}

export function decodeProviderReadinessCommand(
  value: unknown,
): ProfileDecodeResult<ProviderReadinessCommand> {
  return decode(readinessCommandValidator, value);
}

import Type from "typebox";
import Schema from "typebox/schema";

import type { KernelEvent } from "./model.ts";

const closed = { additionalProperties: false } as const;
const identifier = () => Type.String({ maxLength: 256, minLength: 1 });
const boundedText = () => Type.String({ maxLength: 4_096, minLength: 1 });

const ProductErrorSchema = Type.Object(
  {
    code: identifier(),
    message: boundedText(),
    recoverability: Type.Union([
      Type.Literal("retry"),
      Type.Literal("reconfigure"),
      Type.Literal("ask-user"),
      Type.Literal("fatal"),
    ]),
    suggestedActions: Type.Array(boundedText(), { maxItems: 8 }),
  },
  closed,
);

const ActionSchema = Type.Object(
  {
    actionId: identifier(),
    approvalId: identifier(),
    canonicalDisplay: boundedText(),
    cwd: boundedText(),
    digest: boundedText(),
    reason: boundedText(),
    scope: boundedText(),
  },
  closed,
);

const RunWorkspaceSchema = Type.Object(
  {
    name: boundedText(),
    root: boundedText(),
    trust: Type.Literal("trusted"),
    workspaceId: identifier(),
  },
  closed,
);

function isPortableRepositoryPath(value: string): boolean {
  if (
    value === "." ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.startsWith("\\") ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    return value === ".";
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

const RepositoryPathSchema = Type.Refine(
  Type.String({ maxLength: 4_096, minLength: 1 }),
  isPortableRepositoryPath,
);
const ListFilesToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        continuation: Type.Union([RepositoryPathSchema, Type.Null()]),
        path: RepositoryPathSchema,
      },
      closed,
    ),
    name: Type.Literal("list_files"),
    toolCallId: identifier(),
  },
  closed,
);
const ReadFileToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        maxBytes: Type.Integer({ maximum: 24_576, minimum: 1 }),
        offset: Type.Integer({ minimum: 0 }),
        path: RepositoryPathSchema,
      },
      closed,
    ),
    name: Type.Literal("read_file"),
    toolCallId: identifier(),
  },
  closed,
);
const SearchPatternSchema = Type.Refine(
  Type.String({ maxLength: 1_024, minLength: 1 }),
  (value) => !value.includes("\0"),
);
const SearchRepositoryToolCallSchema = Type.Object(
  {
    arguments: Type.Object(
      {
        continuation: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
        path: RepositoryPathSchema,
        pattern: SearchPatternSchema,
      },
      closed,
    ),
    name: Type.Literal("search_repository"),
    toolCallId: identifier(),
  },
  closed,
);
const GitStatusToolCallSchema = Type.Object(
  {
    arguments: Type.Object({}, closed),
    name: Type.Literal("git_status"),
    toolCallId: identifier(),
  },
  closed,
);
const RepositoryToolCallSchema = Type.Union([
  ListFilesToolCallSchema,
  ReadFileToolCallSchema,
  SearchRepositoryToolCallSchema,
  GitStatusToolCallSchema,
]);
const ListFilesEntrySchema = Type.Union([
  Type.Object(
    { kind: Type.Literal("directory"), path: RepositoryPathSchema, size: Type.Null() },
    closed,
  ),
  Type.Object(
    {
      kind: Type.Literal("file"),
      path: RepositoryPathSchema,
      size: Type.Integer({ minimum: 0 }),
    },
    closed,
  ),
]);
const contentHash = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
const ListFilesToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash,
          continuation: Type.Union([RepositoryPathSchema, Type.Null()]),
          entries: Type.Array(ListFilesEntrySchema, { maxItems: 256 }),
          sourcePath: RepositoryPathSchema,
          truncated: Type.Boolean(),
          visited: Type.Integer({ maximum: 4_096, minimum: 0 }),
        },
        closed,
      ),
      name: Type.Literal("list_files"),
      status: Type.Literal("succeeded"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (value) =>
    value.data.truncated === (value.data.continuation !== null) &&
    new TextEncoder().encode(JSON.stringify(value.data.entries)).byteLength <= 24_576,
);
const ReadFileToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          bytesRead: Type.Integer({ maximum: 24_576, minimum: 0 }),
          content: Type.String({ maxLength: 24_576 }),
          contentHash,
          nextOffset: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
          offset: Type.Integer({ minimum: 0 }),
          sourcePath: RepositoryPathSchema,
          totalBytes: Type.Integer({ minimum: 0 }),
        },
        closed,
      ),
      name: Type.Literal("read_file"),
      status: Type.Literal("succeeded"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (value) =>
    new TextEncoder().encode(value.data.content).byteLength === value.data.bytesRead &&
    value.data.offset + value.data.bytesRead <= value.data.totalBytes &&
    (value.data.nextOffset === null
      ? value.data.offset + value.data.bytesRead === value.data.totalBytes
      : value.data.nextOffset === value.data.offset + value.data.bytesRead &&
        value.data.nextOffset < value.data.totalBytes),
);
const SearchMatchSchema = Type.Object(
  {
    byteColumn: Type.Integer({ minimum: 1 }),
    lineNumber: Type.Integer({ minimum: 1 }),
    path: RepositoryPathSchema,
    preview: Type.String({ maxLength: 4_096 }),
  },
  closed,
);
const SearchRepositoryToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash,
          continuation: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
          engine: Type.Object(
            {
              contentHash,
              name: Type.Literal("ripgrep"),
              version: Type.String({ maxLength: 64, minLength: 1 }),
            },
            closed,
          ),
          matches: Type.Array(SearchMatchSchema, { maxItems: 256 }),
          sourcePath: RepositoryPathSchema,
          truncated: Type.Boolean(),
        },
        closed,
      ),
      name: Type.Literal("search_repository"),
      status: Type.Literal("succeeded"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (value) =>
    value.data.truncated === (value.data.continuation !== null) &&
    new TextEncoder().encode(JSON.stringify(value.data.matches)).byteLength <= 24_576,
);
const GitStatusCodeSchema = Type.String({ maxLength: 1, minLength: 1, pattern: "^[.MADRCUT?!]$" });
const GitStatusEntrySchema = Type.Refine(
  Type.Object(
    {
      indexStatus: GitStatusCodeSchema,
      kind: Type.Union([
        Type.Literal("added"),
        Type.Literal("copied"),
        Type.Literal("deleted"),
        Type.Literal("modified"),
        Type.Literal("renamed"),
        Type.Literal("unmerged"),
        Type.Literal("untracked"),
      ]),
      originalPath: Type.Union([RepositoryPathSchema, Type.Null()]),
      path: RepositoryPathSchema,
      worktreeStatus: GitStatusCodeSchema,
    },
    closed,
  ),
  (value) =>
    (value.kind === "renamed" || value.kind === "copied") === (value.originalPath !== null),
);
const GitStatusToolSuccessSchema = Type.Refine(
  Type.Object(
    {
      data: Type.Object(
        {
          contentHash,
          entries: Type.Array(GitStatusEntrySchema, { maxItems: 256 }),
          gitVersion: Type.String({ maxLength: 64, minLength: 1 }),
          sourcePath: Type.Literal("."),
        },
        closed,
      ),
      name: Type.Literal("git_status"),
      status: Type.Literal("succeeded"),
      toolCallId: identifier(),
    },
    closed,
  ),
  (value) => new TextEncoder().encode(JSON.stringify(value.data.entries)).byteLength <= 24_576,
);
const RepositoryToolFailureSchema = Type.Object(
  {
    error: ProductErrorSchema,
    name: Type.Union([
      Type.Literal("list_files"),
      Type.Literal("read_file"),
      Type.Literal("search_repository"),
      Type.Literal("git_status"),
    ]),
    status: Type.Literal("failed"),
    toolCallId: identifier(),
  },
  closed,
);
const RepositoryToolResultSchema = Type.Union([
  ListFilesToolSuccessSchema,
  ReadFileToolSuccessSchema,
  SearchRepositoryToolSuccessSchema,
  GitStatusToolSuccessSchema,
  RepositoryToolFailureSchema,
]);

const FakeActionEffectSchema = Type.Object(
  { effectId: identifier(), runId: identifier(), type: Type.Literal("fake.action.execute") },
  closed,
);
const FakeModelEffectSchema = Type.Object(
  {
    effectId: identifier(),
    runId: identifier(),
    task: boundedText(),
    toolResult: Type.Optional(RepositoryToolResultSchema),
    type: Type.Literal("fake.model.complete"),
  },
  closed,
);
const RepositoryToolEffectSchema = Type.Object(
  {
    effectId: identifier(),
    runId: identifier(),
    toolCall: RepositoryToolCallSchema,
    type: Type.Literal("repository.tool.execute"),
  },
  closed,
);
const FakeVerificationEffectSchema = Type.Object(
  { effectId: identifier(), runId: identifier(), type: Type.Literal("fake.verification.run") },
  closed,
);
export const KernelEffectSchema = Type.Union([
  FakeModelEffectSchema,
  RepositoryToolEffectSchema,
  FakeActionEffectSchema,
  FakeVerificationEffectSchema,
]);

export const KernelEventSchema = Type.Union([
  Type.Object(
    {
      correlationId: identifier(),
      runId: identifier(),
      task: boundedText(),
      type: Type.Literal("run.started"),
      workspace: RunWorkspaceSchema,
    },
    closed,
  ),
  Type.Object(
    {
      effectId: identifier(),
      toolCall: RepositoryToolCallSchema,
      type: Type.Literal("fake.model.tool-requested"),
    },
    closed,
  ),
  Type.Object(
    {
      effectId: identifier(),
      result: RepositoryToolResultSchema,
      type: Type.Literal("repository.tool.completed"),
    },
    closed,
  ),
  Type.Object(
    {
      action: ActionSchema,
      effectId: identifier(),
      type: Type.Literal("fake.model.completed"),
    },
    closed,
  ),
  Type.Object(
    {
      approvalId: identifier(),
      decision: Type.Union([Type.Literal("approve"), Type.Literal("deny")]),
      type: Type.Literal("approval.resolved"),
    },
    closed,
  ),
  Type.Object({ effect: KernelEffectSchema, type: Type.Literal("effect.requested") }, closed),
  Type.Object({ effectId: identifier(), type: Type.Literal("fake.action.completed") }, closed),
  Type.Object(
    {
      effectId: identifier(),
      evidenceRef: identifier(),
      passed: Type.Boolean(),
      type: Type.Literal("verification.completed"),
    },
    closed,
  ),
  Type.Object({ type: Type.Literal("run.cancelled") }, closed),
  Type.Object({ error: ProductErrorSchema, type: Type.Literal("run.blocked") }, closed),
]);

export type KernelEventDecodeResult =
  | { readonly ok: true; readonly value: KernelEvent }
  | { readonly ok: false; readonly code: "invalid_kernel_event" };

const eventValidator = Schema.Compile(KernelEventSchema);

export function decodeKernelEvent(value: unknown): KernelEventDecodeResult {
  return eventValidator.Check(value)
    ? { ok: true, value }
    : { code: "invalid_kernel_event", ok: false };
}

import Type from "typebox";
import Schema from "typebox/schema";

import {
  ActionIdSchema,
  type DecodeResult,
  type ProductError,
  ProductErrorSchema,
  RepositoryPathSchema,
  RevisionSchema,
  RunIdSchema,
} from "./protocol.ts";
import {
  RepositoryCheckBudgetsSchema,
  RepositoryCheckDockerCompatibilityV1Schema,
  RepositoryCheckMountsSchema,
  RepositoryCheckOperationSchema,
  RepositoryCheckProfileSchema,
  RepositoryCheckStagingSchema,
  RepositoryCheckToolchainIdentitySchema,
  RepositorySnapshotManifestV1Schema,
} from "./repository-check.ts";

const closed = { additionalProperties: false } as const;
const sha256Schema = Type.String({ pattern: "^sha256:[a-f0-9]{64}$" });
const digestSchema = Type.String({ pattern: "^[a-f0-9]{64}$" });
const identifierSchema = Type.String({ maxLength: 256, minLength: 1 });
const boundedText = () => Type.String({ maxLength: 4_096, minLength: 1 });
const reviewText = () => Type.String({ maxLength: 57_344 });
const utf8 = new TextEncoder();

export const FileSnapshotSchema = Type.Object(
  {
    path: RepositoryPathSchema,
    byteLength: Type.Integer({ maximum: 1_048_576, minimum: 0 }),
    sha256: sha256Schema,
  },
  closed,
);
export type FileSnapshot = Type.Static<typeof FileSnapshotSchema>;

export const AnchorReplacementSchema = Type.Object(
  {
    oldText: Type.String({ maxLength: 16_384, minLength: 1 }),
    newText: Type.String({ maxLength: 16_384 }),
    expectedOccurrences: Type.Literal(1),
  },
  closed,
);
export type AnchorReplacement = Type.Static<typeof AnchorReplacementSchema>;

export const AnchorEditOperationSchema = Type.Refine(
  Type.Object(
    {
      type: Type.Literal("anchor_edit"),
      path: RepositoryPathSchema,
      baseByteLength: Type.Integer({ maximum: 1_048_576, minimum: 0 }),
      baseSha256: sha256Schema,
      desiredByteLength: Type.Integer({ maximum: 1_048_576, minimum: 0 }),
      desiredSha256: sha256Schema,
      replacements: Type.Array(AnchorReplacementSchema, { maxItems: 16, minItems: 1 }),
    },
    closed,
  ),
  (operation) =>
    operation.baseSha256 !== operation.desiredSha256 &&
    utf8.encode(JSON.stringify(operation.replacements)).byteLength <= 16_384,
);
export type AnchorEditOperation = Type.Static<typeof AnchorEditOperationSchema>;

export const WriteFileOperationSchema = Type.Refine(
  Type.Object(
    {
      byteLength: Type.Integer({ maximum: 32_768, minimum: 0 }),
      content: Type.String({ maxLength: 32_768 }),
      mode: Type.Literal(420),
      parent: Type.Object(
        {
          device: Type.String({ pattern: "^[0-9]+$" }),
          inode: Type.String({ pattern: "^[0-9]+$" }),
          path: RepositoryPathSchema,
        },
        closed,
      ),
      path: RepositoryPathSchema,
      sha256: sha256Schema,
      targetState: Type.Literal("absent"),
      type: Type.Literal("write_file"),
    },
    closed,
  ),
  (operation) => utf8.encode(operation.content).byteLength === operation.byteLength,
);
export type WriteFileOperation = Type.Static<typeof WriteFileOperationSchema>;

export const RunCommandOperationSchema = Type.Refine(
  Type.Object(
    {
      args: Type.Array(Type.String({ maxLength: 4_096 }), { maxItems: 64 }),
      cwd: RepositoryPathSchema,
      cwdIdentity: Type.Object(
        {
          device: Type.String({ pattern: "^[0-9]+$" }),
          inode: Type.String({ pattern: "^[0-9]+$" }),
        },
        closed,
      ),
      environment: Type.Object(
        {
          lang: Type.Literal("C.UTF-8"),
          lcAll: Type.Literal("C.UTF-8"),
          noColor: Type.Literal("1"),
          path: Type.String({ maxLength: 16_384 }),
        },
        closed,
      ),
      executable: Type.Object(
        {
          byteLength: Type.Integer({ maximum: 134_217_728, minimum: 1 }),
          device: Type.String({ pattern: "^[0-9]+$" }),
          inode: Type.String({ pattern: "^[0-9]+$" }),
          path: Type.String({ maxLength: 4_096, minLength: 1 }),
          sha256: sha256Schema,
        },
        closed,
      ),
      network: Type.Literal("host_unrestricted"),
      program: Type.String({ pattern: "^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$" }),
      reason: boundedText(),
      timeoutMs: Type.Integer({ maximum: 600_000, minimum: 1 }),
      type: Type.Literal("run_command"),
    },
    closed,
  ),
  (operation) => operation.args.every((argument) => !argument.includes("\0")),
);
export type RunCommandOperation = Type.Static<typeof RunCommandOperationSchema>;

export const GitTrackedQueryOperationSchema = Type.Object(
  { type: Type.Literal("git_tracked_query"), path: RepositoryPathSchema },
  closed,
);
export const GitDiffOperationSchema = Type.Object(
  { type: Type.Literal("git_diff"), head: Type.String({ pattern: "^[a-f0-9]{40,64}$" }) },
  closed,
);
export const GitDiffCheckOperationSchema = Type.Object(
  { type: Type.Literal("git_diff_check"), head: Type.String({ pattern: "^[a-f0-9]{40,64}$" }) },
  closed,
);
const HostOperationSchema = Type.Union([
  AnchorEditOperationSchema,
  GitTrackedQueryOperationSchema,
  GitDiffOperationSchema,
  GitDiffCheckOperationSchema,
  WriteFileOperationSchema,
  RunCommandOperationSchema,
]);

const commonActionProperties = {
  actionVersion: Type.Literal(1),
  actionId: ActionIdSchema,
  runId: RunIdSchema,
  proposalRevision: RevisionSchema,
  workspace: Type.Object(
    { workspaceId: identifierSchema, canonicalRootHash: sha256Schema },
    closed,
  ),
  cwd: Type.Literal("."),
  lifetime: Type.Object(
    { kind: Type.Literal("single_use_proposal_revision"), revision: RevisionSchema },
    closed,
  ),
} as const;

const HostActionEnvelopeV1Schema = Type.Refine(
  Type.Object(
    {
      ...commonActionProperties,
      kind: Type.Union([
        Type.Literal("anchor_edit"),
        Type.Literal("git_tracked_query"),
        Type.Literal("git_diff"),
        Type.Literal("git_diff_check"),
        Type.Literal("write_file"),
        Type.Literal("run_command"),
      ]),
      operation: HostOperationSchema,
      scope: Type.Object(
        {
          capability: boundedText(),
          paths: Type.Array(RepositoryPathSchema, { maxItems: 1 }),
        },
        closed,
      ),
      baseSnapshots: Type.Array(FileSnapshotSchema, { maxItems: 1 }),
      authority: Type.Object(
        {
          policyVersion: Type.Literal(1),
          ruleSetRevision: identifierSchema,
          environmentClass: Type.Union([
            Type.Literal("none"),
            Type.Literal("scrubbed_git"),
            Type.Literal("closed_non_secret"),
          ]),
          network: Type.Union([Type.Literal("not_requested"), Type.Literal("host_unrestricted")]),
          executionMode: Type.Literal("trusted_host_policy_only"),
        },
        closed,
      ),
      budgets: Type.Object(
        {
          timeoutMs: Type.Union([Type.Integer({ maximum: 600_000, minimum: 1 }), Type.Null()]),
          outputBytes: Type.Union([Type.Integer({ maximum: 2_097_152, minimum: 1 }), Type.Null()]),
        },
        closed,
      ),
    },
    closed,
  ),
  (envelope) => {
    if (
      envelope.kind !== envelope.operation.type ||
      envelope.proposalRevision !== envelope.lifetime.revision ||
      utf8.encode(JSON.stringify(envelope)).byteLength >
        (envelope.operation.type === "write_file" || envelope.operation.type === "run_command"
          ? 57_344
          : 24_576)
    ) {
      return false;
    }
    if (envelope.operation.type === "anchor_edit") {
      const snapshot = envelope.baseSnapshots[0];
      return (
        envelope.scope.paths.length === 1 &&
        envelope.scope.paths[0] === envelope.operation.path &&
        envelope.scope.capability === "workspace.write.existing_tracked_utf8" &&
        snapshot !== undefined &&
        envelope.baseSnapshots.length === 1 &&
        snapshot.path === envelope.operation.path &&
        snapshot.byteLength === envelope.operation.baseByteLength &&
        snapshot.sha256 === envelope.operation.baseSha256 &&
        envelope.authority.environmentClass === "none" &&
        envelope.budgets.timeoutMs === null &&
        envelope.budgets.outputBytes === null
      );
    }
    if (envelope.operation.type === "write_file") {
      return (
        envelope.scope.paths.length === 1 &&
        envelope.scope.paths[0] === envelope.operation.path &&
        envelope.scope.capability === "workspace.write.new_utf8_exclusive" &&
        envelope.baseSnapshots.length === 0 &&
        envelope.authority.environmentClass === "none" &&
        envelope.budgets.timeoutMs === null &&
        envelope.budgets.outputBytes === null &&
        utf8.encode(JSON.stringify(envelope)).byteLength <= 57_344
      );
    }
    if (envelope.operation.type === "run_command") {
      return (
        envelope.scope.paths.length === 1 &&
        envelope.scope.paths[0] === envelope.operation.cwd &&
        envelope.scope.capability === "process.execute.structured_trusted_host" &&
        envelope.baseSnapshots.length === 0 &&
        envelope.authority.environmentClass === "closed_non_secret" &&
        envelope.authority.network === "host_unrestricted" &&
        envelope.budgets.timeoutMs === envelope.operation.timeoutMs &&
        envelope.budgets.outputBytes === 131_072
      );
    }
    return (
      envelope.baseSnapshots.length === 0 &&
      envelope.authority.environmentClass === "scrubbed_git" &&
      envelope.budgets.timeoutMs === 5_000 &&
      envelope.budgets.outputBytes === 2_097_152
    );
  },
);

export const RepositoryCheckActionEnvelopeV1Schema = Type.Refine(
  Type.Object(
    {
      ...commonActionProperties,
      authority: Type.Object(
        {
          environmentClass: Type.Literal("closed_non_secret"),
          executionMode: Type.Literal("docker_container"),
          isolation: Type.Literal("linux_container"),
          network: Type.Literal("none"),
          policyVersion: Type.Literal(1),
          ruleSetRevision: Type.Literal("r2-docker-repository-check-v1"),
        },
        closed,
      ),
      baseSnapshots: Type.Array(FileSnapshotSchema, { maxItems: 0 }),
      budgets: RepositoryCheckBudgetsSchema,
      dockerCompatibility: RepositoryCheckDockerCompatibilityV1Schema,
      kind: Type.Literal("repository_check_v1"),
      mounts: RepositoryCheckMountsSchema,
      operation: RepositoryCheckOperationSchema,
      profile: RepositoryCheckProfileSchema,
      repositorySnapshot: RepositorySnapshotManifestV1Schema,
      scope: Type.Object(
        {
          capability: Type.Literal("repository.execute.named_check"),
          paths: Type.Tuple([Type.Literal(".")]),
        },
        closed,
      ),
      staging: RepositoryCheckStagingSchema,
      toolchain: RepositoryCheckToolchainIdentitySchema,
    },
    closed,
  ),
  (envelope) =>
    envelope.proposalRevision === envelope.lifetime.revision &&
    envelope.operation.catalog.head.length >= 40 &&
    envelope.toolchain.profileRevision === envelope.profile.profileRevision &&
    envelope.dockerCompatibility.daemon.architecture ===
      envelope.toolchain.requestedPlatform.slice("linux/".length) &&
    envelope.dockerCompatibility.image.indexDigest === envelope.toolchain.imageIndexDigest &&
    envelope.dockerCompatibility.image.manifestDigest ===
      envelope.toolchain.platformManifestDigest &&
    utf8.encode(JSON.stringify(envelope)).byteLength <= 65_536,
);
export type RepositoryCheckActionEnvelopeV1 = Type.Static<
  typeof RepositoryCheckActionEnvelopeV1Schema
>;

export const ClosedOperationSchema = Type.Union([
  HostOperationSchema,
  RepositoryCheckOperationSchema,
]);
export type ClosedOperation = Type.Static<typeof ClosedOperationSchema>;

export const ActionEnvelopeV1Schema = Type.Union([
  HostActionEnvelopeV1Schema,
  RepositoryCheckActionEnvelopeV1Schema,
]);
export type ActionEnvelopeV1 = Type.Static<typeof ActionEnvelopeV1Schema>;

export const PolicyDecisionSchema = Type.Object(
  {
    decision: Type.Union([Type.Literal("allow"), Type.Literal("ask"), Type.Literal("deny")]),
    ruleId: identifierSchema,
    ruleSetRevision: identifierSchema,
    actionDigest: digestSchema,
    reason: boundedText(),
    evaluatedAt: Type.String({ format: "date-time" }),
  },
  closed,
);
export type PolicyDecision = Type.Static<typeof PolicyDecisionSchema>;

export const CompletePatchSchema = Type.Refine(
  Type.Object(
    {
      state: Type.Literal("complete"),
      byteLength: Type.Integer({ maximum: 57_344, minimum: 0 }),
      content: reviewText(),
      contentHash: sha256Schema,
    },
    closed,
  ),
  (patch) => utf8.encode(patch.content).byteLength === patch.byteLength,
);
export const BlockedPatchSchema = Type.Object(
  { state: Type.Literal("blocked"), error: ProductErrorSchema },
  closed,
);
export const PatchObservationSchema = Type.Union([CompletePatchSchema, BlockedPatchSchema]);
export type PatchObservation = Type.Static<typeof PatchObservationSchema>;

export const CheckDiagnosticSchema = Type.Object(
  {
    diagnosticId: identifierSchema,
    path: RepositoryPathSchema,
    line: Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
    message: boundedText(),
  },
  closed,
);
export type CheckDiagnostic = Type.Static<typeof CheckDiagnosticSchema>;

export const ClosedCheckObservationSchema = Type.Refine(
  Type.Object(
    {
      checkId: identifierSchema,
      template: Type.Literal("git_diff_check"),
      head: Type.String({ pattern: "^[a-f0-9]{40,64}$" }),
      observedAt: Type.String({ format: "date-time" }),
      status: Type.Union([Type.Literal("passed"), Type.Literal("failed"), Type.Literal("unknown")]),
      diagnostics: Type.Array(CheckDiagnosticSchema, { maxItems: 256 }),
      contentHash: sha256Schema,
    },
    closed,
  ),
  (check) =>
    utf8.encode(JSON.stringify(check.diagnostics)).byteLength <= 24_576 &&
    (check.status === "passed" ? check.diagnostics.length === 0 : true),
);
export type ClosedCheckObservation = Type.Static<typeof ClosedCheckObservationSchema>;

export const AttributedChangedFileSchema = Type.Object(
  {
    path: RepositoryPathSchema,
    status: Type.Union([
      Type.Literal("added"),
      Type.Literal("modified"),
      Type.Literal("deleted"),
      Type.Literal("renamed"),
      Type.Literal("unmerged"),
    ]),
    attribution: Type.Union([
      Type.Literal("eden"),
      Type.Literal("pre_existing"),
      Type.Literal("both"),
    ]),
  },
  closed,
);
export type AttributedChangedFile = Type.Static<typeof AttributedChangedFileSchema>;

export const ChangeReviewSchema = Type.Object(
  {
    head: Type.String({ pattern: "^[a-f0-9]{40,64}$" }),
    observedAt: Type.String({ format: "date-time" }),
    statusHash: sha256Schema,
    edenPatch: PatchObservationSchema,
    currentTrackedPatch: PatchObservationSchema,
    changedFiles: Type.Array(AttributedChangedFileSchema, { maxItems: 256 }),
    untrackedPaths: Type.Array(RepositoryPathSchema, { maxItems: 256 }),
    baselineCheck: ClosedCheckObservationSchema,
    currentCheck: ClosedCheckObservationSchema,
    newlyObservedDiagnostics: Type.Array(identifierSchema, { maxItems: 256 }),
    executionMode: Type.Literal("trusted_host_policy_only"),
    isolation: Type.Literal("none"),
    network: Type.Literal("not_requested"),
  },
  closed,
);
export type ChangeReview = Type.Static<typeof ChangeReviewSchema>;

const actionValidator = Schema.Compile(ActionEnvelopeV1Schema);
const policyValidator = Schema.Compile(PolicyDecisionSchema);
const reviewValidator = Schema.Compile(ChangeReviewSchema);

function invalid(kind: string): ProductError {
  return {
    code: `invalid_${kind}`,
    message: `The ${kind.replaceAll("_", " ")} does not match the closed contract.`,
    recoverability: "fatal",
    suggestedActions: ["Reject the value at the product boundary."],
  };
}

function decode<T>(
  kind: string,
  validator: { Check(value: unknown): value is T },
  value: unknown,
): DecodeResult<T> {
  return validator.Check(value) ? { ok: true, value } : { ok: false, error: invalid(kind) };
}

export function decodeActionEnvelope(value: unknown): DecodeResult<ActionEnvelopeV1> {
  return decode("action_envelope", actionValidator, value);
}

export function decodePolicyDecision(value: unknown): DecodeResult<PolicyDecision> {
  return decode("policy_decision", policyValidator, value);
}

export function decodeChangeReview(value: unknown): DecodeResult<ChangeReview> {
  return decode("change_review", reviewValidator, value);
}

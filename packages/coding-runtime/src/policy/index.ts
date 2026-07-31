import { createHash } from "node:crypto";

import {
  type ActionEnvelopeV1,
  type AnchorEditOperation,
  type DockerDiagnosticProbeActionV1,
  decodeActionEnvelope,
  decodeDockerDiagnosticProbeAction,
  type PolicyDecision,
} from "@eden/contracts";

export const safeActuationRuleSetRevision = "r2-safe-actuation-v1" as const;
const actionDomain = new TextEncoder().encode("eden.action.v1\0");

function sortCanonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortCanonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "actionId")
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => [key, sortCanonical(nested)]),
  );
}

export function canonicalActionBytes(envelope: ActionEnvelopeV1): Uint8Array {
  const decoded = decodeActionEnvelope(envelope);
  if (!decoded.ok) throw new TypeError(decoded.error.message);
  const payload = new TextEncoder().encode(JSON.stringify(sortCanonical(decoded.value)));
  const bytes = new Uint8Array(actionDomain.byteLength + payload.byteLength);
  bytes.set(actionDomain);
  bytes.set(payload, actionDomain.byteLength);
  return bytes;
}

export function safeActionDigest(envelope: ActionEnvelopeV1): string {
  return createHash("sha256").update(canonicalActionBytes(envelope)).digest("hex");
}

export function canonicalDockerDiagnosticProbeActionBytes(
  action: DockerDiagnosticProbeActionV1,
): Uint8Array {
  const decoded = decodeDockerDiagnosticProbeAction(action);
  if (!decoded.ok) throw new TypeError(decoded.error.message);
  const payload = new TextEncoder().encode(JSON.stringify(sortCanonical(decoded.value)));
  const bytes = new Uint8Array(actionDomain.byteLength + payload.byteLength);
  bytes.set(actionDomain);
  bytes.set(payload, actionDomain.byteLength);
  return bytes;
}

export function dockerDiagnosticProbeActionDigest(action: DockerDiagnosticProbeActionV1): string {
  return createHash("sha256")
    .update(canonicalDockerDiagnosticProbeActionBytes(action))
    .digest("hex");
}

export type DockerDiagnosticProbePolicyDecision = PolicyDecision & {
  readonly decision: "ask";
  readonly ruleId: "r2.docker-diagnostic-probe.exact";
  readonly ruleSetRevision: "r2-docker-diagnostic-probe-v1";
};
export type DockerDiagnosticProbePolicyEvaluation =
  | DockerDiagnosticProbePolicyDecision
  | (PolicyDecision & {
      readonly decision: "deny";
      readonly ruleId: "r2.default-deny";
      readonly ruleSetRevision: "r2-docker-diagnostic-probe-v1";
    });

export function evaluateDockerDiagnosticProbePolicy(
  action: DockerDiagnosticProbeActionV1,
  evaluatedAt: string,
): DockerDiagnosticProbePolicyEvaluation {
  const decoded = decodeDockerDiagnosticProbeAction(action);
  if (!decoded.ok) {
    return {
      actionDigest: "0".repeat(64),
      decision: "deny",
      evaluatedAt,
      reason: "The action does not match the accepted Docker diagnostic probe rule set.",
      ruleId: "r2.default-deny",
      ruleSetRevision: "r2-docker-diagnostic-probe-v1",
    };
  }
  return {
    actionDigest: dockerDiagnosticProbeActionDigest(decoded.value),
    decision: "ask",
    evaluatedAt,
    reason: "The exact Docker diagnostic probe requires one interactive approval.",
    ruleId: "r2.docker-diagnostic-probe.exact",
    ruleSetRevision: "r2-docker-diagnostic-probe-v1",
  };
}

export type DockerDiagnosticProbeApprovalState = {
  readonly approvalId: string;
  readonly actionDigest: string;
  readonly actionId: string;
  readonly expectedRevision: number;
  readonly probeId: string;
  readonly proposalRevision: number;
  readonly state: "available" | "consumed";
};

export function createDockerDiagnosticProbeApproval(input: {
  readonly action: DockerDiagnosticProbeActionV1;
  readonly approvalId: string;
  readonly expectedRevision: number;
}): DockerDiagnosticProbeApprovalState {
  return {
    actionDigest: dockerDiagnosticProbeActionDigest(input.action),
    actionId: input.action.actionId,
    approvalId: input.approvalId,
    expectedRevision: input.expectedRevision,
    probeId: input.action.probeId,
    proposalRevision: input.action.proposalRevision,
    state: "available",
  };
}

export type DockerDiagnosticProbeApprovalConsumption =
  | {
      readonly approval: DockerDiagnosticProbeApprovalState & {
        readonly state: "consumed";
      };
      readonly ok: true;
    }
  | {
      readonly code:
        | "approval_already_consumed"
        | "approval_digest_mismatch"
        | "approval_identity_mismatch"
        | "approval_revision_stale";
      readonly ok: false;
    };

export function consumeDockerDiagnosticProbeApproval(
  approval: DockerDiagnosticProbeApprovalState,
  action: DockerDiagnosticProbeActionV1,
  currentRevision: number,
): DockerDiagnosticProbeApprovalConsumption {
  if (approval.state === "consumed") return { code: "approval_already_consumed", ok: false };
  if (
    approval.expectedRevision !== currentRevision ||
    approval.proposalRevision !== action.proposalRevision
  ) {
    return { code: "approval_revision_stale", ok: false };
  }
  if (approval.actionId !== action.actionId || approval.probeId !== action.probeId) {
    return { code: "approval_identity_mismatch", ok: false };
  }
  if (approval.actionDigest !== dockerDiagnosticProbeActionDigest(action)) {
    return { code: "approval_digest_mismatch", ok: false };
  }
  return { approval: { ...approval, state: "consumed" }, ok: true };
}

export function evaluateSafeActuationPolicy(
  envelope: ActionEnvelopeV1,
  evaluatedAt: string,
): PolicyDecision {
  const decoded = decodeActionEnvelope(envelope);
  const digest = decoded.ok ? safeActionDigest(decoded.value) : "0".repeat(64);
  if (!decoded.ok) {
    return {
      decision: "deny",
      ruleId: "r2.default-deny",
      ruleSetRevision: safeActuationRuleSetRevision,
      actionDigest: digest,
      reason: "The action does not match the accepted safe-actuation rule set.",
      evaluatedAt,
    };
  }
  if (decoded.value.kind === "repository_check_v1") {
    return {
      decision: "ask",
      ruleId: "r2.repository-check.named-docker-v1",
      ruleSetRevision: "r2-docker-repository-check-v1",
      actionDigest: digest,
      reason: "The exact named repository check requires one single-use approval.",
      evaluatedAt,
    };
  }
  if (decoded.value.authority.ruleSetRevision !== safeActuationRuleSetRevision) {
    return {
      decision: "deny",
      ruleId: "r2.default-deny",
      ruleSetRevision: safeActuationRuleSetRevision,
      actionDigest: digest,
      reason: "The action does not match the accepted safe-actuation rule set.",
      evaluatedAt,
    };
  }
  if (decoded.value.kind === "anchor_edit") {
    return {
      decision: "ask",
      ruleId: "r2.anchor-edit.tracked-utf8",
      ruleSetRevision: safeActuationRuleSetRevision,
      actionDigest: digest,
      reason: "Tracked UTF-8 modifications require one exact approval.",
      evaluatedAt,
    };
  }
  const rules = {
    git_tracked_query: "r2.git.tracked-query",
    git_diff: "r2.git.review-diff",
    git_diff_check: "r2.git.diff-check",
  } as const;
  return {
    decision: "allow",
    ruleId: rules[decoded.value.kind],
    ruleSetRevision: safeActuationRuleSetRevision,
    actionDigest: digest,
    reason: "The runtime-owned Git template is allowed in its exact closed shape.",
    evaluatedAt,
  };
}

export type SafeApproval = {
  readonly approvalId: string;
  readonly actionId: string;
  readonly runId: string;
  readonly expectedRevision: number;
  readonly proposalRevision: number;
  readonly actionDigest: string;
  readonly state: "available" | "consumed";
};

export function createSafeApproval(input: {
  readonly approvalId: string;
  readonly envelope: ActionEnvelopeV1;
  readonly expectedRevision: number;
}): SafeApproval {
  return {
    approvalId: input.approvalId,
    actionId: input.envelope.actionId,
    runId: input.envelope.runId,
    expectedRevision: input.expectedRevision,
    proposalRevision: input.envelope.proposalRevision,
    actionDigest: safeActionDigest(input.envelope),
    state: "available",
  };
}

export type SafeApprovalConsumption =
  | { readonly ok: true; readonly approval: SafeApproval & { readonly state: "consumed" } }
  | {
      readonly ok: false;
      readonly code:
        | "approval_already_consumed"
        | "approval_digest_mismatch"
        | "approval_identity_mismatch"
        | "approval_revision_stale";
    };

export function consumeSafeApproval(
  approval: SafeApproval,
  envelope: ActionEnvelopeV1,
  currentRevision: number,
): SafeApprovalConsumption {
  if (approval.state === "consumed") return { ok: false, code: "approval_already_consumed" };
  if (
    approval.expectedRevision !== currentRevision ||
    approval.proposalRevision !== envelope.proposalRevision
  ) {
    return { ok: false, code: "approval_revision_stale" };
  }
  if (approval.actionId !== envelope.actionId || approval.runId !== envelope.runId) {
    return { ok: false, code: "approval_identity_mismatch" };
  }
  if (approval.actionDigest !== safeActionDigest(envelope)) {
    return { ok: false, code: "approval_digest_mismatch" };
  }
  return { ok: true, approval: { ...approval, state: "consumed" } };
}

export function isNarrowerAnchorEdit(parent: ActionEnvelopeV1, child: ActionEnvelopeV1): boolean {
  const parentDecoded = decodeActionEnvelope(parent);
  const childDecoded = decodeActionEnvelope(child);
  if (
    !parentDecoded.ok ||
    !childDecoded.ok ||
    parentDecoded.value.kind !== "anchor_edit" ||
    childDecoded.value.kind !== "anchor_edit" ||
    parentDecoded.value.operation.type !== "anchor_edit" ||
    childDecoded.value.operation.type !== "anchor_edit"
  ) {
    return false;
  }
  const left = parentDecoded.value;
  const right = childDecoded.value;
  const leftOperation = left.operation as AnchorEditOperation;
  const rightOperation = right.operation as AnchorEditOperation;
  return (
    left.runId === right.runId &&
    left.workspace.workspaceId === right.workspace.workspaceId &&
    leftOperation.path === rightOperation.path &&
    leftOperation.baseByteLength === rightOperation.baseByteLength &&
    leftOperation.baseSha256 === rightOperation.baseSha256 &&
    rightOperation.replacements.length <= leftOperation.replacements.length &&
    JSON.stringify(left.authority) === JSON.stringify(right.authority) &&
    JSON.stringify(left.budgets) === JSON.stringify(right.budgets) &&
    JSON.stringify(left.scope) === JSON.stringify(right.scope)
  );
}

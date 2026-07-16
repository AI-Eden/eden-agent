import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  awaitingApprovalProductView,
  decodeProductView,
  decodeResolveWorkspaceTrustCommand,
  decodeRunCatalog,
  decodeRunInspection,
  decodeWorkspaceReview,
  emptyRunCatalog,
  executingProductView,
  mixedRunCatalog,
  readOnlyRunInspection,
  restrictedWorkspaceReview,
  reviewProductView,
  trustedWorkspaceReview,
} from "@eden/contracts";

const fixtures = [awaitingApprovalProductView, executingProductView, reviewProductView] as const;

const availableRun = {
  availability: "available",
  phase: executingProductView.phase,
  revision: executingProductView.revision,
  runId: executingProductView.runId,
  startedAt: "2026-07-16T08:00:00.000Z",
  task: "Exercise the deterministic fake runtime.",
  terminalOutcome: executingProductView.terminalOutcome,
  updatedAt: "2026-07-16T08:00:01.000Z",
} as const;

const unavailableRun = {
  availability: "unavailable",
  error: {
    code: "run_history_unavailable",
    message: "The attributed run history is unavailable.",
    recoverability: "reconfigure",
    suggestedActions: ["Inspect or remove the damaged isolated state manually."],
  },
  runId: "run-damaged-1",
} as const;

describe("deterministic product view scenarios", () => {
  it("exports deterministic empty, mixed, and inspection history fixtures", () => {
    assert.equal(decodeRunCatalog(emptyRunCatalog).ok, true);
    assert.equal(decodeRunCatalog(mixedRunCatalog).ok, true);
    assert.equal(decodeRunInspection(readOnlyRunInspection).ok, true);
    assert.equal(mixedRunCatalog.entries[1]?.availability, "unavailable");
    assert.equal(readOnlyRunInspection.mode, "read-only");
  });

  it("round-trips closed run catalogs and read-only inspections", () => {
    const catalog = {
      entries: [availableRun, unavailableRun],
      notices: [],
      protocolVersion: 1,
      truncated: false,
      workspace: trustedWorkspaceReview.workspace,
    } as const;
    const inspection = {
      mode: "read-only",
      protocolVersion: 1,
      summary: availableRun,
      view: executingProductView,
    } as const;

    assert.deepEqual(decodeRunCatalog(catalog), { ok: true, value: catalog });
    assert.deepEqual(decodeRunInspection(inspection), { ok: true, value: inspection });
  });

  it("rejects mutable, secret, malformed, and unsupported history values", () => {
    const catalog = {
      entries: [availableRun],
      notices: [],
      protocolVersion: 1,
      truncated: false,
      workspace: trustedWorkspaceReview.workspace,
    } as const;
    const inspection = {
      mode: "read-only",
      protocolVersion: 1,
      summary: availableRun,
      view: executingProductView,
    } as const;
    const invalidCatalogs = [
      { ...catalog, protocolVersion: 2 },
      { ...catalog, resume: true },
      { ...catalog, entries: [{ ...availableRun, revision: -1 }] },
      { ...catalog, entries: [{ ...availableRun, updatedAt: "yesterday" }] },
      {
        ...catalog,
        entries: [{ ...availableRun, updatedAt: "2026-07-16T07:59:59.000Z" }],
      },
      { ...catalog, entries: [unavailableRun, availableRun] },
      {
        ...catalog,
        entries: [
          { ...availableRun, runId: "run-older-1", updatedAt: "2026-07-16T08:00:00.000Z" },
          { ...availableRun, runId: "run-newer-1", updatedAt: "2026-07-16T08:00:02.000Z" },
        ],
      },
      { ...catalog, entries: [{ ...unavailableRun, SECRET_CANARY: "do-not-leak" }] },
      { ...catalog, entries: Array.from({ length: 101 }, () => availableRun) },
      { ...catalog, notices: Array.from({ length: 17 }, () => unavailableRun.error) },
    ];
    const invalidInspections = [
      { ...inspection, mode: "resume" },
      { ...inspection, command: "approval.resolve" },
      { ...inspection, summary: unavailableRun },
      { ...inspection, summary: { ...availableRun, runId: "run-other-1" } },
      { ...inspection, summary: { ...availableRun, revision: availableRun.revision + 1 } },
      { ...inspection, summary: { ...availableRun, phase: "review" } },
      {
        ...inspection,
        summary: {
          ...availableRun,
          terminalOutcome: { evidenceRef: "evidence-mismatch", state: "succeeded" },
        },
      },
      { ...inspection, providerPayload: { token: "SECRET_CANARY" } },
    ];

    for (const value of invalidCatalogs) assert.equal(decodeRunCatalog(value).ok, false);
    for (const value of invalidInspections) assert.equal(decodeRunInspection(value).ok, false);
  });

  it("exports a dedicated pre-run workspace review boundary", () => {
    const reviews = [restrictedWorkspaceReview, trustedWorkspaceReview] as const;
    const results = reviews.map((review) => decodeWorkspaceReview(review));
    const longRootReview = {
      ...restrictedWorkspaceReview,
      workspace: { ...restrictedWorkspaceReview.workspace, root: `/${"w".repeat(512)}` },
    };

    assert.deepEqual(
      results.map((result) => result.ok),
      [true, true],
    );
    assert.equal(restrictedWorkspaceReview.authority.taskStart, "blocked");
    assert.equal(trustedWorkspaceReview.authority.taskStart, "allowed");
    assert.equal(decodeWorkspaceReview(longRootReview).ok, true);
    assert.deepEqual(
      { ...restrictedWorkspaceReview.authority, taskStart: "allowed" },
      trustedWorkspaceReview.authority,
    );
    assert.equal(
      decodeResolveWorkspaceTrustCommand({
        commandId: "command-trust-1",
        decision: "trust",
        expectedRevision: 0,
        protocolVersion: 1,
        type: "workspace.trust.resolve",
        workspaceId: restrictedWorkspaceReview.workspace.workspaceId,
      }).ok,
      true,
    );
  });

  it("round-trips awaiting-approval, executing, and review views", () => {
    assert.deepEqual(
      fixtures.map((fixture) => decodeProductView(JSON.parse(JSON.stringify(fixture))).ok),
      [true, true, true],
    );
    assert.equal(awaitingApprovalProductView.approval?.actionId, "action-test-1");
    assert.equal(executingProductView.terminalOutcome, null);
    assert.equal(reviewProductView.terminalOutcome?.state, "succeeded");
  });

  it("keeps scenario data attributable and renderer-independent", () => {
    assert.equal(awaitingApprovalProductView.phase, "awaiting-approval");
    assert.equal(awaitingApprovalProductView.currentAction?.actionId, "action-test-1");
    assert.equal(awaitingApprovalProductView.approval?.digest, "sha256:action-test-1");
    assert.equal(executingProductView.changedFiles[0]?.path, "packages/contracts/src/protocol.ts");
    assert.equal(reviewProductView.checks[0]?.requirement, "required");
    assert.ok(reviewProductView.residualRisk);
    assert.ok(reviewProductView.nextActions.length > 0);
    assert.equal(executingProductView.workspace.root, "/work/eden-agent");
  });

  it("rejects renderer state, secret canaries, raw diagnostics, bad versions, and unknown phases", () => {
    const invalidViews = [
      { ...executingProductView, focus: "progress" },
      { ...executingProductView, SECRET_CANARY: "do-not-leak" },
      { ...executingProductView, providerPayload: { reasoning: "hidden" } },
      { ...executingProductView, stack: "Error: raw stack" },
      { ...executingProductView, protocolVersion: 2 },
      { ...executingProductView, phase: "autonomous-magic" },
      {
        ...executingProductView,
        workspace: { ...executingProductView.workspace, environmentSecret: "do-not-leak" },
      },
    ];

    for (const value of invalidViews) assert.equal(decodeProductView(value).ok, false);
  });

  it("rejects authority escalation and secrets in workspace review values", () => {
    const invalidReviews = [
      { ...restrictedWorkspaceReview, providerKey: "SECRET_CANARY" },
      {
        ...restrictedWorkspaceReview,
        authority: { ...restrictedWorkspaceReview.authority, network: "allowed" },
      },
      {
        ...restrictedWorkspaceReview,
        workspace: { ...restrictedWorkspaceReview.workspace, trustParent: true },
      },
      { ...restrictedWorkspaceReview, focus: "trust" },
    ];

    for (const value of invalidReviews) assert.equal(decodeWorkspaceReview(value).ok, false);
  });
});

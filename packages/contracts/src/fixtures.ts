import type {
  AvailableRunSummary,
  ContextAdmissionSummary,
  ProductView,
  RunCatalog,
  RunInspection,
  UnavailableRunSummary,
  WorkspaceReview,
} from "./protocol.ts";

const workspace = {
  workspaceId: "workspace-eden-agent",
  name: "eden-agent",
  root: "/work/eden-agent",
  trust: "trusted",
} as const;
const budget = { used: 320, total: 2_000, unit: "actions" } as const;
const action = {
  actionId: "action-test-1",
  display: "pnpm --filter @eden/contracts test",
  cwd: ".",
  reason: "Run the executable product contract checks.",
  scope: "packages/contracts only",
} as const;

const authority = {
  network: "denied",
  processExecution: "fake-only",
  repositoryRead: "disabled",
  repositoryWrite: "denied",
  sandbox: "not-configured",
} as const;

const restrictedContext = {
  blocker: null,
  budget: null,
  instructions: [],
  items: [],
  state: "restricted",
} satisfies ContextAdmissionSummary;

const unconfiguredContext = {
  blocker: {
    code: "context_profile_limits_required",
    message: "Provider context limits are required before context admission.",
    recoverability: "reconfigure",
    suggestedActions: ["Configure an active provider profile with explicit limits."],
  },
  budget: null,
  instructions: [],
  items: [],
  state: "unconfigured",
} satisfies ContextAdmissionSummary;

export const restrictedWorkspaceReview = {
  authority: { ...authority, taskStart: "blocked" },
  context: restrictedContext,
  nextActions: ["Trust this exact workspace or exit."],
  notice: null,
  profile: { credentials: "not-required", provider: "deterministic-fake" },
  protocolVersion: 1,
  revision: 0,
  workspace: { ...workspace, trust: "restricted" },
} satisfies WorkspaceReview;

export const trustedWorkspaceReview = {
  authority: { ...authority, taskStart: "allowed" },
  context: unconfiguredContext,
  nextActions: ["Describe the deterministic fake task or restrict this workspace."],
  notice: null,
  profile: { credentials: "not-required", provider: "deterministic-fake" },
  protocolVersion: 1,
  revision: 1,
  workspace,
} satisfies WorkspaceReview;

export const awaitingApprovalProductView = {
  protocolVersion: 1,
  viewId: "view-awaiting-approval",
  runId: "run-contracts-1",
  revision: 2,
  workspace,
  phase: "awaiting-approval",
  progress: { completed: 1, total: 3, summary: "Contract schemas are ready for verification." },
  currentAction: action,
  approval: {
    approvalId: "approval-test-1",
    actionId: action.actionId,
    canonicalDisplay: action.display,
    cwd: action.cwd,
    reason: action.reason,
    scope: action.scope,
    digest: "sha256:action-test-1",
    recoveryAction: "Revise the verification scope or deny this action.",
  },
  changedFiles: [{ path: "packages/contracts/src/protocol.ts", status: "added" }],
  checks: [
    {
      checkId: "check-contracts",
      name: "Contracts test suite",
      requirement: "required",
      status: "pending",
      summary: "Awaiting approval to run.",
    },
  ],
  budget,
  nextActions: ["Approve or deny the scoped verification action."],
  residualRisk: null,
  terminalOutcome: null,
} satisfies ProductView;

export const executingProductView = {
  protocolVersion: 1,
  viewId: "view-executing",
  runId: "run-contracts-1",
  revision: 3,
  workspace,
  phase: "executing",
  progress: { completed: 2, total: 3, summary: "Running contract verification." },
  currentAction: action,
  approval: null,
  changedFiles: [
    { path: "packages/contracts/src/protocol.ts", status: "added" },
    { path: "packages/contracts/src/fixtures.ts", status: "added" },
  ],
  checks: [
    {
      checkId: "check-contracts",
      name: "Contracts test suite",
      requirement: "required",
      status: "pending",
      summary: "Verification is running.",
    },
  ],
  budget: { ...budget, used: 480 },
  nextActions: ["Wait for the required check result."],
  residualRisk: null,
  terminalOutcome: null,
} satisfies ProductView;

export const reviewProductView = {
  protocolVersion: 1,
  viewId: "view-review",
  runId: "run-contracts-1",
  revision: 4,
  workspace,
  phase: "review",
  progress: { completed: 3, total: 3, summary: "Implementation and verification are complete." },
  currentAction: null,
  approval: null,
  changedFiles: [
    { path: "packages/contracts/src/protocol.ts", status: "added" },
    { path: "packages/contracts/src/fixtures.ts", status: "added" },
  ],
  checks: [
    {
      checkId: "check-contracts",
      name: "Contracts test suite",
      requirement: "required",
      status: "passed",
      summary: "All product contract scenarios passed.",
      evidenceRef: "evidence-contracts-test",
    },
    {
      checkId: "check-package-smoke",
      name: "Package smoke",
      requirement: "optional",
      status: "passed",
      summary: "The public package decoded JSON values.",
      evidenceRef: "evidence-package-smoke",
    },
  ],
  budget: { ...budget, used: 610 },
  nextActions: ["Review the contract diff and accept the R0 exit."],
  residualRisk: "Semantic stale-command enforcement begins with AgentClient in R1.",
  terminalOutcome: { state: "succeeded", evidenceRef: "evidence-r0-contracts" },
} satisfies ProductView;

export const availableRunSummary = {
  availability: "available",
  phase: reviewProductView.phase,
  revision: reviewProductView.revision,
  runId: reviewProductView.runId,
  startedAt: "2026-07-16T08:00:00.000Z",
  task: "Exercise the deterministic fake runtime.",
  terminalOutcome: reviewProductView.terminalOutcome,
  updatedAt: "2026-07-16T08:00:04.000Z",
} satisfies AvailableRunSummary;

export const unavailableRunSummary = {
  availability: "unavailable",
  error: {
    code: "run_history_unavailable",
    message: "The attributed run history is unavailable.",
    recoverability: "reconfigure",
    suggestedActions: ["Inspect or remove the damaged isolated state manually."],
  },
  runId: "run-damaged-1",
} satisfies UnavailableRunSummary;

export const emptyRunCatalog = {
  entries: [],
  notices: [],
  protocolVersion: 1,
  truncated: false,
  workspace,
} satisfies RunCatalog;

export const mixedRunCatalog = {
  ...emptyRunCatalog,
  entries: [availableRunSummary, unavailableRunSummary],
} satisfies RunCatalog;

export const readOnlyRunInspection = {
  mode: "read-only",
  protocolVersion: 1,
  summary: availableRunSummary,
  view: reviewProductView,
} satisfies RunInspection;

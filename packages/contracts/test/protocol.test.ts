import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeProductCommand,
  decodeProductEvent,
  decodeResolveWorkspaceTrustCommand,
  decodeRunId,
  executingProductView,
  ProductCommandDecodeResultSchema,
  ProductCommandSchema,
  ProductEventDecodeResultSchema,
  ProductEventSchema,
  productProtocolVersion,
} from "@eden/contracts";

const startCommand = {
  protocolVersion: 1,
  commandId: "command-1",
  type: "run.start",
  task: "Fix the failing contract test.",
} as const;

const approvalEvent = {
  protocolVersion: 1,
  eventId: "event-1",
  runId: "run-1",
  cursor: 3,
  revision: 2,
  type: "approval.presented",
  approval: {
    approvalId: "approval-1",
    actionId: "action-1",
    canonicalDisplay: "pnpm test",
    cwd: ".",
    reason: "Run the required checks.",
    scope: "workspace tests only",
    digest: "sha256:approval-1",
  },
} as const;

const validCommands = [
  startCommand,
  {
    protocolVersion: 1,
    commandId: "command-2",
    type: "run.pause",
    runId: "run-1",
    expectedRevision: 2,
  },
  {
    protocolVersion: 1,
    commandId: "command-3",
    type: "run.resume",
    runId: "run-1",
    expectedRevision: 2,
  },
  {
    protocolVersion: 1,
    commandId: "command-4",
    type: "run.cancel",
    runId: "run-1",
    expectedRevision: 2,
  },
  {
    protocolVersion: 1,
    commandId: "command-5",
    type: "approval.resolve",
    runId: "run-1",
    expectedRevision: 2,
    approvalId: "approval-1",
    decision: "approve",
  },
] as const;

const validEvents = [
  {
    protocolVersion: 1,
    eventId: "event-snapshot",
    runId: "run-1",
    cursor: 1,
    revision: 1,
    type: "session.snapshot",
    view: executingProductView,
  },
  {
    protocolVersion: 1,
    eventId: "event-progress",
    runId: "run-1",
    cursor: 2,
    revision: 2,
    type: "phase.progress",
    phase: "executing",
    progress: { completed: 1, total: 2, summary: "Writing schemas." },
    currentAction: null,
  },
  approvalEvent,
  {
    protocolVersion: 1,
    eventId: "event-check",
    runId: "run-1",
    cursor: 4,
    revision: 3,
    type: "verification.updated",
    check: {
      checkId: "check-1",
      name: "Contract tests",
      requirement: "required",
      status: "passed",
      summary: "All contract tests passed.",
      evidenceRef: "evidence-check-1",
    },
  },
  {
    protocolVersion: 1,
    eventId: "event-terminal",
    runId: "run-1",
    cursor: 5,
    revision: 4,
    type: "run.terminal",
    outcome: { state: "succeeded", evidenceRef: "evidence-run-1" },
  },
] as const;

describe("product protocol boundary", () => {
  it("exports closed runtime schemas and decodes exact valid values", () => {
    assert.equal(productProtocolVersion, 1);
    assert.ok(ProductCommandSchema.anyOf.length > 0);
    assert.ok(ProductEventSchema.anyOf.length > 0);
    assert.equal(ProductCommandDecodeResultSchema.anyOf.length, 2);
    assert.equal(ProductEventDecodeResultSchema.anyOf.length, 2);
    for (const command of validCommands) {
      assert.deepEqual(decodeProductCommand(command), { ok: true, value: command });
    }
    for (const event of validEvents) {
      assert.deepEqual(decodeProductEvent(event), { ok: true, value: event });
    }
  });

  it("rejects unsupported versions, empty identifiers, missing fields, and unknown properties", () => {
    const invalidCommands = [
      { ...startCommand, protocolVersion: 2 },
      { ...startCommand, commandId: "" },
      { protocolVersion: 1, commandId: "command-1", type: "run.pause", runId: "run-1" },
      { ...startCommand, rendererFocus: "composer" },
      { ...startCommand, type: "run.succeed" },
    ];

    for (const value of invalidCommands) {
      const result = decodeProductCommand(value);
      assert.equal(result.ok, false);
    }
  });

  it("accepts only path-safe prefixed run identifiers", () => {
    const invalidRunIds = [
      "../run-1",
      "run-1/receipts",
      "RUN-1",
      "550e8400-e29b-41d4-a716-446655440000",
      "run-a_1",
      `run-${"a".repeat(125)}`,
    ];

    for (const runId of invalidRunIds) {
      assert.equal(
        decodeProductEvent({ ...approvalEvent, runId }).ok,
        false,
        `Expected ${runId} to be rejected.`,
      );
    }
    assert.equal(decodeProductEvent({ ...approvalEvent, runId: "run-1" }).ok, true);
    assert.equal(
      decodeProductEvent({
        ...approvalEvent,
        runId: "run-550e8400-e29b-41d4-a716-446655440000",
      }).ok,
      true,
    );
    assert.deepEqual(decodeRunId("run-1"), { ok: true, value: "run-1" });
    assert.equal(decodeRunId("../run-1").ok, false);
  });

  it("requires revisions, cursors, canonical approvals, and verifier evidence", () => {
    const invalidCommands = [
      { protocolVersion: 1, commandId: "command-2", type: "run.pause", runId: "run-1" },
      { protocolVersion: 1, commandId: "command-3", type: "run.resume", runId: "run-1" },
      { protocolVersion: 1, commandId: "command-4", type: "run.cancel", runId: "run-1" },
      {
        protocolVersion: 1,
        commandId: "command-5",
        type: "approval.resolve",
        runId: "run-1",
        approvalId: "approval-1",
        decision: "approve",
      },
    ];
    for (const value of invalidCommands) {
      assert.equal(decodeProductCommand(value).ok, false);
    }

    const { cursor: _cursor, ...withoutCursor } = approvalEvent;
    assert.equal(decodeProductEvent(withoutCursor).ok, false);
    const { canonicalDisplay: _display, ...incompleteApproval } = approvalEvent.approval;
    assert.equal(decodeProductEvent({ ...approvalEvent, approval: incompleteApproval }).ok, false);
    const { digest: _digest, ...unsignedApproval } = approvalEvent.approval;
    assert.equal(decodeProductEvent({ ...approvalEvent, approval: unsignedApproval }).ok, false);
    assert.equal(
      decodeProductEvent({
        ...approvalEvent,
        approval: { ...approvalEvent.approval, rendererLabel: "Approve" },
      }).ok,
      false,
    );
    assert.equal(
      decodeProductEvent({
        ...validEvents[1],
        progress: { completed: 3, total: 2, summary: "Impossible progress." },
      }).ok,
      false,
    );

    assert.equal(
      decodeProductEvent({
        protocolVersion: 1,
        eventId: "event-2",
        runId: "run-1",
        cursor: 4,
        revision: 3,
        type: "run.terminal",
        outcome: { state: "succeeded" },
      }).ok,
      false,
    );

    assert.equal(
      decodeProductEvent({
        ...approvalEvent,
        approval: { ...approvalEvent.approval, cwd: `/${"w".repeat(4_094)}` },
      }).ok,
      true,
    );
  });

  it("accepts only safe-integer revisions and cursors", () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    assert.equal(decodeProductCommand({ ...validCommands[1], expectedRevision: maximum }).ok, true);
    assert.equal(
      decodeProductEvent({ ...approvalEvent, cursor: maximum, revision: maximum }).ok,
      true,
    );
    assert.equal(
      decodeResolveWorkspaceTrustCommand({
        commandId: "command-trust-maximum",
        decision: "restrict",
        expectedRevision: maximum,
        protocolVersion: 1,
        type: "workspace.trust.resolve",
        workspaceId: "workspace-1",
      }).ok,
      true,
    );

    for (const invalid of [maximum + 1, 1e100]) {
      assert.equal(
        decodeProductCommand({ ...validCommands[1], expectedRevision: invalid }).ok,
        false,
      );
      assert.equal(
        decodeProductEvent({ ...approvalEvent, cursor: invalid, revision: invalid }).ok,
        false,
      );
      assert.equal(
        decodeResolveWorkspaceTrustCommand({
          commandId: "command-trust-invalid",
          decision: "restrict",
          expectedRevision: invalid,
          protocolVersion: 1,
          type: "workspace.trust.resolve",
          workspaceId: "workspace-1",
        }).ok,
        false,
      );
    }
  });

  it("returns stable non-throwing errors without mutating external input", () => {
    const hostile = { ...startCommand, protocolVersion: 99, extra: { nested: true } };
    const before = structuredClone(hostile);
    const result = decodeProductCommand(hostile);

    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected invalid external input to be rejected.");
    }
    assert.equal(result.error.code, "unsupported_protocol_version");
    assert.equal(result.error.recoverability, "reconfigure");
    assert.deepEqual(hostile, before);
  });

  it("round-trips commands and events through JSON", () => {
    assert.equal(decodeProductCommand(JSON.parse(JSON.stringify(startCommand))).ok, true);
    assert.equal(decodeProductEvent(JSON.parse(JSON.stringify(approvalEvent))).ok, true);
  });
});

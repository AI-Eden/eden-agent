import { strictEqual } from "node:assert";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import type { RepositoryCheckActionEnvelopeV1 } from "@eden/contracts";
import type { KernelEffect, KernelEvent } from "@eden/kernel";
import type { ModelStepRequestV1 } from "@eden/providers";

import { repositoryCheckActionFixture } from "../../contracts/test/repository-check-fixture.ts";
import { FileJournal } from "../src/journal/index.ts";
import {
  createSafeApproval,
  evaluateSafeActuationPolicy,
  safeActionDigest,
} from "../src/policy/index.ts";
import { projectJournal } from "../src/projection.ts";
import { repositoryCheckStagingIdentity } from "../src/repository-check-identity.ts";
import {
  type EffectHost,
  type EffectObservationListener,
  type ReconciliationResult,
  RuntimeEngine,
} from "../src/runtime.ts";

const runId = "run-repository-check-1";
const workspace = {
  name: "fixture",
  root: "/work/fixture",
  trust: "trusted",
  workspaceId: "workspace-repository-check-1",
} as const;
const rawOutput = Buffer.from("RAW-REPOSITORY-OUTPUT-CANARY\n");
const rawOutputBase64 = rawOutput.toString("base64");
const hash = (value: Uint8Array | string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

class RepositoryCheckLoopHost implements EffectHost {
  readonly modelRequests: ModelStepRequestV1[] = [];
  modelCalls = 0;

  async execute(
    effect: KernelEffect,
    _signal?: AbortSignal,
    observe?: EffectObservationListener,
  ): Promise<KernelEvent> {
    if (effect.type === "repository_check.prepare") {
      const envelope: RepositoryCheckActionEnvelopeV1 = {
        ...repositoryCheckActionFixture,
        actionId: `action-${effect.toolCall.toolCallId}`,
        lifetime: { kind: "single_use_proposal_revision", revision: effect.proposalRevision },
        proposalRevision: effect.proposalRevision,
        runId: effect.runId,
        staging: {
          identity: repositoryCheckStagingIdentity({
            effectId: effect.executionEffectId,
            inputManifestDigest: repositoryCheckActionFixture.repositorySnapshot.digest,
            runId: effect.runId,
          }),
        },
        workspace: {
          ...repositoryCheckActionFixture.workspace,
          workspaceId: effect.workspace.workspaceId,
        },
      };
      const policy = evaluateSafeActuationPolicy(envelope, "2026-08-01T12:00:00.000Z");
      const approval = createSafeApproval({
        approvalId: `approval-${effect.toolCall.toolCallId}`,
        envelope,
        expectedRevision: effect.expectedRevision,
      });
      return {
        action: {
          actionId: envelope.actionId,
          approvalId: approval.approvalId,
          canonicalDisplay: "RepositoryCheck test with exact Docker compatibility",
          cwd: ".",
          digest: safeActionDigest(envelope),
          reason: policy.reason,
          safeActuation: {
            approval: {
              actionDigest: approval.actionDigest,
              expectedRevision: approval.expectedRevision,
              proposalRevision: approval.proposalRevision,
              state: "available",
            },
            envelope,
            parentActionId: null,
            policy,
          },
          scope: "repository check test",
        },
        effectId: effect.effectId,
        type: "safe.action.proposed",
      };
    }
    if (effect.type === "repository_check.execute") {
      for (const state of [
        "preparing",
        "creating",
        "created",
        "running",
        "exited",
        "result_decoded",
        "cleaning",
      ] as const) {
        await observe?.({
          actionId: effect.envelope.actionId,
          effectId: effect.effectId,
          observedAt: "2026-08-01T12:00:01.000Z",
          state,
          type: "repository.check.lifecycle",
        });
      }
      const receiptId = "receipt-repository-check-loop-1";
      const labels = {
        actionId: effect.envelope.actionId,
        effectId: effect.effectId,
        imageIndexDigest: effect.envelope.toolchain.imageIndexDigest,
        inputManifestDigest: effect.envelope.repositorySnapshot.digest,
        platformManifestDigest: effect.envelope.toolchain.platformManifestDigest,
        profileRevision: "r2-docker-profile-v1" as const,
        runId: effect.runId,
        schema: "eden.repository-check.v1" as const,
      };
      const receipt = {
        actionId: effect.envelope.actionId,
        configDigest: hash("config"),
        container: { id: "a".repeat(64), name: "eden-check-repository-loop" },
        effectId: effect.effectId,
        labels,
        lifecycleState: "exited" as const,
        receiptId,
        receiptVersion: 1 as const,
        recordedAt: "2026-08-01T12:00:01.000Z",
        resultDigest: hash("result"),
        resultOutcome: "passed" as const,
        stagingIdentity: effect.envelope.staging.identity,
      };
      const cleanup = {
        actionId: effect.envelope.actionId,
        cleanupVersion: 1 as const,
        completedAt: "2026-08-01T12:00:02.000Z",
        container: { id: receipt.container.id, state: "removed" as const },
        effectId: effect.effectId,
        error: null,
        receiptId,
        staging: { identity: effect.envelope.staging.identity, state: "removed" as const },
        status: "complete" as const,
      };
      return {
        effectId: effect.effectId,
        receipt,
        result: {
          actionId: effect.envelope.actionId,
          checkName: effect.envelope.operation.checkName,
          cleanup,
          effectId: effect.effectId,
          endedAt: "2026-08-01T12:00:01.000Z",
          exitCode: 0,
          imageIndexDigest: effect.envelope.toolchain.imageIndexDigest,
          inputManifestDigest: effect.envelope.repositorySnapshot.digest,
          outcome: "passed",
          platformManifestDigest: effect.envelope.toolchain.platformManifestDigest,
          profileRevision: "r2-docker-profile-v1",
          receiptId,
          resultVersion: 1,
          startedAt: "2026-08-01T12:00:00.000Z",
          stderr: "",
          stderrByteLength: 0,
          stderrEncoding: "base64",
          stderrSha256: hash(Buffer.alloc(0)),
          stdout: rawOutputBase64,
          stdoutByteLength: rawOutput.byteLength,
          stdoutEncoding: "base64",
          stdoutSha256: hash(rawOutput),
          wrapperReason: "process_exited",
        },
        type: "repository.check.completed",
      };
    }
    throw new Error(`Unexpected effect ${effect.type}`);
  }

  async reconcile(): Promise<ReconciliationResult> {
    return { status: "not-started" };
  }

  async executeModelAttempt(
    effect: Extract<KernelEffect, { readonly type: "provider.model.step" }>,
    request: ModelStepRequestV1,
  ): Promise<KernelEvent> {
    this.modelRequests.push(request);
    this.modelCalls += 1;
    return this.modelCalls === 1
      ? {
          effectId: effect.effectId,
          observation: {
            attemptId: request.attemptId,
            finishStatus: "tool_calls",
            privateContinuity: null,
            requestId: "request-repository-check-1",
            status: "completed",
            text: "I will run the named check.",
            toolCalls: [
              {
                arguments: { checkName: "test" },
                name: "repository_check",
                toolCallId: "call-repository-check-1",
              },
            ],
            usage: null,
            version: 1,
          },
          type: "model.step.completed",
        }
      : {
          effectId: effect.effectId,
          observation: {
            attemptId: request.attemptId,
            finishStatus: "stop",
            privateContinuity: null,
            requestId: "request-repository-check-2",
            status: "completed",
            text: "The named check completed; review its local evidence.",
            toolCalls: [],
            usage: null,
            version: 1,
          },
          type: "model.step.completed",
        };
  }

  async reconcileModelAttempt(): Promise<ReconciliationResult> {
    return { status: "not-started" };
  }
}

async function drive(runtime: RuntimeEngine) {
  while (runtime.state.phase === "executing") {
    const effect = await runtime.requestNextEffect();
    if (effect === null) return;
    await runtime.settleInFlightEffect();
  }
}

test("repository-check provider loop consumes one approval and withholds raw output", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-repository-loop-"));
  const journal = await FileJournal.open(join(root, "journal.jsonl"), runId);
  const host = new RepositoryCheckLoopHost();
  let id = 0;
  const runtime = await RuntimeEngine.open(
    journal,
    host,
    { now: () => new Date("2026-08-01T12:00:00.000Z") },
    { next: () => `event-${id++}` },
  );
  try {
    await runtime.commit(
      {
        correlationId: "command-repository-check",
        model: {
          contextWindowTokens: 128_000,
          maxOutputTokens: 512,
          model: "fixture-model",
          profileId: "fixture-profile",
        },
        runId,
        task: "Run the named repository test.",
        type: "run.started",
        workspace,
      },
      "command-repository-check",
    );
    await drive(runtime);
    strictEqual(runtime.state.phase, "awaiting-approval");
    if (runtime.state.phase !== "awaiting-approval") return;
    strictEqual(runtime.state.repositoryCheck?.state, "awaiting_approval");
    await runtime.commit(
      {
        approvalId: runtime.state.action.approvalId,
        decision: "approve",
        type: "approval.resolved",
      },
      "command-approve",
    );
    await drive(runtime);
    strictEqual(runtime.state.phase, "terminal");
    strictEqual(host.modelCalls, 2);
    strictEqual(JSON.stringify(host.modelRequests[1]).includes(rawOutputBase64), false);
    strictEqual(
      JSON.stringify(host.modelRequests[1]).includes("RAW-REPOSITORY-OUTPUT-CANARY"),
      false,
    );
    const projection = projectJournal(await journal.readAll());
    strictEqual(projection.view.repositoryCheck?.state, "review");
    strictEqual(projection.view.repositoryCheck?.result?.stdout, rawOutputBase64);
    strictEqual(
      projection.events.some((event) => event.type === "approval.presented"),
      true,
    );
    strictEqual(
      projection.events.filter((event) => event.type === "repository.check.updated").length,
      9,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

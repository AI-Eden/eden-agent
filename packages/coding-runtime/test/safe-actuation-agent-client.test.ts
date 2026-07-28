import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  decodeProductEvent,
  decodeProductView,
  type ProductEvent,
  type WorkspaceReview,
} from "@eden/contracts";
import type { ModelStepDriver, ModelStepObservationV1, ModelStepRequestV1 } from "@eden/providers";
import { rgPath } from "@vscode/ripgrep";

import { AgentClientError, InProcessAgentClient } from "../src/agent-client.ts";

const credentialCanary = "SECRET_CANARY_SAFE_ACTUATION";

async function collect(events: AsyncIterable<ProductEvent>): Promise<readonly ProductEvent[]> {
  const result: ProductEvent[] = [];
  for await (const event of events) result.push(event);
  return result;
}

function trustCommand(review: WorkspaceReview) {
  return {
    commandId: `command-trust-${review.revision}`,
    decision: "trust",
    expectedRevision: review.revision,
    protocolVersion: 1,
    type: "workspace.trust.resolve",
    workspaceId: review.workspace.workspaceId,
  } as const;
}

class ProposeEditProvider implements ModelStepDriver {
  calls = 0;

  async completeModelStep(request: ModelStepRequestV1): Promise<ModelStepObservationV1> {
    this.calls += 1;
    return {
      attemptId: request.attemptId,
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: "request-safe-edit",
      status: "completed",
      text: "I propose one bounded tracked-file edit.",
      toolCalls: [
        {
          arguments: {
            path: "tracked.txt",
            replacements: [
              {
                expectedOccurrences: 1,
                newText: "new value",
                oldText: "old value",
              },
            ],
          },
          name: "anchor_edit",
          toolCallId: "call-safe-edit",
        },
      ],
      usage: null,
      version: 1,
    };
  }
}

test("AgentClient exposes exact approval and completed safe-actuation review", async () => {
  const root = mkdtempSync(join(tmpdir(), "eden-safe-client-"));
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  const ripgrep = join(root, process.platform === "win32" ? "rg.exe" : "rg");
  mkdirSync(workspace, { recursive: true });
  copyFileSync(rgPath, ripgrep);
  if (process.platform !== "win32") chmodSync(ripgrep, 0o700);
  const ripgrepHash = `sha256:${createHash("sha256").update(readFileSync(ripgrep)).digest("hex")}`;
  execFileSync("git", ["init", "--quiet"], { cwd: workspace });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: workspace });
  execFileSync("git", ["config", "user.name", "Test User"], { cwd: workspace });
  writeFileSync(join(workspace, "tracked.txt"), "old value\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: workspace });
  execFileSync("git", ["commit", "--quiet", "-m", "base"], { cwd: workspace });

  const provider = new ProposeEditProvider();
  const client = await InProcessAgentClient.open({
    createModelProvider: () => provider,
    createReadinessProvider: (resolved) => ({
      async checkReadiness() {
        return {
          checkedAt: "2026-07-28T10:30:00.000Z",
          model: resolved.profile.model,
          profileId: resolved.profile.id,
          requestId: null,
          state: "completion_ready",
        };
      },
    }),
    cwd: workspace,
    profileEnvironment: { EDEN_DEEPSEEK_KEY: credentialCanary },
    realProviderRuns: true,
    repositoryTools: {
      ripgrepAsset: {
        contentHash: ripgrepHash,
        path: ripgrep,
        version: "15.0.0",
      },
    },
    stateDirectory,
  });
  try {
    const profiles = await client.getProviderProfiles();
    const saved = await client.saveProviderProfile({
      commandId: "command-save-safe",
      expectedRevision: profiles.revision,
      profile: {
        baseUrl: "https://api.deepseek.com",
        billingSource: "pay_as_you_go",
        contextWindowTokens: 128_000,
        credential: { name: "EDEN_DEEPSEEK_KEY", source: "environment" },
        id: "deepseek",
        maxOutputTokens: 8_192,
        model: "deepseek-v4-pro",
        protocol: "openai_chat_completions",
        reasoningDisplay: "off",
      },
      protocolVersion: 1,
      select: true,
      type: "provider.profile.save",
    });
    await client.resolveWorkspaceTrust(trustCommand(await client.getWorkspaceReview()));
    await client.checkProviderReadiness({
      commandId: "command-ready-safe",
      expectedRevision: saved.revision,
      possibleChargeConfirmed: true,
      profileId: "deepseek",
      protocolVersion: 1,
      type: "provider.readiness.check",
    });

    const approvalView = await client.submit({
      commandId: "command-run-safe",
      protocolVersion: 1,
      task: "Replace the old value in tracked.txt.",
      type: "run.start",
    });
    assert.equal(approvalView.phase, "awaiting-approval");
    assert.equal(approvalView.approval?.digest.length, 64);
    assert.equal(approvalView.residualRisk?.includes("no OS isolation"), true);
    if (approvalView.approval === null) throw new Error("Expected an approval.");
    await assert.rejects(
      client.submit({
        approvalId: approvalView.approval.approvalId,
        commandId: "command-stale-approve-safe",
        decision: "approve",
        expectedRevision: approvalView.revision - 1,
        protocolVersion: 1,
        runId: approvalView.runId,
        type: "approval.resolve",
      }),
      (error: unknown) =>
        error instanceof AgentClientError && error.productError.code === "stale_revision",
    );
    assert.equal(readFileSync(join(workspace, "tracked.txt"), "utf8"), "old value\n");

    const completed = await client.submit({
      approvalId: approvalView.approval.approvalId,
      commandId: "command-approve-safe",
      decision: "approve",
      expectedRevision: approvalView.revision,
      protocolVersion: 1,
      runId: approvalView.runId,
      type: "approval.resolve",
    });
    assert.equal(readFileSync(join(workspace, "tracked.txt"), "utf8"), "new value\n");
    assert.equal(completed.phase, "review");
    assert.equal(completed.terminalOutcome?.state, "completed");
    assert.deepEqual(completed.changedFiles, [
      { attribution: "eden", path: "tracked.txt", status: "modified" },
    ]);
    assert.deepEqual(
      completed.checks.map((check) => [check.name, check.status]),
      [
        ["Git diff-check (baseline)", "passed"],
        ["Git diff-check (current)", "passed"],
      ],
    );
    assert.equal(decodeProductView(completed).ok, true);
    assert.equal(completed.review?.approval.state, "consumed");
    assert.equal(completed.review?.edenPatch.state, "complete");
    assert.equal(completed.review?.currentTrackedPatch.state, "complete");
    assert.equal(
      new Set(completed.conversation?.map((turn) => turn.turnId)).size,
      completed.conversation?.length,
    );
    const events = await collect(client.subscribe(completed.runId));
    assert.equal(
      events.every((event) => decodeProductEvent(event).ok),
      true,
    );
    const reviewEvent = events.find((event) => event.type === "review.updated");
    assert.equal(reviewEvent?.type, "review.updated");
    if (reviewEvent?.type !== "review.updated") throw new Error("Expected review event.");
    assert.deepEqual(reviewEvent.review, completed.review);
    assert.equal(events.at(-1)?.type, "run.terminal");
    assert.equal(provider.calls, 1);
    assert.equal(JSON.stringify(completed).includes(credentialCanary), false);
  } finally {
    await client.close();
    rmSync(root, { force: true, recursive: true });
  }
});

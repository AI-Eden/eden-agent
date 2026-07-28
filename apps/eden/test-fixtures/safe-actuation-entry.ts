#!/usr/bin/env node

import { dirname, join } from "node:path";

import {
  InProcessAgentClient,
  type InProcessAgentClientOptions,
} from "@eden/coding-runtime/agent-client";
import { loadApplicationAssets } from "@eden/coding-runtime/application-assets";

import { runTui } from "../src/tui-runner.tsx";

const credentialName = "EDEN_ACCEPTANCE_KEY";
const scenario = process.env.EDEN_ACCEPTANCE_SCENARIO ?? "approve";
const stateDirectory = process.env.EDEN_STATE_DIR;
if (stateDirectory === undefined) {
  throw new Error("The acceptance harness requires EDEN_STATE_DIR.");
}
if (process.env[credentialName] === undefined) {
  throw new Error("The acceptance harness requires its non-secret fixture credential.");
}

class AcceptanceModel {
  #calls = 0;

  async completeModelStep(request: { readonly attemptId: string }) {
    const call = this.#calls++;
    const replacements =
      scenario === "deny-narrow" && call === 0
        ? [
            { expectedOccurrences: 1 as const, newText: "new one", oldText: "old one" },
            { expectedOccurrences: 1 as const, newText: "new two", oldText: "old two" },
          ]
        : scenario === "deny-narrow"
          ? [{ expectedOccurrences: 1 as const, newText: "new one", oldText: "old one" }]
          : [
              {
                expectedOccurrences: 1 as const,
                newText: scenario === "check-failure" ? "new value  " : "new value",
                oldText: "old value",
              },
            ];
    return {
      attemptId: request.attemptId,
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: `acceptance-request-${call + 1}`,
      status: "completed",
      text: "I propose one bounded tracked UTF-8 edit.",
      toolCalls: [
        {
          arguments: { path: "tracked.txt", replacements },
          name: "anchor_edit",
          toolCallId: `acceptance-edit-${call + 1}`,
        },
      ],
      usage: null,
      version: 1,
    } as const;
  }
}

const model = new AcceptanceModel();
const repositoryTools = await loadApplicationAssets(dirname(process.execPath));
const openClient = async (options: InProcessAgentClientOptions): Promise<InProcessAgentClient> => {
  const client = await InProcessAgentClient.open({
    ...options,
    createModelProvider: () => model,
    createReadinessProvider: (resolved) => ({
      async checkReadiness() {
        return {
          checkedAt: "2026-07-28T12:00:00.000Z",
          model: resolved.profile.model,
          profileId: resolved.profile.id,
          requestId: null,
          state: "completion_ready",
        };
      },
    }),
    profileEnvironment: { [credentialName]: process.env[credentialName] },
    realProviderRuns: true,
  });
  const catalog = await client.getProviderProfiles();
  const saved =
    catalog.profiles.length === 0
      ? await client.saveProviderProfile({
          commandId: "acceptance-profile-save",
          expectedRevision: catalog.revision,
          profile: {
            baseUrl: "https://acceptance.invalid",
            billingSource: "custom",
            contextWindowTokens: 128_000,
            credential: { name: credentialName, source: "environment" },
            id: "acceptance-fixture",
            maxOutputTokens: 8_192,
            model: "acceptance-model",
            protocol: "openai_chat_completions",
            reasoningDisplay: "off",
          },
          protocolVersion: 1,
          select: true,
          type: "provider.profile.save",
        })
      : catalog;
  await client.checkProviderReadiness({
    commandId: "acceptance-readiness-check",
    expectedRevision: saved.revision,
    possibleChargeConfirmed: true,
    profileId: "acceptance-fixture",
    protocolVersion: 1,
    type: "provider.readiness.check",
  });
  return client;
};

process.exitCode = await runTui({
  cwd: process.cwd(),
  onReady: () => process.stderr.write("__EDEN_SAFE_ACCEPTANCE_READY__\n"),
  openClient,
  repositoryTools,
  stateDirectory: join(stateDirectory),
});

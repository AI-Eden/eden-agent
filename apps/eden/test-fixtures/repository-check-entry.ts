#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  InProcessAgentClient,
  type InProcessAgentClientOptions,
} from "@eden/coding-runtime/agent-client";
import { loadApplicationAssets } from "@eden/coding-runtime/application-assets";

import { runTui } from "../src/tui-runner.tsx";

const credentialName = "EDEN_ACCEPTANCE_KEY";
const scenario = process.env.EDEN_REPOSITORY_CHECK_SCENARIO;
const stateDirectory = process.env.EDEN_STATE_DIR;
const dockerContext = process.env.EDEN_REPOSITORY_CHECK_DOCKER_CONTEXT;
const auditPath = process.env.EDEN_REPOSITORY_CHECK_AUDIT_PATH;
if (
  stateDirectory === undefined ||
  dockerContext === undefined ||
  auditPath === undefined ||
  (scenario !== "check-only" && scenario !== "correct-edit" && scenario !== "wrong-edit")
) {
  throw new Error(
    "The repository-check acceptance harness requires its closed scenario and paths.",
  );
}
if (process.env[credentialName] === undefined) {
  throw new Error("The acceptance harness requires its non-secret fixture credential.");
}

const rawOutputCanary = "RAW_REPOSITORY_OUTPUT_CANARY";
type AcceptanceModelDriver = ReturnType<
  NonNullable<InProcessAgentClientOptions["createModelProvider"]>
>;
type AcceptanceModelRequest = Parameters<AcceptanceModelDriver["completeModelStep"]>[0];
type AcceptanceModelObservation = Awaited<ReturnType<AcceptanceModelDriver["completeModelStep"]>>;

class AcceptanceModel {
  readonly requests: AcceptanceModelRequest[] = [];

  async completeModelStep(request: AcceptanceModelRequest): Promise<AcceptanceModelObservation> {
    this.requests.push(request);
    if (JSON.stringify(request).includes(rawOutputCanary)) {
      throw new Error("Raw repository output crossed the provider boundary.");
    }
    const call = this.requests.length;
    if (scenario === "check-only" && call === 1) return this.repositoryCheck(request, call);
    if (scenario !== "check-only" && call === 1) {
      return {
        attemptId: request.attemptId,
        finishStatus: "tool_calls",
        privateContinuity: null,
        requestId: `repository-acceptance-request-${call}`,
        status: "completed",
        text: "I propose one bounded edit to the existing tracked implementation.",
        toolCalls: [
          {
            arguments: {
              path: "src/add.js",
              replacements: [
                {
                  expectedOccurrences: 1,
                  newText:
                    scenario === "correct-edit" ? "return left + right;" : "return left * right;",
                  oldText: "return left - right;",
                },
              ],
            },
            name: "anchor_edit",
            toolCallId: `repository-acceptance-edit-${call}`,
          },
        ],
        usage: null,
        version: 1,
      };
    }
    return {
      attemptId: request.attemptId,
      finishStatus: "stop",
      privateContinuity: null,
      requestId: `repository-acceptance-request-${call}`,
      status: "completed",
      text: "The named check completed; inspect the local untrusted result.",
      toolCalls: [],
      usage: null,
      version: 1,
    };
  }

  private repositoryCheck(
    request: AcceptanceModelRequest,
    call: number,
  ): AcceptanceModelObservation {
    return {
      attemptId: request.attemptId,
      finishStatus: "tool_calls",
      privateContinuity: null,
      requestId: `repository-acceptance-request-${call}`,
      status: "completed",
      text: "I propose the repository-declared named check.",
      toolCalls: [
        {
          arguments: { checkName: "test" },
          name: "repository_check",
          toolCallId: `repository-acceptance-check-${call}`,
        },
      ],
      usage: null,
      version: 1,
    };
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
          checkedAt: "2026-08-01T12:00:00.000Z",
          model: resolved.profile.model,
          profileId: resolved.profile.id,
          requestId: null,
          state: "completion_ready",
        };
      },
    }),
    profileEnvironment: { [credentialName]: process.env[credentialName] },
    realProviderRuns: true,
    repositoryCheckDockerContext: dockerContext,
  });
  const catalog = await client.getProviderProfiles();
  const saved =
    catalog.profiles.length === 0
      ? await client.saveProviderProfile({
          commandId: "repository-acceptance-profile-save",
          expectedRevision: catalog.revision,
          profile: {
            baseUrl: "https://acceptance.invalid",
            billingSource: "custom",
            contextWindowTokens: 128_000,
            credential: { name: credentialName, source: "environment" },
            id: "repository-acceptance-fixture",
            maxOutputTokens: 8_192,
            model: "repository-acceptance-model",
            protocol: "openai_chat_completions",
            reasoningDisplay: "off",
          },
          protocolVersion: 1,
          select: true,
          type: "provider.profile.save",
        })
      : catalog;
  await client.checkProviderReadiness({
    commandId: "repository-acceptance-readiness-check",
    expectedRevision: saved.revision,
    possibleChargeConfirmed: true,
    profileId: "repository-acceptance-fixture",
    protocolVersion: 1,
    type: "provider.readiness.check",
  });
  return client;
};

process.exitCode = await runTui({
  cwd: process.cwd(),
  onReady: () => process.stderr.write("__EDEN_REPOSITORY_ACCEPTANCE_READY__\n"),
  openClient,
  repositoryTools,
  stateDirectory: join(stateDirectory),
});

await writeFile(
  auditPath,
  `${JSON.stringify({
    modelCalls: model.requests.length,
    rawOutputWithheld: model.requests.every(
      (request) => !JSON.stringify(request).includes(rawOutputCanary),
    ),
    realProviderCalls: 0,
  })}\n`,
  "utf8",
);

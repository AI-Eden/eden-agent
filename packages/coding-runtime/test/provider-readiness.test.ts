import assert from "node:assert/strict";
import { chmod, lstat, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { AgentClientError, InProcessAgentClient } from "@eden/coding-runtime";
import type { ProviderProfileInput } from "@eden/contracts";
import { ProviderAdapterError } from "@eden/providers";

const credentialCanary = "SECRET_CANARY_READINESS_ONE";
const profile = {
  baseUrl: "https://api.deepseek.com",
  billingSource: "pay_as_you_go",
  contextWindowTokens: 1_000_000,
  credential: { name: "EDEN_DEEPSEEK_KEY", source: "environment" },
  id: "deepseek-v4",
  maxOutputTokens: 393_216,
  model: "deepseek-v4-pro",
  protocol: "openai_chat_completions",
  reasoningDisplay: "off",
} as const satisfies ProviderProfileInput;

async function paths(label: string) {
  const root = await mkdtemp(join(tmpdir(), `eden-readiness-${label}-`));
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(workspace));
  return { stateDirectory, workspace };
}

function successProvider(calls: { value: number }) {
  return () => ({
    checkReadiness: async () => {
      calls.value += 1;
      return {
        checkedAt: "2026-07-19T12:00:00.000Z",
        model: profile.model,
        profileId: profile.id,
        requestId: "request-ready-1",
        state: "completion_ready" as const,
      };
    },
  });
}

async function saveProfile(client: InProcessAgentClient, value = profile) {
  const initial = await client.getProviderProfiles();
  return client.saveProviderProfile({
    commandId: "command-save",
    expectedRevision: initial.revision,
    profile: value,
    protocolVersion: 1,
    select: true,
    type: "provider.profile.save",
  });
}

function readinessCommand(revision: number) {
  return {
    commandId: "command-readiness",
    expectedRevision: revision,
    possibleChargeConfirmed: true,
    profileId: profile.id,
    protocolVersion: 1,
    type: "provider.readiness.check",
  } as const;
}

describe("provider readiness persistence", () => {
  it("persists only a salted fingerprint and invalidates on profile or credential change", async () => {
    const fixture = await paths("fingerprint");
    const calls = { value: 0 };
    const client = await InProcessAgentClient.open({
      createReadinessProvider: successProvider(calls),
      cwd: fixture.workspace,
      profileEnvironment: { EDEN_DEEPSEEK_KEY: credentialCanary },
      stateDirectory: fixture.stateDirectory,
    });
    const saved = await saveProfile(client);
    assert.equal((await client.getProviderReadiness()).state, "configured");
    const ready = await client.checkProviderReadiness(readinessCommand(saved.revision));
    assert.equal(ready.state, "completion_ready");
    assert.equal(calls.value, 1);
    assert.equal((await client.getProviderProfiles()).profiles[0]?.readiness, "completion_ready");
    const readinessPath = join(fixture.stateDirectory, "provider-readiness-v1.json");
    const persisted = await readFile(readinessPath, "utf8");
    assert.equal(persisted.includes(credentialCanary), false);
    assert.equal(persisted.includes(profile.model), false);
    if (process.platform !== "win32") {
      assert.equal((await stat(readinessPath)).mode & 0o777, 0o600);
    }
    await client.close();

    const reopened = await InProcessAgentClient.open({
      cwd: fixture.workspace,
      profileEnvironment: { EDEN_DEEPSEEK_KEY: credentialCanary },
      stateDirectory: fixture.stateDirectory,
    });
    assert.equal((await reopened.getProviderReadiness()).state, "completion_ready");
    await reopened.close();

    const changedCredential = await InProcessAgentClient.open({
      createReadinessProvider: successProvider(calls),
      cwd: fixture.workspace,
      profileEnvironment: { EDEN_DEEPSEEK_KEY: "SECRET_CANARY_READINESS_TWO" },
      stateDirectory: fixture.stateDirectory,
    });
    assert.equal((await changedCredential.getProviderReadiness()).state, "configured");
    const catalog = await changedCredential.getProviderProfiles();
    assert.equal(
      (await changedCredential.checkProviderReadiness(readinessCommand(catalog.revision))).state,
      "completion_ready",
    );
    await changedCredential.saveProviderProfile({
      commandId: "command-update",
      expectedRevision: catalog.revision,
      profile: { ...profile, model: "deepseek-chat" },
      protocolVersion: 1,
      select: true,
      type: "provider.profile.save",
    });
    assert.equal((await changedCredential.getProviderReadiness()).state, "configured");
    assert.equal(calls.value, 2);
    await changedCredential.close();
  });

  it("projects redacted provider failures without persisting readiness", async () => {
    const fixture = await paths("failure");
    const client = await InProcessAgentClient.open({
      createReadinessProvider: () => ({
        checkReadiness: async () => {
          throw new ProviderAdapterError({
            checkedAt: "2026-07-19T12:00:00.000Z",
            code: "authentication",
            message: "The provider rejected the configured credential.",
            model: profile.model,
            profileId: profile.id,
            recoverability: "reconfigure",
            requestId: null,
            statusFamily: "4xx",
            suggestedActions: ["Check the selected credential and retry."],
          });
        },
      }),
      cwd: fixture.workspace,
      profileEnvironment: { EDEN_DEEPSEEK_KEY: credentialCanary },
      stateDirectory: fixture.stateDirectory,
    });
    const saved = await saveProfile(client);
    const failed = await client.checkProviderReadiness(readinessCommand(saved.revision));
    assert.equal(failed.state, "configured");
    assert.equal(failed.error?.code, "authentication");
    assert.equal(JSON.stringify(failed).includes(credentialCanary), false);
    await assert.rejects(lstat(join(fixture.stateDirectory, "provider-readiness-v1.json")), {
      code: "ENOENT",
    });
    await client.close();
  });

  it("rechecks the content revision after network completion before persisting", async () => {
    const fixture = await paths("stale");
    let release: (() => void) | undefined;
    const providerResult = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = await InProcessAgentClient.open({
      createReadinessProvider: () => ({
        checkReadiness: async () => {
          await providerResult;
          return {
            checkedAt: "2026-07-19T12:00:00.000Z",
            model: profile.model,
            profileId: profile.id,
            requestId: null,
            state: "completion_ready" as const,
          };
        },
      }),
      cwd: fixture.workspace,
      profileEnvironment: { EDEN_DEEPSEEK_KEY: credentialCanary },
      stateDirectory: fixture.stateDirectory,
    });
    const saved = await saveProfile(first);
    const pending = first.checkProviderReadiness(readinessCommand(saved.revision));
    const second = await InProcessAgentClient.open({
      cwd: fixture.workspace,
      profileEnvironment: { EDEN_DEEPSEEK_KEY: credentialCanary },
      stateDirectory: fixture.stateDirectory,
    });
    await second.saveProviderProfile({
      commandId: "command-concurrent-update",
      expectedRevision: saved.revision,
      profile: { ...profile, model: "changed-during-check" },
      protocolVersion: 1,
      select: true,
      type: "provider.profile.save",
    });
    release?.();
    await assert.rejects(
      pending,
      (error) => error instanceof AgentClientError && error.productError.code === "stale_revision",
    );
    await assert.rejects(lstat(join(fixture.stateDirectory, "provider-readiness-v1.json")), {
      code: "ENOENT",
    });
    await first.close();
    await second.close();
  });

  it("surfaces invalid readiness state as a closed local recovery without secret echo", async () => {
    const fixture = await paths("invalid");
    const client = await InProcessAgentClient.open({
      createReadinessProvider: successProvider({ value: 0 }),
      cwd: fixture.workspace,
      profileEnvironment: { EDEN_DEEPSEEK_KEY: credentialCanary },
      stateDirectory: fixture.stateDirectory,
    });
    await saveProfile(client);
    const readinessPath = join(fixture.stateDirectory, "provider-readiness-v1.json");
    await writeFile(readinessPath, `{"secret":"${credentialCanary}"}\n`, { mode: 0o600 });
    const invalid = await client.getProviderReadiness();
    assert.equal(invalid.state, "configured");
    assert.equal(invalid.error?.code, "invalid_configuration");
    assert.equal(JSON.stringify(invalid).includes(credentialCanary), false);
    if (process.platform !== "win32") {
      await chmod(readinessPath, 0o644);
      assert.equal((await client.getProviderReadiness()).error?.code, "invalid_configuration");
    }
    await client.close();
  });
});

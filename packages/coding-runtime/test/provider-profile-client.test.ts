import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it } from "node:test";

import { AgentClientError, InProcessAgentClient } from "@eden/coding-runtime";

it("AgentClient owns masked provider CRUD outside run and journal state", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-profile-client-"));
  const workspace = join(root, "workspace");
  const stateDirectory = join(root, "state");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(workspace));
  const client = await InProcessAgentClient.open({
    cwd: workspace,
    profileEnvironment: { EDEN_DEEPSEEK_KEY: "SECRET_CANARY_CLIENT" },
    stateDirectory,
  });
  try {
    const initial = await client.getProviderProfiles();
    const unconfiguredReview = await client.getWorkspaceReview();
    assert.deepEqual(unconfiguredReview.profile, { active: null, state: "unconfigured" });
    const saved = await client.saveProviderProfile({
      commandId: "command-save",
      expectedRevision: initial.revision,
      profile: {
        baseUrl: "https://api.deepseek.com",
        billingSource: "pay_as_you_go",
        contextWindowTokens: 1_000_000,
        credential: { name: "EDEN_DEEPSEEK_KEY", source: "environment" },
        id: "deepseek-v4",
        maxOutputTokens: 393_216,
        model: "deepseek-v4-pro",
        protocol: "openai_chat_completions",
        reasoningDisplay: "off",
      },
      protocolVersion: 1,
      select: true,
      type: "provider.profile.save",
    });
    assert.equal(saved.profiles[0]?.credential.presence, "present");
    const configuredReview = await client.getWorkspaceReview();
    assert.equal("active" in configuredReview.profile, true);
    if ("active" in configuredReview.profile) {
      assert.equal(configuredReview.profile.state, "configured");
      assert.equal(configuredReview.profile.active?.id, "deepseek-v4");
      assert.equal(JSON.stringify(configuredReview).includes("SECRET_CANARY_CLIENT"), false);
    }
    assert.equal(JSON.stringify(saved).includes("SECRET_CANARY_CLIENT"), false);
    assert.equal(
      (await readFile(join(stateDirectory, "config.toml"), "utf8")).includes(
        "SECRET_CANARY_CLIENT",
      ),
      false,
    );

    await assert.rejects(
      client.deleteProviderProfile({
        commandId: "command-stale",
        expectedRevision: initial.revision,
        profileId: "deepseek-v4",
        protocolVersion: 1,
        type: "provider.profile.delete",
      }),
      (error) => error instanceof AgentClientError && error.productError.code === "stale_revision",
    );
  } finally {
    await client.close();
  }
});

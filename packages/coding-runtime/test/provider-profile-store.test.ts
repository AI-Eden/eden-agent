import assert from "node:assert/strict";
import { chmod, link, mkdtemp, readFile, rename, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { ProviderProfileStore, ProviderProfileStoreError } from "@eden/coding-runtime";
import type { ProviderProfileInput } from "@eden/contracts";

const canary = "SECRET_CANARY_PROVIDER_PROFILE";
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
} as const;

async function stateRoot(label: string) {
  return join(await mkdtemp(join(tmpdir(), `eden-profile-${label}-`)), "state");
}

function saveCommand(expectedRevision: number, value: ProviderProfileInput = profile) {
  return {
    commandId: "command-save",
    expectedRevision,
    profile: value,
    protocolVersion: 1,
    select: true,
    type: "provider.profile.save",
  } as const;
}

describe("provider profile store", () => {
  it("creates, masks, updates, selects, deletes, and reloads config.toml", async () => {
    const stateDirectory = await stateRoot("crud");
    const store = await ProviderProfileStore.open({
      environment: { EDEN_DEEPSEEK_KEY: canary },
      stateDirectory,
    });
    const empty = await store.read();
    assert.equal(empty.activeProfileId, null);

    const saved = await store.save(saveCommand(empty.revision));
    assert.equal(saved.activeProfileId, profile.id);
    assert.equal(saved.profiles[0]?.credential.presence, "present");
    assert.equal(JSON.stringify(saved).includes(canary), false);
    const persisted = await readFile(join(stateDirectory, "config.toml"), "utf8");
    assert.match(persisted, /EDEN_DEEPSEEK_KEY/u);
    assert.equal(persisted.includes(canary), false);
    if (process.platform !== "win32") {
      assert.equal((await stat(stateDirectory)).mode & 0o777, 0o700);
      assert.equal((await stat(join(stateDirectory, "config.toml"))).mode & 0o777, 0o600);
    }
    const missingEnvironment = await ProviderProfileStore.open({
      environment: { EDEN_DEEPSEEK_KEY: "" },
      stateDirectory,
    });
    assert.equal((await missingEnvironment.read()).profiles[0]?.credential.presence, "missing");

    const second = {
      ...profile,
      id: "kimi-code",
      model: "kimi-for-coding",
      billingSource: "subscription_api_key" as const,
      credential: { source: "inline" as const, value: canary },
    };
    const updated = await store.save({
      ...saveCommand(saved.revision, second),
      commandId: "command-save-second",
      select: false,
    });
    assert.equal(updated.activeProfileId, profile.id);
    assert.equal(JSON.stringify(updated).includes(canary), false);
    const selected = await store.select({
      commandId: "command-select",
      expectedRevision: updated.revision,
      profileId: second.id,
      protocolVersion: 1,
      type: "provider.profile.select",
    });
    assert.equal(selected.activeProfileId, second.id);

    await assert.rejects(
      store.delete({
        commandId: "command-delete-active",
        expectedRevision: selected.revision,
        profileId: second.id,
        protocolVersion: 1,
        type: "provider.profile.delete",
      }),
      (error) =>
        error instanceof ProviderProfileStoreError &&
        error.productError.code === "active_profile_delete_requires_selection",
    );
    const reselected = await store.select({
      commandId: "command-reselect",
      expectedRevision: selected.revision,
      profileId: profile.id,
      protocolVersion: 1,
      type: "provider.profile.select",
    });
    const removed = await store.delete({
      commandId: "command-delete",
      expectedRevision: reselected.revision,
      profileId: second.id,
      protocolVersion: 1,
      type: "provider.profile.delete",
    });
    assert.deepEqual(
      removed.profiles.map((value) => value.id),
      [profile.id],
    );

    await writeFile(
      join(stateDirectory, "config.toml"),
      persisted.replace("deepseek-v4-pro", "deepseek-chat"),
      { encoding: "utf8", mode: 0o600 },
    );
    const reloaded = await store.read();
    assert.equal(reloaded.profiles[0]?.model, "deepseek-chat");
    assert.notEqual(reloaded.revision, saved.revision);
  });

  it("rejects stale revisions, malformed and oversized TOML, and unknown fields", async () => {
    const stateDirectory = await stateRoot("invalid");
    const store = await ProviderProfileStore.open({ stateDirectory });
    const saved = await store.save(saveCommand(0));
    await assert.rejects(
      store.save(saveCommand(0)),
      (error) =>
        error instanceof ProviderProfileStoreError && error.productError.code === "stale_revision",
    );

    for (const source of [
      "version = 1\nunknown = true\n",
      "version = 2\n",
      'version = 1\nactive_profile = "missing"\n',
      "not valid = [toml",
      `version = 1\n# ${"x".repeat(65_536)}\n`,
    ]) {
      await writeFile(join(stateDirectory, "config.toml"), source, { mode: 0o600 });
      await assert.rejects(
        store.read(),
        (error) =>
          error instanceof ProviderProfileStoreError &&
          error.productError.code === "invalid_provider_configuration",
      );
    }
    assert.notEqual(saved.revision, 0);
  });

  it("fails closed for linked or permissive config state", async () => {
    if (process.platform === "win32") return;
    const stateDirectory = await stateRoot("metadata");
    const store = await ProviderProfileStore.open({ stateDirectory });
    await store.save(saveCommand(0));
    const config = join(stateDirectory, "config.toml");
    const parked = join(stateDirectory, "parked.toml");

    await rename(config, parked);
    await symlink(parked, config);
    await assert.rejects(store.read(), ProviderProfileStoreError);
    await rename(config, join(stateDirectory, "config-link"));
    await link(parked, config);
    await assert.rejects(store.read(), ProviderProfileStoreError);
    await rename(config, join(stateDirectory, "config-hardlink"));
    await rename(parked, config);
    await chmod(config, 0o644);
    await assert.rejects(store.read(), ProviderProfileStoreError);
    await chmod(config, 0o600);
    await chmod(stateDirectory, 0o755);
    await assert.rejects(store.read(), ProviderProfileStoreError);
  });

  it("preserves the prior bytes when atomic replacement is interrupted", async () => {
    const stateDirectory = await stateRoot("atomic");
    const initial = await ProviderProfileStore.open({ stateDirectory });
    const saved = await initial.save(saveCommand(0));
    const before = await readFile(join(stateDirectory, "config.toml"), "utf8");
    const interrupted = await ProviderProfileStore.open({
      beforeReplace: async () => {
        throw new Error("injected replacement failure");
      },
      stateDirectory,
    });

    await assert.rejects(
      interrupted.save({
        ...saveCommand(saved.revision, { ...profile, model: "changed-model" }),
        commandId: "command-interrupted",
      }),
      ProviderProfileStoreError,
    );
    assert.equal(await readFile(join(stateDirectory, "config.toml"), "utf8"), before);
  });

  it("linearizes competing stores around one content revision", async () => {
    const stateDirectory = await stateRoot("race");
    const first = await ProviderProfileStore.open({ stateDirectory });
    const second = await ProviderProfileStore.open({ stateDirectory });
    const outcomes = await Promise.allSettled([
      first.save(saveCommand(0, { ...profile, model: "first-model" })),
      second.save(saveCommand(0, { ...profile, model: "second-model" })),
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    assert.equal(
      rejected?.status === "rejected" &&
        rejected.reason instanceof ProviderProfileStoreError &&
        rejected.reason.productError.code,
      "stale_revision",
    );
  });
});

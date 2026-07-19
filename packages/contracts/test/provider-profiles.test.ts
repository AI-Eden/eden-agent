import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decodeDeleteProviderProfileCommand,
  decodeProviderProfileCatalog,
  decodeProviderProfileCheck,
  decodeSaveProviderProfileCommand,
  decodeSelectProviderProfileCommand,
} from "@eden/contracts";

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

describe("provider profile contracts", () => {
  it("decodes closed save, select, and delete commands", () => {
    const save = {
      commandId: "command-profile-save",
      expectedRevision: 0,
      profile,
      protocolVersion: 1,
      select: true,
      type: "provider.profile.save",
    } as const;
    const select = {
      commandId: "command-profile-select",
      expectedRevision: 1,
      profileId: profile.id,
      protocolVersion: 1,
      type: "provider.profile.select",
    } as const;
    const remove = {
      commandId: "command-profile-delete",
      expectedRevision: 1,
      profileId: profile.id,
      protocolVersion: 1,
      type: "provider.profile.delete",
    } as const;

    assert.deepEqual(decodeSaveProviderProfileCommand(save), { ok: true, value: save });
    assert.deepEqual(decodeSelectProviderProfileCommand(select), { ok: true, value: select });
    assert.deepEqual(decodeDeleteProviderProfileCommand(remove), { ok: true, value: remove });
    assert.equal(decodeSaveProviderProfileCommand({ ...save, rendererDraft: true }).ok, false);
    assert.equal(
      decodeSelectProviderProfileCommand({ ...select, profileId: "../escape" }).ok,
      false,
    );
  });

  it("keeps inline credentials out of the masked catalog", () => {
    const catalog = {
      activeProfileId: profile.id,
      notice: null,
      profiles: [
        {
          ...profile,
          credential: {
            name: profile.credential.name,
            presence: "present",
            source: "environment",
          },
          readiness: "unverified",
        },
      ],
      protocolVersion: 1,
      revision: 1,
    } as const;

    assert.deepEqual(decodeProviderProfileCatalog(catalog), { ok: true, value: catalog });
    assert.equal(
      decodeProviderProfileCheck({
        profile: catalog.profiles[0],
        protocolVersion: 1,
        revision: catalog.revision,
        state: "configured",
      }).ok,
      true,
    );
    assert.equal(
      decodeProviderProfileCheck({
        profile: null,
        protocolVersion: 1,
        revision: 0,
        state: "configured",
      }).ok,
      false,
    );
    assert.equal(
      decodeProviderProfileCatalog({
        ...catalog,
        profiles: [{ ...catalog.profiles[0], credential: { source: "inline", value: "secret" } }],
      }).ok,
      false,
    );
  });

  it("rejects invalid profile identities, URLs, limits, and credential shapes", () => {
    const command = {
      commandId: "command-profile-save",
      expectedRevision: 0,
      profile,
      protocolVersion: 1,
      select: true,
      type: "provider.profile.save",
    } as const;
    const invalidProfiles = [
      { ...profile, id: "Uppercase" },
      { ...profile, baseUrl: "file:///tmp/provider" },
      { ...profile, contextWindowTokens: 0 },
      { ...profile, maxOutputTokens: -1 },
      { ...profile, credential: { name: "", source: "environment" } },
      { ...profile, credential: { source: "inline", value: "" } },
      {
        ...profile,
        credential: { name: "EDEN_DEEPSEEK_KEY", source: "environment", value: "secret" },
      },
    ];

    for (const invalid of invalidProfiles) {
      assert.equal(decodeSaveProviderProfileCommand({ ...command, profile: invalid }).ok, false);
    }
  });
});

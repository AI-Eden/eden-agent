import { expect, test } from "bun:test";
import { lstat, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { InProcessAgentClient } from "@eden/coding-runtime";
import { decodeProviderProfileCatalog, decodeProviderReadiness } from "@eden/contracts";

import { runProviderProfiles } from "../src/provider-profiles.ts";

test("headless profile list and check emit closed masked JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-profile-headless-"));
  const stateDirectory = join(root, "state");
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const client = await InProcessAgentClient.open({ cwd: workspace, stateDirectory });
  const initial = await client.getProviderProfiles();
  await client.saveProviderProfile({
    commandId: "command-save",
    expectedRevision: initial.revision,
    profile: {
      baseUrl: "https://api.deepseek.com",
      billingSource: "pay_as_you_go",
      contextWindowTokens: 1_000_000,
      credential: { source: "inline", value: "SECRET_CANARY_HEADLESS" },
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
  await client.close();

  for (const mode of ["profile-list", "profile-check"] as const) {
    let stderr = "";
    let stdout = "";
    expect(
      await runProviderProfiles(
        { mode },
        {
          cwd: workspace,
          io: {
            stderr: (value) => {
              stderr += value;
            },
            stdout: (value) => {
              stdout += value;
            },
          },
          stateDirectory,
        },
      ),
    ).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).not.toContain("SECRET_CANARY_HEADLESS");
    expect(JSON.parse(stdout).protocolVersion).toBe(1);
    expect(
      (mode === "profile-list" ? decodeProviderProfileCatalog : decodeProviderReadiness)(
        JSON.parse(stdout),
      ).ok,
    ).toBe(true);
  }

  await writeFile(join(stateDirectory, "config.toml"), "SECRET_CANARY_HEADLESS = [", {
    mode: 0o600,
  });
  let stderr = "";
  const code = await runProviderProfiles(
    { mode: "profile-list" },
    {
      cwd: workspace,
      io: {
        stderr: (value) => {
          stderr += value;
        },
        stdout: () => undefined,
      },
      stateDirectory,
    },
  );
  expect(code).toBe(1);
  expect(stderr).not.toContain("SECRET_CANARY_HEADLESS");
  expect(JSON.parse(stderr).code).toBe("invalid_provider_configuration");
});

test("headless profile inspection of missing state creates no inode", async () => {
  const root = await mkdtemp(join(tmpdir(), "eden-profile-headless-missing-"));
  const stateDirectory = join(root, "missing-state");
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  for (const mode of ["profile-list", "profile-check"] as const) {
    let stdout = "";
    expect(
      await runProviderProfiles(
        { mode },
        {
          cwd: workspace,
          io: { stderr: () => undefined, stdout: (value) => (stdout += value) },
          stateDirectory,
        },
      ),
    ).toBe(0);
    if (mode === "profile-list") expect(JSON.parse(stdout).profiles).toEqual([]);
    else expect(JSON.parse(stdout).state).toBe("unconfigured");
  }
  await expect(lstat(stateDirectory)).rejects.toMatchObject({ code: "ENOENT" });
});

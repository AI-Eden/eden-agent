import { AgentClientError, InProcessAgentClient } from "@eden/coding-runtime";

import type { CliArguments } from "./args.ts";

type ProfileArguments = Extract<CliArguments, { readonly mode: "profile-check" | "profile-list" }>;

export type ProviderProfileEnvironment = {
  readonly cwd: string;
  readonly io: {
    readonly stderr: (value: string) => unknown;
    readonly stdout: (value: string) => unknown;
  };
  readonly stateDirectory: string;
};

export async function runProviderProfiles(
  arguments_: ProfileArguments,
  environment: ProviderProfileEnvironment,
): Promise<0 | 1> {
  const client = await InProcessAgentClient.open({
    cwd: environment.cwd,
    stateDirectory: environment.stateDirectory,
  });
  try {
    const catalog = await client.getProviderProfiles();
    if (arguments_.mode === "profile-list") {
      environment.io.stdout(`${JSON.stringify(catalog)}\n`);
      return 0;
    }
    const profile = catalog.profiles.find((value) => value.id === catalog.activeProfileId) ?? null;
    const configured = profile !== null && profile.credential.presence === "present";
    environment.io.stdout(
      `${JSON.stringify({
        profile: configured ? profile : null,
        protocolVersion: 1,
        revision: catalog.revision,
        state: configured ? "configured" : "unconfigured",
      })}\n`,
    );
    return 0;
  } catch (error) {
    const productError =
      error instanceof AgentClientError
        ? error.productError
        : {
            code: "provider_configuration_unavailable",
            message: "The provider configuration is unavailable.",
            recoverability: "reconfigure" as const,
            suggestedActions: ["Inspect the local provider configuration and retry."],
          };
    environment.io.stderr(`${JSON.stringify(productError)}\n`);
    return 1;
  } finally {
    await client.close();
  }
}

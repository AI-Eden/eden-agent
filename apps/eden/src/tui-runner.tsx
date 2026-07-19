import { InProcessAgentClient, type InProcessAgentClientOptions } from "@eden/coding-runtime";
import type { WorkspaceReview } from "@eden/contracts";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import { EdenTuiApp } from "./tui.tsx";

export type TuiEnvironment = {
  readonly cwd: string;
  readonly onReady?: (() => void) | undefined;
  readonly repositoryTools?: InProcessAgentClientOptions["repositoryTools"];
  readonly stateDirectory: string;
};

export async function runTui(environment: TuiEnvironment): Promise<0 | 130> {
  const client = await InProcessAgentClient.open({
    cwd: environment.cwd,
    ...(environment.repositoryTools === undefined
      ? {}
      : { repositoryTools: environment.repositoryTools }),
    realProviderRuns: "when-configured",
    stateDirectory: environment.stateDirectory,
  });
  let renderer: Awaited<ReturnType<typeof createCliRenderer>> | undefined;
  let root: ReturnType<typeof createRoot> | undefined;
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    try {
      root?.unmount();
    } finally {
      try {
        renderer?.destroy();
      } finally {
        await client.close();
      }
    }
  };
  try {
    const initialWorkspaceReview: WorkspaceReview = await client.getWorkspaceReview();
    renderer = await createCliRenderer({
      consoleMode: "disabled",
      exitOnCtrlC: false,
      screenMode: "alternate-screen",
    });
    root = createRoot(renderer);
    return await new Promise((resolve, reject) => {
      let finishing = false;
      const finish = async (code: 0 | 130) => {
        if (finishing) return;
        finishing = true;
        try {
          await cleanup();
          resolve(code);
        } catch (error) {
          reject(error);
        }
      };
      root?.render(
        <EdenTuiApp
          client={client}
          initialWorkspaceReview={initialWorkspaceReview}
          onExit={(code) => void finish(code)}
          onReady={environment.onReady}
        />,
      );
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

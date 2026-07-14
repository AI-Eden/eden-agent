import { randomUUID } from "node:crypto";
import { basename } from "node:path";

import { InProcessAgentClient } from "@eden/coding-runtime";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";

import { EdenTuiApp } from "./tui.tsx";

export type TuiEnvironment = {
  readonly cwd: string;
  readonly onReady?: (() => void) | undefined;
  readonly stateDirectory: string;
};

export async function runTui(environment: TuiEnvironment): Promise<0 | 130> {
  const runId = randomUUID();
  const client = await InProcessAgentClient.open({
    cwd: environment.cwd,
    runId,
    stateDirectory: environment.stateDirectory,
    workspace: {
      name: basename(environment.cwd) || "workspace",
      trust: "trusted",
      workspaceId: `workspace:${runId}`,
    },
  });
  const renderer = await createCliRenderer({
    consoleMode: "disabled",
    exitOnCtrlC: false,
    screenMode: "alternate-screen",
  });
  const root = createRoot(renderer);
  return new Promise((resolve) => {
    let finishing = false;
    const finish = async (code: 0 | 130) => {
      if (finishing) return;
      finishing = true;
      root.unmount();
      renderer.destroy();
      await client.close();
      resolve(code);
    };
    root.render(
      <EdenTuiApp
        client={client}
        runId={runId}
        onExit={(code) => void finish(code)}
        onReady={environment.onReady}
      />,
    );
  });
}

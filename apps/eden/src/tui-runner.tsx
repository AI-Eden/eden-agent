import type {
  InProcessAgentClient,
  InProcessAgentClientOptions,
} from "@eden/coding-runtime/agent-client";
import type { WorkspaceReview } from "@eden/contracts";

export type TuiEnvironment = {
  readonly cwd: string;
  readonly onReady?: (() => void) | undefined;
  readonly openClient?: (options: InProcessAgentClientOptions) => Promise<InProcessAgentClient>;
  readonly repositoryTools?:
    | InProcessAgentClientOptions["repositoryTools"]
    | Promise<InProcessAgentClientOptions["repositoryTools"]>;
  readonly stateDirectory: string;
};

export async function runTui(environment: TuiEnvironment): Promise<0 | 130> {
  let client: InProcessAgentClient | undefined;
  let renderer:
    | Awaited<ReturnType<typeof import("@opentui/core")["createCliRenderer"]>>
    | undefined;
  let root: ReturnType<typeof import("@opentui/react")["createRoot"]> | undefined;
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
        await client?.close();
      }
    }
  };
  try {
    const clientModulePromise = import("@eden/coding-runtime/agent-client");
    const clientReviewPromise = Promise.all([
      clientModulePromise,
      Promise.resolve(environment.repositoryTools),
    ]).then(async ([{ InProcessAgentClient }, repositoryTools]) => {
      const openedClient = await (environment.openClient ?? InProcessAgentClient.open)({
        cwd: environment.cwd,
        ...(repositoryTools === undefined ? {} : { repositoryTools }),
        realProviderRuns: "when-configured",
        stateDirectory: environment.stateDirectory,
      });
      client = openedClient;
      const result = {
        client: openedClient,
        review: await openedClient.getWorkspaceReview(),
      };
      return result;
    });
    const corePromise = import("@opentui/core");
    const rendererPromise = corePromise.then(({ createCliRenderer }) =>
      createCliRenderer({
        consoleMode: "disabled",
        enableMouseMovement: false,
        exitOnCtrlC: false,
        screenMode: "alternate-screen",
        useKittyKeyboard: null,
        useMouse: false,
      }),
    );
    const reactRendererPromise = import("@opentui/react");
    const tuiPromise = import("./tui.tsx");
    const reactPromise = import("react");
    const [clientReviewResult, rendererResult, reactRenderer, tui, react] = await Promise.all([
      Promise.resolve(clientReviewPromise).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ reason, status: "rejected" as const }),
      ),
      Promise.resolve(rendererPromise).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (reason: unknown) => ({ reason, status: "rejected" as const }),
      ),
      reactRendererPromise,
      tuiPromise,
      reactPromise,
    ]);
    if (rendererResult.status === "fulfilled") renderer = rendererResult.value;
    if (clientReviewResult.status === "rejected") throw clientReviewResult.reason;
    if (rendererResult.status === "rejected") throw rendererResult.reason;
    const activeClient = clientReviewResult.value.client;
    const initialWorkspaceReview: WorkspaceReview = clientReviewResult.value.review;
    root = reactRenderer.createRoot(rendererResult.value);
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
        react.createElement(tui.EdenTuiApp, {
          client: activeClient,
          initialWorkspaceReview,
          onExit: (code: 0 | 130) => void finish(code),
          onReady: environment.onReady,
        }),
      );
    });
  } catch (error) {
    await cleanup();
    throw error;
  }
}

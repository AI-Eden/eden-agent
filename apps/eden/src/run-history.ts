import { AgentClientError, InProcessAgentClient } from "@eden/coding-runtime/agent-client";
import {
  decodeRunCatalog,
  decodeRunInspection,
  type ProductError,
  type RunId,
} from "@eden/contracts";

import type { HeadlessEnvironment } from "./headless.ts";

export type RunHistoryArguments =
  | { readonly mode: "run-list" }
  | { readonly mode: "run-show"; readonly runId: RunId };

function writeError(error: ProductError, environment: HeadlessEnvironment): void {
  environment.io.stderr(`${JSON.stringify(error)}\n`);
}

function contractError(): ProductError {
  return {
    code: "runtime_contract_failure",
    message: "The runtime produced an invalid run-history value.",
    recoverability: "fatal",
    suggestedActions: ["Inspect the local installation and isolated state directory."],
  };
}

export async function runHistory(
  arguments_: RunHistoryArguments,
  environment: HeadlessEnvironment,
  signal?: AbortSignal,
): Promise<number> {
  let client: InProcessAgentClient | null = null;
  try {
    client = await InProcessAgentClient.openReadOnly({
      cwd: environment.cwd,
      ...(environment.repositoryTools === undefined
        ? {}
        : { repositoryTools: environment.repositoryTools }),
      stateDirectory: environment.stateDirectory,
    });
    const requestOptions = signal === undefined ? undefined : { signal };
    if (arguments_.mode === "run-list") {
      const decoded = decodeRunCatalog(await client.getRunCatalog(requestOptions));
      if (!decoded.ok) throw new AgentClientError(contractError());
      environment.io.stdout(`${JSON.stringify(decoded.value)}\n`);
      return 0;
    }
    const decoded = decodeRunInspection(await client.inspectRun(arguments_.runId, requestOptions));
    if (!decoded.ok) throw new AgentClientError(contractError());
    environment.io.stdout(`${JSON.stringify(decoded.value)}\n`);
    return 0;
  } catch (error) {
    const productError =
      error instanceof AgentClientError
        ? error.productError
        : {
            code: "runtime_failure",
            message: "Run history failed without exposing local state details.",
            recoverability: "fatal" as const,
            suggestedActions: ["Inspect the isolated state directory and retry."],
          };
    writeError(productError, environment);
    return productError.code === "run_not_found" ? 2 : 1;
  } finally {
    await client?.close();
  }
}

import { decodeRunId, type ProductError, type RunId } from "@eden/contracts";

export type CliArguments =
  | { readonly mode: "help" }
  | { readonly mode: "profile-check" }
  | { readonly mode: "profile-list" }
  | { readonly mode: "run-list" }
  | { readonly mode: "run-show"; readonly runId: RunId }
  | { readonly mode: "tui" }
  | {
      readonly approveFakeAction: boolean;
      readonly mode: "headless";
      readonly task: string;
      readonly trustWorkspace: boolean;
    };

export type CliArgumentsResult =
  | { readonly ok: true; readonly value: CliArguments }
  | { readonly ok: false; readonly error: ProductError };

export const helpText = `Usage:
  eden
  eden exec --json [--trust-workspace] [--approve-fake-action] "<task>"
  eden run list --json
  eden run show --json <run-id>
  eden profile list --json
  eden profile check --json
  eden --help

The default command opens the terminal product.
Headless JSON emits one ProductEvent object per line.
Run history JSON emits one RunCatalog or read-only RunInspection object.
`;

function invalid(message: string): CliArgumentsResult {
  return {
    error: {
      code: "invalid_arguments",
      message,
      recoverability: "reconfigure",
      suggestedActions: ["Run eden --help for usage."],
    },
    ok: false,
  };
}

export function parseArgs(argv: readonly string[]): CliArgumentsResult {
  if (argv.length === 0) return { ok: true, value: { mode: "tui" } };
  if (argv.length === 1 && argv[0] === "--help") return { ok: true, value: { mode: "help" } };
  if (argv.length === 3 && argv[0] === "profile" && argv[2] === "--json") {
    if (argv[1] === "list") return { ok: true, value: { mode: "profile-list" } };
    if (argv[1] === "check") return { ok: true, value: { mode: "profile-check" } };
  }
  if (argv.length === 3 && argv[0] === "run" && argv[1] === "list" && argv[2] === "--json") {
    return { ok: true, value: { mode: "run-list" } };
  }
  if (argv.length === 4 && argv[0] === "run" && argv[1] === "show" && argv[2] === "--json") {
    const runId = decodeRunId(argv[3]);
    return runId.ok
      ? { ok: true, value: { mode: "run-show", runId: runId.value } }
      : invalid("Run show requires one path-safe run ID.");
  }
  if (argv[0] !== "exec") return invalid("Unknown command or option.");
  let approveFakeAction = false;
  let json = false;
  let task: string | null = null;
  let trustWorkspace = false;
  for (const argument of argv.slice(1)) {
    if (argument === "--json" && !json) {
      json = true;
    } else if (argument === "--approve-fake-action" && !approveFakeAction) {
      approveFakeAction = true;
    } else if (argument === "--trust-workspace" && !trustWorkspace) {
      trustWorkspace = true;
    } else if (!argument.startsWith("-") && task === null && argument.trim().length > 0) {
      task = argument;
    } else {
      return invalid(`Invalid headless argument: ${argument || "<empty>"}.`);
    }
  }
  if (!json || task === null) {
    return invalid("Headless execution requires --json and one non-empty task.");
  }
  return { ok: true, value: { approveFakeAction, mode: "headless", task, trustWorkspace } };
}

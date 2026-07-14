import type { ProductError } from "@eden/contracts";

export type CliArguments =
  | { readonly mode: "help" }
  | { readonly mode: "tui" }
  | { readonly approveFakeAction: boolean; readonly mode: "headless"; readonly task: string };

export type CliArgumentsResult =
  | { readonly ok: true; readonly value: CliArguments }
  | { readonly ok: false; readonly error: ProductError };

export const helpText = `Usage:
  eden
  eden exec --json [--approve-fake-action] "<task>"
  eden --help

The default command opens the terminal product.
Headless JSON emits one ProductEvent object per line.
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
  if (argv[0] !== "exec") return invalid("Unknown command or option.");
  let approveFakeAction = false;
  let json = false;
  let task: string | null = null;
  for (const argument of argv.slice(1)) {
    if (argument === "--json" && !json) {
      json = true;
    } else if (argument === "--approve-fake-action" && !approveFakeAction) {
      approveFakeAction = true;
    } else if (!argument.startsWith("-") && task === null && argument.trim().length > 0) {
      task = argument;
    } else {
      return invalid(`Invalid headless argument: ${argument || "<empty>"}.`);
    }
  }
  if (!json || task === null) {
    return invalid("Headless execution requires --json and one non-empty task.");
  }
  return { ok: true, value: { approveFakeAction, mode: "headless", task } };
}

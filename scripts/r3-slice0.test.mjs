import { doesNotMatch, strictEqual } from "node:assert";
import { test } from "node:test";

import { helpText, parseArgs } from "../apps/eden/src/args.ts";
import { decodeActionEnvelope, decodeRepositoryToolCall } from "../packages/contracts/src/index.ts";
import { decodeKernelEvent } from "../packages/kernel/src/index.ts";

test("R3-A capabilities require their exact closed call shape", () => {
  for (const candidate of [{ kind: "write_file_v1" }, { kind: "run_command_v1" }]) {
    strictEqual(decodeActionEnvelope(candidate).ok, false);
  }

  for (const call of [
    {
      arguments: { continuation: null, path: "." },
      name: "git_diff",
      toolCallId: "tool-git-diff",
    },
    {
      arguments: { content: "created\n", path: "created.txt" },
      name: "write_file",
      toolCallId: "tool-write-file",
    },
    {
      arguments: {
        args: ["--test"],
        cwd: ".",
        network: "host_unrestricted",
        program: "node",
        reason: "Run the approved repository fixture.",
        timeoutMs: 10_000,
      },
      name: "run_command",
      toolCallId: "tool-run-command",
    },
  ]) {
    strictEqual(decodeRepositoryToolCall(call).ok, true);
    strictEqual(decodeRepositoryToolCall({ ...call, extra: true }).ok, false);
  }

  for (const name of ["web_search", "web_fetch"]) {
    strictEqual(
      decodeRepositoryToolCall({ arguments: {}, name, toolCallId: `tool-${name}` }).ok,
      false,
    );
  }
});

test("R3-B through R3-D effects remain outside R3-A kernel authority", () => {
  for (const type of [
    "plan.proposed",
    "goal.accepted",
    "verification.succeeded",
    "run.resumed",
    "child.spawned",
    "web.fetch.completed",
  ]) {
    strictEqual(decodeKernelEvent({ type }).ok, false);
  }
});

test("R3 plan, goal, resume, child, and web commands remain absent from the CLI", async () => {
  for (const args of [
    ["run", "resume", "run-r3"],
    ["plan", "task"],
    ["goal", "task"],
    ["explore", "task"],
    ["web", "search", "query"],
  ]) {
    strictEqual((await parseArgs(args)).ok, false);
  }

  doesNotMatch(helpText, /\b(plan|goal|resume|explore|web)\b/u);
});

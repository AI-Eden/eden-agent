import type { Action } from "./model.ts";

export function deterministicFakeAction(runId: string, cwd: string): Action {
  return {
    actionId: `${runId}:fake-action`,
    approvalId: `${runId}:fake-approval`,
    canonicalDisplay: "Run the deterministic fake task",
    cwd,
    digest: `${runId}:fake-action-digest`,
    reason: "Exercise the R1 fake-task boundary without changing workspace files.",
    scope: "R1 demo state directory only",
  };
}

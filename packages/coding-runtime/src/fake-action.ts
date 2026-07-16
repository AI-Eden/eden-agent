import { type Action, deterministicFakeAction } from "@eden/kernel";

export function fakeAction(runId: string, cwd: string, canonicalDisplay: string): Action {
  const action = deterministicFakeAction(runId, cwd);
  if (canonicalDisplay !== action.canonicalDisplay) {
    throw new Error("The fake model display does not match the deterministic action.");
  }
  return action;
}

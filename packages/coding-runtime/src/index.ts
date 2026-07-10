export interface RuntimePorts {
  readonly clock: { now(): Date };
  readonly journal: { append(event: unknown): Promise<void> };
}

export const runtimeStatus = "not-implemented" as const;

export type { ContextItem } from "./context/index.js";
export type { GoalSpec } from "./goals/index.js";
export type { JournalPort } from "./journal/index.js";
export type { PlanArtifact } from "./planning/index.js";
export type { PolicyDecision } from "./policy/index.js";
export type { RunProfile } from "./profiles/index.js";
export type { SkillDescriptor } from "./skills/index.js";
export type { SubagentSpec } from "./subagents/index.js";
export type { ToolResult } from "./tools/index.js";
export type { VerificationResult } from "./verification/index.js";
export type { WorkspaceSnapshot } from "./workspace/index.js";

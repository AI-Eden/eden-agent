export interface SubagentSpec {
  readonly role: "explore" | "review";
  readonly parentRunId: string;
  readonly capabilityIds: readonly string[];
  readonly budgetId: string;
}


export interface GoalSpec {
  readonly objective: string;
  readonly requiredChecks: readonly string[];
  readonly allowedCapabilities: readonly string[];
  readonly repairBudget: number;
}

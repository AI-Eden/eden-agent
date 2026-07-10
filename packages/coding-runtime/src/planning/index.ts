export interface PlanArtifact {
  readonly goal: string;
  readonly steps: readonly string[];
  readonly acceptanceChecks: readonly string[];
  readonly nonGoals: readonly string[];
}


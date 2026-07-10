export interface ScenarioResult {
  readonly scenarioId: string;
  readonly passed: boolean;
  readonly evidence: readonly string[];
}

export const labStatus = "skeleton" as const;

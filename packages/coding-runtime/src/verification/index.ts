export interface VerificationResult {
  readonly passed: boolean;
  readonly requiredChecks: readonly {
    readonly id: string;
    readonly passed: boolean;
  }[];
  readonly evidenceRefs: readonly string[];
}

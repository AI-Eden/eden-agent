export interface RunProfile {
  readonly name: "explore" | "plan" | "build" | "goal" | "review";
  readonly instructionRefs: readonly string[];
  readonly budgetId: string;
}

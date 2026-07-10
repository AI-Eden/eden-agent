export interface ContextItem {
  readonly source: string;
  readonly reason: string;
  readonly content: string;
  readonly estimatedTokens: number;
}

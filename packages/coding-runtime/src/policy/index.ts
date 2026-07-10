export type PolicyDecision =
  | { readonly outcome: "allow" }
  | { readonly outcome: "ask"; readonly reason: string }
  | { readonly outcome: "deny"; readonly reason: string };

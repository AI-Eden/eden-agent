# ADR 0007: Native Ports Require Benchmarks

- Status: Accepted
- Date: 2026-07-10

## Context

Rust can improve startup, search, diff, parsing, or isolation primitives, but premature native boundaries add build, distribution, memory-ownership, and cross-platform complexity.

## Decision

Kernel, runtime, and contracts remain TypeScript. A native module is introduced only when a reproducible profile identifies a user-visible bottleneck, a narrow interface exists, the port wins a benchmark, and a TypeScript fallback or explicit support policy is defined.

## Consequences

The repository does not create an empty Rust crate during R0. Native work becomes evidence-driven systems engineering rather than résumé decoration.

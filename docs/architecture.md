# Architecture

## System shape

eden-agent separates execution truth from product presentation.

```text
TUI / headless CLI / later desktop
              |
       product contracts
              |
       AgentClient port
              |
 kernel + coding runtime + policy + journal
              |
 provider / tool / workspace / sandbox adapters
```

The journal is the durable authority. Every surface sends product commands and consumes projections. A surface may own ephemeral selection, layout, and draft state; it may not own run phase, approval, changed-file truth, verification, or terminal state.

## Package responsibilities

### contracts

Defines versioned external commands, product events, view models, and recoverable errors. It is intentionally thin and must not become a generic shared-types package.

### kernel

Contains pure state transitions and pure effect decisions. It knows event meaning but does not read files, call models, execute commands, persist bytes, or render UI.

### coding-runtime

Executes effects through ports. Internal modules cover context, tools, policy, workspace, journal, profiles, planning, goals, verification, skills, and later subagents. These remain modules until a real independent release boundary appears.

### providers

Normalizes one model step: request serialization, streaming, tool-call representation, usage, cancellation, and provider errors. It never owns the multi-step loop.

### lab

Owns fixtures, scenarios, replay, graders, multi-trial reports, and baseline comparisons. A product or harness claim should have a corresponding scenario or measurement here.

### apps/eden

Composes ports and manages terminal lifecycle. It renders product state and serializes headless output. It cannot bypass runtime policy to execute actions.

## Execution sequence

1. A product command is validated and translated into a kernel event.
2. The event is appended to the journal.
3. The reducer produces the next state.
4. The decision function emits effects.
5. The dispatcher executes effects through ports.
6. Observed results become new validated events.
7. Product projections publish stable user-facing state.
8. A verifier, not the model, produces success evidence.

## Dependency rule

Dependencies point inward: apps and adapters depend on contracts and runtime ports; runtime depends on kernel; kernel has no dependency on adapters. TUI, Bun, Node provider SDKs, Docker, Tauri, and Electron cannot leak into the kernel.

## Deferred boundaries

`apps/agentd`, `apps/desktop`, and `crates/eden-native` are not empty scaffolds. They are created only after the R5 service gate or a native-port benchmark. This keeps architecture options visible without pretending they have already been paid for.

# R0 Executable Product Contracts and View Fixtures Plan

- Status: Accepted
- Date: 2026-07-14
- Roadmap stage: R0, Product Contract and Architecture Spikes
- Human checkpoint: approved on 2026-07-15; the next human review is the R0 exit review

## Goal and R0 exit outcome

Replace the placeholder TypeScript-only product contracts with executable TypeBox schemas, safe runtime
decoders, and three deterministic `ProductView` scenarios. The result gives the future TUI and headless
client one versioned boundary without implementing either client or a second state machine.

This is the final R0 implementation plan. After its acceptance checks pass, update `CONTEXT.md` to close
R0 and enter R1, Installable Walking Skeleton.

## Locked decisions

- Use exact `typescript` 7.0.2 and `typebox` 1.3.6. Permit only the package-scoped pnpm allowed-version
  rule `bun-ffi-structs>typescript: 7.0.2` while OpenTUI 0.4.3 resolves `bun-ffi-structs` 0.2.4 with its
  stale `typescript: ^5` peer range. Do not add a second compiler, a global peer ignore, `allowAny`, or a
  broad dependency override. Remove the rule when the upstream range includes TypeScript 7.
- Keep pnpm as the dependency authority and Node's built-in test runner as the test runner.
- Start the product protocol at version `1`. Product protocol and journal schema versions remain
  independent.
- Reject unknown properties, coercion, and transforms at external boundaries. Decoding must not mutate
  its input.
- Add no property-testing dependency until a concrete invariant needs generated cases.
- Requiring a command revision or event cursor is structural protection only. R1 `AgentClient` and
  projection work will enforce semantic freshness and trusted event emission.

These decisions are fixed implementation input. New evidence may amend the plan; ordinary implementation
preferences do not create another human decision.

## Current repository facts

- `packages/contracts/src/index.ts` exports static unions for four run commands, three product events,
  and terminal states. It has no runtime validation, protocol version, `ProductView`, structured decoder,
  fixtures, or tests.
- `packages/contracts` has no production dependency and its `test` script currently discovers zero tests.
- The kernel already has three deterministic transition scenarios. `FakeModelDriver` and the Eden Lab
  scenario surface exist as R0 skeletons.
- ADR 0002 keeps product projections downstream of runtime truth. ADR 0006 requires every client to use
  versioned product commands and projections through `AgentClient`.
- ADR 0008 selects Bun and OpenTUI but prohibits renderer types from entering contracts or runtime.
- `docs/product-contracts.md`, `docs/event-model.md`, `SPEC.md`, and the UX state model define the
  independent expected behavior for this plan.
- `docs/research/typebox-typescript-7-evaluation.md` records the TypeScript 7 and TypeBox 1.x compatibility
  probe, accepted scoped peer exception, and supported-platform verification gate.

## Scope

### In scope

- TypeBox schemas and schema-derived TypeScript types for protocol identifiers, product errors,
  commands, events, terminal outcomes, and `ProductView`.
- Non-throwing decoders for unknown external command, event, and view values.
- Exact rejection of unsupported protocol versions, unknown variants, missing authority fields, and
  unknown properties.
- Three deterministic fake views and contract scenarios: awaiting approval, executing, and review.
- JSON round-trip and negative boundary tests through the public `@eden/contracts` entrypoint.
- Updating this plan and `CONTEXT.md` after verified completion.

### Out of scope

- Kernel event expansion, reducers, effect dispatch, projection implementation, journal persistence,
  replay, or migration code.
- `AgentClient`, transport, IPC, product subscriptions, or semantic stale-command enforcement.
- Production OpenTUI integration, renderer components, layout state, key bindings, or terminal lifecycle.
- A real provider, autonomous loop, policy engine, approval execution, verifier, or Evidence Pack.
- Exporting JSON Schema files, code generation, OpenAPI, a second validator, or a schema benchmark.
- A complete v0.1 contract. R1 and later plans may add variants without weakening version rules.

## Public contract boundary

All schemas and derived types are exported from `@eden/contracts`. Every top-level external object carries
`protocolVersion: 1`. Every object schema reachable from external input rejects additional properties.

The minimal surface contains:

- identifiers for commands, events, runs, revisions, cursors, actions, approvals, checks, and evidence;
- `ProductError` with stable code, message, recoverability, and suggested actions;
- commands for start, pause, resume, cancel, and approval resolution;
- events for session snapshot, phase/progress update, approval presentation, verification update, and
  terminal outcome;
- `ProductView` fields required by the three scenarios: workspace/trust identity, phase, revision,
  progress, current action, approval, changed files, checks, next actions, and terminal outcome;
- a succeeded terminal outcome that requires an evidence reference; no product command can declare
  success;
- `decodeProductCommand`, `decodeProductEvent`, and `decodeProductView`, each returning a discriminated
  success-or-error result rather than throwing validation details across the boundary.

Renderer selection, focus, viewport dimensions, React/OpenTUI objects, raw provider payloads, stack
traces, environment values, and model reasoning are prohibited from the schemas and fixtures.

## Planned files

```text
packages/contracts/
  package.json
  src/
    index.ts
    protocol.ts
    fixtures.ts
  test/
    protocol.test.ts
    scenarios.test.ts
pnpm-lock.yaml
pnpm-workspace.yaml
package.json
.github/workflows/terminal-framework-spike.yml
scripts/terminal-framework-workflow.test.mjs
CONTEXT.md
docs/plans/2026-07-14-product-contracts-and-view-fixtures.md
```

Keep schema definitions and decoder policy in `protocol.ts`. Keep named fake views in `fixtures.ts` so
production consumers cannot mistake them for runtime state. Do not create generic shared helpers or split
the package further without a demonstrated need.

## Test-first implementation slices

### Slice 1: executable schema and decoder foundation

- Public seam: import protocol version, identifier, error, decoder-result schemas and derived types from
  `@eden/contracts`.
- Independent expected result: `SPEC.md`, the threat model, and product-contract versioning rules require
  validated external input, visible incompatibility, structured errors, and separate protocol versions.
- RED: `test/protocol.test.ts` fails because runtime schemas and non-throwing decoders do not exist.
- GREEN: add TypeBox 1.3.6, protocol version `1`, bounded primitives, `ProductError`, and the smallest
  reusable decoder implementation.
- Required cases: accept one exact valid object; reject an unsupported version, an empty identifier, a
  missing required field, and an unknown property; prove the input object was not modified.
- Permitted fakes: none.
- Matching surface: run a Node driver through the package export, decode one valid and one invalid JSON
  value, and observe a typed success and stable structured error.

### Slice 2: versioned product commands and events

- Public seam: decode `unknown` through exported command and event schemas.
- Independent expected result: `docs/product-contracts.md`, `docs/event-model.md`, ADR 0004, and ADR 0006
  define intent-only commands, cursor-bearing events, exact approval presentation, and verifier-owned
  success.
- RED: table-driven tests fail for every required command and event variant because only static placeholder
  unions exist.
- GREEN: implement only the command and event variants named in this plan, derive their TypeScript types,
  and export them through `index.ts`.
- Required negative cases: reject an unknown command; reject pause, resume, cancel, or approval resolution
  without expected revision; reject an event without a cursor; reject approval presentation without its
  canonical display and digest; reject succeeded terminal outcome without an evidence reference; reject
  any `run.succeed` command.
- Permitted fakes: fixed opaque IDs, revisions, cursors, digests, and evidence references.
- Matching surface: JSON-stringify and decode one command and one event through the package entrypoint;
  malformed or forged variants return errors without throwing.

### Slice 3: three `ProductView` fixtures and R0 scenarios

- Public seam: import and decode the named awaiting-approval, executing, and review fixtures from
  `@eden/contracts`.
- Independent expected result: the user journey, UX state model, product hierarchy, and spike fixture
  define what a user must see without granting the renderer execution authority.
- RED: `test/scenarios.test.ts` fails because `ProductView` and the three fake views do not exist.
- GREEN: add the smallest discriminated view schema and deterministic fixtures needed for the three
  scenarios.
- Awaiting-approval scenario: workspace/trust, exact action display, cwd, reason, scope, digest, and
  recovery action remain attributable to one approval.
- Executing scenario: phase, current action, bounded progress, changed files, checks, and budget summary
  remain attributable to one run and contain no terminal claim.
- Review scenario: changed files, required and optional check outcomes, residual risk, next actions, and
  verifier evidence remain attributable; success is represented only with the required evidence reference.
- Required negative cases: reject renderer-local fields, a secret-canary property, raw stack/provider
  payloads, a mismatched protocol version, and an unsupported phase.
- Permitted fakes: fixed clock strings and opaque identities inside `fixtures.ts`; no provider, filesystem,
  terminal, or process mock.
- Matching surface: serialize all three fixtures, parse the JSON back through `decodeProductView`, and
  print a bounded redacted summary proving the scenario identity, phase, and available next action.

### Slice 4: R0 closeout

- Run the focused contracts suite, full repository verification, and the matching-surface driver after
  the final implementation change.
- Confirm the existing three kernel scenarios and the new three product-contract scenarios pass.
- Inspect dependency direction and reject any renderer, Bun, provider, filesystem, process, or journal
  import in `packages/contracts`.
- Remove the temporary `packages/contracts/**` path from the terminal-framework workflow after the final
  contracts commit has exercised the three hosted lanes; root toolchain changes continue to trigger the
  workflow through the manifest, lockfile, and workspace-policy paths.
- Mark this plan complete and update `CONTEXT.md` to R0 complete with R1 as the next stage.
- Stop for the R0 exit review. Do not begin reducer, journal, replay, or production TUI work in the same
  execution.

## Verification commands

```sh
pnpm install --frozen-lockfile
pnpm peers check
pnpm exec tsc --version
pnpm --filter @eden/contracts test
pnpm --filter @eden/contracts typecheck
pnpm test
pnpm typecheck
pnpm code:check
pnpm markdown:check
git diff --check
git status --short
```

The implementation run must also execute one temporary Node driver through the public package entrypoint
for the valid and invalid decoder paths, then remove the driver before completion.

## Risks and stop rules

| Risk | Mitigation or stop rule |
| --- | --- |
| R0 expands into the full v0.1 protocol | Implement only variants and fields required by the three scenarios |
| TypeScript 7 uses native compiler packages | Require frozen install, compiler startup, typecheck, tests, and OpenTUI/Bun packaging on Ubuntu x64, Windows x64, and macOS arm64 |
| OpenTUI's transitive peer range remains `typescript: ^5` | Keep one exact package-scoped allowed-version rule, enforce `pnpm peers check`, and delete the rule when upstream accepts TypeScript 7 |
| Static types and runtime validation diverge | Derive exported types from the TypeBox schemas |
| Decoding silently strips hostile data | Reject unknown properties and coercion; preserve stable error details |
| Contracts pretend to enforce runtime authority | Test structural impossibility only; defer trusted emission and freshness to R1 |
| Product fixtures become a second state machine | Keep them immutable named data with no transition logic |
| Renderer concerns leak inward | Fail the slice if React, OpenTUI, keymap, viewport, or focus types enter contracts |
| Another R0 research branch appears | Stop only for evidence that invalidates an accepted ADR or public contract |

## Rollback path

Before R1 consumes the schemas, rollback removes the TypeBox dependency, schema and fixture modules, tests,
and restores the placeholder static exports. No journal or product-state migration exists in R0.

## Human checkpoints

1. **Implementation approval — active.** Approve this fixed scope, its three test seams, and the R0 exit
   criteria. This approval authorizes continuous execution through all four slices.
2. **Architecture exception only.** Pause only if implementation evidence would change an accepted ADR,
   trust boundary, public protocol rule, or the R0/R1 boundary.
3. **R0 exit review.** Review the implemented public contract, three scenarios, verification evidence,
   and diff; then confirm entry into R1. This is acceptance, not another framework-selection exercise.

## Completion criteria

R0 is complete when:

- every public command, event, error, and view in this plan has one TypeBox schema and one derived type;
- unknown external input is decoded without throwing or mutation and invalid versions fail visibly;
- three deterministic product-contract scenarios pass through the public package boundary;
- no client command can declare success and succeeded terminal output requires verifier evidence identity;
- fixtures contain no renderer state, raw provider data, stack trace, environment secret, or execution
  authority;
- the existing three deterministic kernel scenarios still pass;
- the complete verification stack passes after the final relevant change;
- `CONTEXT.md` marks R0 complete and points to the R1 installable walking skeleton;
- reducer, journal, replay, `AgentClient`, production OpenTUI, and real-provider work have not begun.

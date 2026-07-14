# TypeBox 1.x and TypeScript 7 Evaluation

- Date: 2026-07-15
- Scope: R0 product-contract implementation dependency choice
- Evidence policy: official project documentation, official package metadata, and disposable local probes

## Recommendation

Adopt `typescript` 7.0.2 and `typebox` 1.3.6 before the first executable contracts, with one narrow and
temporary pnpm peer-policy exception for `bun-ffi-structs>typescript`. This is viable without changing
Eden's runtime architecture or adopting the unstable TypeScript compiler API.

TypeScript 7's missing stable programmatic API is not exercised by the current repository. Eden invokes
the `tsc` CLI, uses Biome rather than a TypeScript-API-based linter, and has no checked source or tool that
imports `typescript`. Microsoft ships the CLI and LSP as supported TypeScript 7 surfaces and provides an
official side-by-side TypeScript 6 compatibility package if a future tool requires the legacy API.

The remaining incompatibility is package metadata. `@opentui/core` 0.4.3 depends on
`bun-ffi-structs` 0.2.4, whose declared peer dependency is `typescript: ^5`. The published OpenTUI version
and its current main branch still use that dependency, so an OpenTUI upgrade cannot remove the mismatch
today. The published `bun-ffi-structs` runtime does not import TypeScript, and the complete Eden probe
passes with TypeScript 7. A package-scoped `peerDependencyRules.allowedVersions` entry therefore records
a bounded local compatibility claim without globally ignoring peer failures.

This exception must remain visible, exact, and removable. Supported-platform CI should enforce a frozen
install, `pnpm peers check`, compiler startup, the full verification stack, and OpenTUI/Bun packaging.
Remove the exception as soon as the upstream peer range includes TypeScript 7.

## Release facts

| Choice | Current exact package | Official status | Relevant constraints |
| --- | --- | --- | --- |
| Legacy TypeBox | `@sinclair/typebox` 0.34.52 | 0.x LTS | TypeScript 5-6; ESM and CommonJS |
| Current TypeBox | `typebox` 1.3.6 | Latest 1.x | TypeScript 6-7+; ESM only |
| Previous compiler | `typescript` 5.9.3 | Pre-upgrade baseline | JavaScript implementation |
| Selected compiler | `typescript` 7.0.2 | Stable `latest` | Native compiler; Node 16.20+ |

TypeBox deliberately publishes the generations under different package names. Its official version table
labels 0.x as maintained LTS and 1.x as the latest line developed against the TypeScript 7 compiler. The
official npm metadata reports `@sinclair/typebox` 0.34.52 and `typebox` 1.3.6 as their respective current
releases. TypeScript 7.0 was released on July 8, 2026; `typescript@latest` is 7.0.2 and provides the normal
`tsc` executable. `@typescript/native-preview` is no longer the package to select for a stable upgrade.

Sources:

- [TypeBox version policy](https://github.com/sinclairzx81/typebox#versions)
- [`@sinclair/typebox` 0.34.52 registry metadata](https://registry.npmjs.org/%40sinclair%2Ftypebox/0.34.52)
- [`typebox` 1.3.6 registry metadata](https://registry.npmjs.org/typebox/1.3.6)
- [TypeScript 7.0 release announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [`typescript` 7.0.2 registry metadata](https://registry.npmjs.org/typescript/7.0.2)
- [`bun-ffi-structs` TypeScript peer declaration](https://github.com/anomalyco/bun-ffi-structs/blob/main/package.json)
- [pnpm package-scoped allowed peer versions](https://pnpm.io/settings#peerdependencyrulesallowedversions)

## Option comparison

### Keep TypeScript 5.9 and `@sinclair/typebox` 0.34.52

Benefits:

- It changes only the contracts package and lockfile.
- It retains a mature TypeBox API that supports both ESM and CommonJS.
- It avoids introducing native, platform-specific TypeScript compiler packages during R0.

Costs:

- It starts new public contracts on the legacy TypeBox package even though the repository is already ESM.
- A later move to TypeBox 1.x changes the package name, imports, compiler API, reference handling, and
  validation-error representation.
- The migration would occur after schemas, decoders, fixtures, and tests exist, when the change is more
  expensive and more likely to disturb a compatibility boundary.

The migration cost is real but bounded. TypeBox's official migration guide states that most of the API
surface remains intact, and the two package generations can be installed side by side during a migration.
This remains the lowest-risk fallback if supported-platform CI exposes a native-package or OpenTUI
regression that the local probes did not find.

### Adopt TypeScript 7.0.2 and `typebox` 1.3.6

Benefits:

- It uses both projects' current stable lines from the first executable contract.
- TypeBox 1.x is ESM-only, matching every current Eden package and the root `type: module` setting.
- It avoids a known TypeBox 0.x-to-1.x migration after the product protocol begins to acquire consumers.
- TypeScript 7 provides a substantially faster native compiler and deterministic parallel type checking.

Costs:

- TypeScript 7 includes TypeScript 6 defaults and removals, so this is a real compiler migration rather
  than a dependency-only update.
- TypeScript 7.0 has no stable programmatic compiler API. Tools that import `typescript` must stay on the
  TypeScript 6 compatibility package until the new API arrives.
- The current OpenTUI chain is not peer-compatible: `@opentui/core` 0.4.3 resolves
  `bun-ffi-structs` 0.2.4, which declares `typescript: ^5`. A TypeScript 7 install therefore fails
  `pnpm peers check` even though compilation and runtime tests pass.
- The compiler installs exact-version native packages for supported operating-system and CPU pairs. The
  lockfile and clean installation must be checked on Linux, macOS, and Windows.
- TypeBox 1.x has breaking API changes from 0.34, including its package imports and validation-error
  representation. These are implementation differences for the new contracts, not migrations of current
  Eden code, because Eden has no TypeBox code yet.

Primary migration references:

- [TypeBox 1.0 migration guide](https://github.com/sinclairzx81/typebox/blob/main/changelog/1.0.0-migration.md)
- [TypeScript 7 behavior and removed options](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#updates-since-5x-and-new-behaviors-from-60)
- [TypeScript 7 compiler API transition](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-60)

## Repository compatibility assessment

The current configuration already neutralizes the most disruptive TypeScript 7 default changes:

- `tsconfig.base.json` explicitly sets `strict`, `target: ES2023`, `module: NodeNext`,
  `moduleResolution: NodeNext`, and `types: ["node"]`.
- Every emitting child project explicitly sets `rootDir`.
- The OpenTUI spike explicitly includes Bun and Node global types.
- No checked source imports the TypeScript compiler API.
- No checked configuration uses removed `node10` or `classic` resolution, `baseUrl`, legacy module output,
  ES5 output, or disabled interop flags.

TypeScript 7 changes that remain relevant are:

- `noUncheckedSideEffectImports` defaults to true. No current checked source uses a side-effect-only import.
- Stable type ordering is mandatory. This can change declaration ordering or expose rare inference
  differences, especially in generic-heavy schema code.
- `types` defaults to an empty list and `rootDir` defaults to the project root. Eden already sets both
  where needed.
- TypeScript 7.0 lacks the stable JavaScript compiler API. Eden currently invokes only the `tsc` CLI, so
  the limitation is not exercised.
- Eden's source does not import `typescript`, but the dependency graph still contains an explicit
  TypeScript 5 peer through the selected OpenTUI stack. Source compatibility does not erase package
  compatibility metadata.

The repository should retain `NodeNext`. A repository-wide switch to `moduleResolution: bundler` is not
required by TypeBox or TypeScript 7 and would conflict with the accepted Node/pnpm workspace baseline.
Bun-specific resolution remains an application-boundary concern.

If Eden later adopts a tool that imports `typescript` directly, the decision is still not fatal. The
official transition path is to keep TypeScript 7 as `@typescript/native` for `tsc` while resolving
`typescript` to `@typescript/typescript6` for API consumers. That adds dependency and tool-routing cost,
so Eden should introduce it only for a concrete consumer rather than pre-installing both compilers.

## Local probe evidence

The probes did not edit the repository, its manifests, or its lockfile.

### Existing checkout under TypeScript 7

`typescript` 7.0.2 typechecked all ten current project configurations successfully:

```text
apps/eden
packages/coding-runtime
packages/contracts
packages/kernel
packages/lab
packages/providers
spikes/terminal-framework/fixture
spikes/terminal-framework/harness
spikes/terminal-framework/ink
spikes/terminal-framework/opentui
```

All ten configurations also emitted successfully under both TypeScript 5.9.3 and 7.0.2 into disposable
directories. The declarations were identical. The only JavaScript difference was the ordering of the
named `jsx` and `jsxs` imports in the Ink spike; the imported bindings and runtime behavior were unchanged.

An isolated clone with root `typescript` 7.0.2 and `typebox` 1.3.6 also passed the complete build and test
stack, including the Ink and OpenTUI Node/Bun matching surfaces. On the same checkout, one warm full
workspace typecheck took approximately 7.69 seconds with TypeScript 5.9.3 and 2.70 seconds with TypeScript
7.0.2. This is a useful improvement, but it currently saves about five seconds rather than removing a
development bottleneck.

The same isolated install reported the unresolved dependency contract:

```text
✕ unmet peer typescript
  Installed: 7.0.2
  Wanted:
    ^5:
      bun-ffi-structs@0.2.4
```

`pnpm peers check` exited with status 1. The published `bun-ffi-structs` JavaScript does not import the
TypeScript compiler at runtime, which explains why the matching surfaces still pass, but that observation
is not a substitute for its maintainer-declared compatibility range.

The probe then added this package-scoped pnpm policy in its disposable workspace:

```yaml
peerDependencyRules:
  allowedVersions:
    "bun-ffi-structs>typescript": "7.0.2"
```

With that exact exception, `pnpm peers check`, all ten workspace typechecks, all 15 OpenTUI tests, and
the OpenTUI/Bun standalone-package clean smoke passed. The TypeScript 5 and TypeScript 7 standalone
executables were both 114,493,568 bytes, so the compiler change did not increase the shipped Bun artifact
in this probe. A Linux development install used approximately 31 MB for the TypeScript 7 wrapper plus its
native x64 compiler, compared with approximately 23 MB for TypeScript 5.9.3. pnpm installed only the
host-compatible native package even though the lockfile records TypeScript 7's platform matrix.

`allowedVersions` suppresses a known mismatch for one peer owner; it does not rewrite the dependency,
change runtime code, or prove upstream support. A global `allowAny`, `ignoreMissing`, or broadly scoped
override would conceal unrelated future incompatibilities and is not acceptable.

### TypeBox 1.3.6 contract-shaped probe

A disposable ESM probe used the repository's strictness, `NodeNext`, and ES2023 settings. It defined a
closed versioned command schema, derived its static type, accepted a valid value, and rejected an unknown
property. It compiled with TypeScript 7.0.2 and produced the same result under Node 24 and Bun 1.3.14:

```json
{"valid":true,"hostile":false,"errorKeyword":"additionalProperties"}
```

This proves the minimal TypeBox 1.x construction and validation surface needed by the proposed R0 plan.
It does not prove every future schema composition or every target platform installation.

## Bounded plan decision

The proposed R0 plan may use exact `typescript` 7.0.2 and `typebox` 1.3.6 if the upgrade change also:

- adds only the exact `bun-ffi-structs>typescript` allowed-version rule shown above;
- runs `pnpm install --frozen-lockfile`, `pnpm peers check`, `pnpm exec tsc --version`, typecheck, build,
  tests, and OpenTUI/Bun packaging on the supported operating-system matrix;
- keeps TypeScript 6 absent until a real compiler-API consumer appears;
- records removal of the exception when `bun-ffi-structs` widens its peer range.

If any supported platform cannot install or launch TypeScript 7's native compiler, revert this isolated
toolchain change and continue R0 with exact `typescript` 5.9.3 and `@sinclair/typebox` 0.34.52. This is a
bounded verification gate, not a new architecture phase.

## Residual uncertainty and stop rule

The local probes establish source, declaration, Node runtime, Bun runtime, peer-policy, and standalone
packaging compatibility on Linux x64. They do not establish clean installation and compiler startup on
macOS or Windows.

The existing terminal-framework workflow already runs fresh frozen installs, typechecks, tests, and
packaging on Ubuntu x64, Windows x64, and macOS arm64. Extend its evidence with `pnpm peers check` and
`pnpm exec tsc --version`; those lanes can prove the actual native compiler chosen for each runner. Add
macOS Intel or Linux/Windows ARM lanes only when Eden claims those architectures as supported targets.

CI cannot convert the local exception into an upstream guarantee, and non-interactive runners cannot
prove IME, cell-width rendering, raw keyboard input, or restoration behavior in Windows Terminal/WSL.
Those behaviors remain covered by the completed matching-surface evidence and targeted manual checks.

Stop this decision work after the three primary CI lanes pass. Do not wait for an OpenTUI release merely
to remove metadata debt; track the one-line exception for deletion and proceed to contract implementation.

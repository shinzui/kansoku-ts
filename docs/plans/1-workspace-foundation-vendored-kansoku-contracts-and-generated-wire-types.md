---
id: 1
slug: workspace-foundation-vendored-kansoku-contracts-and-generated-wire-types
title: "Workspace foundation, vendored Kansoku contracts, and generated wire types"
kind: exec-plan
created_at: 2026-10-15T02:11:18Z
intention: "intention_01m4ymqn7xe1a8tz8v7r78e34y"
master_plan: "docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md"
provenance:
  created_by:
    model: "claude-fable-5-1"
    harness: "claude-code"
    at: 2026-10-15T02:11:18Z
  revisions:
    - model: "claude-fable-5-1"
      harness: "claude-code"
      at: 2026-10-15T03:17:45Z
      mode: "update"
      note: "Unify React peer range, add optional @types/react peer, prove sessionStorage in the DOM harness"
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-10-15T03:45:08Z
      mode: "implement"
      note: "Implement workspace, pinned generated contracts, test harness, CI and ADR bundle"
---

# Workspace foundation, vendored Kansoku contracts, and generated wire types

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.


## Purpose / Big Picture

This repository, `kansoku-ts`, will ship two npm packages, `kansoku-js` and `kansoku-react`,
that let a web application record analytics events into the Kansoku analytics service
(`mori://shinzui/kansoku`) without writing HTTP code. Today the repository is a bare Bun and
TypeScript scaffold: one `package.json`, one `tsconfig.json`, a `justfile`, a Nix development
shell, lint and format configuration, and the planning documents. No package directory, no
test, no build output, and no copy of the server's API contract exists yet.

After this plan is complete, a contributor can clone the repository, enter the development
shell, run `just install`, `just check`, `just test`, and `just build`, and observe two package
directories that compile, test under a simulated browser, and build to the exact
distribution layout the later plans publish. They can run `just check-contracts` and see
that the committed copy of the server's OpenAPI document and event catalog is pinned to a
named server commit and that the TypeScript types generated from it are up to date. They can
open `docs/adr/` and find a validated architecture-decision bundle with its first record. A
continuous-integration workflow runs the same commands on every push. Nothing in this plan
sends an analytics event; it builds the floor every other plan in
`docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md` stands on.


## Progress

- [x] (2026-10-14; build, Node import/require, publint and checks passed) Milestone 1 — Bun workspace with two package scaffolds. `just build` produces
  `packages/kansoku-js/dist/{index.js,index.js.map,index.d.ts}` (plus per-module `.d.ts`
  files) and the same for `kansoku-react`; Node can `import` the ESM entry of `kansoku-js` and,
  through `require(esm)` on the dev shell's Node 22, also `require()` it, reading
  `version === "0.1.0"` both ways; `just check` (typecheck, lint, format) passes.
- [x] (2026-10-14; generated types and contract tests passed) Milestone 2 — Vendored contracts and generated wire types. `contracts/openapi.json`,
  `contracts/events.json`, and `contracts/KANSOKU_COMMIT` exist and match server commit
  `d61cf0c4b53bc6f9128f8589cd287c107f394427`; `just generate-schema` writes
  `packages/kansoku-js/src/generated/schema.ts`; `just check-contracts` exits 0 on a clean tree
  and non-zero after `contracts/openapi.json` is edited; the contract tests pass.
- [x] (2026-10-14; 8 DOM tests and 1 no-DOM test passed) Milestone 3 — DOM test harness. `just test` runs `bun test` with the happy-dom preload
  and then the same suite paths with `KANSOKU_TEST_NO_DOM=1`, under which registration is
  skipped; the sample DOM test, the fetch-mock self-test, and the no-DOM sanity test pass;
  `test/helpers/fetch-mock.ts` exposes `createFetchMock()` returning `{ fetch, requests,
  respondWith }` as described in Interfaces and Dependencies.
- [x] (2026-10-14; local CI and strict ADR validation pass; remote verification deferred by user) Milestone 4 — Continuous integration and ADR bundle. `.github/workflows/ci.yml` runs
  `just ci` inside the Nix shell; `docs/adr/` is a profile-governed bundle whose strict
  validation passes with ADR-1 (contract vendoring policy) present; `mori validate` accepts
  the bundle declared in `mori.dhall`.


## Surprises & Discoveries

The scaffold already contained formatter differences in managed skill/tooling files and plan prose. The formatter excludes managed agents, plan documents (which require intentional spacing), and byte-for-byte vendored contracts; it still checks all handwritten implementation and ADR files. Bun add initially rewrote existing React peer declarations; the agreed peer ranges were restored explicitly. The scaffold also omitted OKF from CI: the workflow installs the profile-compatible v0.9.0.0 validator at its exact upstream release commit using the producer cache. Current upstream is v0.10.0.0; no newer behavior is needed for the v0.19.0 ADR profile. The initial push omitted bunfig.toml; a follow-up commit adds it. Local `just ci`, both publint runs, Node import/require, the negative DOM test, and the contract-drift negative test pass. The user explicitly directed functional package work to proceed without waiting for remote CI.


## Decision Log

- Decision: Emit declaration files with the development shell's `tsc` (TypeScript 7.0.2)
  instead of the `bun-plugin-dts` plugin the portfolio precedent `shomei-ts-client` uses.
  Rationale: `bun-plugin-dts` bundles its own TypeScript 5 and a declaration bundler, so the
  repository would type-check with one compiler and emit with another. TypeScript 7's
  declaration emit was verified in this shell on 2026-10-14. One compiler, no extra
  dependency.
  Date: 2026-10-14

- Decision: Package sources import sibling modules with an explicit `.js` extension
  (`import { x } from "./types.js"`) and the package `tsconfig` files do not enable
  `allowImportingTsExtensions`.
  Rationale: `tsc` copies import specifiers into `.d.ts` files unchanged. Under Node's ESM
  resolution, which strict consumers (`moduleResolution: "nodenext"`) apply to a `"type":
  "module"` package, an extensionless `./types` in a declaration file does not resolve. The
  `.js` form resolves in both module systems, and both Bun's bundler and `tsc` map `./x.js` to
  `./x.ts` during development. This is the convention most published ESM libraries use.
  Date: 2026-10-14

- Decision: Vendor the server's OpenAPI document and event catalog as committed files at a
  pinned server commit, and commit the generated `schema.ts`. Never read the sibling
  checkout during `just build` or `just test`.
  Rationale: A clean clone must build without the server repository present; a reviewer
  must see a contract change as a diff; CI must fail when the generated file lags the
  vendored document. Refreshing the pin is a deliberate, reviewed action.
  Date: 2026-10-14

- Decision: `kansoku-react` declares `kansoku-js` as a peer dependency with a literal
  version range (`^0.1.0`) and as a development dependency with the `workspace:*` protocol.
  Rationale: `npm publish`, which the release plan uses for trusted publishing, does not
  rewrite `workspace:` ranges, so a literal peer range is the only form that is correct both
  locally and when published. Lockstep versioning keeps the range current.
  Date: 2026-10-14

- Decision: Install `typescript@5` as a root development dependency solely because
  `openapi-typescript` 7.x declares it as a peer dependency and uses its compiler API to print
  types. It is not used for type-checking or emit; the shell's `tsc` 7.0.2 remains the
  compiler.
  Rationale: `openapi-typescript` will not run without a TypeScript 5 module resolvable from
  `node_modules`. Confining it to `devDependencies` keeps the published packages dependency
  free.
  Date: 2026-10-14

- Decision: Keep Bun's default `minimum-release-age` install gate (seven days) and treat every
  dependency version quoted in this plan as an upper bound, not a pin. The installed version
  is whatever `bun add` resolves under the gate on the day of implementation.
  Rationale: Bun 1.4.2 refuses to install a release younger than seven days unless
  `minimumReleaseAge` is lowered in `bunfig.toml`; on 2026-10-14 it resolved
  `@happy-dom/global-registrator` to 20.14.5 rather than the 21.0.1 shown on npm. The gate is a
  supply-chain protection against freshly published malicious versions and should stay. Lower
  it deliberately, in a reviewed change, only when a fix this repository needs is newer than
  the window, and restore it afterwards.
  Date: 2026-10-14

- Decision: Adopt the shared architecture-decision profile in this plan (not later) and
  write ADR-1 about the contract vendoring policy as part of adoption.
  Rationale: The MasterPlan names several decisions that must become ADRs during
  implementation; the bundle has to exist before the first of them is implemented, and a
  bundle with one real record proves the validation gate against something non-trivial.
  Date: 2026-10-14

- Decision: Build and publish both packages as ESM-only: one `Bun.build` call with
  `format: "esm"`, one `dist/index.d.ts` set, an export map with `types` and `default` conditions
  only, `main` and `types` kept for legacy resolvers, no `module` field, and
  `"engines": { "node": ">=20.19.0" }`. The per-package `banner` option stays because Bun hoists
  external `import` statements above a source-level `"use client"` directive even in ESM output.
  Rationale: The MasterPlan's ESM-only decision of 2026-10-14. Every supported Node release can
  `require()` an ES module, so a second build, a `.d.cts` copy, and the dual-package hazard buy
  nothing; the banner finding comes from a 2026-10-14 `Bun.build` 1.4.2 experiment on a module
  with an external `react` import.
  Date: 2026-10-14


## Outcomes & Retrospective

The workspace, pinned contracts, generated wire types, test harness and ADR bundle are implemented. Local CI passes, as do Node import/require, publint, and negative drift/DOM probes. Remote CI verification is deferred at the user’s direction so package behavior can be implemented first.


## Context and Orientation

### What exists today

The repository root is `/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts` (every
path below is relative to it). The Kansoku server repository is checked out beside it at
`../kansoku`. The scaffold was generated by Seihou, the portfolio's project scaffolding tool;
`.seihou/config.dhall` records the project name `kansoku-ts` and description "React and JS
client for kansoku", and `.seihou/manifest.json` records which Seihou modules were applied
(git initialisation, agent gitignore, the exec-plan and master-plan skills, and the Bun
project module). Files marked "seihou-managed" in their header comment are regenerated by
Seihou upgrades; put customisations in the files those comments point to.

The current tree contains these files and nothing else of note:

- `package.json` — name `kansoku-ts`, version `0.1.0`, `"private": true`, `"type":
  "module"`, scripts `typecheck`, `lint`, `lint:fix`, `format`, `format:check`, and a single
  development dependency `@types/bun` `1.4.2`. It has no `workspaces` field.
- `tsconfig.json` — Bun-style settings: `lib: ["ESNext"]`, `module: ESNext`,
  `moduleResolution: bundler`, `jsx: react-jsx`, `types: ["bun"]`, `noEmit`,
  `verbatimModuleSyntax`, `allowImportingTsExtensions`, strict flags
  (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`), and `include:
  ["src", "*.ts"]`. There is no `src` directory yet.
- `justfile` — recipes `install` (`bun install`), `typecheck` (`tsc --noEmit`), `format`,
  `format-check`, `lint`, `lint-fix`, and `check` (typecheck, lint, format-check). `just` is
  a command runner; each recipe is a named shell snippet.
- `flake.nix`, `flake.lock`, `nix/bun.nix`, `nix/pre-commit.nix`, `nix/tooling.nix`,
  `nix/tooling-sources.json` — the Nix development shell. `nix/bun.nix` puts `bun`, `just`,
  and pinned npm archives of `typescript` 7.0.2 (`tsc`), `oxlint` 1.87.0, and `oxfmt` 0.72.0
  on the shell's `PATH`, and exposes an option `bunProject.extraDevPackages` for extra tools.
  `nix/pre-commit.nix` installs git pre-commit hooks that run `oxlint` and `oxfmt --check`.
  `flake.module.nix.example` shows how to add tools without editing managed files: copy it to
  `flake.module.nix` (which `flake.nix` imports when present). Enter the shell with
  `nix develop`, or let `direnv` do it through `.envrc`. Inside the shell on 2026-10-14:
  `bun 1.4.2`, `tsc 7.0.2`, `oxlint 1.87.0`, `oxfmt 0.72.0`, `node v22.23.3`, `npm 10.9.9`.
  The user also has `bun` on their normal `PATH`.
- `.oxlintrc.json` — oxlint (a fast linter) with the `typescript`, `unicorn`, `oxc`, and
  `import` plugins, `correctness` as errors, and `ignorePatterns` for `node_modules`, `dist`,
  `build`, `result`, `.direnv`, `.seihou`.
- `.oxfmtrc.json` — oxfmt (a formatter): no semicolons, sorted imports, double quotes,
  two-space indent, 100-column lines, trailing commas, sorted `package.json`, and the same
  `ignorePatterns`.
- `.gitignore` — ignores `.claude/`, `.agents/`, `node_modules`, `dist`, `build`,
  `.direnv`, `result*`, logs, `.env*`, and `.pre-commit-config.yaml`.
- `mori.dhall` — the Mori project manifest registered as `shinzui/kansoku-ts` on
  2026-10-14. Mori is the portfolio's project registry; this manifest already declares two
  packages, `kansoku-js` at `packages/kansoku-js` and `kansoku-react` at
  `packages/kansoku-react`, and depends on `shinzui/kansoku` and
  `openapi-ts/openapi-typescript`. The declared paths do not exist yet; this plan creates
  them. The manifest declares no `okfBundles`; Milestone 4 adds one.
- `agents/skills/exec-plan/` and `agents/skills/master-plan/` — the planning skills, their
  specifications (`PLANS.md`, `MASTERPLAN.md`, `ADR.md`, `PROVENANCE.md`), and the scripts
  that created this file. `.claude/skills/` symlinks to them and is git-ignored.
- `docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md` — the
  MasterPlan this plan belongs to. `docs/plans/2-…` through `docs/plans/6-…` are its other
  children; they consume what this plan builds and are named below only where that matters.

There is no `node_modules`, no `bun.lock`, no `bunfig.toml`, no `packages/`, `contracts/`,
`scripts/`, `test/`, or `.github/` directory, and no `docs/adr/` directory.

### Terms used in this plan

- **Bun workspace**: a root `package.json` whose `workspaces` field lists directories that
  are each their own package. `bun install` links them together so `kansoku-react` can import
  `kansoku-js` from source.
- **ESM and CJS**: the two JavaScript module systems, `import` (ECMAScript modules) and
  `require` (CommonJS). Both packages ship ESM only. CommonJS consumers still work because
  Node loads ES modules through `require()` (`require(esm)`, unflagged since Node 20.19 and
  22.12, which is every Node release still supported in 2026); the manifests declare that floor
  in `engines`.
- **Declaration file**: a `.d.ts` file describing a module's types without its code. With one
  module format there is one set of them.
- **Export map**: the `exports` field of `package.json`, which tells Node and bundlers which
  file to load for `import` versus `require` and where the types are.
- **OpenAPI document**: a JSON description of an HTTP API: its paths, request and response
  schemas, and security schemes. The server publishes one at `docs/api/openapi.json`.
- **Event catalog**: the server's public list of governed event names, their immutable
  versions, required properties, types, and validation patterns, published at
  `GET /v1/schemas` and committed in the server as `docs/contracts/events.json`.
- **Wire types**: TypeScript types that mirror the JSON the server accepts and returns.
  `openapi-typescript` generates them from the OpenAPI document so nobody hand-writes them.
- **happy-dom**: a JavaScript implementation of browser APIs (`document`, `window`,
  `location`, `history`, `localStorage`, `sessionStorage`) that lets DOM code run under `bun test`.
- **ADR**: an architecture decision record, one Markdown file per durable decision. **OKF**
  is the Open Knowledge Format the portfolio uses for such bundles, validated by the `okf`
  command (version 0.9.0.0 is installed). A **profile** is a Dhall descriptor stating the
  frontmatter rules a bundle must satisfy.
- **Seihou blueprint**: an agent-driven Seihou procedure. `adopt-architecture-decisions`
  from the `okf-profiles` project installs the ADR profile into a repository.

### ADR context

No ADRs exist in this repository; this plan creates `docs/adr/` and its first record. The
server's ADR bundle is registered in Mori as `mori://shinzui/kansoku/okf/adrs`. Two of its
records shape this plan:

- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-1` (SDK-grade ingest contract boundaries)
  fixes the response algebra the generated types must carry: `POST /v1/batch` returns HTTP
  202 with a `BatchAck` (`accepted` count, `rejected` list of index, optional `eventId`,
  `errors`), and HTTP 400, 404, 413, and 503 return an `ErrorEnvelopeWire` (`code`,
  `message`, `retryable`). The plan verifies that the generated `schema.ts` exposes exactly
  these shapes.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-7` (versioned event schema governance) makes
  the catalog a published, deterministic artifact: `catalogVersion` versions the document
  shape, every event has contiguous immutable versions from 1, and the committed
  `docs/contracts/events.json` is byte-identical to `GET /v1/schemas`. That determinism is
  what allows this plan to vendor the file and a later plan to detect drift.

The server guide that describes the HTTP contract in prose is `docs/guides/send-events.md`
in `mori://shinzui/kansoku` (artifact-level Mori URI pending). The portfolio precedent for a
Bun-built TypeScript client is `/Users/shinzui/Keikaku/bokuno/shomei-ts-client`: its
`package.json` runs `openapi-typescript openapi.json --output src/schema.ts` and its
`build.ts` calls `Bun.build` twice (CJS then ESM) and writes a per-directory `package.json`
marker; this plan adapts the generation step but builds ESM only and changes the output layout
and the declaration strategy as recorded in the Decision Log.

### Server facts this plan relies on

At server commit `d61cf0c4b53bc6f9128f8589cd287c107f394427` (the `master` HEAD of
`../kansoku` on 2026-10-14), `docs/api/openapi.json` is an OpenAPI 3.1.0 document titled
"Kansoku Analytics API" whose `components.schemas.AnalyticsEvent.required` list is exactly
`eventId`, `eventName`, `source`, `occurredAt`, `receivedAt`, `properties`, `context`, and
whose schema names include `AnalyticsEvent`, `BatchAck`, `RejectedEvent`, `ErrorEnvelopeWire`,
`SchemaCatalog`, `EventVersions`, `VersionedEventSchema`, `ContractProperty`, `EventSource`,
and `IngestAck`. `docs/contracts/events.json` has `catalogVersion` 1, `service` `"kansoku"`,
and eight events: `experiment_viewed`, `feature_used`, `identify`, `page_view`,
`payment_completed`, `session_start`, `subscription_started`, `user_registered`. The
contract tests in Milestone 2 assert these facts against the vendored copies, so a future
pin refresh that changes them fails loudly and the assertions are updated deliberately.


## Plan of Work

### Milestone 1 — Bun workspace and two buildable package scaffolds

Scope: turn the single-package scaffold into a workspace with `packages/kansoku-js` and
`packages/kansoku-react`, a shared base `tsconfig`, a shared build script, and `just` recipes
that operate on both packages. At the end, both packages type-check, lint, format, and build
to the distribution layout below, and each exports a `version` constant equal to its
`package.json` version. Nothing else is implemented; `docs/plans/2-…` adds the real client
code to `kansoku-js`, and `docs/plans/4-…` adds React code to `kansoku-react`.

Edit the root `package.json`: add `"workspaces": ["packages/*", "examples/*"]` (the
`examples/*` glob is for `docs/plans/5-…`; an empty glob is harmless), keep `"private":
true`, and replace the scripts with workspace-aware ones that the `justfile` calls. Add root
development dependencies `openapi-typescript` (7.13.0 was current on npm on 2026-10-14),
`typescript` `^5.9` (peer of `openapi-typescript` only; see Decision Log), and
`@happy-dom/global-registrator` (21.0.1 was current; Bun resolved 20.14.5 under its release-age
gate). Keep `@types/bun` `1.4.2`. Every version named here is an upper bound: Bun installs the
newest release at least seven days old, so record whatever it resolves in `bun.lock` and do not
hand-edit `package.json` to force a newer number. If a newer release carries a fix this plan
needs, add an `[install]` table to `bunfig.toml` with `minimumReleaseAge = <seconds>` in a
change that says why, and remove it once the release is older than the default window.

Create `tsconfig.base.json` at the root with the compiler options every package shares:
`target: "ES2022"`, `module: "ESNext"`, `moduleResolution: "bundler"`, `lib: ["ES2022",
"DOM", "DOM.Iterable"]`, `jsx: "react-jsx"`, `strict: true`, `noUncheckedIndexedAccess`,
`noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`,
`verbatimModuleSyntax: true`, `isolatedModules: true`, `esModuleInterop: true`,
`skipLibCheck: true`, `forceConsistentCasingInFileNames: true`, `resolveJsonModule: true`,
and `noEmit: true`. Do not set `allowImportingTsExtensions` or `types` here. Leave the root
`tsconfig.json` as the configuration for root-level scripts and tests (`scripts/`, `test/`),
changing its `include` to `["scripts", "test", "*.ts"]`.

Create `packages/kansoku-js/` with: `package.json` (name `kansoku-js`, version `0.1.0`,
description "Browser SDK for the Kansoku analytics service", `"type": "module"`,
`"sideEffects": false`, `"files": ["dist", "README.md", "CHANGELOG.md"]`, the export map from
the MasterPlan reproduced in Interfaces and Dependencies, `"main"` and `"types"` (no
`"module"` field), `"engines": { "node": ">=20.19.0" }`,
`"license"` left as `"UNLICENSED"` with a comment-free TODO recorded in `docs/plans/6-…`'s
scope, and scripts `build`, `typecheck`, `test`); `tsconfig.json` extending
`../../tsconfig.base.json` with `types: ["bun"]` and `include: ["src", "test"]` (type-checks
tests too); `tsconfig.build.json` extending the same base with `noEmit: false`,
`declaration: true`, `emitDeclarationOnly: true`, `outDir: "dist"`, `rootDir: "src"`,
`types: []`, `include: ["src"]`; `src/index.ts` exporting `version` from `./version.js`;
`src/version.ts` containing `export const version = "0.1.0"`; `test/version.test.ts`
asserting `version` equals the `version` field of the package's `package.json`; and a
one-paragraph `README.md` plus an empty `CHANGELOG.md` (the release plan fills them).

Create `packages/kansoku-react/` the same way (name `kansoku-react`, description "React
bindings for kansoku-js") with `peerDependencies` `{ "react": "^18.0.0 || ^19.0.0",
"kansoku-js": "^0.1.0", "@types/react": ">=18" }`, `peerDependenciesMeta`
`{ "@types/react": { "optional": true } }`, and `devDependencies` `{ "kansoku-js":
"workspace:*", "react": "^19.3.1", "@types/react": "^19" }`. The React peer range is the one
the MasterPlan fixes for every plan; `@types/react` is an optional peer because the emitted
declaration files import React types (the convention zustand and Radix use). EP-4 owns the
final values. Its `src/index.ts` exports `version` and re-exports nothing else yet.

Create `scripts/build.ts`, run as `bun scripts/build.ts <package-dir>`. It reads the target
`package.json`, removes `<package-dir>/dist`, computes the externals as every key of
`dependencies` and `peerDependencies` plus `react/jsx-runtime` when `react` is a peer, then
calls `Bun.build` once with `entrypoints: ["src/index.ts"]`, `outdir: "dist"`,
`target: "browser"`, `format: "esm"`, `naming: "index.js"`, `sourcemap: "linked"`,
`minify: false`, `external`; then runs `tsc -p tsconfig.build.json` in the package directory,
which emits `dist/index.d.ts` and one `.d.ts` per source module. There is no CommonJS build and
no `.d.cts` copy (Decision Log). It exits non-zero and prints the bundler's messages when any
step fails. Use `Bun.spawn` or the `$` shell helper from `bun` for `tsc`, with `cwd` set to the
package directory so the shell's `tsc` binary is used.

The script also supports a per-package banner. It reads the optional manifest field
`"kansoku": { "banner": "<text>" }` from the package's `package.json` and, when present,
passes it as the `banner` option to `Bun.build` so the text is the first line of
`dist/index.js`. This exists for React's `"use client"` directive, which must sit in the
module's directive prologue (before any statement, including `import` declarations) to count:
verified on 2026-10-14 with Bun 1.4.2, a module whose first line is `"use client"` and which
imports from the external `react` is emitted with the `import` statement first and the string
after it, where it is an inert expression; with the banner the directive is line 1 and the
source-level copy that follows is harmless. `kansoku-js` leaves the field unset;
`docs/plans/4-…` sets `"kansoku": { "banner": "\"use client\";" }` in
`packages/kansoku-react/package.json` and needs no build-script change. The script prints the
banner it applied, if any.

Update the `justfile`: keep `default` and `install`; make `typecheck` run `tsc --noEmit -p
tsconfig.json` for the root and for each package; add `build` (runs `scripts/build.ts` for
`packages/kansoku-js` then `packages/kansoku-react`, in that order because the React package
resolves `kansoku-js` from the workspace); add `test-no-dom` and `test` as defined in
Milestone 3 (`test` runs the happy-dom suite and then the no-DOM suite); keep `lint`,
`lint-fix`, `format`, `format-check`; redefine `check` as `typecheck lint format-check`; add
`ci` (`install`, `check`, `test`, `build`, `check-contracts`, `adr-check`; the last two are
defined in Milestones 2 and 4). Until Milestone 3 lands, `test` may simply run `bun test`.
`just build` is the single producer of `dist/`: the Vite examples and the real-browser smoke
test in `docs/plans/5-…` import both packages through their export maps from the built
`dist/` directories, so those recipes depend on `just build` having run, not on sources. Add `dist`, `packages/*/dist`, and `.turbo` style noise to
`.gitignore` only if not already covered (`dist` already is).

Acceptance: `just install`, `just check`, `just test`, and `just build` succeed from a fresh
clone inside `nix develop`; `dist/index.js`, `dist/index.js.map`, and `dist/index.d.ts` exist in
both packages; Node `import`s the `kansoku-js` entry and `require()`s it (Node 22's
`require(esm)`), reading `version` both ways; `bunx publint packages/kansoku-js` reports no
errors (informational here; `docs/plans/6-…` makes it a gate).

### Milestone 2 — Vendored server contracts, sync script, and generated wire types

Scope: pin the server contract into this repository and derive TypeScript types from it, with
a check that fails when either drifts. At the end, `contracts/` holds the two server
documents and the commit they came from, `packages/kansoku-js/src/generated/schema.ts` is
generated and committed, and tests prove the vendored documents carry the shapes the SDK
depends on.

Create `scripts/sync-contracts.ts`, run as `bun scripts/sync-contracts.ts [--from <path>]
[--ref <git-ref>]` with defaults `--from ../kansoku` and `--ref master`. It resolves the ref
to a full SHA with `git -C <from> rev-parse <ref>`, reads `docs/api/openapi.json` and
`docs/contracts/events.json` at that SHA with `git -C <from> show <sha>:<path>` (so a dirty
working tree in the server checkout cannot leak in), writes them to `contracts/openapi.json`
and `contracts/events.json` byte-for-byte, writes the SHA followed by a newline to
`contracts/KANSOKU_COMMIT`, and prints the SHA and the byte counts. Run it once with `--ref
d61cf0c4b53bc6f9128f8589cd287c107f394427` to seed the directory. Add a `contracts/README.md`
explaining that the files are copies, naming the source paths, and stating that the only
way to change them is to rerun the script and commit the result together with a regenerated
`schema.ts`.

Add `just sync-contracts` (runs the script with any extra arguments passed through),
`just generate-schema` (`bun x openapi-typescript contracts/openapi.json -o
packages/kansoku-js/src/generated/schema.ts`), and `just check-contracts` (runs
`generate-schema` and then `git diff --exit-code -- contracts
packages/kansoku-js/src/generated`, so CI fails when the generated file was not committed).
Add `packages/*/src/generated` to `ignorePatterns` in both `.oxlintrc.json` and
`.oxfmtrc.json`; the generated file is not hand-edited and must not be reformatted.

Create `packages/kansoku-js/src/contract/wire.ts` that re-exports the types later plans use
from the generated module: `AnalyticsEvent`, `BatchAck`, `RejectedEvent`,
`ErrorEnvelopeWire`, `SchemaCatalog`, `EventVersions`, `VersionedEventSchema`,
`ContractProperty`, `EventSource`, and `IngestAck`, each as
`components["schemas"]["<Name>"]` from `../generated/schema.js`, plus `paths` for anyone who
needs operation types. This is the single import point for wire types; `docs/plans/2-…` and
later plans import from here and never from `generated/` directly.

Create `packages/kansoku-js/test/contract.test.ts` with two kinds of assertion. Compile-time
assertions use a local helper type `Equal<A, B>` and `const` declarations such as
`const _requiredKeys: Equal<RequiredKeys<AnalyticsEvent>, "eventId" | "eventName" | "source" |
"occurredAt" | "receivedAt" | "properties" | "context"> = true` so `just typecheck` fails if
the generated schema changes the required set; they also assert that `BatchAck` has
`accepted: number` and `rejected: RejectedEvent[]`, and that `ErrorEnvelopeWire` has
`retryable: boolean`. Runtime assertions read `contracts/openapi.json` and
`contracts/events.json` (via `Bun.file` relative to `import.meta.dir`) and assert the
`required` array, the presence of the ten schema names, `catalogVersion === 1`, `service ===
"kansoku"`, the eight event names, that `events.page_view.versions[0].properties` contains
a required string property `url`, and that `contracts/KANSOKU_COMMIT` matches
`/^[0-9a-f]{40}\n$/`.

Acceptance: `just check-contracts` exits 0; editing one character in
`contracts/openapi.json` (for example a description string) and rerunning makes it exit
non-zero with a diff, after which `git checkout -- contracts` restores it; `bun test
packages/kansoku-js/test/contract.test.ts` passes; `just typecheck` passes.

### Milestone 3 — DOM test harness and scripted fetch helper

Scope: make `bun test` run every test in the workspace under a simulated browser, and ship
the request-recording `fetch` double that `docs/plans/2-…`, `3-…`, and `4-…` use to test
delivery without a network. At the end, a sample test proves `document`, `window.location`,
`history.pushState`, and `localStorage` exist, and the helper's own tests prove it records
requests and plays scripted responses in order.

Create `bunfig.toml` with a `[test]` table whose `preload` is `["./test/setup/dom.ts"]`.
Create `test/setup/dom.ts` that imports `GlobalRegistrator` from
`@happy-dom/global-registrator` and calls `GlobalRegistrator.register({ url:
"http://localhost:3000/", width: 1280, height: 720 })`. The explicit origin matters: the
History API refuses `pushState` to a different origin, and the default `about:blank` origin
would make navigation tests impossible. Export nothing.

The preload applies to every file `bun test` runs, and happy-dom's registration replaces
`globalThis.fetch` and defines `window` and `document`. Some suites need the real globals:
the DOM-free envelope tests in `docs/plans/2-…`, the server-side-rendering test in
`docs/plans/4-…`, and the live suite in `docs/plans/5-…`, which must use Bun's real `fetch`
to reach a server. Give every plan one mechanism: `test/setup/dom.ts` reads
`process.env.KANSOKU_TEST_NO_DOM` and returns without calling `GlobalRegistrator.register()`
when the value is `"1"`. No-DOM suites are then run as `KANSOKU_TEST_NO_DOM=1 bun test
<paths>` with the same `bunfig.toml` and no second configuration file. Establish the
companion convention now: no-DOM tests live in a `test/ssr/` directory (at the root and inside
each package), and each such file wraps its suite in `describe.skipIf(typeof document !==
"undefined")` so the plain DOM run skips it instead of failing it. Define two `just` recipes.
`test-no-dom +paths` runs `KANSOKU_TEST_NO_DOM=1 bun test {{paths}}` (a `just` variadic
parameter, so callers pass whichever directories they need). `test` runs `bun test` and then
`just test-no-dom test/ssr packages/kansoku-js/test/ssr packages/kansoku-react/test/ssr`; the
positional arguments are path filters, so a directory that does not exist yet simply matches
nothing. Create `test/ssr/no-dom.test.ts` asserting, inside the `skipIf` guard, that
`typeof document === "undefined"`, `typeof window === "undefined"`, and that
`globalThis.fetch` is Bun's native implementation (its `toString()` contains `native code`),
so the recipe is verifiable in this plan. The CI recipe calls `just test`, never `bun test`
directly.

Create `test/helpers/fetch-mock.ts` exporting a factory `createFetchMock(): FetchMock`. A
`FetchMock` has exactly three members: `fetch`, a drop-in for `globalThis.fetch` that records
every call; `requests`, the array of recorded requests, each `{ url: string; method: string;
headers: Record<string, string>; body: unknown; keepalive: boolean }` with header names
lower-cased and `body` parsed as JSON when the request body is JSON; and
`respondWith(...responses: ScriptedResponse[])`, which queues responses consumed in order,
after which the default response applies. Response builders are exported alongside:
`ack(accepted, rejected = [])` (HTTP 202 with a `BatchAck` body), `envelope(status, code,
retryable, message = code)` (an `ErrorEnvelopeWire` body for 400, 404, 413, or 503),
`status(code)` (an empty body, for 401), `networkError(message = "network error")` (the
promise rejects with a `TypeError`, which is what browsers throw), and `hang()` (a promise
that never settles, for request-timeout tests; callers combine it with the injectable timers
later plans define). The default response is `ack(n)` where `n` is the number of events in
the request body when it is an array, else `ack(1)`. Add `test/helpers/fetch-mock.test.ts`
covering recording (including the `keepalive` flag and lower-cased headers), ordered
playback, the default, the network-error rejection, and that `hang()` has not settled after
the test yields. Add `test/setup/dom.test.ts` asserting `typeof document ===
"object"`, `location.origin === "http://localhost:3000"`, that `history.pushState({}, "",
"/pricing")` changes `location.pathname`, and that `localStorage.setItem` and
`sessionStorage.setItem` each followed by `getItem` round-trip (`docs/plans/2-…` mirrors the
pending queue to `sessionStorage`, so the harness must prove it exists).

Acceptance: `just test` runs the package `version` tests, the contract tests, the DOM
sample, and the fetch-mock tests under happy-dom and reports zero failures, then runs the
no-DOM pass, under which `test/ssr/no-dom.test.ts` passes (not skipped). Running `bun test`
alone shows that same file as skipped, proving the guard; running
`KANSOKU_TEST_NO_DOM=1 bun test test/setup` makes `test/setup/dom.test.ts` fail on the
missing `document`, proving the environment variable disables registration.

### Milestone 4 — Continuous integration and the ADR bundle

Scope: run the whole check surface on every push, and give the repository a validated
architecture-decision bundle with its first record. At the end, `.github/workflows/ci.yml`
exists, `docs/adr/` validates strictly, `mori.dhall` declares the bundle, and
`just adr-check` is part of `just ci`.

Create `.github/workflows/ci.yml` triggered on `push` to `master` and on `pull_request`. It
runs on `ubuntu-latest`, checks out the repository, installs Nix with
`DeterminateSystems/nix-installer-action` and enables the Magic Nix Cache action, then runs
`nix develop --command just ci`. Because the dev shell pins `bun`, `tsc`, `oxlint`, and
`oxfmt`, CI uses exactly the local versions. `just ci` runs `install` with `bun install
--frozen-lockfile` semantics (commit `bun.lock`), then `check`, `test`, `build`,
`check-contracts`, and `adr-check`.

Adopt the ADR profile. Preferred path: run the installed Seihou blueprint in the repository
root, `seihou agent run adopt-architecture-decisions`, which inventories the (empty) corpus,
installs `docs/adr/profile.dhall`, writes `docs/adr/index.md` with `okf_version: "0.2"`,
starts `docs/adr/log.md`, registers the bundle in `mori.dhall`, and wires validation into the
repository's check surface. Review its output against the fallback below and correct any
divergence. Fallback path if the blueprint is unavailable or declines an empty corpus: create
`docs/adr/`, copy
`/Users/shinzui/Keikaku/bokuno/okf-profiles/blueprints/adopt-architecture-decisions/files/architecture-decisions-profile.dhall`
to `docs/adr/profile.dhall` (it is a frozen import of `okf-profiles` `v0.19.0` exposing
`Profiles.documentation.architectureDecisions`; never edit its hash), run `okf index docs/adr
--write --okf-version 0.2`, and append the first log entry with `okf log add docs/adr --kind
Migration -m "Adopt the shared architecture-decision profile"`.

Write the first record. Allocate its handle with `okf id next docs/adr --profile
docs/adr/profile.dhall ADR` (expected `ADR-1`), create
`docs/adr/0001-vendor-kansoku-contracts-at-a-pinned-commit.md` with frontmatter `type:
Architecture Decision Record`, `title`, a one-sentence `description`, `docId: ADR-1`,
`status: Accepted`, `date` (today), `timestamp` (today at `T00:00:00Z`), and `generated`
with `by: human:kansoku-ts-maintainers` and `at` equal to the timestamp, mirroring the
server's `docs/adr/0001-sdk-grade-ingest-contract-boundaries.md`. Its body has `## Context`
(the SDK must match a server contract it does not own), `## Decision` (vendor
`docs/api/openapi.json` and `docs/contracts/events.json` at a pinned commit recorded in
`contracts/KANSOKU_COMMIT`; generate `schema.ts` with `openapi-typescript`; commit both; refresh
only by rerunning `scripts/sync-contracts.ts`; a live drift guard in `docs/plans/5-…` compares
`GET /v1/schemas` with the vendored catalog), `## Alternatives considered` (reading the
sibling checkout at build time; fetching from a running server at build time; hand-written
types), and `## Consequences`. Rerun `okf index docs/adr --write --okf-version 0.2` so the
index lists it and `okf log add docs/adr ADR-1 -m "Record the contract vendoring policy"`.

Add `adr-check` to the `justfile`: `okf validate docs/adr --strict --profile
docs/adr/profile.dhall --profile-enforce --log-enforce`. Add the bundle to `mori.dhall` as
`okfBundles = [ Schema.OkfBundle::{ name = "adrs", path = "docs/adr", okfVersion = "0.2",
profile = Some "docs/adr/profile.dhall", description = Some "Durable architecture decisions
for the Kansoku browser SDKs" } ]`, then run `mori validate --check-deps` and `mori register`
so the registry sees the bundle.

Acceptance: `just adr-check` exits 0; `mori validate --check-deps` prints "Configuration is
valid"; `mori registry bundles shinzui/kansoku-ts` lists `adrs`; the workflow file passes
`actionlint` if available (optional) and runs green on the first push after this milestone.


## Concrete Steps

All commands run from the repository root inside the development shell. Start every session
with:

```bash
cd /Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts
nix develop
```

If `direnv` is allowed for this directory, the shell is entered automatically on `cd`.

### Milestone 1

Create the directories and files described in Plan of Work, then install and verify:

```bash
mkdir -p packages/kansoku-js/src packages/kansoku-js/test \
         packages/kansoku-react/src packages/kansoku-react/test scripts
bun add -d openapi-typescript typescript@^5.9 @happy-dom/global-registrator
bun install
just check
just build
```

`bun add` prints the versions it resolved. Expect them to be at or below the npm "latest"
figures quoted in this plan (for example `@happy-dom/global-registrator@20.14.5` instead of
21.0.1 on 2026-10-14) because Bun 1.4.2 skips releases younger than seven days. Accept what it
resolves; see the Decision Log before changing `minimumReleaseAge`.

Expected tail of `just build`:

```text
kansoku-js: dist/index.js, dist/index.js.map, dist/index.d.ts
kansoku-react: dist/index.js, dist/index.js.map, dist/index.d.ts
```

Verify the ESM entry loads under Node through both `import` and `require()` (the dev shell's
Node 22 supports `require(esm)`) and that the export map is well formed:

```bash
node --input-type=module -e 'import("./packages/kansoku-js/dist/index.js").then(m => console.log(m.version))'
node -e 'console.log(require("./packages/kansoku-js/dist/index.js").version)'
bunx publint packages/kansoku-js
bunx publint packages/kansoku-react
```

Expected: `0.1.0` printed twice, and `publint` reporting "All good!" for each package. If
`publint` reports that `types` should come first in a condition object, reorder the keys as
shown in Interfaces and Dependencies; the `types` condition must precede `default`.

Run the version tests:

```bash
bun test packages
```

Expected: two passing tests, one per package.

### Milestone 2

Seed the contracts at the pinned commit and generate the schema:

```bash
bun scripts/sync-contracts.ts --from ../kansoku --ref d61cf0c4b53bc6f9128f8589cd287c107f394427
cat contracts/KANSOKU_COMMIT
just generate-schema
just check-contracts
```

Expected output of the sync script:

```text
pinned ../kansoku @ d61cf0c4b53bc6f9128f8589cd287c107f394427
wrote contracts/openapi.json (78xxx bytes)
wrote contracts/events.json (xxxx bytes)
wrote contracts/KANSOKU_COMMIT
```

`cat contracts/KANSOKU_COMMIT` prints `d61cf0c4b53bc6f9128f8589cd287c107f394427`. The
generated file begins with the banner `This file was auto-generated by openapi-typescript`
and contains `export interface components` with a `schemas` member listing `AnalyticsEvent`.
`just check-contracts` exits 0 and prints nothing from `git diff`.

Prove the drift check works, then undo the probe:

```bash
sed -i.bak 's/"Kansoku Analytics API"/"Kansoku Analytics API (probe)"/' contracts/openapi.json && rm contracts/openapi.json.bak
just check-contracts; echo "exit=$?"
git checkout -- contracts packages/kansoku-js/src/generated
```

Expected: `exit=1` with a diff showing the probe string, then a clean tree.

Run the contract tests and the type-level assertions:

```bash
bun test packages/kansoku-js/test/contract.test.ts
just typecheck
```

Expected: all contract assertions pass and type-checking reports no errors.

### Milestone 3

Create `bunfig.toml`, `test/setup/dom.ts`, `test/setup/dom.test.ts`,
`test/helpers/fetch-mock.ts`, `test/helpers/fetch-mock.test.ts`, and
`test/ssr/no-dom.test.ts`, add the `test` and `test-no-dom` recipes, then run everything:

```bash
just test
```

Expected: two `bun test` summaries. The first (DOM run) ends with

```text
 N pass
 1 skip
 0 fail
Ran N tests across M files.
```

where the files include `test/setup/dom.test.ts`, `test/helpers/fetch-mock.test.ts`,
`packages/kansoku-js/test/contract.test.ts`, both `version.test.ts` files, and the skipped
`test/ssr/no-dom.test.ts`. The second (no-DOM run) ends with

```text
 1 pass
 0 fail
Ran 1 test across 1 file.
```

Confirm the environment switch directly if the second summary is not as expected:

```bash
KANSOKU_TEST_NO_DOM=1 bun test test/ssr
just test-no-dom test/ssr
```

Both commands print the same one-test summary.

### Milestone 4

Create `.github/workflows/ci.yml`, then adopt the ADR profile:

```bash
seihou agent run adopt-architecture-decisions
```

If that command is unavailable or refuses an empty corpus, use the fallback:

```bash
mkdir -p docs/adr
cp /Users/shinzui/Keikaku/bokuno/okf-profiles/blueprints/adopt-architecture-decisions/files/architecture-decisions-profile.dhall docs/adr/profile.dhall
okf index docs/adr --write --okf-version 0.2
okf log add docs/adr --kind Migration -m "Adopt the shared architecture-decision profile"
```

Allocate the first handle and write the record, then refresh the index and log:

```bash
okf id next docs/adr --profile docs/adr/profile.dhall ADR
# create docs/adr/0001-vendor-kansoku-contracts-at-a-pinned-commit.md as described
okf index docs/adr --write --okf-version 0.2
okf log add docs/adr ADR-1 -m "Record the contract vendoring policy"
just adr-check
```

Expected: `okf id next` prints `ADR-1`; `just adr-check` exits 0 with no diagnostics.

Declare the bundle in `mori.dhall` and re-register:

```bash
mori validate --check-deps
mori register
mori registry bundles shinzui/kansoku-ts
```

Expected: "Configuration is valid." and a bundles table containing a row `adrs │ docs/adr
│ docs/adr/profile.dhall │ 0.2`.

Finally run the full CI recipe locally, which is what the workflow runs:

```bash
just ci
```

Expected: every step passes; the last lines are `just adr-check` output (none) and a zero
exit status.


## Validation and Acceptance

Required acceptance for the whole plan, each observable from a fresh clone inside
`nix develop`:

1. `just install && just check && just test && just build` exits 0.
2. `dist/index.js`, `dist/index.js.map`, and `dist/index.d.ts` exist in both packages, Node
   prints `0.1.0` for the `kansoku-js` entry through both `import` and `require()`, and
   `bunx publint` reports no errors for either package.
3. `contracts/KANSOKU_COMMIT` contains `d61cf0c4b53bc6f9128f8589cd287c107f394427`;
   `just check-contracts` exits 0 on a clean tree and 1 after the probe edit.
4. `just test` runs `bun test` under happy-dom, where `test/setup/dom.test.ts` passes and
   `test/helpers/fetch-mock.test.ts` proves recording, ordered playback, defaults, the
   network-error rejection, and the never-settling `hang()`, and then the
   `KANSOKU_TEST_NO_DOM=1` pass, where `test/ssr/no-dom.test.ts` passes with no DOM and
   Bun's native `fetch`.
5. `just adr-check` exits 0 with ADR-1 present; `mori validate --check-deps` is valid;
   `mori registry bundles shinzui/kansoku-ts` lists `adrs`.
6. The GitHub Actions workflow runs `just ci` through `nix develop` and is green on the first
   push after this milestone (verify with `gh run list --limit 1` and `gh run view`).

Not required here, proposed for other plans: `@arethetypeswrong/cli` and size budgets belong
to `docs/plans/6-…`; any code that sends events belongs to `docs/plans/2-…`.


## Idempotence and Recovery

Every step can be repeated. `bun install` is idempotent; delete `node_modules` and
`bun.lock` and rerun if the lockfile is suspect. `scripts/build.ts` deletes `dist` before
building, so a failed build leaves no stale output. `scripts/sync-contracts.ts` overwrites
the three files in `contracts/`; rerunning with the same ref produces identical bytes, and
`git checkout -- contracts packages/kansoku-js/src/generated` restores the committed pin
after any probe. `just generate-schema` is deterministic for a given input.

Before running the ADR blueprint, check that `docs/adr/profile.dhall` does not exist; if
it does, the bundle is already adopted and only the record-writing steps apply. `okf index
--write` and `okf log add` are safe to rerun; the index is regenerated and the log only
appends. `mori register` can be rerun at any time to refresh the registry. If `okf validate`
rejects the record, fix the frontmatter it names; never edit `profile.dhall`'s hash and never
pick a `docId` by hand.

If `openapi-typescript` fails to start because it cannot find `typescript`, confirm the
root `devDependencies` include `typescript@^5.9` and rerun `bun install`; the shell's `tsc`
7.0.2 is intentionally not used for generation.

If `bun add` reports that it chose an older version than npm's latest, that is the
release-age gate working as intended, not an error. Only when a newer release is required
should `bunfig.toml` gain `[install] minimumReleaseAge = <seconds>`; commit that change with
its reason and remove it once the needed release is older than seven days.


## Interfaces and Dependencies

Tools and libraries whose choice matters: Bun 1.4.2 (workspaces, `bun test`, `Bun.build`);
TypeScript 7.0.2 from the Nix shell (`tsc`) for type-checking and declaration emit;
`openapi-typescript` 7.x (7.13.0 current on 2026-10-14) with its `typescript@^5.9` peer, both
root development dependencies; `@happy-dom/global-registrator` 20.x or 21.x (21.0.1 current,
20.14.5 resolved under Bun's seven-day release-age gate on 2026-10-14); oxlint 1.87.0 and
oxfmt 0.72.0 from the shell; `okf` 0.9.0.0 and `seihou` for the ADR bundle; `mori` for
registration; `DeterminateSystems/nix-installer-action` in CI. npm package versions in this
plan are upper bounds resolved by Bun on the day of implementation and recorded in `bun.lock`;
the Nix-shell tool versions are exact pins from `nix/tooling-sources.json`.

Package export map, identical in both packages (ESM-only, so no `require` condition; the
`types` key precedes `default`):

```json
{
  "type": "module",
  "sideEffects": false,
  "files": ["dist", "README.md", "CHANGELOG.md"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./package.json": "./package.json"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "engines": { "node": ">=20.19.0" }
}
```

Build script contract: `bun scripts/build.ts <package-dir>` produces exactly
`dist/index.js` (ESM), `dist/index.js.map`, and `dist/index.d.ts` plus per-module `.d.ts`
files; there is no CommonJS output. Externals are the package's `dependencies` and
`peerDependencies` (and `react/jsx-runtime` when `react` is a peer). When the package manifest
has `"kansoku": { "banner": "<text>" }`, that text is passed as `banner` to `Bun.build` and
becomes the first line of `dist/index.js`. Later plans must not add a second build path or a
second module format; a package that needs a leading directive sets the manifest field instead.

Vendored contract files: `contracts/openapi.json`, `contracts/events.json`,
`contracts/KANSOKU_COMMIT` (forty hex characters and a newline). Generated types:
`packages/kansoku-js/src/generated/schema.ts`, consumed only through
`packages/kansoku-js/src/contract/wire.ts`, which exports the type aliases `AnalyticsEvent`,
`BatchAck`, `RejectedEvent`, `ErrorEnvelopeWire`, `SchemaCatalog`, `EventVersions`,
`VersionedEventSchema`, `ContractProperty`, `EventSource`, `IngestAck`, and `paths`.

Test harness contract: `bunfig.toml` preloads `test/setup/dom.ts` for every `bun test`
invocation. The preload registers happy-dom at origin `http://localhost:3000` unless the
environment variable `KANSOKU_TEST_NO_DOM` equals `1`, in which case it does nothing and the
process keeps Bun's real `fetch`, no `window`, and no `document`. Suites that need real
globals are run as `KANSOKU_TEST_NO_DOM=1 bun test <paths>` (or `just test-no-dom <paths>`),
live under a `test/ssr/` directory, and guard themselves with `describe.skipIf(typeof document
!== "undefined")`. `test/helpers/fetch-mock.ts` exports:

```typescript
export interface RecordedRequest {
  url: string
  method: string
  headers: Record<string, string>   // lower-cased names
  body: unknown                      // parsed JSON when the request body is JSON
  keepalive: boolean
}

export type ScriptedResponse = () => Promise<Response>

export interface FetchMock {
  fetch: typeof globalThis.fetch      // drop-in; records every call
  requests: RecordedRequest[]
  respondWith(...responses: ScriptedResponse[]): void
}

export function createFetchMock(): FetchMock
export function ack(accepted: number, rejected?: Array<{ index: number; eventId?: string; errors: string[] }>): ScriptedResponse   // HTTP 202 BatchAck
export function envelope(status: 400 | 404 | 413 | 503, code: string, retryable: boolean, message?: string): ScriptedResponse   // ErrorEnvelopeWire
export function status(code: number): ScriptedResponse            // empty body, e.g. 401
export function networkError(message?: string): ScriptedResponse  // rejects with TypeError
export function hang(): ScriptedResponse                          // never settles (timeout tests)
```

`just` recipes other plans call: `install`, `typecheck`, `lint`, `lint-fix`, `format`,
`format-check`, `check`, `test`, `test-no-dom <paths…>`, `build`, `sync-contracts`,
`generate-schema`, `check-contracts`, `adr-check`, `ci`. `build` is the only producer of
`dist/`, which the example and smoke-test recipes in `docs/plans/5-…` consume through the
export maps.

Prerequisites: none. This is the first child plan of
`docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md`; every other child
hard-depends on it being Complete.

Revision note (2026-10-14): the user deferred remote CI acceptance and prioritised implementation of functional packages. Remote run success is follow-up verification, not a prerequisite for EP-2.

---
id: 10
slug: build-kansoku-react-with-the-production-jsx-runtime
title: "Build kansoku-react with the production JSX runtime"
kind: exec-plan
created_at: 2026-11-07T16:13:32Z
provenance:
  created_by:
    model: "gpt-6.1-sol"
    harness: "codex-cli"
    at: 2026-11-07T16:13:32Z
  reviews:
    - model: "gpt-6-astra"
      harness: "codex-cli"
      at: 2026-11-07T19:20:58Z
      verdict: "changes-requested"
      note: "Verified build probes and ADR/CI contracts; correct usePageView specialization claim and distinguish provider context from the server fallback."
  revisions:
    - model: "gpt-6-astra"
      harness: "codex-cli"
      at: 2026-11-07T19:20:58Z
      mode: "update"
      note: "Address review findings: preserve usePageView runtime semantics and require direct provider-context identity in the smoke."
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-11-07T19:28:43Z
      mode: "implement"
      note: "Implement deterministic production JSX compilation and built-provider smoke; verify release preparation."
---

# Build kansoku-react with the production JSX runtime

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.
Record implementation friction using agents/skills/exec-plan/FRICTION.md.


## Purpose / Big Picture

Applications following the React package's README must be able to render `KansokuProvider`
in production. Currently the published 0.1.0 bundle calls React's development-only `jsxDEV`
function, which is undefined when React runs in production. This plan fixes
[BUG-2](../bug-reports/kansoku-react-bundles-the-development-jsx-runtime.md), adds a check
that actually renders the built package in production, and prepares a patch changeset.

After implementation, `just package-smoke` will render the provider successfully with
React in both development and production, and `just check` will enforce that behavior.
The built module will import `react/jsx-runtime`, retain its `"use client"` banner,
and continue to use the application's React installation. Publication is a later release
operation; completion here means a tested fix and release preparation in this repository.


## Progress

- [x] M1 (2026-11-07): Builds made with NODE_ENV unset, development, or production all emit the production
  JSX runtime, and the resulting provider renders `child` in a fresh production Node process.
  Verified all three real builds on Bun 1.4.2; the production smoke returned the expected
  `<span>child</span>` and verified context identity after each build.
- [x] M2 (2026-11-07): `just package-smoke` checks the built React provider and context in fresh development
  and production Node processes; the production check demonstrably rejects the original build.
  Negative control (definition removed, development build) exited 1 on the runtime assertion;
  restored build passed both modes and the core smoke accepted three events. Focused coverage
  passed 20 tests (one DOM-mode SSR skip) plus the separate no-DOM SSR test.
- [x] M3 (2026-11-07): `just ci` passes, BUG-2 records the verified unreleased fix, relevant ADRs capture the
  distribution contract, and a patch changeset prepares the fixed package group for release.
  `nix develop --no-write-lock-file -c just ci` exited zero: 104 source tests passed,
  13 environment/live tests skipped, and all three separate no-DOM tests passed.
  Type, package, size, formatting, contract and strict documentation checks passed.
  Changesets reports patch releases for kansoku-js and kansoku-react; `git diff --check` passed.


## Surprises & Discoveries

Review discovery (2026-11-07): In-memory builds on Bun 1.4.2 with the proposed definition
select `react/jsx-runtime` with NODE_ENV unset, development, and production. However, Bun
leaves `process.env?.NODE_ENV` and its `typeof process` guard in `usePageView` unchanged.
The definition does not specialize this optional-chain expression. Preserve the existing
warning behavior; changing it is outside this repair.

Review discovery (2026-11-07): `useKansoku()` returns a module-level no-op client when
there is no context during server rendering. An opted-out assertion alone therefore cannot
prove that the options-form provider supplied context. Read `KansokuContext` directly in
the smoke's consumer as well, and compare its client with the hook result.


## Decision Log

Decision (2026-11-07): Specialize the React bundle for production using Bun.build's
`define` setting for `process.env.NODE_ENV`. Planning probes on the supported Bun 1.4.2
showed that this selects `react/jsx-runtime` even when the build process starts in
development. The documented `jsx.development: false` setting and assigning
`process.env.NODE_ENV = "production"` after startup did not. Keep the existing Bun floor
and dependency versions; a toolchain upgrade is unnecessary to fix the supported build.

Decision (2026-11-07): Exercise the emitted JavaScript with Node in separate processes.
Changing NODE_ENV inside a running test process can leave React's development implementation
cached. A successful source import or export-name comparison cannot detect this rendering defect.

Decision (2026-11-07): Prepare a patch changeset using the existing fixed release group.
Registry publication and changes in downstream repositories are outside this plan. The user
chose to proceed without an Intention ID; this is a standalone repair plan.


## Outcomes & Retrospective

Completed 2026-11-07. The real build now selects react/jsx-runtime in all three ambient
build environments, and fresh Node consumers render both provider ownership forms with the
expected context, HTML and zero fetch calls. Removing only the definition reproduced a
failing smoke (exit 1); restoring it made the integrated package gate pass. Full CI passed
with the locked Bun 1.4.2, Node 22.23.3 and React 19.3.0 toolchain.

ADR-6 now records deterministic production JSX compilation and the fresh-process rendering
gate, including the distinction between JSX compilation and usePageView's runtime warning.
ADR-5's binding contract remains intact. BUG-2 records an unreleased fix, and the patch
changeset prepares both packages through the existing fixed group. No dependencies,
public APIs or manifests changed. Registry publication remains a separate release operation;
published 0.1.0 is still affected.

No implementation friction met the recording threshold, and the plan's logged-friction
query returned no entries to triage.


## Context and Orientation

This repository publishes `kansoku-js`, the browser analytics client, and `kansoku-react`,
its React bindings. A peer dependency is supplied by the consuming application rather than
compiled into the library: React and kansoku-js are peers of kansoku-react.
`packages/kansoku-react/src/provider.tsx` implements `KansokuProvider` and returns
`<KansokuContext.Provider>`. This syntax is JSX, which the build converts into JavaScript
function calls. React's normal JSX runtime, `react/jsx-runtime`, supplies `jsx` and `jsxs`;
its development runtime, `react/jsx-dev-runtime`, supplies `jsxDEV` only in development.

`scripts/build.ts` is shared by both packages. It requires Bun >=1.4.2 from root
`package.json`, bundles `src/index.ts` into minified ESM (JavaScript using import/export),
writes a linked source map, verifies runtime export names and types through
`scripts/verify-bundle.ts`, and emits declarations with TypeScript. Dependencies and peers
are external imports. The script already explicitly externalizes `react/jsx-runtime` and
gets the React banner from `packages/kansoku-react/package.json`. It currently has no
explicit production build definition. `tsconfig.base.json` sets `jsx: react-jsx`, which
has not prevented the wrong runtime from being emitted.

Planning checks on 2026-11-07 used Bun 1.4.2, Node 22.23.3, and installed React/react-dom
19.3.0. The existing `packages/kansoku-react/dist/index.js` imports `jsxDEV`. Rendering it
with `react-dom/server` returns `child` with NODE_ENV=development and throws
`TypeError: w is not a function` with NODE_ENV=production. Inspection of installed React's
production development-runtime module confirms `exports.jsxDEV = void 0`. An in-memory
build of the real source with the proposed `define` setting emitted the normal runtime;
these probes did not change source or replace the existing dist files. The minimal runtime
check below is the early integration proof to repeat after changing the real build script.

Mori lookup found neither Bun nor React registered locally, so planning consulted installed
dependency code and [Bun's build configuration documentation](https://bun.com/docs/bundler#api).
The documentation includes `jsx.development`, but the supported runtime probe is authoritative
for this repair. npm's latest endpoints reported Bun/@types/bun 1.4.4 and React/react-dom
19.3.1 on the planning date; matching upstream release tags were checked. These are newer
than the installed versions, not a reason to change this plan's dependencies. Recheck the
registry and upstream tags before proposing any later version change.

`justfile` runs both builds in dependency order. Its `package-smoke: build` recipe currently
runs only `packages/kansoku-js/scripts/smoke.ts`, which delivers events to a local stub.
`scripts/ssr-smoke.ts` also covers only the core source. React tests are Bun tests, including
`packages/kansoku-react/test/ssr/ssr.test.tsx`, which renders source in a process without DOM
(browser document/window) globals. `bunfig.toml` normally preloads the browser simulation
in `test/setup/dom.ts`; plain Node scripts do not use this preload. The report's reference
to Vitest is stale: do not add a second test framework. Root `tsconfig.json` checks scripts
and tests, while the new plain JavaScript smoke will run directly in Node.

[Plan 9](9-guard-sdk-builds-against-incomplete-bundles-and-require-bun-1-4-2.md)
already delivered the Bun floor and export verification. Retain those checks; this repair
covers a behavior that can fail while every export remains present.

[ADR-5](../adr/0005-react-binding-boundary.md) requires React 18/19 compatible provider syntax,
a first-position use-client banner, no browser client during server rendering, and reversible
lifecycle effects for provider-owned clients. Keep these source contracts.
[ADR-6](../adr/0006-two-browser-packages-and-esm-distribution.md) requires external peers,
ESM with declarations/source maps, a 3 KiB gzip React entry budget, and checks of built
artifacts. [ADR-7](../adr/0007-lockstep-versioning-and-trusted-publishing.md) requires
lockstep release preparation and checking packages before release. `.changeset/config.json`
defines the fixed group containing both public packages. Both manifests are now at 0.1.0;
ADR-7's description of the prepublication state is historical.

ADRs and bug reports are profile-governed documentation bundles, described by
`docs/adr/profile.dhall` and `docs/bug-reports/profile.dhall`. Their strict checks require
valid metadata and amendment logs. Preserve stable ADR-5, ADR-6, ADR-7 and BUG-2 handles.


## Plan of Work

### Milestone 1: Deterministic production JSX output


In the Bun.build configuration in `scripts/build.ts`, add the following definition for
`manifest.name === "kansoku-react"`; leave it undefined for kansoku-js:

```typescript
define: manifest.name === "kansoku-react"
  ? { "process.env.NODE_ENV": JSON.stringify("production") }
  : undefined,
```

This replaces the named environment expression with a literal during compilation and, on
Bun 1.4.2, selects the production JSX transform. It does not replace the optional-chain environment
comparison in `packages/kansoku-react/src/hooks/usePageView.ts` on Bun 1.4.2; retain that
hook's existing runtime warning behavior and do not claim that the entire bundle has had
its development diagnostics removed. The JSX transform uses the normal runtime even when
consumed from a development application. Source tests keep their existing behavior. Do not rely on the caller setting NODE_ENV or modify
the process environment at runtime. Do not rewrite the provider to bypass JSX or change
provider/context ownership. Retain external peers, the banner, declarations, maps, and
export verification.

Build under each of the three environment settings shown below. After each build, inspect
the React entry and run the minimal production rendering check. It must print `child` and
exit zero. The entry must import `react/jsx-runtime` and contain no `react/jsx-dev-runtime`
import. This closes the actual producer/consumer interaction before adding automation.

### Milestone 2: A built-package rendering check in the existing gate


Create `packages/kansoku-react/scripts/smoke.mjs`, a plain Node ESM script. Import
`createElement` and `useContext` from `react`, `renderToString` from `react-dom/server`, and
`KansokuProvider`, `KansokuContext`, `useKansoku`, and `createNoopClient` from `../dist/index.js`. Use Node's strict assertions;
do not import TS sources or a test-library renderer. Require NODE_ENV to be either
development or production and assert `typeof window === "undefined"`.

Read `../dist/index.js` relative to `import.meta.url`; assert that its first statement is
`"use client"`, that it refers to `react/jsx-runtime`, and that it has no
`react/jsx-dev-runtime` reference. Avoid assertions about minified local variable names.
Render a provider using the options form from the README and assert the exact output
`<span>child</span>`. Have its child call both `useContext(KansokuContext)` and `useKansoku()`.
Assert that the context is non-null, its client is the hook result, and that client is opted
out via `isOptedOut()`. This distinguishes provider context from the hook's no-provider
server fallback. In a second render, pass a caller-owned client created with
`createNoopClient()` and assert that both the context client and `useKansoku()` return that
exact object, with the same expected HTML. Install a throwing fetch stub and count calls
around rendering; require zero calls. Let assertion failures produce nonzero exits.
Print `kansoku-react package-smoke: <mode> ok` only after both renders and artifact checks pass.

Extend the existing `package-smoke: build` recipe in `justfile` to run this script twice,
using `NODE_ENV=development node ...` and `NODE_ENV=production node ...`, after the existing
core smoke. Each command creates a fresh Node process with the environment established
before React is imported. The recipe remains in `check`; both GitHub CI and release already
run `just ci`, so no separate workflow is needed. Keep the existing core and source checks.

Prove the check detects BUG-2 by temporarily removing only the new definition, rebuilding
under NODE_ENV=development, and running the production smoke. It must fail on the forbidden
runtime check or rendering. Restore the definition, rebuild, and require both modes to pass.
Record concise failing/passing evidence in this plan. Existing source tests continue to
cover browser lifecycle behavior; this smoke targets the built runtime and server context.

### Milestone 3: Verified closure and patch release preparation


Update ADR-6 to require production JSX compilation independent of the builder's environment
and rendering the built React package in fresh development/production processes in the
standard package gate. Update ADR-5 only if implementation changes its binding contract;
the intended fix preserves it. Advance meaningful-revision timestamps and append amendment
log entries for any changed ADR.

After acceptance passes, set BUG-2's `status: fixed`, `fixedVersion: unreleased`, and a
`resolution` that names the deterministic build definition, built-package smoke, and this
plan. Preserve the original report's observation and reproduction fields as historical
evidence. Add an amendment log entry. Do not claim npm 0.1.0 has been repaired in place.

Add `.changeset/fix-production-jsx-runtime.md` declaring a patch for `kansoku-react` and
explaining that production consumers can render KansokuProvider again. Let the existing
fixed-group release workflow compute the eventual coordinated versions; do not manually
bump manifests or run publication as part of this repair. Verify that Changesets recognizes
the patch. Run the final checks below, then update Progress and Outcomes with evidence,
triage any implementation friction entries, and distill durable decisions into ADR-6.


## Concrete Steps

All commands start at the repository root. Enter `nix develop` for the checked-in toolchain;
run `bun install --frozen-lockfile` if dependencies are missing. Do not search or read
`/nix/store`. Node must meet the published engine requirement (>=20.19.0; Node 22 >=22.12).

Before editing, the following shows the crash. Repeat after M1's build to see `child`:

```bash
cd packages/kansoku-react
NODE_ENV=production node --input-type=module -e '
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { KansokuProvider } from "./dist/index.js";
console.log(renderToString(createElement(KansokuProvider, {
  options: { baseUrl: "https://k.test", writeKey: "w", sourceService: "s" }
}, "child")));
'
cd ../..
```

Build the core first, then check the React build under each ambient setting. Repeat the
entry inspection and minimal production rendering command after each React build:

```bash
bun scripts/build.ts packages/kansoku-js
env -u NODE_ENV bun scripts/build.ts packages/kansoku-react
NODE_ENV=development bun scripts/build.ts packages/kansoku-react
NODE_ENV=production bun scripts/build.ts packages/kansoku-react
```

Each build must exit zero, print its declaration/map/entry success line, the use-client
banner for React, and `exports: N verified` for its current public surface. Do not freeze
an export count in the new test. To inspect emitted runtime specifiers without printing
the full minified module:

```bash
bun -e 'const t=await Bun.file("packages/kansoku-react/dist/index.js").text(); console.log([...new Set(t.match(/react\/jsx[^"\x27]*/g))])'
```

The only runtime specifier should be `react/jsx-runtime`. Once M2 exists, use its command
instead of the one-line manual render after each build, and run the integrated recipe:

```bash
NODE_ENV=development node packages/kansoku-react/scripts/smoke.mjs
NODE_ENV=production node packages/kansoku-react/scripts/smoke.mjs
just package-smoke
```

Expected React success lines:

```text
kansoku-react package-smoke: development ok
kansoku-react package-smoke: production ok
```

The core smoke must still report three accepted events. Run focused existing coverage:

```bash
bun test test/scripts packages/kansoku-react/test
just test-no-dom packages/kansoku-react/test/ssr
```

For M3, create the changeset with this content:

```markdown
---
"kansoku-react": patch
---

Fix KansokuProvider crashing in production by compiling the package with the production JSX runtime.
```

After editing ADR-6 and BUG-2, append their logs and validate release preparation:

```bash
okf log add docs/adr ADR-6 --kind Update -m "Require production JSX output and built React rendering checks"
okf log add docs/bug-reports BUG-2 --kind Update -m "Fix production JSX compilation and add a built-provider smoke"
bun x --no-install changeset status
```

Changesets must report a pending patch including kansoku-react and respect the fixed group.
Format the changed supported files, including amendment logs:

```bash
oxfmt --write scripts/build.ts packages/kansoku-react/scripts/smoke.mjs docs/adr/0006-two-browser-packages-and-esm-distribution.md docs/adr/log.md docs/bug-reports/kansoku-react-bundles-the-development-jsx-runtime.md docs/bug-reports/log.md .changeset/fix-production-jsx-runtime.md
```

The repository's `.oxfmtrc.json` excludes `docs/plans`; preserve this plan's skill-required
Markdown formatting directly. Finish with:

```bash
just ci
git diff --check
```

`just ci` must exit zero, run the new two-mode React check, pass source tests/type checks,
pass package declaration checks and size budgets, and strictly validate the ADR, bug-report,
and friction bundles. Record material pre-existing failures separately from this fix rather
than silently treating them as passing acceptance.


## Validation and Acceptance

M1 is accepted when all three build environments produce the normal JSX runtime and the
fresh production Node render changes from a TypeError to `child`. Builds must preserve the
first-position banner, external React/kansoku-js imports, declarations, linked source map,
and export verification. The production definition must be in the build configuration,
not merely in a task-runner invocation.

M2 is accepted when the new smoke proves both provider ownership forms deliver the expected
context and HTML with no network calls in both fresh Node modes. The options-form consumer
must observe a non-null `KansokuContext` whose client equals `useKansoku()`; an opted-out
hook result alone can come from the server fallback and is insufficient. `just package-smoke` must
include these checks after building, alongside the existing core smoke. The negative-control
build must fail and the restored candidate must pass. Testing only source JSX, successful
module imports, or a string search for the runtime is insufficient.

M3 is accepted when `just ci` and whitespace checks pass, the patch changeset is recognized,
BUG-2 records an unreleased fix, and strict documentation validation passes with the updated
ADR/logs. The existing 3 KiB gzip React budget and package API/type contracts remain in force.
No actual registry publication, downstream workaround removal, dependency upgrades, or new
browser-testing matrix is required to complete this plan. The React 18/19 peer range and
React 18 compatible provider syntax remain unchanged; the local runtime proof uses the
locked React 19 installation rather than claiming an unexecuted cross-version matrix.


## Idempotence and Recovery

The build replaces generated dist files, so rerunning it after a failed attempt regenerates
the complete package; always build kansoku-js before checking the React bundle. Fresh Node
processes prevent module-cache contamination between environment modes. The smoke needs no
analytics server or credentials.

During the negative control, save the small build-definition diff and restore it immediately
after proving the failure. Rebuild the fixed candidate before any final checks. Do not use
a repository-wide reset or discard unrelated work. Changesets and documentation edits are
ordinary source files; reuse the same changeset on retry and avoid duplicate amendment log
entries. Do not edit published 0.1.0 artifacts or report a released fixedVersion until a
separate release has actually occurred.


## Interfaces and Dependencies

The production build uses the existing Bun.build `define?: Record<string, string>` API;
the value must be a JavaScript string literal, hence `JSON.stringify("production")`.
The proposed smoke uses Node's built-in assertions and file APIs, plus existing React and
react-dom development dependencies resolved from `packages/kansoku-react`. `.mjs` makes the
fixture executable without a TypeScript loader or JSX transform. No runtime dependency or
public interface is added.

`KansokuProviderProps` in `packages/kansoku-react/src/provider.tsx` remains the union of
`{ options, children }` and `{ client, children }`; the smoke exercises both forms through
the distribution entry. `scripts/verify-bundle.ts` retains its existing export-verification
interface. `justfile` keeps the public recipe name `package-smoke`, now covering both
packages. This plan has no parent-plan prerequisite beyond the current checked-in build
and package infrastructure.


Revision note (2026-11-07): Review against the build, provider/hooks, ADR-5/6/7, and CI
confirmed the proposed JSX fix, including in-memory probes under all three build environments
and reproduction of the current production TypeError. Corrected the unsupported claim that
Bun specializes usePageView's optional-chain check and strengthened the options-form smoke
to prove real context delivery. Implementation milestones remain uncompleted; these review
probes do not replace validation of the eventual build-script change.

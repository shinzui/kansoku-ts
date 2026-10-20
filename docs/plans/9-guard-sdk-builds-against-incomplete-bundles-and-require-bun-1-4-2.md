---
id: 9
slug: guard-sdk-builds-against-incomplete-bundles-and-require-bun-1-4-2
title: "Guard SDK builds against incomplete bundles and require bun 1.4.2"
kind: exec-plan
created_at: 2026-10-20T23:28:08Z
intention: "intention_01m4ymqn7xe1a8tz8v7r78e34y"
provenance:
  created_by:
    model: "claude-opus-5-5"
    harness: "claude-code"
    at: 2026-10-20T23:28:08Z
  revisions:
    - model: "claude-opus-5-5"
      harness: "claude-code"
      at: 2026-10-20T23:33:35Z
      mode: "implement"
      note: "Milestone 1 implemented: bun floor and bundle export verification"
---

# Guard SDK builds against incomplete bundles and require bun 1.4.2

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.




## Purpose / Big Picture

Today `just build` can produce a `packages/kansoku-js/dist/index.js` that cannot be imported,
and still print its success line and exit 0. Bug report BUG-1
([docs/bug-reports/bun-1-3-drops-entry-named-reexports.md](../bug-reports/bun-1-3-drops-entry-named-reexports.md))
shows how: bun 1.3.13 bundles `packages/kansoku-js/src/index.ts` into a 604-byte module whose
export list names `createKansoku` and `version` without ever defining them. bun 1.4.2, the
version the repository's `nix develop` shell provides, bundles the same source correctly
(re-verified on 2026-10-20 at commit `0c94d9f`: 24 modules, 22,912 bytes, 14 exports).

The project does not support older bun versions. This plan makes that a stated, enforced
requirement and makes the build check its own output. Afterwards:

1. `bun scripts/build.ts` under any bun older than 1.4.2 stops before bundling, with a message
   that names the required version and BUG-1, and exits non-zero.
2. Under a supported bun, the build imports the bundle it just wrote and compares its runtime
   exports, by name and by `typeof`, with the source entry module's exports. If they differ, or
   if the bundle cannot be imported at all, the build prints what is wrong and exits non-zero.
   It no longer reports success for an incomplete bundle.
3. `just check` also runs `packages/kansoku-js/scripts/smoke.ts`, which sends three events from
   the built bundle to a local stub server and requires all three to be accepted.
4. The README, the getting-started guide and ADR-6 state the bun floor, and BUG-1 is closed as
   `fixed`.

To see it working, run `just build` in `nix develop` and observe one extra line per package,
`exports: 14 verified` for kansoku-js and `exports: 10 verified` for kansoku-react. Then run the
same build script under bun 1.3.13 and see it refuse to start.


## Progress

- [x] M1: `scripts/build.ts` refuses bun older than the root `package.json` `engines.bun` range
  (`>=1.4.2`) and verifies every bundle's export surface against its source entry; the verifier
  has unit tests and rejects the real bun 1.3.13 artifact. Accepted 2026-10-20: five verifier
  cases pass; `just build` prints `exports: 14 verified` and `exports: 10 verified`; bun 1.3.13
  is refused with exit 1 and `dist/index.js` keeps its modification time; the verifier rejects
  the 604-byte 1.3.13 bundle with `bundle cannot be imported: "K" is not declared in this file;
  "j" is not declared in this file` (exit 1); `just test` (90 pass, 0 fail) and `just typecheck`
  pass.
- [ ] M2: `just check` runs the kansoku-js package smoke; the README, getting-started guide and
  ADR-6 state the bun floor; BUG-1 is `fixed`; `just ci` passes.


## Surprises & Discoveries

`just format-check`, and therefore `just check` and `just ci`, already failed at `0c94d9f` before
this plan began: `oxfmt --check .` reports `docs/bug-reports/bun-1-3-drops-entry-named-reexports.md`,
`docs/bug-reports/index.md`, `docs/bug-reports/log.md` and
`docs/guides/instrument-before-server-ready.md`. Milestone 2 requires `just ci` to pass, so it
formats those files with `oxfmt --write` and reruns `just bug-report-check` to confirm the
formatted bug-report bundle still validates.

bun reports the BUG-1 bundle's import failure as the per-binding messages `"K" is not declared
in this file; "j" is not declared in this file`, so `describe` in `scripts/verify-bundle.ts`
unwraps `AggregateError.errors`.


## Decision Log

- Decision: the minimum bun for building this repository is 1.4.2, and older versions are
  refused rather than worked around.
  Rationale: the maintainer said on 2026-10-20 that old bun versions do not need support. 1.4.2
  is the version `nix develop` provides and the only 1.4 release verified against BUG-1; 1.4.0
  and 1.4.1 are untested, and establishing the exact affected range is not worth the effort.
  This also rules out BUG-1's third suggested fix, rewriting
  `packages/kansoku-js/src/index.ts` to avoid `export { name } from` statements, which exists
  only to accommodate older bundlers.
  Date: 2026-10-20

- Decision: declare the floor once, as `engines.bun` in the private root `package.json`, and
  have `scripts/build.ts` read it from there. Do not add `engines.bun` to the published
  `packages/kansoku-js/package.json` or `packages/kansoku-react/package.json`.
  Rationale: bun does not enforce `engines`, so the build script must check it; reading the field
  keeps the declaration and the check from drifting apart. The published packages ship plain ESM
  that any bundler or Node 20.19+ consumes; bun is a requirement for building them, not for
  using them.
  Date: 2026-10-20

- Decision: the build verifies the bundle against the source entry module's runtime exports,
  not against a hard-coded list of names.
  Rationale: one rule covers both packages and stays correct as exports are added or removed.
  Comparing `typeof` as well as names catches a binding that exists but is wrong, such as
  `undefined` in place of a function.
  Date: 2026-10-20

- Decision: link this plan to the existing SDK intention `intention_01m4ymqn7xe1a8tz8v7r78e34y`
  instead of creating a new intention.
  Rationale: `mina ci` could not create a child intention because `rei.create.default-parent`
  is not configured, and the maintainer chose to link the existing intention rather than
  configure one.
  Date: 2026-10-20


## Outcomes & Retrospective

(To be filled during and after implementation.)


## Context and Orientation

This repository, `mori://shinzui/kansoku-ts`, publishes two browser packages: `kansoku-js`
(`packages/kansoku-js`), a dependency-free analytics SDK, and `kansoku-react`
(`packages/kansoku-react`), React bindings that treat `kansoku-js` and `react` as peers. Each
package's public API is re-exported from its `src/index.ts`, which bun bundles into one minified
ESM file, `dist/index.js`. Both `package.json` files declare `"sideEffects": false`, which tells
a bundler that importing a module for its side effects alone does nothing, so modules whose
exports go unused may be dropped. That flag plus the `export { name } from "./module.js"`
statements in `packages/kansoku-js/src/index.ts` trigger BUG-1 under bun 1.3.13.

Tooling comes from the Nix flake. `nix/bun.nix` puts `pkgs.bun` from the nixpkgs revision
pinned in `flake.nix` into the dev shell; that is bun 1.4.2 (`bun --version` inside
`nix develop` prints `1.4.2`). `@types/bun` in the root `package.json` is also pinned to 1.4.2.
The root `package.json` is private and currently has no `engines` field. Each package manifest
declares `"engines": { "node": ">=20.19.0" }`.

`scripts/build.ts` is the build for one package directory, passed as its first argument. It
deletes `dist`, calls `Bun.build` on `src/index.ts` (browser target, ESM, minified, linked
source map, the package's dependencies and peers external, and an optional banner from the
manifest's `kansoku.banner`), exits 1 if `result.success` is false, runs `tsc -p
tsconfig.build.json` in the package directory to emit declarations, and then prints
`<name>: dist/index.js, dist/index.js.map, dist/index.d.ts`. `Bun.build` reports success for
the broken BUG-1 bundle, so nothing in that path notices it.

The `justfile` defines `build` as the build script for `packages/kansoku-js` and then
`packages/kansoku-react`. `check` runs `typecheck lint format-check ssr-smoke check-contracts
check-packages check-size adr-check bug-report-check`, and `ci` runs `install-frozen check test
build check-contracts adr-check bug-report-check`. GitHub Actions (`.github/workflows/ci.yml`)
runs `nix develop --command just ci`. None of these steps imports a built bundle:
`scripts/ssr-smoke.ts` imports `packages/kansoku-js/src/index.js`, the source;
`check-packages` (publint and attw) inspects manifests and declarations; `check-size`
(`scripts/check-size.ts`) only measures gzip bytes. `packages/kansoku-js/scripts/smoke.ts`
does import `../dist/index.js`, starts a `Bun.serve` stub of `/v1/batch`, tracks three events,
flushes, and requires `client.stats.accepted === 3`, printing `accepted: 3`, but no recipe runs
it.

Both packages' source entries can be imported by bun with no DOM present, as ADR-6 requires
browser access to stay out of module scope. A prototype run on 2026-10-20 confirmed that
importing `dist/index.js` and `src/index.ts` for each package in plain `bun` yields identical
sorted export names: 14 for kansoku-js (`ALIAS`, `BUILT_IN_SCHEMA_VERSIONS`,
`EXPERIMENT_NAME_PATTERN`, `EXPERIMENT_VIEWED`, `GROUP`, `IDENTIFIER_KINDS`, `IDENTIFY`,
`IDENTIFY_ONCE`, `MAX_SCHEMA_VERSION`, `MIN_SCHEMA_VERSION`, `PAGE_VIEW`, `SESSION_START`,
`createKansoku`, `version`) and 10 for kansoku-react (`KansokuContext`, `KansokuProvider`,
`createNoopClient`, `useExperiment`, `useIdentify`, `useIdentifyOnce`, `useKansoku`,
`usePageView`, `useTrack`, `version`). kansoku-react's bundle resolves `react` and `kansoku-js`
from the workspace `node_modules`, so kansoku-js must be built first, which `just build`
already does.

Tests run with `bun test` from the repository root. `bunfig.toml` preloads
`test/setup/dom.ts` for tests only; `bun scripts/...` invocations do not load it. Root-level
test files live under `test/` (for example `test/helpers/fetch-mock.test.ts`).

The bug-report bundle `docs/bug-reports` follows the okf-profiles v0.22.0
`coordination.bugReports` profile (`docs/bug-reports/profile.dhall`) and is validated by
`just bug-report-check`. Its status lifecycle includes the terminal status `fixed`, which
requires a `fixedVersion` (`unreleased` while the fix is only on the default branch) and,
under `--strict`, a `resolution` sentence. Its `log.md` records changes with `okf log add`.
BUG-1 currently has `status: reported`.

Relevant ADRs:
[ADR-6, two browser packages and ESM distribution](../adr/0006-two-browser-packages-and-esm-distribution.md)
requires one minified ESM bundle per package with linked source maps and declarations,
distribution through Bun minification, and states that "Package/SSR/type checks validate the
built artifact". This plan makes that statement true for the bundle's exports and adds the
build toolchain floor to the ADR.
[ADR-7, lockstep versioning and trusted publishing](../adr/0007-lockstep-versioning-and-trusted-publishing.md)
requires building and checking packed tarballs before release; the release workflow runs
`just ci`, so the new checks also gate releases. No other ADR is relevant.


## Plan of Work

### Milestone 1: version floor and bundle verification

At the end of this milestone, `scripts/build.ts` refuses unsupported bun versions and refuses
to report success for a bundle whose exports differ from its source. Acceptance is a passing
`bun test test/scripts`, a `just build` that prints the two `exports: N verified` lines, a
refusal under bun 1.3.13, and the new verifier rejecting the real bun 1.3.13 bundle.

Add `"engines": { "bun": ">=1.4.2" }` to the root `package.json`.

Create `scripts/verify-bundle.ts`. It exports one function,
`verifyBundle(bundlePath: string, sourcePath: string): Promise<BundleVerification>`, where
`BundleVerification` is `{ exports: string[]; problems: string[] }`. It dynamically imports the
source entry, then the bundle. If importing the bundle throws, it returns a single problem,
`bundle cannot be imported: <message>`; bun reports the BUG-1 shape as an `AggregateError`, so
include the messages of its `errors` when present. Otherwise it compares the two sets of export
names and reports each name missing from the bundle, each name only in the bundle, and each
shared name whose `typeof` differs, as `<name>: source <type>, bundle <type>`. `exports` is the
sorted list of the bundle's export names. Import with `pathToFileURL(path).href` so absolute
paths work everywhere. When run directly (`import.meta.main`), it takes the bundle path and the
source path as arguments, prints `exports: N verified` and exits 0 when there are no problems,
or prints each problem to stderr and exits 1.

Change `scripts/build.ts` so that, before anything else, it reads the root `package.json`
(`resolve(import.meta.dir, "../package.json")`), takes `engines.bun`, and if
`Bun.semver.satisfies(Bun.version, range)` is false prints to stderr

```text
scripts/build.ts requires bun >=1.4.2 (root package.json engines.bun); this is bun 1.3.13.
Older bun drops the entry module's named re-exports (BUG-1). Build inside `nix develop`.
```

with the actual range and version substituted, and exits 1. After `Bun.build` succeeds and
before `tsc` runs, call `verifyBundle` on `dist/index.js` and `src/index.ts`. On any problem,
print `<name>: dist/index.js does not match src/index.ts` followed by each problem, and exit 1.
As the script's last line of output, after the success line and any `banner:` line, print
`exports: N verified`. Keep the script's existing style:
top-level `await`, no extra dependencies, short comments only where intent is not obvious.

Add `test/scripts/verify-bundle.test.ts`. Each case writes small fixture modules into a
directory created with `mkdtemp(join(tmpdir(), "verify-bundle-"))` and removes it afterwards.
The source fixture is

```typescript
export const version = "1.0.0"
export function createKansoku() {}
export const SESSION_START = "session_start"
```

Cases: a bundle with the same three exports passes with `exports` equal to
`["SESSION_START", "createKansoku", "version"]`; the BUG-1 shape,
`const e="session_start";export{K as version,j as createKansoku,e as SESSION_START}`, fails with
a problem starting `bundle cannot be imported`; a bundle without `createKansoku` reports it as
missing; a bundle exporting an extra `debug` reports it as extra; a bundle where
`createKansoku` is the string `"x"` reports `createKansoku: source function, bundle string`.

### Milestone 2: package smoke, documentation and BUG-1 closure

At the end of this milestone, `just check` exercises the built kansoku-js bundle against a stub
server, the documentation states the bun floor, and BUG-1 records the fix. Acceptance is a
passing `just ci` whose output includes `accepted: 3`, and passing strict ADR and bug-report
validation.

In the `justfile`, add a recipe `package-smoke: build` that runs
`bun packages/kansoku-js/scripts/smoke.ts`, and add `package-smoke` to `check` after
`ssr-smoke`. kansoku-react has no smoke script and needs none; its bundle is covered by the
verification in milestone 1 and by `just test-smoke`.

In `README.md`, after the paragraph that begins "Run `just check` and `just test`", add one
sentence saying that building requires bun 1.4.2 or later, which `nix develop` provides, and
that `scripts/build.ts` refuses older versions because of BUG-1, linked to the bug report. In
`docs/guides/getting-started.md`, in the paragraph beginning "After npm publication", add a
sentence for consumers who bundle the SDK from source before publication: use bun 1.4.2 or
later, because bun 1.3 produces a `kansoku-js` bundle without `createKansoku`.

Amend ADR-6 (`docs/adr/0006-two-browser-packages-and-esm-distribution.md`). In Decision, add
that builds require bun `>=1.4.2`, declared as `engines.bun` in the root `package.json` and
enforced by `scripts/build.ts`, and that the build imports each bundle and compares its runtime
exports with the source entry before it reports success. In Consequences, note that bun older
than 1.4.2 is unsupported for building and why (BUG-1). Advance `timestamp` to the time of the
edit and record it with
`okf log add docs/adr ADR-6 -m "<one sentence>"`.

Close BUG-1 in `docs/bug-reports/bun-1-3-drops-entry-named-reexports.md`: set `status: fixed`,
add `fixedVersion: unreleased`, and add a `resolution` such as "This repository requires bun
1.4.2 or later, which bundles the entry correctly; scripts/build.ts refuses older bun and
verifies each bundle's exports against its source entry, and `just check` runs the package
smoke (docs/plans/9-guard-sdk-builds-against-incomplete-bundles-and-require-bun-1-4-2.md)."
Leave the report's original observation fields unchanged; they record what was observed.
Record the change with `okf log add docs/bug-reports BUG-1 --kind Update -m "<one sentence>"`.
The workaround in `mori://tan/tan-ng-labs` (a wrapper entry) belongs to that repository and is
not changed by this plan.


## Concrete Steps

Run everything from the repository root inside `nix develop`.

Milestone 1, after the edits:

```bash
bun test test/scripts
just build
```

Expected tail of `just build`:

```text
kansoku-js: dist/index.js, dist/index.js.map, dist/index.d.ts
exports: 14 verified
kansoku-react: dist/index.js, dist/index.js.map, dist/index.d.ts
banner: "use client";
exports: 10 verified
```

Then confirm the floor with bun 1.3.13, taken from the nixpkgs that `mori://shinzui/kansoku`
pins (its checkout is found with `mori registry show shinzui/kansoku --full`):

```bash
nix shell --inputs-from <kansoku checkout> nixpkgs#bun -c bun --version
nix shell --inputs-from <kansoku checkout> nixpkgs#bun -c bun scripts/build.ts packages/kansoku-js; echo "exit=$?"
```

Expected: `1.3.13`, then the two-line refusal message and `exit=1`, with `packages/kansoku-js/dist`
left as it was. Then produce the real broken artifact with the 1.3.13 CLI and check that the
verifier, run under 1.4.2, rejects it:

```bash
nix shell --inputs-from <kansoku checkout> nixpkgs#bun -c bun build packages/kansoku-js/src/index.ts --target=browser --format=esm --minify --outfile="$TMPDIR/kansoku-1.3.13.js"
bun scripts/verify-bundle.ts "$TMPDIR/kansoku-1.3.13.js" packages/kansoku-js/src/index.ts; echo "exit=$?"
```

Expected: a line starting `bundle cannot be imported` and `exit=1`. For contrast,
`bun scripts/verify-bundle.ts packages/kansoku-js/dist/index.js packages/kansoku-js/src/index.ts`
prints `exports: 14 verified` and exits 0.

Milestone 2, after the edits:

```bash
just package-smoke
just ci
```

`just package-smoke` ends with `accepted: 3`. `just ci` exits 0 and its output contains
`exports: 14 verified`, `accepted: 3`, and the strict ADR and bug-report validations passing.

Commit each milestone separately with Conventional Commits messages and the trailers

```text
ExecPlan: docs/plans/9-guard-sdk-builds-against-incomplete-bundles-and-require-bun-1-4-2.md
Intention: intention_01m4ymqn7xe1a8tz8v7r78e34y
```


## Validation and Acceptance

Milestone 1 is accepted when all of the following hold. `bun test test/scripts` passes its five
cases. `just build` under bun 1.4.2 prints `exports: 14 verified` and `exports: 10 verified`
and exits 0. `bun scripts/build.ts packages/kansoku-js` under bun 1.3.13 prints the refusal
and exits 1 without touching `dist`. `scripts/verify-bundle.ts` exits 1 on the 604-byte bun
1.3.13 bundle and 0 on the bun 1.4.2 bundle. `bun test` as a whole still passes.

Milestone 2 is accepted when `just ci` exits 0 with `accepted: 3` in its output, and
`just adr-check` and `just bug-report-check` pass with ADR-6's new timestamp and BUG-1 at
`status: fixed`.

Verifying that the build fails on a broken bundle under bun 1.4.2 itself is not possible with
real input, because 1.4.2 does not produce one; the unit tests and the 1.3.13 artifact check
together stand in for that. Testing bun 1.4.0 and 1.4.1 is out of scope.


## Idempotence and Recovery

Every step can be repeated. `scripts/build.ts` deletes `dist` before bundling, so a failed
verification leaves a `dist/index.js` that should not be used; rerunning the build replaces
it. The version check runs before the deletion, so a refused build leaves `dist` untouched. The
unit tests create and remove their own temporary directories. `okf log add` appends an entry
each time it runs, so run it once per change; if it is run twice, delete the duplicate entry
from the relevant `log.md` before committing. To roll back, revert the milestone commits.


## Interfaces and Dependencies

No new dependencies. The work uses bun's built-ins `Bun.version`, `Bun.semver.satisfies` and
`Bun.build`, and Node's `node:url` `pathToFileURL`, `node:path` and `node:fs/promises`.

`scripts/verify-bundle.ts` exports:

```typescript
export type BundleVerification = { exports: string[]; problems: string[] }
export async function verifyBundle(
  bundlePath: string,
  sourcePath: string,
): Promise<BundleVerification>
```

`scripts/build.ts` keeps its command-line interface (`bun scripts/build.ts <package-dir>`) and
its output files. Its new contract is that it exits non-zero when bun does not satisfy the root
`package.json` `engines.bun` range, and when `dist/index.js` does not reproduce the runtime
exports of `src/index.ts`. The `just build`, `just check` and `just ci` recipes keep their
names; `check` gains `package-smoke`.

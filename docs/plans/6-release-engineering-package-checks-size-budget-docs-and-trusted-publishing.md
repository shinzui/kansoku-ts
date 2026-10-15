---
id: 6
slug: release-engineering-package-checks-size-budget-docs-and-trusted-publishing
title: "Release engineering: package checks, size budget, docs, and trusted publishing"
kind: exec-plan
created_at: 2026-10-15T02:11:18Z
intention: "intention_01m4ymqn7xe1a8tz8v7r78e34y"
master_plan: "docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md"
provenance:
  created_by:
    model: "claude-fable-5-1"
    harness: "claude-code"
    at: 2026-10-15T02:11:18Z
---

# Release engineering: package checks, size budget, docs, and trusted publishing

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.


## Purpose / Big Picture

This repository, `kansoku-ts`, builds two npm packages for the Kansoku analytics service:
`kansoku-js`, a browser client that records page views, sessions, identity, and custom events
and delivers them to a Kansoku server, and `kansoku-react`, a thin React binding over it. Other
plans build the code. This plan makes the two packages *publishable* and *published*: a reader
who clones the repository can prove in one command that each package has a correct export map,
correct TypeScript declarations for both module systems, and a gzip size under a published
budget; a pull request shows exactly which files a release would contain; a push to `master`
with a pending changeset versions both packages in lockstep, writes their changelogs, and
publishes them to npm from GitHub Actions without any long-lived secret, with provenance
attestations that link each tarball to the workflow run that built it; and a developer who
has never seen Kansoku can read the package READMEs and `docs/guides/` and send their first
event.

After this plan is complete, these commands succeed from the repository root (first two) and
from anywhere (last two):

```bash
just check            # typecheck, lint, format, contracts, build, publint, attw, size budget
bunx changeset status # shows pending releases for kansoku-js and kansoku-react
npm view kansoku-js version      # 0.1.0
npm view kansoku-react version   # 0.1.0
```

The first three milestones depend only on the workspace that `docs/plans/1-workspace-foundation-vendored-kansoku-contracts-and-generated-wire-types.md`
(EP-1) creates and can be completed while the packages are still stubs. The fourth milestone,
the first public release, is gated on
`docs/plans/5-examples-live-contract-conformance-and-real-browser-smoke-test.md` (EP-5) being
Complete and on the user's explicit go-ahead, because publishing to npm is an outward-facing,
effectively irreversible action (npm allows unpublishing only within a narrow window and never
allows reusing a version number).


## Progress

- [ ] M1: `just check` runs `publint` and `@arethetypeswrong/cli` against both built packages
  with zero problems and `scripts/check-size.ts` reports gzip sizes under budget
  (`kansoku-js` ≤ 10 KiB, `kansoku-react` ≤ 3 KiB); CI runs the same recipe.
- [ ] M2: changesets configured with a fixed group, both manifests carry `repository` metadata,
  `.github/workflows/release.yml` exists with OIDC permissions, and a pull request's CI shows a
  green `npm pack` listing and `npm publish --dry-run` for both packages.
- [ ] M3: the maintainer's chosen license is committed as a root `LICENSE` file and declared in
  both manifests (publint rerun green); package READMEs, `docs/README.md`,
  `docs/guides/getting-started.md`, `docs/guides/react.md`, and
  `docs/guides/delivery-and-privacy.md` exist and are registered in `mori.dhall`
  (`mori validate` passes); the lockstep-versioning ADR exists and the ADR distillation pass
  over the five MasterPlan candidates is recorded in `docs/adr/`.
- [ ] M4: every item of the publish-preconditions checklist (Plan of Work, Milestone 4) was
  confirmed with the user before any publish command ran; `kansoku-js@0.1.0` and
  `kansoku-react@0.1.0` are live on npm (`npm view` shows `0.1.0`), a scratch Bun project
  outside the repository installs both and imports them, and the cross-repository handoff list
  for the server maintainers is recorded in this plan.


## Surprises & Discoveries

(None yet.)


## Decision Log

- Decision: Verify the published package shape with `publint` and `@arethetypeswrong/cli`
  against the *packed tarball* (`attw --pack`), not against the source tree, and make both part
  of `just check` so a broken export map fails locally before it fails on npm.
  Rationale: The export map, `.d.ts`/`.d.cts` pair, and `files` whitelist are exactly the things
  a unit test cannot see; both tools inspect what a consumer would install.
  Date: 2026-10-14

- Decision: Enforce gzip size budgets in a repository script (`scripts/check-size.ts`) that
  fails `just check`, with budgets `kansoku-js` ≤ 10 KiB and `kansoku-react` ≤ 3 KiB measured
  on `dist/index.js`. Budgets are raised only with a Decision Log entry in the plan that needs
  the increase.
  Rationale: A browser SDK's main cost to its host is bundle weight. The reference SDKs this
  initiative follows all publish a budget; enforcing it in CI keeps it honest.
  Date: 2026-10-14

- Decision: Version both packages in a changesets *fixed group* and express `kansoku-react`'s
  peer dependency on `kansoku-js` as a concrete range (`^0.1.0`) that changesets updates in
  lockstep, instead of the `workspace:^` protocol.
  Rationale: `changeset publish` invokes `npm publish`, which does not rewrite the `workspace:`
  protocol, and `bun publish` (which does) cannot generate provenance. A fixed group keeps both
  versions equal, so the concrete range always matches the local workspace package for Bun's
  linker and the published version for consumers.
  Date: 2026-10-14

- Decision: Publish with `npm publish` under npm trusted publishing (OpenID Connect from GitHub
  Actions) rather than `bun publish` or a stored `NPM_TOKEN`.
  Rationale: Bun's own documentation states `bun publish` cannot generate provenance
  statements and does not document OIDC support; npm's trusted publishing removes long-lived
  tokens and attaches provenance automatically for public repositories.
  Date: 2026-10-14

- Decision: Bootstrap the very first publish of each package name manually (interactive
  `npm publish` by the maintainer with two-factor authentication), then register the trusted
  publisher for each package and let every later release flow through the workflow. The
  MasterPlan records this split: first publish manual, every later release through trusted
  publishing.
  Rationale: npm's trusted-publisher configuration lives in an existing package's settings page
  and the official documentation does not describe pre-registering a name that has never been
  published; community guides consistently report that the first publish must be manual. The
  alternative, a granular access token that can create packages, is a secret that would outlive
  its single use.
  Date: 2026-10-14

- Decision: The package license is the maintainer's choice, made during M3 and never by the
  implementer. The scaffold leaves both manifests effectively `UNLICENSED`; the server's
  initial specification frames Kansoku as an open-source project, so an open-source license is
  expected, but which one is asked, not assumed. Until it is chosen and committed, no publish
  may run.
  Rationale: A license is a legal commitment that outlives any plan; npm shows it on the
  package page and consumers' compliance tooling reads the `license` field.
  Date: 2026-10-14


## Outcomes & Retrospective

(To be filled during and after implementation.)


## Context and Orientation

### What this repository looks like when you start

You begin after EP-1 is complete. The repository root holds a private `package.json` whose
`"workspaces"` field lists `packages/*` and `examples/*`; Bun 1.4.2 installs and links them. The
two publishable packages are `packages/kansoku-js` and `packages/kansoku-react`. Each has its own
`package.json`, a `src/` directory (exporting at least a `version` constant after EP-1; the real
client after EP-2 through EP-4), a `test/` directory, a `tsconfig.json` for type-checking, and a
`tsconfig.build.json` used only for declaration emit. The shared build script
`scripts/build.ts <package-dir>` produces, inside `<package-dir>/dist/`, an ESM bundle
`index.js`, a CommonJS bundle `index.cjs`, linked source maps, the TypeScript declaration file
`index.d.ts` emitted by `tsc`, and a copy of it named `index.d.cts` so CommonJS consumers
resolve declarations too. The dev shell (enter it with `nix develop`, or let `direnv` do it)
provides `bun`, `tsc` (TypeScript 7.0.2), `oxlint`, `oxfmt`, `just`, `node` 22, and `npm`
10.9.9. `just --list` shows the recipes; `just check` is the aggregate check EP-1 defined
(typecheck, lint, format check, contract regeneration check, build), and `.github/workflows/ci.yml`
runs it on pull requests and pushes.

Each package manifest already declares `"type": "module"`, `"sideEffects": false`, a `"files"`
whitelist of `dist`, `README.md`, and `CHANGELOG.md`, and this export map:

```json
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./package.json": "./package.json"
  },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

Documentation lives under `docs/`: `docs/masterplans/` (the coordinating MasterPlan for this
initiative), `docs/plans/` (this and its sibling ExecPlans), and `docs/adr/` (Architecture
Decision Records, installed by EP-1 with the shared OKF profile at `docs/adr/profile.dhall`,
plus the reserved `index.md` and `log.md`). `mori.dhall` at the root is the project manifest
for Mori, the portfolio's project registry; it already declares both packages and will gain
`docs` entries in this plan. The Kansoku server itself is a separate repository, registered in
Mori as `mori://shinzui/kansoku`; its producer guides are the style reference for the
documentation written here (artifact-level Mori URIs for those guides are pending; they are at
`docs/guides/send-events.md` and `docs/guides/haskell-sdk.md` inside that project).

### Terms used in this plan

**publint** is a command-line tool (version 0.3.25 here) that reads a package's `package.json`
and files and reports mistakes in the export map, `main`/`module`/`types` fields, `files`
whitelist, and module-format consistency, the way a consumer's bundler or Node would hit them.
**Are the types wrong** (`@arethetypeswrong/cli`, version 0.18.5, binary `attw`) packs a
package the way `npm publish` would and resolves its TypeScript declarations under every
resolution mode (`node10`, `node16` CommonJS and ESM, `bundler`), reporting problems such as
"masquerading as ESM" when a CommonJS entry is paired with an ESM-only declaration file. A
**size budget** is a maximum compressed size for a built artifact that a check enforces;
`gzip` is the compression browsers negotiate by default, so gzip size approximates what a page
downloads. **Changesets** is a release tool: a *changeset* is a small Markdown file under
`.changeset/` naming the packages a change affects and the bump each needs (`patch`, `minor`,
`major`); `changeset version` consumes pending changesets, bumps `package.json` versions, and
writes `CHANGELOG.md` entries; `changeset publish` publishes every package whose current version
is not yet on the registry. A **fixed group** is a changesets setting that forces the listed
packages to always share one version number. **Trusted publishing** is npm's tokenless publish
flow: the GitHub Actions runner requests a short-lived **OIDC** (OpenID Connect) identity token
from GitHub, `npm` exchanges it with the registry, and the registry accepts the publish only if
the token's repository, workflow filename, and optional environment match the *trusted
publisher* configured for that package on npmjs.com. **Provenance** is a signed attestation
npm records with a published version stating which repository, commit, and workflow run built
it; consumers see it on the package page and can verify it with `npm audit signatures`. A
**dry-run publish** (`npm publish --dry-run`) performs every local step of publishing,
including packing the tarball and printing its contents, without contacting the registry's
publish endpoint. A **dist-tag** is a named pointer such as `latest` to a published version. A
**peer dependency** is a package the consumer must install alongside yours rather than one you
bundle; `kansoku-react` peer-depends on `kansoku-js` and on `react`.

### What the npm documentation says, and what it does not

Verified on 2026-10-14 against npm's official documentation pages for trusted publishers and
provenance statements. Trusted publishing requires npm CLI 11.5.1 or later and Node 22.14.0
or later; the dev shell's Node 22 ships npm 10.9.9, so the workflow must upgrade npm before
publishing. The workflow needs the `id-token: write` permission ("the critical requirement").
The trusted publisher is configured on npmjs.com under the package's Settings in a "Trusted
publishing" section by choosing GitHub Actions and entering the organization or user
(`shinzui`), the repository (`kansoku-ts`), the workflow filename only (`release.yml`, not the
full path; it must exist under `.github/workflows/`), and an optional environment name; fields
are case-sensitive and npm does not validate them when saved, only at publish time. The
`repository.url` in `package.json` must exactly match the repository. A new trusted-publisher
configuration expires if it has not completed a successful publish within two days. When
publishing through trusted publishing from a public repository for a public package,
provenance is generated automatically and the `--provenance` flag is unnecessary; passing it
is harmless, and provenance can be disabled with `NPM_CONFIG_PROVENANCE=false`. Provenance
requires the repository to be public: `kansoku-ts` was created private, so the maintainer must
make it public before the first provenance-bearing publish or disable provenance.

The documentation does **not** say whether a trusted publisher can be configured for a package
name that has never been published. It describes configuration only through an existing
package's settings page, and community release guides consistently report that the first
version must be published manually before trusted publishing can be enabled. This plan
therefore treats the first publish as a manual bootstrap (Decision Log). If, at
implementation time, npmjs.com offers a way to register a trusted publisher for a new name,
record that in Surprises & Discoveries and skip the manual step.

Bun's documentation for `bun publish` (checked the same day) states it "cannot generate
provenance statements yet" and errors on any provenance setting; it does not document OIDC
trusted publishing. The release workflow therefore uses `npm publish` exclusively.

### Architecture Decision Records

Local ADRs live in `docs/adr/` under the shared architecture-decision profile. Follow
`agents/skills/exec-plan/ADR.md` when creating records: allocate the next handle with `okf id
next docs/adr --profile docs/adr/profile.dhall ADR`, never by counting files; add a `log.md`
entry with `okf log add`; and run strict validation (shown in Concrete Steps). This plan creates
one ADR, "Lockstep versioning and trusted publishing", and performs the MasterPlan's final
distillation pass. The MasterPlan names five decisions that deserve records; during M3 check
which exist and create the missing ones:

1. Two publishable packages with no separate core package, keeping `kansoku-js`'s core
   modules free of DOM globals at module scope (MasterPlan Decision Log; no child plan is
   assigned to write it, so M3 writes it if absent).
2. Contract vendoring and refresh policy for the server's OpenAPI document and schema catalog
   (assigned to EP-1).
3. Delivery semantics and exit transport: batch-only delivery, retry classes, 413 splitting,
   keepalive `fetch` instead of `sendBeacon` (assigned to EP-2).
4. Identity and session persistence policy: storage keys, inactivity timeout, `reset`
   behaviour (assigned to EP-2).
5. Lockstep versioning and trusted publishing (this plan).

The only server ADR this plan cites is `mori://shinzui/kansoku/okf/adrs/concepts/ADR-1`
(SDK-grade ingest contract boundaries), because `docs/guides/delivery-and-privacy.md` restates
its delivery semantics: HTTP 202 ends a delivery attempt, rejected events are never retried,
HTTP 413 is permanent for that request and the client must split or shrink, and CORS is open
on `/v1/*` with `Content-Type`, `X-Api-Key`, and `Authorization` pre-approved. Use the exact
URI above when citing it; do not paraphrase it into a path.


## Plan of Work

### Milestone 1 — Package-shape checks and size budget

Scope: after this milestone, `just check` fails when either package's export map, declaration
files, or `files` whitelist would break a consumer, or when a built bundle exceeds its gzip
budget. Add `publint` and `@arethetypeswrong/cli` as root dev dependencies at the exact
versions named above. Add a `just check-packages` recipe that builds both packages (reusing
EP-1's `just build`) and then runs `bunx publint packages/kansoku-js`, `bunx publint
packages/kansoku-react`, `bunx attw --pack packages/kansoku-js`, and `bunx attw --pack
packages/kansoku-react`; `attw` must report no problems in any resolution mode and `publint`
must print "All good!". Write `scripts/check-size.ts`: it reads each package's
`dist/index.js`, compresses it with `Bun.gzipSync`, prints a small table of raw and gzip bytes
per package, compares against a budget map (`kansoku-js`: 10240 bytes, `kansoku-react`: 3072
bytes), and exits non-zero naming the offender when a budget is exceeded. Expose it as `just
check-size`. Extend the `check` recipe so it depends on `check-packages` and `check-size` after
the existing steps, and confirm `.github/workflows/ci.yml` still runs `just check` so CI
inherits the new gates. Keep the generated `src/generated/schema.ts` out of the size
measurement (it is type-only and erased by the bundler; if it survives into `dist/index.js`,
that is a bundling bug to fix in EP-1's script, not a budget to raise).

### Milestone 2 — Changesets, repository metadata, release workflow, and dry run

Scope: after this milestone, a pull request shows exactly what a release would publish, and a
push to `master` can version and publish without any stored npm secret. Install
`@changesets/cli` at the pinned version, run `bunx changeset init`, and edit
`.changeset/config.json` to set `"baseBranch": "master"`, `"access": "public"`,
`"fixed": [["kansoku-js", "kansoku-react"]]`, `"updateInternalDependencies": "patch"`, and
`"privatePackages": { "version": false, "tag": false }` so the private root and example
packages are never versioned. Set both package versions to `0.0.0` and add
`.changeset/initial-release.md` declaring a `minor` bump for both packages with a one-line
summary, so that `changeset version` yields `0.1.0` and a generated `CHANGELOG.md` in each
package (if EP-1 left the manifests at `0.1.0`, lower them; the changeset is the source of
truth for the first version). Change `kansoku-react`'s `peerDependencies` entry for `kansoku-js`
from `workspace:^` to `^0.0.0`; after `changeset version` runs it reads `^0.1.0`, and Bun's
workspace linker still resolves it to the local package because the fixed group keeps the
versions equal. Add to both manifests `"repository": { "type": "git", "url":
"git+https://github.com/shinzui/kansoku-ts.git", "directory": "packages/<name>" }`,
`"homepage"`, and `"keywords"`. Leave the `license` field alone in this milestone; Milestone 3
sets it once the maintainer has chosen a license. Do not add `publishConfig.provenance`;
provenance is controlled by the workflow environment so local dry runs and Bun tooling keep
working.

Create `.github/workflows/release.yml`. It triggers on `push` to `master`, grants
`permissions: { contents: write, pull-requests: write, id-token: write }`, checks out with
full history, installs Bun (`oven-sh/setup-bun`) and Node 24 (`actions/setup-node@v6`, whose
bundled npm is 11.x; the job still runs `npm install -g npm@latest` and asserts `npm --version`
is at least 11.5.1 with a small shell check), runs `bun install --frozen-lockfile`, `just
check`, and then `changesets/action@v1` with `version: bunx changeset version` and
`publish: bun run release`, where the root `release` script is `bun run build && bunx changeset
publish`. The action opens or updates a "Version Packages" pull request while changesets are
pending and runs the publish command once that pull request has merged and the versions are
unpublished. Set `NPM_CONFIG_PROVENANCE: "true"` in the publish step's environment. Do not set
`NPM_TOKEN`; at implementation time confirm that the pinned `changesets/action` release does
not require it when OIDC is available (its changelog documents trusted-publishing support).
If it does, replace the action's publish step with an explicit step that runs `bun run release`
only when `bunx changeset status --output` reports no pending changesets, and record the
substitution in the Decision Log.

Extend `.github/workflows/ci.yml` (pull requests) with a "release dry run" job that builds,
then for each package runs `npm pack --dry-run --json` and `npm publish --dry-run --access
public` from the package directory and uploads the printed file listings as a job summary. A
reviewer can then see, on every pull request, the exact tarball contents. Run the same two
commands locally to confirm they need no registry login.

### Milestone 3 — License, documentation, Mori docs entries, and the ADR distillation pass

Scope: after this milestone both packages carry the maintainer's chosen license, a newcomer
can adopt either package from the READMEs and guides alone, Mori lists the guides, and the
durable decisions of the whole initiative are recorded as ADRs.

Start with the license, because the READMEs and the npm package pages display it. Both package
manifests currently inherit the scaffold's effectively `UNLICENSED` state, while the Kansoku
server's `docs/initial-spec.md` (in `mori://shinzui/kansoku`) frames Kansoku as an open-source
project. Ask the maintainer which license to use; present the common open-source options (MIT,
Apache-2.0, BSD-3-Clause, MPL-2.0) and whatever the server repository itself uses as the
default suggestion, but do not pick one. Once chosen, add a root `LICENSE` file with the full
license text and the copyright line the maintainer specifies, set `"license"` in
`packages/kansoku-js/package.json` and `packages/kansoku-react/package.json` to the matching
SPDX identifier, copy `LICENSE` into each package directory (npm includes a root-level
`LICENSE` file in a package automatically only when it sits in the *package* directory, so the
copy is required) and add `LICENSE` to each manifest's `files` whitelist, then rerun `just
check-packages` so publint confirms the field and the file. Record the chosen license in the
Decision Log of this plan.

Then write the documentation. Read the server's `docs/guides/send-events.md` and
`docs/guides/haskell-sdk.md` in the sibling checkout (`../kansoku`) first and match their
register: short declarative paragraphs,
one fenced example per concept, exact field names, a "Documentation index" link at the bottom,
no marketing. Write `packages/kansoku-js/README.md` covering installation, a five-line quick
start, the full `KansokuOptions` and `KansokuClient` reference as documented in the MasterPlan's
Integration Points (copy the final signatures from `packages/kansoku-js/src/types.ts` at the time
of writing, since EP-2 and EP-3 own them), delivery semantics (batch endpoint, 202 partial
acceptance, which responses are retried, 413 splitting, exit flush with keepalive `fetch`),
privacy (no PII captured by default, `beforeSend`, `respectDoNotTrack`, `optOut`/`optIn`, what
`reset` clears), the storage keys under the default prefix, schema version pinning with
`schemaVersions` and `TrackOptions.schemaVersion`, and troubleshooting for HTTP 401 (wrong or
revoked write key), HTTP 413 (batch or event too large), and CORS failures (server
`KANSOKU_CORS_ORIGINS` allowlist). Write `packages/kansoku-react/README.md` covering
installation with the peer dependencies, `KansokuProvider` in both forms (existing client or
options), every hook with a short example, server-side rendering behaviour, StrictMode and
exposure dedupe, and the rule that `usePageView` requires `autocapture.pageViews: false`. Write
`docs/README.md` as an index, `docs/guides/getting-started.md` (run the server from the sibling
checkout with its documented `just up`, `just migrate`, `just ch-migrate`, `just issue-key
write`, and `just run` steps, then send one `page_view` from a static HTML page and read it back
with `curl` against `/metrics/page-views` using a service token), `docs/guides/react.md`, and
`docs/guides/delivery-and-privacy.md` (the contract restatement that cites
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-1`). Register the guides and both READMEs in
`mori.dhall` under `docs` using `Schema.DocRef::{ key, kind = Schema.DocKind.Guide, audience =
Schema.DocAudience.User, location = Schema.DocLocation.LocalFile "docs/guides/…" }` (READMEs use
`DocKind.Reference`), then run `mori validate` and `mori register` so `mori registry docs
shinzui/kansoku-ts` lists them.

Then perform the ADR work. Create the "Lockstep versioning and trusted publishing" record with
the handle `okf id next` allocates, capturing the fixed group, the concrete peer range instead
of `workspace:`, `npm publish` over `bun publish`, the manual bootstrap of first publishes, and
the public-repository requirement for provenance. Run the distillation pass: list the five
candidates from Context and Orientation, open `docs/adr/`, and for each candidate either confirm
an existing record covers it or create it from the Decision Log and Surprises & Discoveries of
the owning plan and the MasterPlan. Update `docs/adr/index.md` if the profile requires a
manual index, add `log.md` entries, and run strict validation.

### Milestone 4 — First publish of 0.1.0

Scope: both packages are live on npm and verified from a clean consumer. Publishing is
outward-facing and cannot be undone cleanly, so the implementer confirms every item of the
following checklist with the user, in this session, before running any publish command, and
does not proceed on an inferred approval. The MasterPlan records the release model this
checklist implements: the first publish of each package name is manual, and every later release
goes through trusted publishing from `release.yml`.

Publish-preconditions checklist, each item confirmed with the user and its evidence noted in
Progress:

1. EP-5 (`docs/plans/5-examples-live-contract-conformance-and-real-browser-smoke-test.md`) is
   marked Complete in the MasterPlan registry, and the MasterPlan's cross-plan gate "vendored
   contract drift guard green against a live server at the pinned commit" is checked.
2. The license has been chosen by the maintainer and is committed: root `LICENSE`, per-package
   `LICENSE` copies, `license` fields and `files` entries in both manifests (Milestone 3).
3. The repository-visibility decision has been taken: either the GitHub repository
   `shinzui/kansoku-ts` is public, so npm attaches provenance automatically, or it stays private
   and the release workflow sets `NPM_CONFIG_PROVENANCE` to `"false"`, with that trade-off (no
   provenance attestations until the repository is public) recorded in the lockstep-versioning
   ADR.
4. The maintainer has completed the first manual publish of each package name with two-factor
   authentication (the bootstrap described below), because trusted publishers can only be
   registered on an existing package.
5. Trusted publishers are registered on npmjs.com for both `kansoku-js` and `kansoku-react`
   with the exact values user `shinzui`, repository `kansoku-ts`, workflow filename
   `release.yml` (filename only, case-sensitive), and no environment.

Items 4 and 5 are completed by the maintainer during this milestone, not before it; the
checklist is confirmed in two passes, items 1–3 before the bootstrap publish and items 4–5
before the first workflow release.

Sequence: merge the "Version Packages" pull request so `master` carries `0.1.0` in both
manifests and changelogs. Confirm items 1–3. Because the names have never been published, the
maintainer runs the bootstrap publish interactively from a clean `master` checkout inside the
dev shell: `bun install --frozen-lockfile`, `just check`, `npm login` (web flow, two-factor),
then from each package directory `npm publish --access public` (no provenance is possible from
a laptop). Immediately afterwards the maintainer configures the trusted publisher for each
package on npmjs.com with the values in item 5. Confirm items 4 and 5 and record the exact
date and the two npm package URLs in Progress. The release workflow's first automatic run
happens with the next changeset; verify at that point that the published version shows a
provenance badge (if the repository is public) and that `npm audit signatures` passes in a
consumer project, and record that evidence here as well. Then verify `0.1.0` from a scratch
project outside the repository and write the cross-repository handoff list (Concrete Steps)
into this plan's Outcomes section.


## Concrete Steps

All commands run inside the dev shell (`nix develop`, or `direnv allow` once). Working
directories are stated per block.

### M1 — checks

From the repository root:

```bash
bun add -d publint@0.3.25 @arethetypeswrong/cli@0.18.5
just build
bunx publint packages/kansoku-js
bunx publint packages/kansoku-react
bunx attw --pack packages/kansoku-js
bunx attw --pack packages/kansoku-react
```

Expected `publint` output for each package:

```text
packages/kansoku-js
All good!
```

Expected `attw` output ends with a table in which every cell for `node10`, `node16 (from CJS)`,
`node16 (from ESM)`, and `bundler` shows a check mark and the summary line reports no problems.
A "Masquerading as ESM" or "Masquerading as CJS" cell means the `.d.cts` copy or the `require`
condition is wrong; fix the build script or export map rather than ignoring the check.

Create `scripts/check-size.ts`:

```typescript
#!/usr/bin/env bun
import { gzipSync } from "bun"

const budgets: Record<string, number> = {
  "kansoku-js": 10 * 1024,
  "kansoku-react": 3 * 1024,
}

let failed = false
console.log("package          raw      gzip     budget")
for (const [name, budget] of Object.entries(budgets)) {
  const file = Bun.file(`packages/${name}/dist/index.js`)
  if (!(await file.exists())) {
    console.error(`${name}: packages/${name}/dist/index.js is missing; run 'just build' first`)
    process.exit(2)
  }
  const raw = new Uint8Array(await file.arrayBuffer())
  const gz = gzipSync(raw).byteLength
  const over = gz > budget
  if (over) failed = true
  console.log(
    `${name.padEnd(16)} ${String(raw.byteLength).padStart(7)} ${String(gz).padStart(8)} ${String(budget).padStart(8)} ${over ? "OVER BUDGET" : "ok"}`,
  )
}
if (failed) {
  console.error("size budget exceeded")
  process.exit(1)
}
```

Add recipes to `justfile`:

```just
# Verify published package shape (publint + are-the-types-wrong) against packed tarballs
check-packages: build
    bunx publint packages/kansoku-js
    bunx publint packages/kansoku-react
    bunx attw --pack packages/kansoku-js
    bunx attw --pack packages/kansoku-react

# Enforce gzip size budgets on built bundles
check-size: build
    bun scripts/check-size.ts

# Run all checks: typecheck, lint, formatting, contracts, package shape, size budget
check: typecheck lint format-check check-contracts check-packages check-size
```

Expected `just check-size` output:

```text
package          raw      gzip     budget
kansoku-js         18731     6502    10240 ok
kansoku-react       4120     1388     3072 ok
```

The numbers will differ; what matters is `ok` on both lines and exit code 0. Confirm
`.github/workflows/ci.yml` invokes `just check` (if EP-1 listed individual recipes instead, add
`check-packages` and `check-size`).

### M2 — changesets, metadata, release workflow, dry run

From the repository root:

```bash
bun add -d @changesets/cli@3.0.3
bunx changeset init
```

Replace `.changeset/config.json` with:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.1.1/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [["kansoku-js", "kansoku-react"]],
  "linked": [],
  "access": "public",
  "baseBranch": "master",
  "updateInternalDependencies": "patch",
  "privatePackages": { "version": false, "tag": false },
  "ignore": []
}
```

Adjust the `$schema` version to the one `changeset init` wrote if it differs. Create
`.changeset/initial-release.md`:

```markdown
---
"kansoku-js": minor
"kansoku-react": minor
---

Initial release: browser client with page-view and session autocapture, identity helpers,
experiment exposure, batched delivery with retries and exit flush; React provider and hooks.
```

Edit both `packages/*/package.json`: set `"version": "0.0.0"`, add the `repository`,
`license`, `homepage` (`https://github.com/shinzui/kansoku-ts#readme`), and `keywords`
(`analytics`, `kansoku`, `browser`, and for the React package `react`) fields, and in
`packages/kansoku-react/package.json` set `"peerDependencies": { "kansoku-js": "^0.0.0",
"react": "^18 || ^19" }` (keep `kansoku-js` also in `devDependencies` as `workspace:*` for
tests). Add the root script `"release": "bun run build && bunx changeset publish"`. Then:

```bash
bun install
bunx changeset status --verbose
```

Expected output names both packages with a `minor` bump to `0.1.0` under one fixed group. Do
not run `changeset version` locally; the workflow's "Version Packages" pull request does it.

Create `.github/workflows/release.yml`:

```yaml
name: release
on:
  push:
    branches: [master]
concurrency: release-${{ github.ref }}
permissions:
  contents: write
  pull-requests: write
  id-token: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          registry-url: https://registry.npmjs.org
      - name: Ensure npm supports trusted publishing
        run: |
          npm install -g npm@latest
          npm --version
          node -e 'const [a,b,c]=process.argv[1].split(".").map(Number); if (a<11||(a===11&&(b<5||(b===5&&c<1)))) { console.error("npm >= 11.5.1 required"); process.exit(1) }' "$(npm --version)"
      - run: bun install --frozen-lockfile
      - run: nix --version || true
      - run: bun run typecheck && bun run lint && bun run format:check
      - run: bun run build
      - uses: changesets/action@v1
        with:
          version: bunx changeset version
          publish: bun run release
          commit: "chore(release): version packages"
          title: "chore(release): version packages"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_PROVENANCE: "true"
```

Pin the action versions that exist at implementation time and note them in the Decision Log if
they differ from the above. The workflow runs the Bun/npm scripts directly instead of `just`
because the runner has no Nix; `ci.yml` from EP-1 is the authority on how CI enters the dev
shell, so mirror whichever approach it took (if it installs Nix and runs `nix develop -c just
check`, do the same here before the changesets step).

Add the dry-run job to `.github/workflows/ci.yml` (inside the existing workflow, after the
check job):

```yaml
  release-dry-run:
    runs-on: ubuntu-latest
    needs: check
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.4.2
      - uses: actions/setup-node@v6
        with:
          node-version: 24
      - run: bun install --frozen-lockfile
      - run: bun run build
      - name: Pack and dry-run publish
        run: |
          for p in kansoku-js kansoku-react; do
            echo "## $p" >> "$GITHUB_STEP_SUMMARY"
            (cd "packages/$p" && npm pack --dry-run --json | tee -a "$GITHUB_STEP_SUMMARY")
            (cd "packages/$p" && npm publish --dry-run --access public)
          done
```

Run the same commands locally from each package directory and confirm the tarball listing
contains only `dist/…`, `README.md`, `CHANGELOG.md`, and `package.json`:

```bash
cd packages/kansoku-js && npm pack --dry-run && npm publish --dry-run --access public
```

Expected excerpt:

```text
npm notice package: kansoku-js@0.0.0
npm notice Tarball Contents
npm notice 1.2kB README.md
npm notice 5.8kB dist/index.cjs
npm notice 3.1kB dist/index.d.cts
npm notice 3.1kB dist/index.d.ts
npm notice 5.4kB dist/index.js
npm notice 0.9kB package.json
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access (dry-run)
```

Open a pull request with M1 and M2 and confirm both CI jobs are green before marking M2.

### M3 — license, documentation, Mori docs, ADRs

License first. Ask the maintainer which license to use, then, with `<SPDX>` replaced by the
chosen identifier (for example `MIT` or `Apache-2.0`) and the license text saved to a root
`LICENSE` file, run from the repository root:

```bash
cp LICENSE packages/kansoku-js/LICENSE
cp LICENSE packages/kansoku-react/LICENSE
for p in kansoku-js kansoku-react; do
  bun -e "const f='packages/$p/package.json'; const j=await Bun.file(f).json(); j.license='<SPDX>'; j.files=[...new Set([...(j.files??[]),'LICENSE'])]; await Bun.write(f, JSON.stringify(j,null,2)+'\n')"
done
oxfmt --write packages/kansoku-js/package.json packages/kansoku-react/package.json
just check-packages
cd packages/kansoku-js && npm pack --dry-run 2>&1 | grep -E 'LICENSE|license' ; cd ../..
```

Expected: publint still prints "All good!" for both packages, and the `npm pack --dry-run`
listing now includes `LICENSE`. Record the chosen license in this plan's Decision Log.

Then write the documentation files listed in Plan of Work. Register them in `mori.dhall` by
adding a `docs` list to the project record, for example:

```dhall
    , docs =
      [ Schema.DocRef::{
        , key = "getting-started"
        , kind = Schema.DocKind.Guide
        , audience = Schema.DocAudience.User
        , description = Some "Run a local Kansoku server and send a first page view with kansoku-js"
        , location = Schema.DocLocation.LocalFile "docs/guides/getting-started.md"
        }
      , Schema.DocRef::{
        , key = "react"
        , kind = Schema.DocKind.Guide
        , audience = Schema.DocAudience.User
        , location = Schema.DocLocation.LocalFile "docs/guides/react.md"
        }
      , Schema.DocRef::{
        , key = "delivery-and-privacy"
        , kind = Schema.DocKind.Guide
        , audience = Schema.DocAudience.User
        , location = Schema.DocLocation.LocalFile "docs/guides/delivery-and-privacy.md"
        }
      , Schema.DocRef::{
        , key = "kansoku-js-readme"
        , kind = Schema.DocKind.Reference
        , audience = Schema.DocAudience.User
        , location = Schema.DocLocation.LocalFile "packages/kansoku-js/README.md"
        }
      , Schema.DocRef::{
        , key = "kansoku-react-readme"
        , kind = Schema.DocKind.Reference
        , audience = Schema.DocAudience.User
        , location = Schema.DocLocation.LocalFile "packages/kansoku-react/README.md"
        }
      ]
```

Then from the repository root:

```bash
mori validate
mori register
mori registry docs shinzui/kansoku-ts
```

Expected: "Configuration is valid." and a docs listing with the five entries.

ADR work, from the repository root:

```bash
okf id list docs/adr --profile docs/adr/profile.dhall
okf id next docs/adr --profile docs/adr/profile.dhall ADR
```

Create `docs/adr/<NNNN>-lockstep-versioning-and-trusted-publishing.md` with the frontmatter the
profile requires (`type: Architecture Decision Record`, `title`, `description`, `docId: ADR-N`
from `okf id next`, `status: Accepted`, `date`, `timestamp`) and the Context, Decision,
Alternatives considered, Consequences sections used by the server's ADRs. Repeat for any of the
other four candidates that no earlier plan created. Then:

```bash
okf log add docs/adr --profile docs/adr/profile.dhall --message "Add ADR-N lockstep versioning and trusted publishing"
okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce
```

Expected: validation reports zero errors. If EP-1 wired `okf validate` into `just check`, run
`just check` as well.

### M4 — first publish and verification

Only after items 1–3 of the publish-preconditions checklist (Plan of Work, Milestone 4) have
been confirmed with the user in this session. Before the first command below, restate the
checklist to the user and wait for an explicit "publish". From a clean `master` checkout in the
dev shell, after the "Version Packages" pull request has merged:

```bash
git pull --ff-only
bun install --frozen-lockfile
just check
npm login
cd packages/kansoku-js && npm publish --access public && cd ../..
cd packages/kansoku-react && npm publish --access public && cd ../..
```

Then on npmjs.com, for each package: Settings → Trusted publishing → Add trusted publisher →
GitHub Actions → user `shinzui`, repository `kansoku-ts`, workflow filename `release.yml`,
environment blank. Apply the repository-visibility decision from checklist item 3 (make the
GitHub repository public, or set `NPM_CONFIG_PROVENANCE: "false"` in `release.yml`). Confirm
checklist items 4 and 5 with the user and record them in Progress. Verify from any directory:

```bash
npm view kansoku-js version
npm view kansoku-react version
npm view kansoku-react peerDependencies
```

Expected:

```text
0.1.0
0.1.0
{ 'kansoku-js': '^0.1.0', react: '^18 || ^19' }
```

Consumer smoke test, in a fresh directory outside the repository (for example under the
session scratchpad):

```bash
mkdir kansoku-smoke && cd kansoku-smoke
bun init -y
bun add kansoku-js kansoku-react react
cat > smoke.ts <<'EOF'
import { createKansoku, version } from "kansoku-js"
import { KansokuProvider } from "kansoku-react"
console.log(version, typeof createKansoku, typeof KansokuProvider)
EOF
bun run smoke.ts
```

Expected: `0.1.0 function function`. Also confirm the CommonJS entry resolves:

```bash
node -e "const k = require('kansoku-js'); console.log(k.version)"
```

Expected: `0.1.0`. Record the cross-repository handoff list in Outcomes & Retrospective and
communicate it to the server maintainers: in `mori://shinzui/kansoku`, update
`docs/guides/send-events.md` and `docs/guides/haskell-sdk.md` to stop saying browser and React
SDKs are not shipped and link the two npm packages and this repository's guides; update
`docs/initial-spec.md` "Current Components" and "Later Scope" accordingly; file two improvement
requests, one for an `occurredAt` clock-skew tolerance (the server rejects any `occurredAt`
later than its own clock and exposes no server time to cross-origin clients), and one for a
beacon-friendly credential transport (credential in body or query) so browser SDKs could use
`navigator.sendBeacon` on page exit.


## Validation and Acceptance

M1 is accepted when `just check` exits 0 on a clean checkout with both packages built, the two
`publint` runs print "All good!", both `attw --pack` runs report no problems, `just check-size`
prints `ok` for both packages, and deliberately breaking the export map (for example renaming
`dist/index.d.cts` in a scratch copy) makes `attw` fail with a non-zero exit, proving the gate
is live. CI on a pull request must run the same recipe.

M2 is accepted when `bunx changeset status` lists both packages in one fixed group bumping to
`0.1.0`, `npm pack --dry-run` from each package directory lists exactly the whitelisted files,
`npm publish --dry-run --access public` succeeds without a login, the pull request's
`release-dry-run` job is green with the file listings in the job summary, and
`.github/workflows/release.yml` passes `actionlint` or GitHub's workflow validation (push it on
a branch and confirm the workflow file is accepted; it must not publish from a branch because
it triggers only on `master`).

M3 is accepted when a root `LICENSE` file and per-package copies exist, both manifests declare
the maintainer's chosen SPDX identifier in `license` and list `LICENSE` in `files`, `just
check-packages` is green after that change and `npm pack --dry-run` lists `LICENSE`, a reader
can follow `docs/guides/getting-started.md` end to end against a local server (this is
exercised by EP-5's examples; here, confirm every command in the guide exists and every file
path it names exists), `mori validate` and `mori registry docs shinzui/kansoku-ts` show the five
documents, the lockstep ADR exists with a handle allocated by `okf id next`, strict `okf
validate` passes, and each of the five candidate decisions is covered by a record in `docs/adr/`
(list the mapping in this plan's Outcomes).

M4 is accepted when the five-item publish-preconditions checklist is recorded in Progress with
the user's confirmation of each item, `npm view` returns `0.1.0` for both packages, the scratch
consumer prints `0.1.0 function function` under Bun and `0.1.0` under Node's `require`, the
trusted publisher is registered for both packages with workflow filename `release.yml`
(screenshot or the settings page text recorded as evidence in Progress), and the handoff list is
written into Outcomes & Retrospective. If the repository is public, the first automatic release
through `release.yml` (after the next changeset) must additionally show provenance on the npm
package page; record that evidence when it happens, even if after this plan is marked
complete.

Proposed, not required: a `size-limit`-style comment on pull requests showing the budget delta.
Do not add it without a scope decision.


## Idempotence and Recovery

Every M1–M3 step is safe to repeat: `bun add -d` with exact versions is a no-op when already
present, `just check` is read-only apart from `dist/` output, `changeset init` refuses to
overwrite an existing `.changeset/`, `mori register` re-registers idempotently, and `okf id
next` allocates a new handle only when you create a file with it. If `attw` or `publint` fail
after a build-script change, fix `scripts/build.ts` or the export map and rerun `just build`.
If a dry-run publish fails with an authentication error, it means the package directory
contains a `.npmrc` or the environment has `NPM_CONFIG_*` variables pointing at a registry that
requires auth even for dry runs; unset them and retry.

M4 is the risky step. A published version can never be re-published under the same number; if
`0.1.0` ships broken, publish `0.1.1` through the workflow rather than attempting `npm
unpublish` (allowed only within 72 hours and only when no other package depends on it). If the
manual bootstrap publishes `kansoku-js` but `kansoku-react` fails (for example because the peer
range does not match), fix and publish `kansoku-react` only; do not bump `kansoku-js`. If a
trusted-publisher configuration expires because no publish happened within two days, delete and
recreate it. If the workflow publishes without provenance because the repository was still
private, the published version is still valid; provenance begins with the first publish after
the repository is public.


## Interfaces and Dependencies

Tools and exact versions: `publint` 0.3.25, `@arethetypeswrong/cli` 0.18.5, `@changesets/cli`
3.0.3, Bun 1.4.2, npm 11.5.1 or newer in the release workflow (Node 24 in `actions/setup-node`),
GitHub Actions `actions/checkout`, `actions/setup-node@v6`, `oven-sh/setup-bun@v2`,
`changesets/action@v1`; `okf` 0.9.0.0 or later for the ADR profile; `mori` for registry
registration. Verify the current released version of each against the npm registry and GitHub
before pinning, since the local corpus may lag.

Repository artifacts this plan owns: `scripts/check-size.ts`, the `check-packages`,
`check-size`, and extended `check` recipes in `justfile`, `.changeset/config.json` and
`.changeset/initial-release.md`, `.github/workflows/release.yml`, the `release-dry-run` job in
`.github/workflows/ci.yml`, the `repository`, `license`, `homepage`, `keywords`, `files`, and
`version` fields in both package manifests, the root `LICENSE` file and its per-package copies,
the `kansoku-js` peer range in `packages/kansoku-react/package.json`, the root `release` script,
both package READMEs, `docs/README.md`, the three guides under `docs/guides/`, the `docs` list
in `mori.dhall`, and the lockstep-versioning ADR plus any distillation records.

Artifacts this plan consumes but does not own: the workspace, build script, export map, `dist/`
layout, `check` recipe, `ci.yml`, and `docs/adr/profile.dhall` from EP-1
(`docs/plans/1-workspace-foundation-vendored-kansoku-contracts-and-generated-wire-types.md`);
the public API in `packages/kansoku-js/src/types.ts` from EP-2 and EP-3, which the READMEs must
quote verbatim at writing time; the hooks from EP-4; and the examples and live suite from EP-5,
whose completion gates M4.

Prerequisites declared by the MasterPlan: EP-1 Complete before M1; EP-5 Complete, the drift-guard
gate checked, and the user's explicit approval before M4. The MasterPlan's registry row for this
plan records the milestone-level dependency explicitly.

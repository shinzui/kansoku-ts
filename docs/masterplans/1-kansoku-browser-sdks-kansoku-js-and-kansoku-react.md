---
id: 1
slug: kansoku-browser-sdks-kansoku-js-and-kansoku-react
title: "Kansoku Browser SDKs: kansoku-js and kansoku-react"
kind: master-plan
created_at: 2026-10-15T02:03:47Z
intention: "intention_01m4ymqn7xe1a8tz8v7r78e34y"
provenance:
  created_by:
    model: "claude-fable-5-1"
    harness: "claude-code"
    at: 2026-10-15T02:03:47Z
  revisions:
    - model: "claude-fable-5-1"
      harness: "claude-code"
      at: 2026-10-15T03:17:45Z
      mode: "update"
      note: "Best-practices review: reversible start/stop lifecycle, GPC gate, sessionStorage queue mirror, React provider redesign, reconciled cross-plan inconsistencies"
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-10-15T03:45:08Z
      mode: "implement"
      note: "Implement workspace foundation and continue child plans in dependency order"
---

# Kansoku Browser SDKs: kansoku-js and kansoku-react

This MasterPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.


## Vision & Scope

Kansoku (観測, "observation") is the portfolio's first-party, self-hostable product and web
analytics service. Its Haskell server (`mori://shinzui/kansoku`) accepts analytics events over
HTTP, buffers them in PostgreSQL, writes them to ClickHouse, and answers typed metric queries.
Three Kansoku MasterPlans built and hardened that server, and all three explicitly deferred the
browser SDKs to "a later frontend initiative" because the server repository is a Haskell-only
Nix flake and a JavaScript toolchain is its own effort (see the scope decision dated 2026-07-01
in `mori://shinzui/kansoku/masterplans/1-kansoku-analytics-service-mvp`). This repository,
`kansoku-ts`, is that initiative. Today the server's own documentation says "Browser, React, and
other language SDKs are not yet shipped; use the HTTP ingestion guide from those environments."

After this initiative is complete, a web application can install two npm packages and record
what its users do without writing HTTP code:

```bash
bun add kansoku-js        # any browser application
bun add kansoku-react     # React applications (depends on kansoku-js)
```

A page that loads `kansoku-js`, calls `createKansoku({ baseUrl, writeKey })`, and does nothing
else automatically records a `page_view` event for the initial load and for every single-page
navigation (changes made through the browser's History API), starts a session and stamps every
event with its `sessionId`, assigns and persists an anonymous identifier, and delivers events to
`POST /v1/batch` in batches with the retry behaviour the server contract requires. The
application can additionally call `track`, `identify`, `alias`, `group`, `experiment`, `reset`,
`flush`, and `shutdown`, pause and resume capture with `stop` and `start`, attach the server's
four supported identity signals (`cookie`, `device`, `fingerprint`, `email_sha256`), pin the
schema version of governed events, and honour the browser's Global Privacy Control or Do Not
Track signal with one option each. Events queued when the user leaves the page are flushed with
a keepalive request so they are not lost. A React application wraps its tree in
`KansokuProvider` and uses `useKansoku`, `useTrack`, `usePageView`, `useIdentify`, and
`useExperiment` hooks that are safe under server-side rendering and React StrictMode because
the provider drives the client's reversible lifecycle from an effect rather than constructing a
side-effecting client during render. Both packages ship as ESM-only builds with TypeScript
declarations (Node 20.19 and later, which is every supported Node release today, can
`require()` them), have zero runtime dependencies, stay under a published size budget, and are
released to npm with provenance through trusted publishing.

Term definitions used throughout this MasterPlan. Each child plan repeats the ones it needs so
it stays self-contained.

- **SDK** (software development kit): here, a library an application imports to talk to
  Kansoku. The server repository already ships a Haskell SDK (`kansoku-client`); this
  initiative ships the TypeScript ones.
- **Write key**: a public Kansoku credential with prefix `ksk_w_`. It may ingest events and
  nothing else, and it is designed to be embedded in a browser bundle. It is sent in the
  `X-Api-Key` header (or as `Authorization: Bearer`). The server stamps every accepted event
  with the account that owns the key, so a browser cannot write into another account.
- **Batch endpoint**: `POST /v1/batch`, which accepts a JSON array of events. A syntactically
  valid array always returns HTTP 202 with `{"accepted": n, "rejected": [...]}`; invalid events
  are reported by zero-based index and must not be retried ("partial acceptance").
- **Error envelope**: the JSON body `{"code": "...", "message": "...", "retryable": bool}`
  returned with HTTP 400, 404, 413, and 503. Only `code` and `retryable` are machine contract.
- **Schema catalog**: the public, unauthenticated `GET /v1/schemas` document (also committed in
  the server repository as `docs/contracts/events.json`) listing every governed event name, its
  immutable versions, required properties, types, and validation patterns. Omitting
  `schemaVersion` means version 1, never latest.
- **Anonymous ID**: a random identifier the SDK generates once per browser and persists; the
  server treats it as the implicit `cookie` identity signal.
- **Session**: a run of activity in one browser. The SDK generates a `sessionId`, renews it after
  thirty minutes of inactivity, and emits `session_start` when a new one begins.
- **Autocapture**: events the SDK records without an explicit call, limited in this initiative to
  page views and session starts.
- **SPA** (single-page application): a web app that changes what the user sees by rewriting the
  URL with `history.pushState` or `history.replaceState` instead of loading a new document.
- **UTM parameters**: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
  query-string fields used for campaign attribution; Kansoku stores them as top-level event
  fields.
- **Keepalive fetch**: `fetch(url, { keepalive: true })`, which lets a request outlive the page
  that started it. Browsers cap the total in-flight keepalive body size at 64 KiB per origin.
- **happy-dom**: a JavaScript implementation of browser APIs used to run DOM-dependent unit
  tests under `bun test` without a real browser.
- **ESM / CJS**: the two JavaScript module systems (`import` / `require`). Both packages publish
  ESM only; CommonJS consumers load them through Node's `require(esm)`, available unflagged
  since Node 20.19 and 22.12, which covers every Node release still supported in 2026.
- **Trusted publishing**: npm's OpenID Connect flow in which a GitHub Actions workflow publishes
  without a long-lived token and npm attaches provenance attestations.

Included in this initiative: the Bun workspace that hosts both packages; a pinned, vendored copy
of the server's OpenAPI document and schema catalog with generated TypeScript wire types; the
`kansoku-js` core (event envelope, identity and session state, bounded and persisted queue,
batched delivery, retry policy, exit flush, consent and opt-out, drop accounting); browser
capture (page views, SPA navigation, attribution, context, identity helpers, experiment
exposure); `kansoku-react` (provider and hooks); runnable examples; an opt-in live conformance
suite against a real `kansoku-server`; a real-browser smoke test; package-shape checks; a size
budget; documentation; and a trusted-publishing release pipeline that ships `0.1.0` of both
packages.

Explicitly excluded: a metrics query client (metrics need service tokens, which must never ship
in a browser; a future Node package may add one); session replay, heatmaps, click or form
autocapture (deferred until there is a consumer); feature-flag evaluation (Kansoku has no flag
service; `experiment()` only records exposure of a variant the application chose); a Node.js
producer SDK and framework wrappers beyond React (Next.js, Vue, Svelte); a dashboard UI; and any
change to the Kansoku server. Server gaps this initiative surfaces are recorded as cross-repo
handoffs in Integration Points, not fixed here.


## Decomposition Strategy

The initiative is decomposed by functional concern into six child ExecPlans, each of which
produces a behaviour that can be verified on its own. The guiding principles were: keep the
delivery engine separate from capture semantics so each can be tested without the other;
make the React package a thin consumer of a stable `kansoku-js` surface rather than a second
implementation; put every shared artifact (workspace, vendored contracts, generated types, test
harness) in one foundation plan that everything else hard-depends on; and keep release
engineering independent so the pipeline can be proven with dry runs long before there is
anything worth publishing.

The design follows the practices that the mature browser analytics SDKs converge on. PostHog's
`posthog-js`, Segment's `analytics-next`, Amplitude's browser SDK, Sentry's JavaScript SDK, and
OpenTelemetry's web exporters all: keep a dependency-free core with a small public surface;
assign and persist an anonymous identifier and an inactivity-timed session; batch events with a
count and interval threshold and a bounded queue; retry only transient failures with exponential
backoff and jitter; flush remaining events on `visibilitychange` and `pagehide` with a transport
that survives navigation; expose a `beforeSend` hook for redaction and a drop callback for loss
accounting; provide opt-out and consent controls; patch the History API for SPA page views and
parse UTM attribution; ship tree-shakeable ESM with type declarations and a size budget; and
publish framework bindings as separate thin packages. The React binding follows the pattern
TanStack Query's `QueryClientProvider` established for wrapping an external client: the client
is constructed without side effects, and the provider's effect drives a reversible pair of
lifecycle calls (`start` on setup, `stop` on cleanup), so React StrictMode's extra
setup-and-cleanup cycle in development is harmless by construction rather than by a timing
workaround. Privacy gating follows what browsers actually ship in 2026: Firefox removed its Do
Not Track setting in version 135 and points users to Global Privacy Control, so the SDK offers
an opt-in gate for each signal. Two of their choices were deliberately
not copied: a separate `core` package (two packages do not justify a third; the core modules
inside `kansoku-js` are kept runtime-agnostic so a Node SDK can extract them later) and
`navigator.sendBeacon` as the exit transport (it cannot send headers, and Kansoku requires the
credential in a header, so keepalive `fetch` is the only compliant exit path).

Alternatives considered for the decomposition. One plan per package (two plans) was rejected
because `kansoku-js` mixes two concerns with different verification stories, and a single
500-line plan would hide the delivery contract that every later consumer depends on. Folding
examples and live conformance into the React plan was rejected because the live suite verifies
`kansoku-js` against the real server and should not wait for React. Making release engineering
the last milestone of the React plan was rejected because the pipeline's dry runs are the
cheapest early signal that the package shapes are publishable.

ADR context. This repository has no `docs/adr/` corpus yet; EP-1 installs the shared
architecture-decision profile so later plans can record decisions there. The server's ADR
bundle is registered in Mori as `mori://shinzui/kansoku/okf/adrs`, and the following records
constrain this initiative directly. Each child plan repeats the parts it depends on.

- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-1` — SDK-grade ingest contract boundaries.
  `POST /v1/batch` partially accepts; HTTP 202 ends the delivery attempt; rejected events are
  never retried; HTTP 413 is permanent and the client must split or shrink; CORS applies only to
  `/v1/*`, pre-approves `Content-Type`, `X-Api-Key`, and `Authorization`, and wraps the size
  middleware so browsers can read 413 bodies. Default limits: 500 events per batch, 5 MiB body.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-3` — API-key authentication and account-scoped
  analytics. Write keys (`ksk_w_`) ingest only; both header transports are accepted;
  `Authorization` wins when both are present; the credential is the sole source of tenancy and
  overwrites any `accountId` in the body; unknown or revoked keys return 401.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-5` — Evidence-based multi-signal identity
  resolution. `identifiers` accepts only `cookie`, `device`, `fingerprint`, `email_sha256`;
  values are 1–256 printable non-space ASCII characters; `anonymousId` is already the implicit
  cookie signal; cookie bindings are created only by `identify` and `alias` events.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-6` — Exposure-based experiment analytics. The
  canonical event is `experiment_viewed`, emitted when a variant is actually shown; its
  `experiment` and `variant` properties must match `^[a-z0-9_.:-]{1,128}$`; re-exposure does not
  double count on the server.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-7` — Versioned event schema governance. Each
  governed event has immutable versions starting at 1; absent `schemaVersion` means 1;
  versions outside `1..65535` are rejected; the catalog is public at `GET /v1/schemas` and
  committed as `docs/contracts/events.json`.

Related server plans, cited by their intended Mori artifact URIs (artifact-level resolution of
plan URIs is pending in the registry; the project URI resolves):
`mori://shinzui/kansoku/plans/7-haskell-server-sdk` (the Haskell client whose buffering,
helper, and loss-accounting semantics this initiative mirrors),
`mori://shinzui/kansoku/plans/14-sdk-grade-ingest-contract-partial-batch-acceptance-cors-and-payload-limits`,
`mori://shinzui/kansoku/plans/15-api-keys-service-auth-and-account-scoped-queries`, and
`mori://shinzui/kansoku/plans/20-event-schema-governance-versioned-registry-and-portfolio-event-contracts`.
The server's producer guides live at `mori://shinzui/kansoku` under `docs/guides/send-events.md`
and `docs/guides/haskell-sdk.md` (artifact-level URIs pending).

The initiative is pinned to server commit `d61cf0c4b53bc6f9128f8589cd287c107f394427`, the
`master` HEAD of the sibling checkout at `../kansoku` on 2026-10-14. EP-1 vendors that commit's
OpenAPI document and catalog; later refreshes are an explicit, reviewed step.


## Exec-Plan Registry

| # | Title | Path | Hard Deps | Soft Deps | Status |
|---|-------|------|-----------|-----------|--------|
| 1 | Workspace foundation, vendored Kansoku contracts, and generated wire types | docs/plans/1-workspace-foundation-vendored-kansoku-contracts-and-generated-wire-types.md | None | None | Complete |
| 2 | kansoku-js core: event envelope, identity and session state, batched delivery, and exit flush | docs/plans/2-kansoku-js-core-event-envelope-identity-and-session-state-batched-delivery-and-exit-flush.md | EP-1 | None | Complete |
| 3 | kansoku-js browser capture: page views, navigation, attribution, identity helpers, and experiments | docs/plans/3-kansoku-js-browser-capture-page-views-navigation-attribution-identity-helpers-and-experiments.md | EP-2 | None | Complete |
| 4 | kansoku-react: provider, hooks, and router-agnostic page tracking | docs/plans/4-kansoku-react-provider-hooks-and-router-agnostic-page-tracking.md | EP-3 | None | In Progress |
| 5 | Examples, live contract conformance, and real-browser smoke test | docs/plans/5-examples-live-contract-conformance-and-real-browser-smoke-test.md | EP-3 (M1, M3, M4); EP-4 for M2 (React example) | EP-6 | Not Started |
| 6 | Release engineering: package checks, size budget, docs, and trusted publishing | docs/plans/6-release-engineering-package-checks-size-budget-docs-and-trusted-publishing.md | EP-1; final milestone (first publish) requires EP-5 Complete | EP-2, EP-3, EP-4 | Not Started |

Status values: Not Started, In Progress, Complete, Cancelled.
Hard Deps and Soft Deps reference other rows by their # prefix (e.g., EP-1, EP-3).
A whole-child hard dependency requires that child to be Complete. If only a milestone's
accepted output is needed, name it explicitly (e.g., EP-1 M1) and explain it below.


## Dependency Graph

The work proceeds in four phases. Phase 1 is EP-1 alone: it converts the scaffolded repository
into a Bun workspace with two package directories, vendors the server contracts, generates wire
types, installs the DOM test harness and shared build script, wires continuous integration, and
adopts the ADR profile. Everything else hard-depends on EP-1 because every later plan imports
the generated types, runs under the test harness, and builds with the shared script; starting
any of them earlier would mean inventing those artifacts twice.

Phase 2 is the `kansoku-js` package in two sequential plans. EP-2 delivers the engine: the event
envelope that matches `AnalyticsEvent`, the anonymous-ID and session store, the bounded and
persisted queue, batched delivery to `/v1/batch`, the retry and drop policy, keepalive exit
flush, consent, and the `createKansoku`, `track`, `flush`, `shutdown`, and stats surface. It is
verifiable with manual `track` calls against a mocked `fetch`. EP-3 hard-depends on EP-2 whole
because every capture feature it adds (page views, navigation patching, attribution, context,
`identify`/`alias`/`group`, `experiment`, `reset`, `setIdentifiers`) is expressed as calls into
EP-2's envelope builder and queue. In parallel with phase 2, EP-6 may complete its pipeline
milestones (package-shape checks, size budget, changesets, dry-run publish workflow) because
they depend only on EP-1's workspace and package manifests.

Phase 3 runs EP-4 and EP-5 once EP-3 is complete. EP-4 hard-depends on EP-3 because its hooks
wrap `page`, `identify`, and `experiment`, and because `usePageView` must know whether
autocapture is on. EP-5's dependencies are declared at milestone granularity: its vanilla
example (M1), live conformance suite (M3), and Chromium smoke test (M4) require EP-3 Complete,
and only its React example (M2) requires EP-4 Complete, so M1, M3, and M4 may proceed while
EP-4 is still in progress. EP-5 has a soft dependency on EP-6 because the examples consume the
built `dist/` artifacts and benefit from the package-shape checks; they run against `just
build` output from the start, so EP-6's checks only add confidence.

Phase 4 is EP-6's final milestone, the first public release of both packages at `0.1.0`. It
hard-depends on EP-5 Complete: the packages are not published until the live suite has proven
conformance against a real server and the real-browser smoke test has exercised SPA page views
and exit flush. This is the one milestone-granularity dependency in the initiative; the earlier
EP-6 milestones only require EP-1.

There are no cycles. The critical path is EP-1 → EP-2 → EP-3 → EP-4 → EP-5 → EP-6 (publish).


## Integration Points

Each integration point names the plans involved, the shared artifact, the owning plan, and how
later plans consume or extend it. Decisions marked "ADR" are candidates for `docs/adr/` once
EP-1 installs the bundle; the implementing plan creates the record.

**Workspace layout and toolchain** (owner EP-1; consumed by all). The root `package.json` is
private and declares `"workspaces": ["packages/*", "examples/*"]`. Package sources live at
`packages/kansoku-js/src` and `packages/kansoku-react/src`; tests live beside them under `test/`.
Dependency versions quoted in this initiative were read from npm on 2026-10-14 and are upper
bounds, not pins: Bun 1.4.2 enforces a default seven-day `minimum-release-age` on install, so
the implementer accepts what Bun resolves on the day or sets `minimumReleaseAge` in
`bunfig.toml` deliberately. Tooling is the scaffolded set: Bun 1.4.2 for install, test, and bundling; TypeScript 7.0.2
(`tsc`) for type-checking and declaration emit (verified on 2026-10-14 that `tsc --declaration
--emitDeclarationOnly` produces correct `.d.ts` output in this dev shell); oxlint 1.87.0 and
oxfmt 0.72.0 for lint and format; `just` recipes as the human entry points (`install`, `check`,
`test`, `test-no-dom <paths>`, `build`, `sync-contracts`, `generate-schema`, `check-contracts`,
with later plans adding `dev-vanilla`, `dev-react`, `test-live`, `test-smoke`). Because
`openapi-typescript` 7.x declares a `typescript@^5` peer, the root adds `typescript@^5.9` as a
development dependency for that generator only; `tsc` 7.0.2 from the dev shell remains the
compiler for type-checking and declaration emit. A shared
`tsconfig.base.json` adds `"lib": ["ES2022", "DOM", "DOM.Iterable"]` for the packages; the
root `tsconfig.json` keeps the scaffold's Bun settings for scripts. `scripts/build.ts <package>`
runs `Bun.build` once (`format: "esm"`, `target: "browser"`, output `dist/index.js`, no
minification, `sourcemap: "linked"`, externals from `dependencies` and `peerDependencies`) and
then `tsc -p <package>/tsconfig.build.json` to emit `dist/index.d.ts` beside per-module
declaration files. There is no CommonJS output and no `.d.cts` copy: both packages are
ESM-only, and CommonJS consumers on any supported Node release load them through
`require(esm)`. The script reads an optional per-package manifest field
`"kansoku": { "banner": "..." }` and passes it as the `banner` option of `Bun.build`;
`kansoku-react` uses it to keep its `"use client"` directive on line 1 of `dist/index.js`
(verified on 2026-10-14 with Bun 1.4.2 that, when the module has an external import such as
`react`, the bundler emits the `import` statement first and the source-level directive after it,
where it is no longer a directive; the banner is the only way to keep it in the prologue). Each
package manifest declares `"type": "module"`, `"sideEffects": false`,
`"files": ["dist", "README.md", "CHANGELOG.md"]`, `"engines": { "node": ">=20.19.0" }` (the
`require(esm)` floor, so an unsupported Node gets an install warning rather than a confusing
runtime error), and the export map below. `kansoku-react` additionally declares
`peerDependencies` of `react` `^18.0.0 || ^19.0.0`, `kansoku-js` `^0.1.0` (a literal range; see
Versioning and release), and `@types/react` `>=18` marked optional in `peerDependenciesMeta`,
the convention React libraries such as zustand use so TypeScript consumers resolve the types the
declaration files import without forcing JavaScript consumers to install them. EP-1 scaffolds
these fields and EP-4 owns their final values. EP-6 verifies the package shape with `publint`
and `@arethetypeswrong/cli --profile esm-only`. Shipping one module format also removes the
dual-package hazard: there is exactly one copy of `kansoku-react`'s context object however the
package is loaded. The one consumer cost is Jest in its default CommonJS mode, which does not
use Node's `require(esm)` and needs the package added to its ESM transform allowlist; the
READMEs say so.

```json
{
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./package.json": "./package.json"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "engines": { "node": ">=20.19.0" }
}
```

**Vendored server contracts and generated wire types** (owner EP-1; consumed by EP-2, EP-3,
EP-5, EP-6). `contracts/openapi.json` and `contracts/events.json` are byte-for-byte copies of
the server's `docs/api/openapi.json` and `docs/contracts/events.json` at the commit recorded in
`contracts/KANSOKU_COMMIT` (initially `d61cf0c4b53bc6f9128f8589cd287c107f394427`).
`scripts/sync-contracts.ts` copies them from a git ref of the sibling checkout (default
`../kansoku`, default ref `master`) using `git show <ref>:<path>` and rewrites the commit file;
`just sync-contracts` runs it. `openapi-typescript` 7.x generates
`packages/kansoku-js/src/generated/schema.ts` from `contracts/openapi.json` (`just
generate-schema`); the file is committed, excluded from oxlint and oxfmt, and `just
check-contracts` fails when regeneration would change it. EP-2 never hand-writes wire types: it
re-exports `components["schemas"]["AnalyticsEvent"]`, `BatchAck`, `RejectedEvent`,
`ErrorEnvelopeWire`, `SchemaCatalog`, and `EventSource` from `src/contract/wire.ts`. The
generated `schemaVersion` type is an unbounded integer; the SDK narrows it to `1..65535` at
runtime. EP-5's live suite fetches `GET /v1/schemas` and fails when it differs from
`contracts/events.json`, which is the drift guard for the pin. Refreshing the pin is a reviewed
change that reruns both scripts and the suite. (ADR: contract vendoring and refresh policy.)

**`kansoku-js` public surface** (owner EP-2 for the core members and option set; EP-3 adds the
capture members in the same `src/types.ts` and `src/client.ts`; consumed by EP-4, EP-5, EP-6).
The package exports `createKansoku(options: KansokuOptions): KansokuClient`, the types below,
the event-name constants, and `version`. Module ownership: EP-2 owns `src/index.ts`,
`src/types.ts`, `src/client.ts`, `src/envelope.ts`, `src/queue.ts`, `src/transport.ts`,
`src/retry.ts`, `src/storage.ts`, `src/identity.ts`, `src/session.ts`, `src/lifecycle.ts`,
`src/contract/wire.ts`, `src/contract/events.ts`, and `src/contract/validate.ts`. EP-3 owns
`src/page.ts`, `src/navigation.ts`, `src/attribution.ts`, `src/context.ts`,
`src/experiment.ts`, and `src/identity-api.ts`, and extends `types.ts`, `client.ts`, and
`index.ts`.

```typescript
export interface KansokuOptions {
  baseUrl: string                         // e.g. "https://analytics.example.com"; no trailing slash
  writeKey: string                        // ksk_w_… ; sent as X-Api-Key
  sourceService?: string                  // stamps AnalyticsEvent.sourceService
  autoStart?: boolean                     // default true; false constructs without side effects until start()
  flushAt?: number                        // default 20 events
  flushIntervalMs?: number                // default 5000
  maxQueueSize?: number                   // default 1000; newest event dropped when full
  maxBatchEvents?: number                 // default 100 (server cap 500)
  maxBatchBytes?: number                  // default 1 MiB (server cap 5 MiB)
  maxRetries?: number                     // default 5
  retryBaseDelayMs?: number               // default 500; exponential, full jitter, 30 s cap
  requestTimeoutMs?: number               // default 10000
  persistQueue?: boolean                  // default true; mirrors the queue to sessionStorage (per tab)
  storage?: "localStorage" | "cookie" | "memory" | StorageAdapter   // identity, session, opt-out, exposures; default localStorage
  storageKeyPrefix?: string               // default "kansoku"
  cookieDomain?: string                   // only for the cookie adapter
  sessionTimeoutMs?: number               // default 1_800_000 (30 min)
  schemaVersions?: Record<string, number> // per-event pins; merged over built-in defaults
  autocapture?: { pageViews?: boolean; sessions?: boolean }   // defaults true/true (EP-3)
  optOut?: boolean                        // start opted out
  respectDoNotTrack?: boolean             // default false; navigator.doNotTrack === "1" suppresses capture
  respectGlobalPrivacyControl?: boolean   // default false; navigator.globalPrivacyControl === true suppresses capture
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null
  onDrop?: (info: DropInfo) => void
  fetch?: typeof globalThis.fetch         // injectable for tests
  now?: () => number                      // injectable clock
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  debug?: boolean
}

export type DropReason =
  | "queue_full" | "rejected" | "permanent_error" | "retries_exhausted"
  | "before_send" | "opted_out" | "invalid"

export interface DropInfo { reason: DropReason; events: AnalyticsEvent[]; detail?: string }

export interface KansokuClient {
  // EP-2
  track(eventName: string, properties?: JsonObject, options?: TrackOptions): void
  flush(): Promise<void>
  start(): void                            // idempotent; attaches listeners, timer, capture; no-op after shutdown
  stop(): void                             // idempotent inverse of start(); detaches and begins a non-blocking flush
  shutdown(): Promise<void>                // stop(), await the final flush, then refuse further events
  optOut(): void
  optIn(): void
  isOptedOut(): boolean
  getAnonymousId(): string
  getUserId(): string | undefined
  getSessionId(): string
  readonly stats: Readonly<{ queued: number; accepted: number; rejected: number; dropped: number }>
  readonly config: ResolvedKansokuOptions
  // EP-3
  page(properties?: JsonObject, options?: TrackOptions): void
  identify(userId: string, traits?: JsonObject): void
  alias(previousId: string, newId: string, properties?: JsonObject): void
  group(organizationId: string, properties?: JsonObject): void
  experiment(experiment: string, variant: string, properties?: JsonObject, options?: ExperimentOptions): void
  setIdentifiers(identifiers: Partial<Record<IdentifierKind, string>>): void
  reset(): void
}

export interface TrackOptions { schemaVersion?: number; occurredAt?: Date; context?: JsonObject }
export interface ExperimentOptions { force?: boolean }   // bypass per-session exposure dedupe
export type IdentifierKind = "cookie" | "device" | "fingerprint" | "email_sha256"
// Every option resolved to its default (fetch, now, and timers resolve to the platform globals);
// the callbacks and cookieDomain stay optional. Frozen at construction.
export type ResolvedKansokuOptions = Readonly<
  Required<Omit<KansokuOptions, "beforeSend" | "onDrop" | "cookieDomain">>
  & Pick<KansokuOptions, "beforeSend" | "onDrop" | "cookieDomain">
>
```

Two entry points are internal to the package and are how EP-3 feeds capture events into EP-2's
pipeline without duplicating it: `buildEvent(name, properties, options, webFields?, ids?)` in
`src/envelope.ts`, whose optional `webFields` argument carries the top-level web fields `url`,
`referrer`, `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, and `utmTerm`, and whose
optional `ids` argument (`{ anonymousId?: string; userId?: string }`) overrides the identity
store for that one event (only EP-3's `alias` uses it); and
`enqueueBuilt(event)` on the internal client object, which runs validation, `beforeSend`, the
enqueue, and the flush-threshold check. The same internal object offers two registration hooks:
`registerContextProvider(fn: () => JsonObject): () => void`, whose providers are consulted when
an event is constructed and merged into `context` beneath the caller's `TrackOptions.context`
(EP-3's context module registers the browser provider), and
`onStart(install: () => (() => void) | void): void`, which registers an installer that `start()`
runs on every activation and whose returned teardown `stop()` runs on every deactivation (EP-3
registers one installer that records the initial page view and patches the History API, and
whose teardown unpatches it). None of these is exported from `src/index.ts`. `stats.dropped`
counts every drop including rejections, matching the Haskell client's `droppedCount`;
`stats.rejected` is the subset reported by the server. EP-2 stores `respectDoNotTrack` and
`respectGlobalPrivacyControl` in the resolved config; EP-3 implements both gates, reusing EP-2's
`opted_out` drop path.

**Client lifecycle** (owner EP-2; EP-3 registers its installer through `onStart`; EP-4 is the
consumer that needs it to be reversible). Construction (`createKansoku`) is free of observable
side effects beyond reading and lazily initialising persisted state: it resolves options,
creates the storage adapters, loads or generates the anonymous identifier, reads the session,
and restores the persisted queue, but attaches no listeners, starts no timer, patches nothing,
and records no event. `start()` activates the client: it attaches the exit-flush listeners,
starts the flush interval, and runs every `onStart` installer (in EP-3: the initial page view and
the History API patch). `stop()` is the exact inverse: it runs the installers' teardowns in
reverse order, detaches the listeners, clears the interval, and begins a non-blocking `flush()`
so nothing queued is stranded; identity, session, the queue, and the page-view dedupe key are
kept, so `start()` after `stop()` resumes without re-recording the current page. Both are
idempotent. `shutdown()` is `stop()` followed by an awaited final `flush()`, after which the
client refuses new events (`track` drops with reason `opted_out`, detail `shutdown`) and
`start()` is a no-op. `createKansoku` calls `start()` itself unless `autoStart` is `false`, so a
vanilla page keeps its one-call setup. This is what makes `KansokuProvider` correct under React
StrictMode without a workaround: the provider constructs the client with `autoStart: false` in a
lazy state initialiser and calls `start()` in its effect and `stop()` in the cleanup, which is
the same reversible `mount`/`unmount` shape TanStack Query's `QueryClientProvider` uses, and the
development-only setup → cleanup → setup sequence simply restarts the client. (ADR: delivery
semantics and exit transport, extended with the lifecycle.)

**Event envelope rules** (owner EP-2; EP-3 builds every capture event through the same
builder). `eventId` is `crypto.randomUUID()` with a fallback random string; `eventName` as
given; `source` is always `"web"`; `sourceService` from options; `occurredAt` is
`new Date(now()).toISOString()` and `receivedAt` is the same value (the server overwrites it);
`properties` and `context` are always objects; `anonymousId`, `sessionId`, and, when known,
`userId`, `organizationId`, and `identifiers` are stamped on every event; `schemaVersion` is
stamped only when pinned. The constants module `src/contract/events.ts` owns the names and
built-in version pins: `page_view` 1, `session_start` 1, `experiment_viewed` 1, and the
unversioned reserved names `identify`, `alias`, `group`. Capture events match the Haskell SDK
helpers exactly: `identify` carries `userId`, `anonymousId`, and traits as `properties`; `alias`
carries `anonymousId = previousId`, `userId = newId`, and `properties.previousId` /
`properties.newId`; `group` carries `userId` and `organizationId`; `session_start` carries
`properties.sessionId`; `page_view` carries top-level `url`, `referrer`, `utm*` and
`properties.url` (required by version 1) plus `properties.path` and `properties.title`.
`src/contract/validate.ts` implements identifier-value and experiment-name validation and the
schema-version range so invalid events are dropped client-side with reason `invalid` instead of
consuming a server rejection. EP-2's contract tests load `contracts/events.json` and assert that
every built-in event satisfies its declared version.

**Delivery contract** (owner EP-2; verified live by EP-5; documented by EP-6). Every delivery,
including a single event, is `POST {baseUrl}/v1/batch` with `Content-Type: application/json` and
`X-Api-Key: <writeKey>`. HTTP 202 ends the attempt: `accepted` increments stats, each entry in
`rejected` is removed from the queue and reported through `onDrop` with reason `rejected`. HTTP
400, 401, 403, and 404 are permanent for the whole batch (reason `permanent_error`), as is a 503
whose envelope says `retryable: false`. HTTP 413 with more than one event splits the batch in
half and resends each half; a single-event 413 is dropped. HTTP 503 with `retryable: true`, a
network error, a timeout, and any response that cannot be parsed are retried up to `maxRetries`
with exponential backoff and full jitter; the batch stays queued between attempts and is dropped
with reason `retries_exhausted` afterwards. Only one flush is in flight at a time. After
`shutdown()` resolves, later `track` calls are dropped (reason `opted_out`, detail `shutdown`)
rather than queued. While the client is started, on `visibilitychange` to `hidden` and on
`pagehide` it flushes everything queued using `fetch(..., { keepalive: true })` in chunks of at
most 60 KiB of body each; `navigator.sendBeacon` is not used because it cannot carry the
credential header. When `persistQueue` is on, the pending queue is mirrored to the tab's
`sessionStorage` after every enqueue and acknowledgement and restored by the next
`createKansoku` in that tab, so an unacknowledged exit flush during a reload or a same-tab
navigation is retried with the same `eventId` values and deduplicated by the server.
`sessionStorage` rather than `localStorage` is deliberate: `localStorage` is shared by every tab
of the origin, so two tabs writing the same queue key clobber each other's pending events and
both replay the other's; a per-tab mirror cannot. Events in a tab that is closed while its
keepalive request fails are lost, which is the same trade every reference SDK makes. (ADR:
delivery semantics and exit transport.)

**Storage keys and persistence format** (owner EP-2; EP-3's `reset` and EP-5's smoke test rely
on it). Identity and session state live in the adapter the `storage` option selects
(`localStorage` by default, shared across the origin's tabs, which is what an anonymous
identifier and a session need). With the default prefix, those keys are `kansoku.anonymous_id`,
`kansoku.user_id`, `kansoku.identifiers`, `kansoku.organization_id`, `kansoku.session` (JSON
`{ "id": string, "lastActivityAt": number }`), `kansoku.opt_out`, and `kansoku.exposures`
(EP-3). The pending queue is different: `kansoku.queue` (JSON array of pending `AnalyticsEvent`,
capped at `maxQueueSize`) is always mirrored to `sessionStorage`, which is per tab, regardless of
the `storage` option, for the reason given under Delivery contract. Both the selected adapter
and the session adapter fall back to memory when access throws (private mode, blocked storage).
`reset()` clears `user_id`, `identifiers`, `organization_id`, and `exposures`, rotates
`anonymous_id` and the session, and leaves the queue intact. (ADR: identity and session
persistence policy.)

**Autocapture versus manual page views** (owner EP-3 for the option; EP-4 consumes).
`autocapture.pageViews` defaults to true: `start()` records the initial page view and installs
the History API patch (`history.pushState`, `history.replaceState`, and the `popstate` event),
so React Router and similar routers are covered with no React-specific code, and `stop()`
removes the patch. Because the React provider starts the client from an effect, the initial
`page_view` is recorded after the first paint, when `document.title` is already set, and the
dedupe key makes the StrictMode restart record nothing extra. EP-4's `usePageView(key)` is for
applications that want explicit control; it expects the application to pass
`autocapture.pageViews: false` and warns once in development, by reading `client.config`, when
autocapture is still on. The warning is advisory, not enforced, so a misconfigured app
double-counts rather than losing data. `KansokuProvider` does not change `kansoku-js` defaults.

**Experiment exposure dedupe** (owner EP-3; EP-4's `useExperiment` relies on it).
`experiment(experiment, variant)` validates both names against `^[a-z0-9_.:-]{1,128}$`, emits
`experiment_viewed` version 1, and records the pair in `kansoku.exposures` for the current
session so repeated calls (including React StrictMode double effects) emit once per session.
An `{ force: true }` option bypasses the dedupe.

**Privacy signals** (owner EP-3 for the gate; EP-2 resolves the options; EP-6 documents them).
Two opt-in options honour browser privacy signals, both default `false` so an application makes
the choice knowingly: `respectDoNotTrack` suppresses capture when `navigator.doNotTrack` (or the
legacy `window.doNotTrack` / `navigator.msDoNotTrack`) is `"1"`, and `respectGlobalPrivacyControl`
suppresses capture when `navigator.globalPrivacyControl` is `true`. Global Privacy Control is
the signal browsers now promote (Firefox removed its Do Not Track setting in version 135 and
exposes GPC instead; Brave and DuckDuckGo send GPC by default; Chrome and Safari expose neither
property, in which case both reads are `undefined` and nothing is suppressed). Suppression
reuses the opt-out path: autocaptured events are skipped silently and explicit calls drop with
reason `opted_out`. The SDK never sets or changes either signal.

**Test harness** (owner EP-1; used by EP-2, EP-3, EP-4, EP-5). `bunfig.toml` preloads
`test/setup/dom.ts`, which registers happy-dom globals through
`@happy-dom/global-registrator` unless the environment variable `KANSOKU_TEST_NO_DOM` is `1`.
That single switch is how every suite that needs real globals runs: EP-2's DOM-free envelope
tests, EP-4's server-side rendering test, and EP-5's live suite, which needs the real `fetch`
that happy-dom would otherwise replace. There is no second bunfig and no `--preload` override.
EP-1's `just test` runs `bun test` and then `KANSOKU_TEST_NO_DOM=1 bun test` over the no-DOM
paths, and CI calls `just test`. `test/helpers/fetch-mock.ts` exports `createFetchMock()`
returning `{ fetch, requests, respondWith }`: a drop-in `fetch` that records each call's URL,
method, headers, parsed JSON body, and keepalive flag into `requests`, and `respondWith` to
script the next responses (202 `BatchAck`, 400/401/404/413/503 envelopes, a thrown network
error, a never-resolving timeout). Deterministic timing comes from the injectable `now` and
`timers` options rather than a fake-timer library. EP-4 adds `@testing-library/react` on top of
the same harness.

**Examples** (owner EP-5; EP-1's build is the prerequisite). `examples/vanilla-vite` and
`examples/react-vite` are workspace members that consume `kansoku-js` and `kansoku-react`
through their published export maps, which resolve to `dist/`; the example and smoke recipes
therefore run `just build` first and never alias to package sources. The React example uses
React Router 8 under StrictMode so autocapture is proven against a real router and the
provider's `start`/`stop` lifecycle is proven against StrictMode's extra effect cycle in a real
browser. The Chromium smoke test reads the queue mirror from `sessionStorage` (not
`localStorage`), matching the storage-keys point above.

**Live conformance environment** (owner EP-5; referenced by EP-6 documentation). The opt-in
suite under `test/live/` reads `KANSOKU_LIVE_BASE_URL` and `KANSOKU_LIVE_WRITE_KEY`, optionally
`KANSOKU_LIVE_SERVICE_TOKEN` for a metrics read-back, and skips with a clear message when they are
unset. `just test-live` runs it as `KANSOKU_TEST_NO_DOM=1 bun test test/live` so the real
`fetch` is used. It runs against the sibling checkout's `just up`, `just migrate`,
`just ch-migrate`, `just issue-key write`, and `just run` flow documented in the server's
`docs/guides/getting-started.md` (default port 8080; CORS open to all origins unless
`KANSOKU_CORS_ORIGINS` is set).

**Versioning and release** (owner EP-6). Both packages are versioned in lockstep through a
changesets fixed group. Manifests start at `0.0.0` and an initial `minor` changeset produces
`0.1.0`, the first published version. `kansoku-react` declares `kansoku-js` as a peer dependency
with the literal range `^0.1.0`, kept in step by the fixed group, and as a `workspace:*`
development dependency for local resolution; `npm publish` does not rewrite `workspace:` ranges,
and `bun publish` (which does) cannot produce provenance, so the literal range is required.
Publishing runs from a GitHub Actions workflow with `id-token: write` and `contents: write`, npm
11.5.1 or newer (the dev shell's Node 22 bundles npm 10.9.9, so the workflow upgrades npm
first), and `changeset publish` driving `npm publish --access public`; provenance is attached
automatically under trusted publishing for a public repository and public package, so no
`--provenance` flag is needed. Two preconditions are the maintainer's, not the implementer's:
npm's documentation describes trusted-publisher configuration only on an existing package's
settings page, so the first publish of each new name is a manual, two-factor `npm publish` by the
maintainer, after which the trusted publisher (repository `shinzui/kansoku-ts`, workflow
filename `release.yml`) is registered for both names; and automatic provenance requires a public
GitHub repository, while `shinzui/kansoku-ts` was created private, so the maintainer decides
before the first release whether to make it public or to publish without provenance. The
packages also need a license before publication; the scaffold leaves them `UNLICENSED` and the
server's spec frames Kansoku as open source, so EP-6 asks the maintainer to choose one. (ADR:
lockstep versioning and trusted publishing. EP-6's distillation pass also creates the
two-package-layout ADR if no earlier plan has.)

**Cross-repository handoffs** (not owned by any child plan; recorded for the server
maintainers). After the first publish, the server's `docs/guides/send-events.md`,
`docs/guides/haskell-sdk.md`, and `docs/initial-spec.md` should stop saying no browser SDK has
shipped and link to these packages. Two server gaps surfaced during planning and belong in
Kansoku improvement requests rather than in this initiative: the server rejects any
`occurredAt` later than its own clock, so a browser whose clock runs ahead loses events, and
nothing in the response lets a cross-origin client measure the skew (the `Date` header is not
CORS-exposed); and because credentials are header-only, a beacon-friendly transport (credential
in body or query) would let the SDK use `sendBeacon` on exit. EP-5's live suite measures how
often the clock-skew rejection occurs with a deliberately skewed clock so the request carries
evidence.

The uncertain shared behaviour that deserves an early representative check is exit flush under
keepalive limits: EP-2 proves it with a happy-dom unit test that dispatches `pagehide` and
asserts chunked keepalive requests, and EP-5's real-browser smoke test proves it in Chromium
by navigating away and asserting the server-side mock received the final batch.


## Progress

EP-1 is locally accepted as of 2026-10-14. Workspace, pinned generated contracts, test harness and ADR validation pass. At the user’s direction, remote CI is deferred verification and does not block functional package implementation. EP-2 is Complete: the built kansoku-js core delivers real HTTP batches; 28 core tests and the DOM-free contract checks pass. EP-3 is Complete with 41 package tests and SSR safety accepted. EP-4 is In Progress to add the React provider and hooks.

Cross-plan gates not represented by a single child plan:

- [ ] Exit-flush representative check passes in both forms: EP-2's happy-dom unit test and
  EP-5's Chromium smoke test observe the final batch after navigation.
- [ ] Vendored-contract drift guard is green against a live server at the pinned commit before
  EP-6 publishes `0.1.0`.
- [ ] Maintainer decisions recorded before the first publish: the package license, and whether
  the repository becomes public (automatic provenance) or stays private (publish without
  provenance).


## Surprises & Discoveries

- Discovery (planning, 2026-10-14): `navigator.sendBeacon` cannot be the exit transport. Kansoku
  accepts credentials only in `X-Api-Key` or `Authorization` headers, and the Beacon API sends no
  custom headers, so exit flush must use keepalive `fetch` and respect the 64 KiB in-flight body
  cap. Every reference SDK that uses Beacon does so because its server accepts the key in the
  URL or body. Recorded as a server handoff above.
- Discovery (planning, 2026-10-14): TypeScript 7.0.2 (the Go-based compiler pinned by the
  scaffold) emits declaration files correctly for an ES2022 module with interfaces and
  functions; the shared build script can rely on `tsc --emitDeclarationOnly` without a second
  TypeScript install.
- Discovery (planning, 2026-10-14): `Bun.build` 1.4.2 preserves a `"use client"` directive only
  in ESM output; in CommonJS output it lands after the module helpers and stops being a
  directive. The shared build script therefore accepts a per-package `banner`, which EP-4 sets.
  The same drafting pass found that the EP-3 `experiment()` signature needed an options
  parameter to carry the promised `force` escape hatch; the interface above now includes it.
- Discovery (planning, 2026-10-14): Bun 1.4.2 refused `@happy-dom/global-registrator@21.0.1`
  because of its default seven-day minimum release age and resolved 20.14.5 instead. Version
  numbers in the plans are therefore upper bounds; the gate is kept as supply-chain protection.
- Discovery (planning, 2026-10-14): happy-dom's global registrator replaces `fetch`, so a global
  test preload would silently break the live conformance suite. The harness now keys DOM
  registration off `KANSOKU_TEST_NO_DOM`, one mechanism shared by the DOM-free, SSR, and live
  suites instead of three competing workarounds the child drafts had each invented.
- Discovery (planning, 2026-10-14, from npm's trusted-publishers and provenance documentation):
  provenance under trusted publishing is automatic but only for a public repository, and
  `shinzui/kansoku-ts` was created private; npm documents trusted-publisher setup only on an
  existing package's page, so the first publish of a new name is manual; `npm publish` does not
  rewrite `workspace:` ranges and `bun publish` cannot attach provenance, which forces a literal
  peer range on `kansoku-react`. All three now shape EP-6 and the Versioning and release point.
- Discovery (review, 2026-10-14): the first draft of EP-4 made `KansokuProvider` construct a
  side-effecting client during render and survive React StrictMode's extra effect cycle by
  deferring `shutdown()` to a cancellable timer, a workaround the plan itself flagged as a
  flakiness risk. React's rule that effect setup and cleanup must be symmetric, and TanStack
  Query's `QueryClientProvider` precedent (`client.mount()` in the effect, `client.unmount()` in
  the cleanup), pointed at the fix: give `KansokuClient` a reversible `start`/`stop` pair and an
  `autoStart` option, and move the History patch and the initial page view behind the internal
  `onStart` installer hook that replaces `onShutdown`. The change touches EP-2, EP-3, and EP-4
  but removes the only non-deterministic design in the initiative.
- Discovery (review, 2026-10-14): `respectDoNotTrack` alone is an outdated privacy gate. Firefox
  removed the Do Not Track setting in version 135 (February 2025) and points users to Global
  Privacy Control, which Brave and DuckDuckGo send by default and which carries legal weight in
  several jurisdictions. `respectGlobalPrivacyControl` was added beside it; both stay opt-in.
- Discovery (review, 2026-10-14): mirroring the pending queue to `localStorage` is unsafe with
  more than one tab open, because every tab writes the same key and clobbers the others' pending
  events while also replaying them. The mirror now lives in `sessionStorage`, which is per tab
  and still survives reloads and same-tab navigations; identity and session state stay in the
  shared adapter because they must be shared.
- Discovery (review, 2026-10-14): `@types/react` 19 removed the global `JSX` namespace, so the
  `JSX.Element` return type the EP-4 draft used does not compile against the pinned types;
  `ReactElement` from `react` is used instead. The same pass aligned three inconsistent copies of
  the React peer range (`>=18`, `^18.0.0 || ^19.0.0`, `^18 || ^19`) to `^18.0.0 || ^19.0.0`,
  aligned `ResolvedKansokuOptions` between this document and EP-2 (`fetch`, `now`, and `timers`
  resolve to the globals and are required in the resolved type), and corrected EP-5's claim that
  `useKansoku()` returns `null` during server rendering (it returns the no-op client).
- Discovery (review, 2026-10-14, after the ESM-only decision): the `"use client"` banner is still
  needed with a single ESM output. A fresh `Bun.build` 1.4.2 experiment on a module with an
  external `react` import showed the bundler emitting the hoisted `import` statement before the
  source-level `"use client"` string, which demotes it to an inert expression; with
  `banner: "\"use client\";"` the directive is line 1 and the now-redundant source directive
  follows harmlessly. The planning-time claim that ESM output needed no banner was made on a
  module with no external imports. The dev shell's Node 22 `require()`s an ES module directly,
  which is the CommonJS path the ESM-only packages rely on.


## Decision Log

- Decision (2026-10-14, user direction): Accept the foundation with its passing local checks and defer remote CI verification. Prioritise working SDK packages over further CI work. This explicitly revises EP-1’s remote-run acceptance gate; existing SDK behavior and test obligations remain.

- Decision: Ship exactly two publishable packages, `kansoku-js` and `kansoku-react`, with no
  separate core package. The runtime-agnostic modules inside `kansoku-js` (envelope, queue,
  transport, retry, validation) must not import DOM globals at module scope so a future Node
  package can extract them.
  Rationale: Two packages do not justify a third to maintain and version. Reference SDKs that
  split out a core did so once they had three or more runtimes. Keeping the boundary clean
  inside one package preserves the option at near-zero cost.
  Date: 2026-10-14

- Decision: Publish unscoped as `kansoku-js` and `kansoku-react`, the names the three Kansoku
  MasterPlans already use for the deferred SDKs. The `@kansoku` npm scope and the unscoped
  `kansoku` name were verified available on 2026-10-14 and should be reserved, but packages are
  not published under them in this initiative.
  Rationale: Continuity with server documentation and plans; avoiding a rename of names the
  portfolio already refers to.
  Date: 2026-10-14

- Decision: Vendor the server's OpenAPI document and schema catalog at a pinned commit and
  generate wire types with `openapi-typescript`; never hand-write wire types and never read the
  sibling checkout at build time.
  Rationale: Reproducible builds from a clean clone; reviewable contract diffs when the pin
  moves; the same pattern the portfolio already uses in `shomei-ts-client`.
  Date: 2026-10-14

- Decision: Deliver exclusively through `POST /v1/batch` with the `X-Api-Key` header, retry only
  transient outcomes, treat 202 as terminal, split on 413, and use keepalive `fetch` for exit
  flush.
  Rationale: Mirrors ADR-1 and ADR-3 of the server and the Haskell SDK's loss accounting; the
  single endpoint keeps partial-acceptance handling uniform; the header constraint rules out
  Beacon.
  Date: 2026-10-14

- Decision: Toolchain is the scaffolded Bun + TypeScript 7 + oxlint + oxfmt set, with
  `Bun.build` for JavaScript output, `tsc` for declarations, `bun test` with happy-dom for unit
  tests, and a single optional Playwright Chromium smoke test in EP-5.
  Rationale: Matches the repository's seihou-managed dev shell and the portfolio's existing
  TypeScript client; avoids a second bundler or test runner; a real browser is still needed to
  prove keepalive exit flush and History API patching.
  Date: 2026-10-14

- Decision: Separate delivery (EP-2) from capture (EP-3) and make React (EP-4) a thin consumer;
  keep release engineering (EP-6) independent with a milestone-level dependency on EP-5 for the
  first publish.
  Rationale: Independent verifiability of each behaviour and early dry runs of the release
  pipeline, as explained in Decomposition Strategy.
  Date: 2026-10-14

- Decision: Version both packages in lockstep with a changesets fixed group and publish through
  npm trusted publishing, with the first publish of each name done manually by the maintainer
  and provenance attached automatically once the repository is public.
  Rationale: `kansoku-react` peer-depends on `kansoku-js`; lockstep removes compatibility
  matrices. Trusted publishing avoids long-lived tokens and is the current npm recommendation.
  npm's documentation does not show trusted-publisher setup for a never-published name, and
  provenance requires a public repository, so both preconditions are called out rather than
  assumed.
  Date: 2026-10-14

- Decision: Exclude a metrics client, session replay, click and form autocapture, feature
  flags, a Node SDK, non-React wrappers, and any server change from this initiative.
  Rationale: Service tokens must not ship in browsers; the other items have no consumer yet and
  each is its own initiative. Server gaps are handed off, not fixed here.
  Date: 2026-10-14

- Decision: `KansokuClient` exposes a reversible lifecycle, `start()` and `stop()`, plus an
  `autoStart` option (default `true`); `shutdown()` is `stop()` followed by an awaited final
  flush and a terminal state. Construction has no observable side effects beyond initialising
  persisted state. The internal `onStart(install)` hook replaces the earlier `onShutdown(fn)`.
  Rationale: React requires effect setup and cleanup to be symmetric and runs an extra cycle in
  StrictMode; a one-way `shutdown()` forced the React provider into a timing workaround. A
  reversible pair is the pattern TanStack Query's provider established, costs `kansoku-js` two
  idempotent methods, keeps the vanilla one-call setup, and gives applications a way to pause
  capture without losing state.
  Date: 2026-10-14

- Decision: Add `respectGlobalPrivacyControl` beside `respectDoNotTrack`, both opt-in and both
  routed through the same suppression path.
  Rationale: Global Privacy Control is the signal browsers ship and regulators recognise in
  2026; Do Not Track is kept for the users who still send it. Defaults stay `false` so an
  application decides its own policy, as the reference SDKs do.
  Date: 2026-10-14

- Decision: The pending-queue mirror lives in `sessionStorage` (per tab, memory fallback)
  regardless of the `storage` option; identity, session, opt-out, and exposure state live in
  the selected adapter (`localStorage` by default).
  Rationale: A shared mirror is clobbered and replayed by concurrent tabs; a per-tab mirror still
  covers the exit-flush failure modes that matter (reload, same-tab navigation). Identity must be
  shared across tabs, so it keeps the shared adapter.
  Date: 2026-10-14

- Decision (superseded the same day by the ESM-only decision below): Keep publishing both ESM and
  CommonJS for `0.1.0`, document the dual-package hazard for `kansoku-react`'s context object in
  its README, and revisit ESM-only before `1.0.0`.
  Rationale: Every supported Node release can now `require()` an ES module, which makes ESM-only
  the simpler shape for new libraries, but Jest-based consumers still need CommonJS without extra
  transform configuration, and the Vision promised both formats. The hazard only bites an
  application that loads the package through both conditions at once; `publint` and
  `@arethetypeswrong/cli` guard the export map either way. Dropping CommonJS is a scope change
  for the maintainer to make deliberately.
  Date: 2026-10-14

- Decision: Publish both packages as ESM-only. One `Bun.build` output (`dist/index.js`), one
  declaration file set (`dist/index.d.ts`), an export map with `types` and `default` conditions
  only, `main` and `types` kept for legacy resolvers, `module` dropped, and
  `"engines": { "node": ">=20.19.0" }` as the `require(esm)` floor. The `"use client"` banner
  mechanism stays because Bun hoists external imports above a source-level directive in ESM
  output too. `@arethetypeswrong/cli` runs with `--profile esm-only`.
  Rationale: The maintainer chose ESM-only on 2026-10-14 after the review. Node 20 reached end
  of life in April 2026 and every supported Node release loads ES modules through `require()`,
  so the only consumer that loses anything is Jest in its default CommonJS mode, which already
  needs a transform allowlist for most modern packages. In exchange the build has one output, the
  type declarations have one shape, the dual-package hazard for the React context disappears, and
  the bundlers, Vite examples, Playwright smoke test, and Bun test harness in this initiative all
  consume ESM natively. Supersedes the dual-format decision above.
  Date: 2026-10-14

Revision note (2026-10-14): a best-practices review before implementation changed the
`kansoku-js` lifecycle (reversible `start`/`stop`, `autoStart`, `onStart` installer hook),
added `respectGlobalPrivacyControl`, moved the queue mirror to `sessionStorage`, redesigned
`KansokuProvider` to drive the lifecycle from an effect with a memoised context value and
`ReactElement` typing, added `@types/react` as an optional peer, unified the React peer range,
and reconciled three cross-plan inconsistencies. The decomposition, registry, dependency graph,
and milestone gates are unchanged; EP-1 through EP-6 carry the cascaded edits.

Revision note (2026-10-14, later the same day): the maintainer chose ESM-only publishing. The
Vision, terms, Workspace layout integration point, Surprises & Discoveries, and Decision Log were
updated; EP-1 (build script, manifests, acceptance), EP-2 (build outputs), EP-4 (build
acceptance, banner rationale, README notes), and EP-6 (`attw` profile, tarball listing, README
and ADR content) carry the cascade. EP-3 and EP-5 had no module-format content to change.


## Outcomes & Retrospective

(To be filled during and after implementation.)

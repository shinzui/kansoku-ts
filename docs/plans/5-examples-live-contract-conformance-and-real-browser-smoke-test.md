---
id: 5
slug: examples-live-contract-conformance-and-real-browser-smoke-test
title: "Examples, live contract conformance, and real-browser smoke test"
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
      note: "Smoke test reads sessionStorage queue mirror; correct useKansoku SSR return; note provider lifecycle under StrictMode"
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-10-15T04:06:47Z
      mode: "implement"
      note: "Implement runnable built-package examples, live contract suite and browser smoke tests"
---

# Examples, live contract conformance, and real-browser smoke test

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.


## Purpose / Big Picture

Up to this plan, `kansoku-js` and `kansoku-react` have only ever talked to a scripted `fetch`
in unit tests. This plan proves them against the real thing. After it is complete, a
contributor can start the Kansoku server from the sibling checkout, run one `just` recipe, and
watch a plain Vite page and a React Router application record page views, identities, and
experiment exposures that show up in the server's metrics API. A second recipe runs an opt-in
live conformance suite that pins the SDK's delivery behaviour to the server's documented
contract: partial batch acceptance, non-retry of rejections, 413 splitting, 401 on a bad key,
and a drift guard that fails the moment the server's public schema catalog stops matching the
copy vendored in this repository. A third recipe drives real Chromium through the vanilla
example and asserts that single-page navigations produce page views and that the final batch
survives leaving the page.

Nothing in this plan changes the SDK's public surface. Its deliverables are two runnable
example applications under `examples/`, the live suite under `test/live/`, the Chromium smoke
test under `test/smoke/`, four `just` recipes, and recorded evidence, including one deliberate
clock-skew experiment whose outcome feeds a server-side improvement request rather than an
acceptance criterion here.


## Progress

- [x] (2026-10-14; Chromium against a real server reached route metrics) M1: `examples/vanilla-vite` runs against a local Kansoku server; loading it and clicking
  through its two in-page routes produces three `page_view` events that appear in
  `GET /metrics/page-views` for the dev account.
- [x] (2026-10-14; real-server metrics observed 3 views, 1 identify, 2 exposures, 1 session start) M2: `examples/react-vite` runs with React Router; navigating its routes produces page
  views through autocapture alone, signing in emits `identify`, and the experiment panel emits
  exactly one `experiment_viewed` per variant per session, all visible in the server's metrics.
- [x] (2026-10-14; 7 live tests pass, skip mode passes and drift negative probe fails) M3: `just test-live` passes against a local server with the drift guard, the 202 /
  rejection / 413 / 401 cases, and the clock-skew experiment recorded in this plan's Surprises
  & Discoveries; the same command skips cleanly with an explanatory message when the live
  environment variables are unset.
- [x] (2026-10-14; Chromium and negative exit regression pass; manual fallback documented) M4: `just test-smoke` drives Chromium through the vanilla example, observes `page_view`
  for the initial load and two `pushState` navigations, observes the final keepalive batch after
  navigating to `about:blank`, and finds `kansoku.queue` empty afterwards; the manual Chrome
  fallback is documented. Automated Chromium was available, so the manual fallback was not needed.


## Surprises & Discoveries

Chromium delivered the exit request after navigation, but the destroyed document did not always run its acknowledgement handler. Reload therefore re-sends the same eventId from sessionStorage; the server deduplicates it. The smoke test requires pre-reload server receipt, stable eventId on recovery and an empty mirror after the reload flush, rather than promising the old document can always clear storage. Removing exit listeners made the pre-reload receipt assertion fail (0 CTA events after 5 seconds); restoration passed both browser tests. Vite 8.3.3 and Playwright 1.64.0 resolved under the release-age gate. The live suite uses track("page_view", { url }) without DOM globals because page() is intentionally a browser-only no-op there. Configurable batch limits can exceed the default server cap so 413 splitting can be verified.


## Decision Log

- Decision: Live tests are ordinary `*.test.ts` files under `test/live/` that skip themselves
  when `KANSOKU_LIVE_BASE_URL` or `KANSOKU_LIVE_WRITE_KEY` is unset, and `just test-live` runs
  them as `KANSOKU_TEST_NO_DOM=1 bun test test/live`, the repository-wide switch that makes
  EP-1's `test/setup/dom.ts` skip registering happy-dom.
  Rationale: `bun test` discovers every `*.test.ts` under the workspace, so the files must be
  safe in the default run; the root `bunfig.toml` from EP-1 preloads happy-dom, whose `fetch`
  replacement must not stand between the live suite and the real server. The environment
  variable is the one mechanism every plan uses for DOM-free runs, so this plan adds no second
  Bun configuration file.
  Date: 2026-10-14

- Decision: The React example uses React Router 8 (`react-router` 8.4.0 at planning time,
  peer-depending on React 19.2.7 or newer) so autocapture is proven against a widely used
  router that navigates through `history.pushState`, with no React-specific page-view code.
  Rationale: The MasterPlan's integration point "Autocapture versus manual page views" states
  that routers are covered by History API patching alone; an example that calls `usePageView`
  would not prove that claim.
  Date: 2026-10-14

- Decision: The smoke test runs under Playwright's own test runner via Node 22 from the dev
  shell (`npx playwright test`), Chromium only, with browsers installed outside Nix by
  `npx playwright install chromium`.
  Rationale: Playwright's runner is Node-first; running it under Bun is not a supported
  configuration and would add a second source of flakiness to the one test whose job is to be
  trustworthy. Chromium alone is enough to prove History API patching and keepalive flush.
  Date: 2026-10-14

- Decision: The clock-skew experiment is recorded as evidence, never as acceptance.
  Rationale: The server rejects any `occurredAt` later than its own clock. Whether a browser
  one minute ahead loses events is a server policy question handed off to Kansoku in the
  MasterPlan's "Cross-repository handoffs"; this plan can only measure it.
  Date: 2026-10-14


## Outcomes & Retrospective

Both runnable examples consume built SDK exports. Two Chromium mock-server tests pass, including the exit-only event; disabling exit listeners fails that check. Seven real-server tests and two real-browser/live-metrics checks pass using fresh temporary PostgreSQL/ClickHouse services on isolated ports. Catalog drift is detected by a deliberate probe. No existing database was reset, and temporary services were stopped. The historical pinned server revision was not rebuilt; the tested native server checkout had advanced while retaining the pinned catalog. Exact pinned-code execution remains a release integration gate. The manual DevTools fallback is documented but was unnecessary because native Chromium was available.


## Context and Orientation

This repository, `kansoku-ts`, is a Bun workspace at `/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts`
(Mori project `mori://shinzui/kansoku-ts`). It holds two npm packages: `packages/kansoku-js`,
a dependency-free browser client for the Kansoku analytics service, and
`packages/kansoku-react`, React bindings over it. The root `package.json` declares
`"workspaces": ["packages/*", "examples/*"]`, so any directory under `examples/` with its own
`package.json` is a workspace member and can depend on the packages with the version
`workspace:*`. The root `justfile` is the human entry point; the root `bunfig.toml` (installed
by EP-1, `docs/plans/1-workspace-foundation-vendored-kansoku-contracts-and-generated-wire-types.md`)
preloads `test/setup/dom.ts`, which registers happy-dom (a JavaScript implementation of browser
APIs) so unit tests can touch `window` and `document` under `bun test`. Setting the environment
variable `KANSOKU_TEST_NO_DOM=1` makes that setup file skip the registration, leaving Bun's
native `fetch` and no `window` in place; it is the repository-wide way to run tests that must
talk to a real server. Both packages publish through their `exports` map to `dist/`, so
anything that imports `kansoku-js` or `kansoku-react` as a dependency, including the examples
in this plan, needs `just build` to have produced `packages/*/dist` first.

The Kansoku server lives in the sibling checkout `../kansoku` (Mori project
`mori://shinzui/kansoku`). It is a Haskell service that accepts analytics events over HTTP,
queues them in PostgreSQL, writes them to ClickHouse, and answers metric queries. This plan
runs it locally exactly as its own guide `docs/guides/getting-started.md` describes. In three
terminals, each after `cd ../kansoku && nix develop`: terminal 1 runs `just up`
(process-compose starts rootless PostgreSQL and ClickHouse and creates the database); terminal 2
runs `just migrate` then `just ch-migrate` (the PostgreSQL plan and the forward-only ClickHouse
migrations), then `just issue-key write dev "kansoku-ts examples"` and
`just issue-key service dev "kansoku-ts live tests"` (each prints an ID, then the credential
once), then `just run` (the server, listening on `http://localhost:8080`; the port comes from
`KANSOKU_SERVER_PORT`); terminal 3 is for `curl`. `curl --fail --silent http://localhost:8080/health`
prints `OK` when the server is up, and `/ready` reports four checks. `just dev-keys` issues both
credentials for the `dev` account in one step. Browser requests are allowed from any origin by
default because `KANSOKU_CORS_ORIGINS` is unset; the server's `docs/guides/configuration.md`
explains that CORS covers `/v1/*` only and permits `GET`, `POST`, `Content-Type`, `X-Api-Key`,
and `Authorization`. This plan never changes the server; if the sibling checkout is at a
different commit than `contracts/KANSOKU_COMMIT` records, the drift guard below will say so.

Terms used in this plan. A **write key** is a public credential with prefix `ksk_w_` that may
only ingest events; it is sent in the `X-Api-Key` header and may ship in a browser bundle. A
**service token** has prefix `ksk_s_`, may ingest and read metrics, and must never be put in a
browser; this plan uses one only from the live suite running under Bun. **Live conformance**
means running the SDK against a real server and asserting the server's documented responses,
as opposed to unit tests against a scripted `fetch`. The **drift guard** is a test that fetches
the server's public schema catalog at `GET /v1/schemas` and fails when it differs from
`contracts/events.json`, the copy vendored by EP-1 at the server commit recorded in
`contracts/KANSOKU_COMMIT`; it is how this repository learns that its pin is stale. **Route
interception** is Playwright's ability to answer a browser's network request from the test
instead of letting it reach a server; the smoke test uses it to stand in for Kansoku and to
inspect the bodies the SDK sends. **Keepalive** refers to `fetch(url, { keepalive: true })`,
which lets a request outlive the page that started it; the SDK uses it to flush the queue when
the page is hidden or unloaded, because `navigator.sendBeacon` cannot carry the `X-Api-Key`
header. **Clock skew** is the difference between the browser's clock and the server's; the
server rejects any event whose `occurredAt` is later than the server's own time. The **BatchAck**
is the HTTP 202 body `{"accepted": n, "rejected": [{"index": i, "eventId": "...",
"errors": ["..."]}]}` that ends every delivery attempt.

The SDK surface the examples and tests use, as delivered by EP-2
(`docs/plans/2-kansoku-js-core-event-envelope-identity-and-session-state-batched-delivery-and-exit-flush.md`)
and EP-3 (`docs/plans/3-kansoku-js-browser-capture-page-views-navigation-attribution-identity-helpers-and-experiments.md`):

```typescript
import { createKansoku } from "kansoku-js"

const client = createKansoku({
  baseUrl: "http://localhost:8080",   // no trailing slash; the SDK appends /v1/batch
  writeKey: "ksk_w_…",                // sent as X-Api-Key
  sourceService: "vanilla-example",
  // autocapture: { pageViews: true, sessions: true } are the defaults
  // fetch, now, timers are injectable for tests
  // onDrop receives { reason, events, detail }
})
client.track("cta_clicked", { cta: "pricing" })
client.page()                                     // explicit page_view
client.identify("user_42", { plan: "pro" })       // emits identify, stamps userId afterwards
client.experiment("pricing_layout", "variant_b")  // emits experiment_viewed once per session
client.reset()                                    // forgets the user, rotates anonymous id and session
client.stop(); client.start()                     // reversible lifecycle; createKansoku starts unless autoStart: false
await client.flush()
await client.shutdown()
client.stats                                      // { queued, accepted, rejected, dropped }
```

Every event the SDK sends is one JSON object in a JSON array posted to
`POST {baseUrl}/v1/batch` with `Content-Type: application/json` and `X-Api-Key`. A `page_view`
carries top-level `url`, `referrer`, and any `utm*` fields plus `properties.url` (required by
version 1 of the published schema), `properties.path`, and `properties.title`, and is stamped
with `schemaVersion: 1`. HTTP 202 ends the attempt; rejected entries are dropped with reason
`rejected` and never retried; 400, 401, 403, and 404 drop the batch with reason
`permanent_error`; 413 with more than one event splits the batch in half and resends each half;
503 with `retryable: true`, network errors, and timeouts are retried with backoff. On
`visibilitychange` to `hidden` and on `pagehide` the SDK flushes with keepalive requests of at
most 60 KiB each. With the default `persistQueue: true`, pending events are mirrored to the
`sessionStorage` key `kansoku.queue` (per tab; identity lives in `localStorage`) and the key is
emptied as batches are acknowledged.

The React surface, delivered by EP-4
(`docs/plans/4-kansoku-react-provider-hooks-and-router-agnostic-page-tracking.md`):

```tsx
import { KansokuProvider, useKansoku, useTrack, useIdentify, useExperiment } from "kansoku-react"

<KansokuProvider options={{ baseUrl, writeKey, sourceService: "react-example" }}>
  <App />
</KansokuProvider>

const track = useTrack()                       // stable track(eventName, properties?)
useIdentify(user?.id, { plan: user?.plan })    // identifies when the id becomes defined or changes
useExperiment("pricing_layout", variant)       // records exposure once per session, StrictMode-safe
const client = useKansoku()                    // the underlying KansokuClient; a no-op client during SSR
```

`KansokuProvider` leaves the `kansoku-js` defaults alone, so autocapture of page views is on
and React Router navigation (which calls `history.pushState`) is recorded without any
React-specific code. It constructs the client with `autoStart: false` and calls `start()` from
an effect and `stop()` from the effect's cleanup, so StrictMode's extra setup-and-cleanup cycle
restarts the client and records one initial `page_view`, which the React example's acceptance
counts rely on. `usePageView` exists for applications that turn autocapture off; this plan
deliberately does not use it.

ADRs. Local architecture decision records live in `docs/adr/` (the bundle EP-1 installs with
the shared `documentation.architectureDecisions` profile; validate with
`okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce`).
This plan creates no ADR: it records evidence, and the only durable context it produces is the
clock-skew measurement that feeds the cross-repository handoff listed in the MasterPlan. Three
server ADRs define what the live suite asserts, cited by the canonical handles Mori returns:
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-1` (SDK-grade ingest contract boundaries: a
syntactically valid batch always returns 202 with per-index rejections that must not be retried;
HTTP 413 is permanent and the client must split or shrink; defaults are 500 events per batch
and 5 MiB per body; CORS is scoped to `/v1/*`);
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-3` (API-key authentication: unknown or revoked
credentials return 401; write keys cannot read metrics; the credential's account overrides any
`accountId` in the body); and `mori://shinzui/kansoku/okf/adrs/concepts/ADR-7` (versioned
schema governance: `GET /v1/schemas` is public, unauthenticated, CORS-enabled, and byte-for-byte
the same catalog that the server commits as `docs/contracts/events.json`). The server's human
guide for all of this is `docs/guides/send-events.md` in the sibling checkout.

Versions current on npm at planning time (2026-10-14), to be re-checked at implementation:
`vite` 8.3.4, `@vitejs/plugin-react` 6.1.2, `react` and `react-dom` 19.3.1, `react-router`
8.4.0, `@playwright/test` 1.64.1. The dev shell provides Bun 1.4.2 and Node 22 with npm 10.9;
Playwright's runner uses Node.


## Plan of Work

The work is four milestones. The two examples come first because they are the fastest way to
see the SDK doing its job against a real server and because the smoke test later reuses the
vanilla one. The live suite follows, since it needs the same running server and credentials.
The Chromium smoke test is last because it depends on nothing but the vanilla example and
Playwright, and because its browser download is the one step that happens outside Nix.

### Milestone 1 — Vanilla Vite example against a local server

Create `examples/vanilla-vite` as a workspace member: a `package.json` named
`@kansoku-ts/example-vanilla` with `"private": true`, `kansoku-js` as a `workspace:*`
dependency, `vite` as a dev dependency, and scripts `dev`, `build`, and `preview`. The app is
one `index.html`, one `src/main.ts`, and a tiny hand-rolled router: three links (`/`,
`/pricing`, `/docs`) whose click handlers call `history.pushState` and swap the content of a
`<main>` element, plus a `popstate` listener so the back button works. There is no framework;
the point is to show that `kansoku-js` sees `pushState` and records a `page_view` with the new
`url` and `properties.path` on its own. The page also has a "Track CTA" button calling
`client.track("cta_clicked", { cta: "pricing" })`, a "Flush" button calling `client.flush()`,
and a status line that renders `client.stats` every second so a human can watch `accepted`
climb. `src/main.ts` reads `import.meta.env.VITE_KANSOKU_BASE_URL` and
`import.meta.env.VITE_KANSOKU_WRITE_KEY`, refuses to start with a visible error when either is
missing, and passes `sourceService: "vanilla-example"` and an `onDrop` handler that logs to the
console. An `.env.example` documents both variables; `.env.local` is git-ignored (add
`examples/*/.env.local` to the root `.gitignore`). The example's README repeats the server
start flow above, tells the reader where to find the write key, and states that `just build`
must run first because the example imports `kansoku-js` through its export map from
`packages/kansoku-js/dist`, exactly as an npm consumer would; there is no Vite alias to the
package sources.

Add the root recipe `dev-vanilla` that runs `bun run --cwd examples/vanilla-vite dev`.
Acceptance: with the server running, open the dev URL, click Pricing and Docs, wait for the
flush interval, and query `GET /metrics/page-views` for today with `groupBy=route` using the
service token; three routes appear with value 1 each (or more if the page was reloaded).

### Milestone 2 — React example with React Router

Create `examples/react-vite` as `@kansoku-ts/example-react` with `kansoku-react` and
`kansoku-js` as `workspace:*` dependencies, `react`, `react-dom`, and `react-router` as
dependencies, and `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom` as dev
dependencies. `src/main.tsx` renders `<StrictMode>` → `<KansokuProvider options={…}>` →
`<BrowserRouter>` → `<App />`. `App` has a nav with three `<Link>`s (`/`, `/pricing`,
`/account`), a fake sign-in form on `/account` that stores `{ id, plan }` in React state and
calls `useIdentify(user?.id, { plan: user?.plan })`, a sign-out button that calls
`client.reset()`, and a pricing page with a "variant" toggle (`control` / `variant_b`) whose
`PricingPanel` component calls `useExperiment("pricing_layout", variant)`. StrictMode matters:
it runs effects twice in development, and the example must still emit one `page_view` for the
initial load (the provider's `start()` → `stop()` → `start()` restart is deduplicated by URL)
and one `experiment_viewed` per variant per session because EP-3's exposure dedupe is doing its
job.
The same `.env.example`, `.env.local`, README, and `onDrop` logging conventions apply, with
`sourceService: "react-example"`; the README likewise states that `just build` must run first,
since both `kansoku-react` and `kansoku-js` are consumed from their `dist/` output.

Add the root recipe `dev-react`. Acceptance: with the server running, navigate `/` →
`/pricing` → `/account`, sign in as `user_42`, toggle the pricing variant twice (control →
variant_b → control), and reload nothing. The server's `GET /metrics/page-views` shows three
routes; `GET /metrics/events` with `groupBy=event_name` shows `page_view` 3, `identify` 1,
`experiment_viewed` 2 (one per distinct variant, not three), and `session_start` 1.

### Milestone 3 — Live conformance suite

Create `test/live/env.ts`, which reads `KANSOKU_LIVE_BASE_URL`,
`KANSOKU_LIVE_WRITE_KEY`, and optional `KANSOKU_LIVE_SERVICE_TOKEN`, exports `live` (true when
the first two are set) and a `describeLive = live ? describe : describe.skip` helper, and, when
skipping, prints one line explaining which variables to set. When `live` is true it also throws
a clear error if `globalThis.window` exists, which means the suite was started without
`KANSOKU_TEST_NO_DOM=1` and happy-dom's `fetch` would be in the way. Every test file in `test/live/`
uses `describeLive`, so the default `bun test` from the repository root passes with these tests
marked skipped and the message visible.

`test/live/catalog.test.ts` is the drift guard: it fetches `${base}/v1/schemas` without
credentials, parses it, and deep-compares it with the parsed `contracts/events.json`. The
failure message names `contracts/KANSOKU_COMMIT` and tells the reader to run
`just sync-contracts && just generate-schema` and review the diff, or to check out that commit
in `../kansoku`.

`test/live/ingest.test.ts` exercises the delivery contract through the SDK with an injected
`fetch` wrapper that records every request and response but forwards to Bun's real `fetch`:
one `client.page()` call with an explicit URL after `client.flush()` yields exactly one request
to `/v1/batch` with HTTP 202 and `{ accepted: 1, rejected: [] }`, and `client.stats.accepted`
is 1; a raw `fetch` POST of a `page_view` with `properties: {}` (no `url`) returns 202 with
`rejected[0].index === 0` and an error string mentioning `url`, which proves the server, not the
SDK, is the one doing schema validation; a client with `maxBatchEvents: 501` and
`flushAt: 501` given 501 events with one-character properties exercises 413 handling: the first
request returns 413 with `code` set and `retryable: false`, the SDK splits, and after
`flush()` the recorded requests show the halves accepted with the sum of `accepted` equal to
501 and `stats.dropped` equal to 0 (read the default batch cap of 500 from the server's
`docs/guides/send-events.md` before writing the assertion, and read the configured cap from
the environment if the local server overrides it); a client created with `writeKey:
"ksk_w_bogus"` and one event ends with HTTP 401, `stats.dropped` 1, and an `onDrop` call with
reason `permanent_error` and no retry (exactly one recorded request).

`test/live/clock-skew.test.ts` is the experiment: a client with `now: () => Date.now() +
60_000` sends one `page_view`; the test records the response (202 with the event accepted, or
202 with it rejected and the server's message about `occurredAt` being in the future) and
writes a one-line summary to the console. It passes in both cases. The implementer copies the
observed outcome into this plan's Surprises & Discoveries with the response excerpt, because
the MasterPlan hands that evidence to the server maintainers.

`test/live/metrics.test.ts` runs only when `KANSOKU_LIVE_SERVICE_TOKEN` is set. It sends a
`page_view` with a unique `url` such as `https://live.test/${crypto.randomUUID()}`, then polls
`GET /metrics/page-views?from=<today>&to=<tomorrow>&groupBy=route` with `Authorization: Bearer
<token>` every two seconds for up to sixty seconds until a point whose `group.route` matches
appears. The test explains in a comment that the writer moves events from PostgreSQL to
ClickHouse asynchronously (normally within five seconds) and that rollups are therefore
eventually consistent, which is why it polls rather than asserting immediately.

Add the root recipe `test-live` running `KANSOKU_TEST_NO_DOM=1 bun test test/live`. The
variable makes EP-1's `test/setup/dom.ts` skip happy-dom registration, so the suite talks to
the server through Bun's native `fetch`; the suite must fail with a clear message if it finds a
`window` global, which means someone ran it without the variable. Acceptance: with the server
running and the three variables exported, `just test-live` passes; with them unset, it reports
the skip message and exits 0.

### Milestone 4 — Chromium smoke test

Add `@playwright/test` as a root dev dependency and `test/smoke/playwright.config.ts` with
Chromium as the only project, `webServer` set to build and preview the vanilla example
(`bun run --cwd examples/vanilla-vite build && bun run --cwd examples/vanilla-vite preview
--port 4173 --strictPort`, with `VITE_KANSOKU_BASE_URL=http://kansoku.test` and
`VITE_KANSOKU_WRITE_KEY=ksk_w_smoke` set for the build so no server is needed), and
`testDir: "./test/smoke"`. `test/smoke/vanilla.spec.ts` registers
`page.route("http://kansoku.test/v1/batch", …)` that records each request body and replies
`202` with `{ accepted: <count>, rejected: [] }`, then: loads `/`; clicks Pricing and Docs;
calls `page.waitForRequest` until the recorded `page_view` events cover `/`, `/pricing`, and
`/docs` with `properties.url` equal to the full URL and `schemaVersion` 1; clicks Track CTA and
confirms a `cta_clicked` event arrives; then navigates to `about:blank` and asserts that a final
request arrived with the remaining events and that `request.headers()["x-api-key"]` is
`ksk_w_smoke` on every request. Before navigating away it evaluates
`sessionStorage.getItem("kansoku.queue")` to confirm events were mirrored while pending (the
mirror is per tab, which is why it is `sessionStorage` and not `localStorage`), and after
re-opening `/` in the same Playwright page (same tab, so the same `sessionStorage`) it asserts
the key is `null` or `[]`, proving the exit flush was acknowledged and the queue emptied rather
than replayed. Also assert that at
least one request was `pushState`-triggered by checking that the browser never performed a
full navigation (count `page.on("load")` events; expect exactly one for the initial load and
one for the re-open).

Install the browser once per machine with `npx playwright install chromium`; it downloads to
`~/Library/Caches/ms-playwright` on macOS and `~/.cache/ms-playwright` on Linux, outside the
Nix store, which is why this step is outside the dev shell's declarative tooling. Add the root
recipe `test-smoke`, depending on `build`, that runs
`npx playwright test --config test/smoke/playwright.config.ts`; the vanilla example's own
`vite build` inside `webServer` resolves `kansoku-js` through its export map to
`packages/kansoku-js/dist`, so the packages must be built first.

Document the manual fallback in `test/smoke/README.md` for machines where the browser download
is blocked: run `just dev-vanilla`, open Chrome DevTools → Network, tick "Preserve log", filter
on `batch`, click through the routes, navigate to another site, and confirm the last
`POST /v1/batch` row shows the `keepalive`-flagged request with the remaining events and a 202
response; then check Application → Session Storage → `kansoku.queue` is empty. The fallback must
be exercised once and the observation recorded in Surprises & Discoveries.

Acceptance: `just test-smoke` passes in headless Chromium; the test fails if the final batch is
missing, which is the regression it exists to catch.


## Concrete Steps

All commands run from the repository root `/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts`
inside `nix develop` (or with `direnv` active) unless stated otherwise. Server commands run from
`/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku` inside its own `nix develop`.

Start the server (three terminals in `../kansoku`):

```bash
# terminal 1
nix develop
just up

# terminal 2
nix develop
just migrate
just ch-migrate
just issue-key write dev "kansoku-ts examples"
just issue-key service dev "kansoku-ts live tests"
just run

# terminal 3
nix develop
curl --fail --silent http://localhost:8080/health   # prints OK
```

Scaffold and run the vanilla example:

```bash
mkdir -p examples/vanilla-vite/src
# create package.json, index.html, src/main.ts, .env.example, README.md as described in Milestone 1
cp examples/vanilla-vite/.env.example examples/vanilla-vite/.env.local
# edit .env.local: VITE_KANSOKU_BASE_URL=http://localhost:8080 and the printed ksk_w_… key
bun install
just dev-vanilla   # depends on `build`, so packages/*/dist is produced first
```

Expected `just dev-vanilla` output:

```text
  VITE v8.x.x  ready in 180 ms
  ➜  Local:   http://localhost:5173/
```

Verify page views landed (terminal 3, after clicking Pricing and Docs and waiting about ten
seconds):

```bash
export KANSOKU_SERVICE_TOKEN='ksk_s_…'
TODAY=$(date -u +%F); TOMORROW=$(date -u -v+1d +%F 2>/dev/null || date -u -d tomorrow +%F)
curl --fail-with-body --get http://localhost:8080/metrics/page-views \
  --header "Authorization: Bearer $KANSOKU_SERVICE_TOKEN" \
  --data-urlencode "from=$TODAY" --data-urlencode "to=$TOMORROW" \
  --data-urlencode 'groupBy=route' | jq .
```

```json
{
  "metric": "page_views",
  "points": [
    {"bucket": "2026-10-15", "group": {"route": "/"}, "value": 1},
    {"bucket": "2026-10-15", "group": {"route": "/docs"}, "value": 1},
    {"bucket": "2026-10-15", "group": {"route": "/pricing"}, "value": 1}
  ]
}
```

Scaffold and run the React example:

```bash
mkdir -p examples/react-vite/src
# create package.json, index.html, vite.config.ts, src/main.tsx, src/App.tsx, .env.example, README.md
cp examples/react-vite/.env.example examples/react-vite/.env.local   # then edit as above
bun install
just dev-react     # depends on `build`, so packages/*/dist is produced first
```

After the scripted walk-through in Milestone 2, confirm event counts by name:

```bash
curl --fail-with-body --get http://localhost:8080/metrics/events \
  --header "Authorization: Bearer $KANSOKU_SERVICE_TOKEN" \
  --data-urlencode "from=$TODAY" --data-urlencode "to=$TOMORROW" \
  --data-urlencode 'groupBy=event_name' | jq '.points[] | {name: .group.event_name, value}'
```

```text
{"name": "experiment_viewed", "value": 2}
{"name": "identify", "value": 1}
{"name": "page_view", "value": 3}
{"name": "session_start", "value": 1}
```

(Counts are per account and per day; if the vanilla example ran first in the same account,
`page_view` and `session_start` will include its events too. Use a fresh account via
`just issue-key write react …` if exact numbers matter.)

Run the live suite:

```bash
export KANSOKU_LIVE_BASE_URL=http://localhost:8080
export KANSOKU_LIVE_WRITE_KEY='ksk_w_…'
export KANSOKU_LIVE_SERVICE_TOKEN='ksk_s_…'   # optional; enables metrics.test.ts
just test-live
```

```text
bun test v1.4.2
test/live/catalog.test.ts:
✓ live catalog > GET /v1/schemas equals contracts/events.json
test/live/ingest.test.ts:
✓ live ingest > one page_view is accepted with 202
✓ live ingest > a page_view without properties.url is rejected by index, never retried
✓ live ingest > 501 events hit 413, split, and are fully delivered
✓ live ingest > a bogus write key yields 401 and a permanent_error drop
test/live/clock-skew.test.ts:
clock-skew: occurredAt +60s → 202 rejected[0]: "receivedAt (…) precedes occurredAt (…); occurredAt is in the future relative to the server clock"
✓ live clock skew > records the server's reaction to a browser clock 60 s ahead
test/live/metrics.test.ts:
✓ live metrics > the page_view appears in /metrics/page-views within 60 s

 7 pass
 0 fail
```

Without the variables:

```bash
unset KANSOKU_LIVE_BASE_URL KANSOKU_LIVE_WRITE_KEY KANSOKU_LIVE_SERVICE_TOKEN
just test-live
```

```text
live tests skipped: set KANSOKU_LIVE_BASE_URL and KANSOKU_LIVE_WRITE_KEY (and optionally KANSOKU_LIVE_SERVICE_TOKEN) to run them
 0 pass
 7 skip
 0 fail
```

Run the default unit suite to confirm the live files are harmless there:

```bash
bun test
```

The output lists the live tests as skipped alongside the packages' passing unit tests.

Install Playwright's browser once (outside the Nix tooling; needs network) and run the smoke
test:

```bash
bun add -d @playwright/test
npx playwright install chromium
just test-smoke
```

```text
Running 1 test using 1 worker
  ✓  1 [chromium] › test/smoke/vanilla.spec.ts:12:1 › vanilla example records SPA page views and flushes on exit (4.2s)
  1 passed (6.1s)
```

Add the four recipes to the root `justfile`:

```just
# Run the vanilla Vite example against the server in examples/vanilla-vite/.env.local
# (depends on `build` because the example imports kansoku-js from packages/kansoku-js/dist)
dev-vanilla: build
    bun run --cwd examples/vanilla-vite dev

# Run the React Router example against the server in examples/react-vite/.env.local
dev-react: build
    bun run --cwd examples/react-vite dev

# Opt-in live conformance suite; skips unless KANSOKU_LIVE_BASE_URL and KANSOKU_LIVE_WRITE_KEY are set
test-live:
    KANSOKU_TEST_NO_DOM=1 bun test test/live

# Chromium smoke test over the vanilla example (needs `npx playwright install chromium` once)
test-smoke: build
    npx playwright test --config test/smoke/playwright.config.ts
```

`build` is EP-1's recipe that bundles both packages into `packages/*/dist`; the three recipes
above depend on it so a fresh clone cannot run an example against stale or missing output.


## Validation and Acceptance

Required acceptance, each phrased as something a person can observe:

Milestone 1 is accepted when, with a local server running and `examples/vanilla-vite/.env.local`
filled in, `just dev-vanilla` serves the page, clicking Pricing then Docs changes the URL
without a full reload (the DevTools Network panel shows no document request), and the
`page-views` metric query above returns the three routes for today's bucket.

Milestone 2 is accepted when the React walk-through yields the `events` metric grouped by name
showing `experiment_viewed` 2 after three toggles across two variants, `identify` 1, and
`page_view` 3, with React StrictMode enabled in `src/main.tsx` (verify by reading the file; do
not remove StrictMode to make the count come out).

Milestone 3 is accepted when `just test-live` prints the seven passing tests with the server
running and the skip message with the variables unset, when the catalog test fails with the
documented message if `contracts/events.json` is hand-edited (then restored), and when this
plan's Surprises & Discoveries holds the clock-skew observation with the server's response
excerpt.

Milestone 4 is accepted when `just test-smoke` passes headless, and when commenting out the
`pagehide`/`visibilitychange` flush in `packages/kansoku-js/src/lifecycle.ts` (then restoring
it) makes the final-batch assertion fail. That negative check is the proof the test is
observing exit flush and not an ordinary interval flush.

The early representative interaction check for this plan is the drift guard: run
`test/live/catalog.test.ts` first, before the ingest tests, because if the catalog has drifted,
the rejection messages the ingest tests assert on may have changed too.

Proposals that are not acceptance for this plan: a Firefox or WebKit project in the Playwright
configuration; a GitHub Actions job that runs the smoke test (EP-6 may add it); a Node-side
read-back of `GET /metrics/experiments` for the React example.


## Idempotence and Recovery

Every step here can be repeated. `bun install` is idempotent. Re-running the examples against
the same account accumulates events; the metric queries are per UTC day, so counts grow during
a day and reset the next. For exact counts, issue a fresh write key for a new account name
(`just issue-key write <account> "…"` in `../kansoku`) and point `.env.local` at it. The live
suite generates fresh `eventId` values on every run and never asserts absolute totals, only
per-request outcomes and the appearance of its own unique URL, so it can run repeatedly against
a long-lived account. The 413 test sends 501 events of a few bytes each; it adds about 501 rows
per run to the account, which is harmless for a development database. If the server is down,
the live suite fails fast on the first `fetch` with a connection error naming the base URL;
start the server and rerun. If `npx playwright install chromium` fails for network reasons,
use the documented manual Chrome fallback and record that it was used. Never run the server's
`just ch-reset`; it is destructive and unrelated to this plan.


## Interfaces and Dependencies

Prerequisites declared by the MasterPlan's Exec-Plan Registry, at milestone granularity.
Milestones 1, 3, and 4 require EP-3
(`docs/plans/3-kansoku-js-browser-capture-page-views-navigation-attribution-identity-helpers-and-experiments.md`)
to be Complete, because they exercise only `kansoku-js`: its `page_view` autocapture, History
API patching, `track`, `experiment`, delivery contract, and exit flush. Milestone 2 requires
EP-4 (`docs/plans/4-kansoku-react-provider-hooks-and-router-agnostic-page-tracking.md`) to be
Complete, because the React example is built on `KansokuProvider`, `useIdentify`, and
`useExperiment`. Do not start Milestone 2 against an in-progress EP-4, and do not weaken the
EP-3 prerequisite to a milestone of EP-3: the examples and the smoke test depend on the whole
capture surface. The soft dependency on EP-6
(`docs/plans/6-release-engineering-package-checks-size-budget-docs-and-trusted-publishing.md`)
means the examples benefit from its package-shape checks but do not wait for them. The examples
consume the built `dist/` output of both packages through their `exports` maps, exactly as a
published consumer would; there is no Vite alias to `src/`, and every example README states
that `just build` must run first (the `dev-vanilla`, `dev-react`, and `test-smoke` recipes
depend on `build` so this cannot be forgotten).

Artifacts this plan consumes and must not redefine: `createKansoku`, `KansokuOptions`
(`baseUrl`, `writeKey`, `sourceService`, `maxBatchEvents`, `flushAt`, `fetch`, `now`, `onDrop`),
`KansokuClient` (`track`, `page`, `identify`, `experiment`, `reset`, `flush`, `shutdown`,
`stats`) from `packages/kansoku-js/src/index.ts`; `KansokuProvider`, `useKansoku`, `useTrack`,
`useIdentify`, `useExperiment` from `packages/kansoku-react/src/index.ts`; the `sessionStorage`
key `kansoku.queue` and the keepalive exit flush from `packages/kansoku-js/src/lifecycle.ts`;
`contracts/events.json` and `contracts/KANSOKU_COMMIT` from EP-1.

Artifacts this plan owns: `examples/vanilla-vite/**`, `examples/react-vite/**`,
`test/live/env.ts`, `test/live/*.test.ts`,
`test/smoke/playwright.config.ts`, `test/smoke/vanilla.spec.ts`, `test/smoke/README.md`, the
four `justfile` recipes, and the `.gitignore` entry for `examples/*/.env.local`. The environment
variables `KANSOKU_LIVE_BASE_URL`, `KANSOKU_LIVE_WRITE_KEY`, and `KANSOKU_LIVE_SERVICE_TOKEN` are
defined here and referenced by EP-6's documentation.

External services and libraries whose choice matters: the Kansoku server at the commit in
`contracts/KANSOKU_COMMIT` (its `GET /v1/schemas`, `POST /v1/batch`, `GET /metrics/page-views`,
and `GET /metrics/events` routes); Vite 8 and `@vitejs/plugin-react` 6; React 19 and React
Router 8 (whose `BrowserRouter` navigates with `history.pushState`); `@playwright/test` 1.64
with Chromium only, run by Node 22 from the dev shell. The live suite relies on EP-1's
`KANSOKU_TEST_NO_DOM=1` contract in `test/setup/dom.ts`; if that switch ever changes name or
behaviour, the `test-live` recipe and the `window` guard in `test/live/env.ts` change with it.

Revision note (2026-10-14): native Chromium proved that exit acknowledgements cannot reliably execute in a destroyed document. Acceptance now permits recovery attempts with the same eventId and requires eventual mirror clearing; the pre-reload exit receipt and negative regression check remain mandatory. The smoke tests use .pw.ts to avoid Bun discovery and a real HTTP mock so exit requests survive page teardown.

Acceptance evidence (2026-10-14): the temporary native environment at `/tmp/kansoku-sdk-live-umbrgxj1` ran 7 live tests and 2 Chromium live-example tests successfully. The server catalog structurally equals the catalog vendored from `d61cf0c4b53bc6f9128f8589cd287c107f394427`; the source checkout in `mori://shinzui/kansoku` had advanced to `cd0ec9f` during this session. A +60-second producer clock yielded HTTP 202 with `accepted: 0`, one index-0 rejection and detail `occurredAt is in the future relative to the server clock`. The first metrics probe failed because a DOM-free track call put URL only in properties; the live fixture now supplies the same top-level URL that browser page() supplies.

Revision note (2026-10-14): automated Chromium was available and exercised all browser behavior, so the manual fallback remains documentation for blocked browser installs rather than a duplicate acceptance run. Exact historical pinned-code execution remains explicitly unverified before release.

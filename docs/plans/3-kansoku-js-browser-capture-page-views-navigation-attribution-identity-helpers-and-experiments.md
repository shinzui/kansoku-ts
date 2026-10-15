---
id: 3
slug: kansoku-js-browser-capture-page-views-navigation-attribution-identity-helpers-and-experiments
title: "kansoku-js browser capture: page views, navigation, attribution, identity helpers, and experiments"
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
      note: "Bind initial page view and History patch to start/stop via onStart, add Global Privacy Control gate"
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-10-15T03:59:45Z
      mode: "implement"
      note: "Implement browser capture, identity helpers, exposure dedupe and privacy gates"
---

# kansoku-js browser capture: page views, navigation, attribution, identity helpers, and experiments

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.


## Purpose / Big Picture

After the previous plan, `kansoku-js` can deliver events reliably, but an application still has
to describe every event by hand: it must call `track("page_view", { url: location.href })` on
every navigation, remember to put the user's id on every event after login, and build
experiment-exposure events itself. This plan turns the delivery engine into a web analytics SDK.
When it is complete, a page that does nothing more than

```typescript
import { createKansoku } from "kansoku-js"

const kansoku = createKansoku({
  baseUrl: "https://analytics.example.com",
  writeKey: "ksk_w_…",
})
```

records a `page_view` for the initial load and for every single-page navigation, with the
page URL, referrer, title, and campaign (UTM) attribution filled in, and with locale, time
zone, screen and viewport size, user agent, and the SDK version attached as context. The
application can call `kansoku.identify("user_42", { plan: "pro" })` once after login and every
later event carries `userId`; it can call `kansoku.alias`, `kansoku.group`, and
`kansoku.setIdentifiers` to send the identity evidence the server understands; it can call
`kansoku.experiment("pricing_page", "variant_b")` where a variant is rendered and the SDK emits
exactly one `experiment_viewed` per session for that pair; and it can call `kansoku.reset()` at
logout to forget the user. Users who set the browser's Do Not Track signal can be honoured with
one option. Every event these features produce is built through the same envelope builder,
queue, and transport that the previous plan verified, so delivery behaviour does not change.

You can see it working by running the package's unit tests (`bun test packages/kansoku-js`),
which drive a simulated browser through navigation, login, and experiment exposure and assert
the exact JSON batches that reach the mocked server. The React bindings plan
(`docs/plans/4-kansoku-react-provider-hooks-and-router-agnostic-page-tracking.md`) and the
examples plan (`docs/plans/5-examples-live-contract-conformance-and-real-browser-smoke-test.md`)
build directly on the surface this plan adds.


## Progress

- [x] (2026-10-14; package suite, SSR smoke, build and checks pass) Milestone 1 — `page()` records a `page_view` with attribution and context, and
  `createKansoku` autocaptures the initial page view. Accepted when `bun test
  packages/kansoku-js/test/page.test.ts packages/kansoku-js/test/attribution.test.ts
  packages/kansoku-js/test/context.test.ts` passes and the mocked batch contains the event
  shape shown in Validation and Acceptance.
- [x] (2026-10-14; package suite, SSR smoke, build and checks pass) Milestone 2 — single-page navigation produces page views: `history.pushState`,
  `history.replaceState`, and `popstate` each yield a deduplicated `page_view`, the patch is
  installed by `start()` and removed by `stop()` (and therefore by `shutdown()`), a client
  created with `autoStart: false` records nothing until `start()`, and the
  `autocapture.pageViews` / `autocapture.sessions` switches work.
  Accepted when `bun test packages/kansoku-js/test/navigation.test.ts` passes and the
  happy-dom script in Validation and Acceptance prints two page views.
- [x] (2026-10-14; package suite, SSR smoke, build and checks pass) Milestone 3 — identity API: `identify`, `alias`, `group`, `setIdentifiers`, and `reset`
  emit the exact shapes of the Haskell SDK helpers, validate inputs client-side, and persist
  state under the agreed storage keys. Accepted when `bun test
  packages/kansoku-js/test/identity-api.test.ts` passes.
- [x] (2026-10-14; package suite, SSR smoke, build and checks pass) Milestone 4 — `experiment()` with validation and per-session dedupe, Global Privacy
  Control, Do Not Track, and opt-out gating of all capture, server-side-rendering import
  safety, README API
  documentation, and ADR updates. Accepted when `bun test packages/kansoku-js` passes in
  full, `bun run scripts/ssr-smoke.ts` prints `ssr-smoke: ok`, `just check` passes, and
  `okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce
  --log-enforce` passes.


## Surprises & Discoveries

Exposure dedupe is persisted only after successful enqueue, so beforeSend redaction or capacity drops do not prevent a later valid exposure. The SSR smoke injects a successful transport rather than waiting on an unavailable localhost service; it exercises import and capture/lifecycle safety without adding a network prerequisite.


## Decision Log

- Decision: Autocaptured events are skipped silently when the client is opted out (or an
  honoured privacy signal, Global Privacy Control or Do Not Track, is set), while explicit
  calls (`track`, `page`, `identify`, …) made while opted
  out continue to go through the delivery engine's existing drop path with reason
  `opted_out`.
  Rationale: An application that opts out should not receive one `onDrop` callback per
  navigation for events it never asked for; explicit calls are the application's own and the
  existing accounting stays observable.
  Date: 2026-10-14

- Decision: `alias` does not change the persisted user id; only `identify` sets it. `group`
  persists `organizationId` so later events carry it.
  Rationale: Matches the server's identity model, where `alias` is evidence linking two ids
  (ADR-5: cookie bindings are created only by `identify` and `alias`) rather than a change of
  the current user, and matches the Haskell helper, which is stateless. Persisting the group is
  what makes `group()` useful on a page that keeps emitting events.
  Date: 2026-10-14

- Decision: Single-page navigation page views are captured on the next macrotask after the
  History API call and deduplicated by origin, path, and query (hash-only changes are
  ignored), so a router that calls `pushState` and immediately `replaceState` yields one
  event, and a title set synchronously after navigation is observed.
  Rationale: Routers commonly rewrite the URL twice per navigation and update `document.title`
  after the URL change; capturing synchronously would double count and record stale titles.
  Date: 2026-10-14

- Decision: Context is collected per event (not once at start-up) and contains exactly
  `locale`, `timezone`, `screen`, `viewport`, `userAgent`, and `library`. No field that could
  identify a person (IP address, precise geolocation, fingerprint hashes) is collected by
  default; applications that want a fingerprint must compute it themselves and pass it through
  `setIdentifiers`.
  Rationale: Viewport changes between events; the server derives device and browser context
  from `userAgent`; the default must be safe to deploy without a privacy review of the SDK.
  Date: 2026-10-14

- Decision: The initial page view and the History API patch are installed through the delivery
  engine's internal `onStart` hook, so `start()` installs them and `stop()` removes them, instead
  of running at the end of `createKansoku` and being torn down only by `shutdown()`.
  Rationale: The second plan's lifecycle is reversible (`start`/`stop`, with `autoStart`) so the
  React provider can drive it from an effect; capture must follow the same lifecycle or a stopped
  client would keep recording page views. The dedupe key survives `stop()`, so a restart on the
  same URL records nothing extra, which is what React StrictMode's extra cycle requires.
  Date: 2026-10-14

- Decision: Honour Global Privacy Control (`navigator.globalPrivacyControl === true`) behind
  `respectGlobalPrivacyControl`, beside Do Not Track behind `respectDoNotTrack`; both default
  to `false` and share one suppression path.
  Rationale: Firefox removed its Do Not Track setting in version 135 and points users to Global
  Privacy Control, which Brave and DuckDuckGo send by default and which has legal force in
  several jurisdictions; an SDK shipped in 2026 with only a Do Not Track gate would be honouring
  the wrong signal. Defaults stay opt-in because the reference SDKs leave the policy to the
  application.
  Date: 2026-10-14


## Outcomes & Retrospective

Implemented page views, navigation, context, attribution, identity and exposure helpers and privacy gates on the shared core. All 41 kansoku-js tests pass, along with SSR smoke, type checks, build and strict validation of four ADRs. Capture is lifecycle-bound and restart-deduplicated for React StrictMode.


## Context and Orientation

### Where this plan starts

This repository, `kansoku-ts`, is a Bun workspace that publishes two npm packages for the
Kansoku analytics service. The service itself is a Haskell server in the sibling repository
registered in Mori as `mori://shinzui/kansoku` (checked out at `../kansoku`). The MasterPlan
`docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md` coordinates six
plans; this is the third. It hard-depends on the second plan,
`docs/plans/2-kansoku-js-core-event-envelope-identity-and-session-state-batched-delivery-and-exit-flush.md`,
being Complete, which means the following already exists in the working tree when you start:

- `packages/kansoku-js/` with `package.json`, `tsconfig.json`, `tsconfig.build.json`,
  `README.md`, and `src/`.
- `packages/kansoku-js/src/index.ts` exporting `createKansoku`, `version`, the public types,
  and the event-name constants.
- `packages/kansoku-js/src/types.ts` declaring `KansokuOptions`, `KansokuClient`,
  `TrackOptions`, `DropInfo`, `DropReason`, `JsonObject`, and `IdentifierKind`.
- `packages/kansoku-js/src/client.ts` implementing `createKansoku` with `track`, `flush`,
  `start`, `stop`, `shutdown`, `optOut`, `optIn`, `isOptedOut`, `getAnonymousId`, `getUserId`,
  `getSessionId`, `stats`, and `config`, and the `autoStart` option.
- `packages/kansoku-js/src/envelope.ts` (builds an `AnalyticsEvent` from a name, properties,
  and options), `src/queue.ts`, `src/transport.ts`, `src/retry.ts`, `src/storage.ts`,
  `src/identity.ts`, `src/session.ts`, `src/lifecycle.ts`, `src/contract/wire.ts`,
  `src/contract/events.ts`, and `src/contract/validate.ts`.
- `packages/kansoku-js/src/generated/schema.ts`, generated from `contracts/openapi.json` by
  the first plan; never edit it by hand.
- `contracts/events.json`, the server's schema catalog at the pinned commit recorded in
  `contracts/KANSOKU_COMMIT`.
- A test harness: `bunfig.toml` preloads `test/setup/dom.ts`, which registers happy-dom
  browser globals, and `test/helpers/fetch-mock.ts` provides a scripted `fetch`.
- `docs/adr/`, a profile-governed Architecture Decision Record bundle installed by the first
  plan, containing at least the records the second plan created.

Run every command in this plan from the repository root,
`/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts`, inside the Nix dev shell (`nix
develop`, or automatically via direnv). The shell provides `bun` 1.4.2, `tsc` 7.0.2,
`oxlint`, `oxfmt`, and `just`.

### Terms used in this plan

- **SPA** (single-page application): a web application that changes what the user sees by
  rewriting the URL in place rather than loading a new HTML document. Because no new document
  loads, nothing fires a "page loaded" signal, so analytics SDKs must observe URL rewrites
  themselves.
- **History API**: the browser's `history.pushState(state, title, url)` and
  `history.replaceState(state, title, url)` methods, which change `location` without a
  reload, and the `popstate` event, which fires when the user presses Back or Forward (or
  code calls `history.back()`). Routers such as React Router use these under the hood.
- **Page view**: the Kansoku event named `page_view`. Its governed schema, version 1,
  requires one property, `url`, the full URL of the viewed page.
- **Referrer**: the URL of the page the user came from, exposed as `document.referrer`. It is
  empty for direct visits and is set by the browser, not by code.
- **UTM parameters**: the five campaign-attribution query-string fields `utm_source`,
  `utm_medium`, `utm_campaign`, `utm_content`, and `utm_term`, for example
  `?utm_source=newsletter&utm_campaign=launch`. Kansoku stores them as the top-level event
  fields `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, and `utmTerm`.
- **Autocapture**: events the SDK records without an explicit call. In this initiative that
  means page views (this plan) and session starts (the second plan).
- **Context**: the `context` object every Kansoku event carries, describing the environment
  the event came from (locale, time zone, screen) as opposed to `properties`, which describe
  the event itself.
- **Do Not Track (DNT)**: a legacy browser preference exposed as `navigator.doNotTrack` (the
  string `"1"` when enabled). Firefox removed the setting in version 135 (February 2025) and
  Chrome and Safari never exposed the property; some users still send it through other means,
  so honouring it is opt-in through `respectDoNotTrack`.
- **Global Privacy Control (GPC)**: the privacy signal browsers now promote, exposed as
  `navigator.globalPrivacyControl` (`true` when the user has asked sites not to sell or share
  their data). Firefox, Brave, and DuckDuckGo expose it; Chrome and Safari do not, so the
  property is `undefined` there. It carries legal weight in several jurisdictions. Honouring it
  is opt-in through `respectGlobalPrivacyControl`.
- **Started / stopped**: the two states of a constructed client, moved between by the idempotent
  `start()` and `stop()` methods the second plan added. Only a started client has its exit-flush
  listeners, flush interval, and (after this plan) History API patch active; `createKansoku`
  starts the client itself unless `autoStart: false` is passed.
- **Identity signal**: evidence that ties an anonymous visitor to a known user. Kansoku
  accepts the implicit cookie signal (`anonymousId`) plus an optional `identifiers` object
  whose keys are exactly `cookie`, `device`, `fingerprint`, and `email_sha256` and whose
  values are 1–256 printable, non-space ASCII characters.
- **Exposure**: the moment a user is actually shown an experiment variant. Kansoku's canonical
  exposure event is `experiment_viewed` with string properties `experiment` and `variant`;
  assignment that is never rendered is not an exposure.
- **Server-side rendering (SSR)**: running application code on a server (Node, Bun, an edge
  runtime) where `window`, `document`, and `navigator` do not exist. A module that touches
  them at import time crashes such a build.

### The surface this plan extends

The MasterPlan fixes the public surface of `kansoku-js`. The second plan implemented the
members marked EP-2 below; this plan adds the members marked EP-3 in the same `src/types.ts`
and `src/client.ts`, and adds the options it needs.

```typescript
export interface KansokuOptions {
  baseUrl: string
  writeKey: string
  sourceService?: string
  autoStart?: boolean                                          // EP-2; default true
  flushAt?: number
  flushIntervalMs?: number
  maxQueueSize?: number
  maxBatchEvents?: number
  maxBatchBytes?: number
  maxRetries?: number
  retryBaseDelayMs?: number
  requestTimeoutMs?: number
  persistQueue?: boolean
  storage?: "localStorage" | "cookie" | "memory" | StorageAdapter
  storageKeyPrefix?: string
  cookieDomain?: string
  sessionTimeoutMs?: number
  schemaVersions?: Record<string, number>
  autocapture?: { pageViews?: boolean; sessions?: boolean }   // EP-3 adds pageViews handling
  optOut?: boolean
  respectDoNotTrack?: boolean                                  // EP-3 implements the gate
  respectGlobalPrivacyControl?: boolean                        // EP-3 implements the gate
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null
  onDrop?: (info: DropInfo) => void
  fetch?: typeof globalThis.fetch
  now?: () => number
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  debug?: boolean
}

export interface KansokuClient {
  // EP-2
  track(eventName: string, properties?: JsonObject, options?: TrackOptions): void
  flush(): Promise<void>
  start(): void
  stop(): void
  shutdown(): Promise<void>
  optOut(): void
  optIn(): void
  isOptedOut(): boolean
  getAnonymousId(): string
  getUserId(): string | undefined
  getSessionId(): string
  readonly stats: Readonly<{ queued: number; accepted: number; rejected: number; dropped: number }>
  readonly config: ResolvedKansokuOptions
  // EP-3 (this plan)
  page(properties?: JsonObject, options?: TrackOptions): void
  identify(userId: string, traits?: JsonObject): void
  alias(previousId: string, newId: string, properties?: JsonObject): void
  group(organizationId: string, properties?: JsonObject): void
  experiment(experiment: string, variant: string, properties?: JsonObject, options?: ExperimentOptions): void
  setIdentifiers(identifiers: Partial<Record<IdentifierKind, string>>): void
  reset(): void
}

export interface TrackOptions { schemaVersion?: number; occurredAt?: Date; context?: JsonObject }
export interface ExperimentOptions { force?: boolean }
export type IdentifierKind = "cookie" | "device" | "fingerprint" | "email_sha256"
export type DropReason =
  | "queue_full" | "rejected" | "permanent_error" | "retries_exhausted"
  | "before_send" | "opted_out" | "invalid"
```

The second plan's internal modules are what this plan calls. The names below are the agreed
internal interface between the two plans; use them exactly as written.

- `src/envelope.ts` exports `buildEvent(name, properties, options, webFields?, ids?)`, the one
  function that builds every event. It stamps `eventId` (`crypto.randomUUID()` with a
  fallback), `eventName`, `source: "web"`, `sourceService`, `occurredAt` and `receivedAt`
  (`new Date(now()).toISOString()`), `anonymousId`, `sessionId`, and, when known, `userId`,
  `organizationId`, `identifiers`; `schemaVersion` only when pinned; `properties` and
  `context` always objects. The optional fourth argument `webFields` carries the top-level web
  fields `url`, `referrer`, `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, and
  `utmTerm`; `page()` is the caller that populates it. The builder also accepts an explicit
  `ids` argument (`{ anonymousId?: string; userId?: string }`) that overrides the identity
  store's values for one event; only `alias` uses it. Every capture feature in this plan
  builds its event with `buildEvent`; none of them constructs an `AnalyticsEvent` literal.
- `src/client.ts` holds the internal client object: the `ResolvedKansokuOptions` (declared in
  `src/types.ts`), the identity store, the session manager, the queue, the storage adapter,
  `enqueueBuilt(event)` — which runs validation, `beforeSend`, the enqueue, and the
  flush-threshold check for an already-built event — `registerContextProvider(fn: () =>
  JsonObject): () => void`, which registers a function whose result `buildEvent` merges into
  every event's `context` (the returned function unregisters it), and `onStart(install: () =>
  (() => void) | void): void`, which registers an installer that `start()` runs on every
  activation and whose returned teardown `stop()` runs on every deactivation (an installer
  registered while the client is already started runs immediately). The public `track(name,
  properties, options)` is `buildEvent` followed by `enqueueBuilt` behind the opt-out check.
  Every capture feature in this plan calls `buildEvent` and then `enqueueBuilt` directly; it
  must not call the public `track()` and must not re-implement validation, `beforeSend`, or
  the threshold check. This plan registers exactly one context provider (Milestone 1) and one
  `onStart` installer that records the initial page view and installs the History API patch,
  returning the unpatch function (Milestones 1 and 2). `stats.dropped` counts every
  drop, including server rejections (`stats.rejected` is that subset), so the client-side
  `invalid` drops this plan introduces increment `stats.dropped` only.
- `src/identity.ts` is the identity store over the storage adapter with `getAnonymousId()`,
  `rotateAnonymousId()`, `getUserId()`, `setUserId(id)`, `clearUserId()`,
  `getIdentifiers()`, `setIdentifiers(map)`, `clearIdentifiers()`, `getOrganizationId()`,
  `setOrganizationId(id)`, and `clearOrganizationId()`, persisted under the keys listed
  below.
- `src/session.ts` is the session manager with `getSessionId()`, `touch()` (extend the
  session on activity), and `rotate()` (start a new session, emitting `session_start`
  version 1 with `properties.sessionId` when `autocapture.sessions` is on). It persists the
  session as JSON `{ "id": string, "lastActivityAt": number }` under `kansoku.session`;
  `reset()` in this plan calls `rotate()` to replace it.
- `src/storage.ts` exports the `StorageAdapter` interface (`get(key)`, `set(key, value)`,
  `remove(key)`) and a `storageKey(prefix, name)` helper; the default adapter is
  `localStorage` with a memory fallback when access throws.
- `src/contract/events.ts` owns the event names and built-in version pins: `page_view` 1,
  `session_start` 1, `experiment_viewed` 1, and the unversioned reserved names `identify`,
  `alias`, `group`.
- `src/contract/validate.ts` exports `validateIdentifiers(map)` (closed key set, 1–256
  printable non-space ASCII), `validateExperimentName(value)` (anchored
  `^[a-z0-9_.:-]{1,128}$`), and `validateSchemaVersion(n)` (`1..65535`), each returning a
  list of human-readable problems (empty when valid).
- `src/lifecycle.ts` installs the `visibilitychange` and `pagehide` exit-flush listeners when
  the client starts and removes them when it stops.

Storage keys, with the default prefix `kansoku`, in the adapter the `storage` option selects:
`kansoku.anonymous_id`, `kansoku.user_id`, `kansoku.identifiers`, `kansoku.organization_id`,
`kansoku.session` (JSON `{ "id", "lastActivityAt" }`), `kansoku.opt_out`, and, new in this
plan, `kansoku.exposures`. The queue mirror `kansoku.queue` lives in `sessionStorage` (per tab)
and this plan never touches it.

Module ownership for this plan: it creates `packages/kansoku-js/src/page.ts`,
`src/navigation.ts`, `src/attribution.ts`, `src/context.ts`, `src/experiment.ts`, and
`src/identity-api.ts`, and it edits `src/types.ts`, `src/client.ts`, `src/index.ts`, and
`README.md`. It does not edit `src/generated/schema.ts`, `contracts/`, or any workspace-level
file.

### Server contract this plan must honour

Local ADRs live in `docs/adr/`, a profile-governed bundle installed by the first plan. Scan its
filenames and read the record the second plan created for identity and session persistence
(its title contains "identity and session persistence"); this plan updates that record with
the `reset()` and exposures semantics and creates one new record, "Browser capture defaults",
recording the autocapture behaviour and its binding to the `start`/`stop` lifecycle, the
context fields, the two opt-in privacy signals, and the no-personal-data default. The
other records in the bundle are not needed to implement this plan.

The server's own decisions are cited by the canonical handles Mori returns for the bundle
`mori://shinzui/kansoku/okf/adrs`:

- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-5` — `identifiers` accepts only `cookie`,
  `device`, `fingerprint`, and `email_sha256`; values are 1–256 printable non-space ASCII
  characters; `anonymousId` is already the implicit cookie signal and need not be repeated;
  cookie-to-user bindings are created only by `identify` and `alias` events, while the other
  kinds bind on any event that carries a `userId`.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-6` — the canonical exposure event is
  `experiment_viewed`, emitted when a variant is actually shown; `experiment` and `variant`
  must match `^[a-z0-9_.:-]{1,128}$`; the server's exposure rollup unions users, so repeated
  exposure of the same user does not double count there (client dedupe saves bandwidth, it is
  not required for correctness).
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-7` — governed events have immutable versions
  starting at 1 and an absent `schemaVersion` means 1; at the pinned commit `page_view`
  version 1 requires `properties.url` (string) and `session_start` version 1 requires
  `properties.sessionId` (string). `identify`, `user_registered`, `feature_used`,
  `payment_completed`, `subscription_started`, and `experiment_viewed` are the other governed
  names. Undeclared names such as `alias` and `group` are accepted without property checks.

The Haskell SDK in the server repository (`kansoku-client/src/Kansoku/Client.hs` under
`mori://shinzui/kansoku`; artifact-level URI pending) defines the helper shapes this plan
mirrors exactly: `identify` builds an `identify` event with `userId`, the optional
`anonymousId`, and traits as `properties`; `alias` builds an `alias` event with `anonymousId =
previousId`, `userId = newId`, and `properties` containing `previousId` and `newId` before any
caller pairs; `group` builds a `group` event carrying the caller's ids plus `organizationId`.
The server's producer guide is `docs/guides/send-events.md` in that repository.

### Test harness facts

Verified on 2026-10-14 against `@happy-dom/global-registrator` 20.14.5 (the newest version
Bun 1.4.2 would install; Bun's default `minimum-release-age` of seven days blocked the
one-week-old 21.0.1): `history.pushState` and `history.replaceState` update `location.href`
and `location.pathname`; `history.back()` restores the previous URL and fires `popstate`
asynchronously; a synthetic `window.dispatchEvent(new PopStateEvent("popstate"))` reaches
listeners; `document.referrer` is the empty string and is not settable through assignment but
can be stubbed with `Object.defineProperty(document, "referrer", { value, configurable: true })`;
`navigator.doNotTrack` is the string `"unspecified"` and can be stubbed the same way;
`document.title` is writable; `navigator.language`, `navigator.userAgent`, `screen.width`,
`window.innerWidth`, `Intl.DateTimeFormat().resolvedOptions().timeZone`, `localStorage`, and
`crypto.randomUUID` all work; assigning `location.hash` fires `hashchange`. The preload
registers a default URL; a test that needs a particular URL calls
`history.replaceState(null, "", "/pricing?utm_source=newsletter")` before creating the client,
then stubs `document.referrer` if it needs one. If the installed happy-dom behaves differently,
dispatch the events synthetically and stub `location` fields the same way; record the deviation
in Surprises & Discoveries.


## Plan of Work

### Milestone 1 — page views with attribution and context

Scope: an explicit `page()` method, automatic capture of the initial page view, and the
context that every event carries. At the end, calling `createKansoku` in a browser enqueues
one `page_view` whose top-level `url`, `referrer`, and `utm*` fields and whose
`properties.url`, `properties.path`, and `properties.title` are filled from the page, and
whose `context` contains the six agreed fields.

Create `src/attribution.ts` with a pure function `readAttribution(loc: Location-like, referrer:
string)` that returns `{ url, referrer?, utmSource?, utmMedium?, utmCampaign?, utmContent?,
utmTerm? }`. It parses `loc.search` with `URLSearchParams`, maps each `utm_*` key to its
camel-case field, and omits any field whose value is empty. Keep it free of globals so it can be
unit-tested with plain objects.

Create `src/context.ts` with `collectContext(libraryVersion: string): JsonObject`. Inside the
function (never at module scope) read `navigator.language` into `locale`,
`Intl.DateTimeFormat().resolvedOptions().timeZone` into `timezone`, `screen.width` and
`screen.height` into `screen`, `window.innerWidth` and `window.innerHeight` into `viewport`,
`navigator.userAgent` into `userAgent`, and set `library` to `{ name: "kansoku-js", version }`.
Wrap each read in a guard so a missing global or a throwing getter simply omits that field; the
function must return `{ library }` at minimum under SSR. In `createKansoku`, call
`registerContextProvider(() => collectContext(version))` once at construction (providers are
not lifecycle-bound; the unregister function is not needed), so that `buildEvent` produces the
final `context` as `{ ...providedContext, ...(options?.context ?? {}) }` and
`TrackOptions.context` wins on conflicts for `track()` and every capture method alike.

Create `src/page.ts` with `buildPageView(client, properties, options)` returning the
`AnalyticsEvent` for the current page: it calls `readAttribution(location, document.referrer)`,
sets `properties` to `{ url, path: location.pathname, title: document.title, ...properties }`
(caller values override), pins `schemaVersion` to the `page_view` entry of the resolved
`schemaVersions` (built-in 1) unless `options.schemaVersion` is given, and calls
`buildEvent("page_view", properties, options, webFields)` with the attribution result as the
`webFields` argument. Add `page(properties, options)` to the client: it skips with no side
effect when there is no `document`, otherwise passes the built event to `enqueueBuilt`. The
initial page view is recorded by the capture installer this plan registers through the
internal `onStart` hook (so it runs when the client starts, which for a vanilla page is the end
of `createKansoku` and for the React provider is its effect): when `autocapture.pageViews` is
not `false`, when a `document` exists, when the client is not suppressed (see the gating rule in
Milestone 4), and when the current deduplication key (origin + pathname + search) differs from
the last recorded one, record the page view and remember the key in the state for Milestone 2.
The key is kept across `stop()`, so a `stop()`/`start()` cycle on the same URL, which React
StrictMode performs in development, records nothing extra.

Verification: `bun test packages/kansoku-js/test/page.test.ts
packages/kansoku-js/test/attribution.test.ts packages/kansoku-js/test/context.test.ts` passes.
The page test creates a client with the fetch mock, calls `flush()`, and asserts the single
batched event's fields; see Validation and Acceptance for the expected shape.

### Milestone 2 — single-page navigation and the autocapture switches

Scope: page views for SPA navigation, correct teardown, and the two autocapture switches. At
the end, `history.pushState`, `history.replaceState`, and Back/Forward each produce one
deduplicated `page_view`, and `shutdown()` restores the History API.

Create `src/navigation.ts` with `installNavigationCapture(state, onNavigate): () => void`.
Inside the function (not at module scope), check that `window` and `history` exist; return a
no-op teardown otherwise. Save the original `history.pushState` and `history.replaceState`,
replace each with a wrapper that calls the original with the same `this` and arguments and then
schedules `onNavigate()` through `state.timers.setTimeout(…, 0)`, and add a `popstate`
listener that schedules the same call. `onNavigate` computes the deduplication key
`location.origin + location.pathname + location.search`; when it differs from the last
recorded key it records a page view through the Milestone 1 builder and updates the key. A
hash-only change therefore records nothing. The returned teardown removes the `popstate`
listener and restores the original methods only if `history.pushState` is still the wrapper
this client installed (another library may have patched on top; do not clobber it). The
installer registered through `onStart` in Milestone 1 calls `installNavigationCapture` after
recording the initial page view and returns its teardown, so `start()` installs the patch and
`stop()` (and therefore `shutdown()`) removes it; a second `start()` installs it again. Install
the capture only when `autocapture.pageViews` is not `false`.

`autocapture.sessions` is implemented by the second plan's session manager; this plan only
confirms that `createKansoku({ autocapture: { sessions: false } })` suppresses `session_start`
while still assigning a `sessionId` to every event, and documents both switches in the README.

Verification: `bun test packages/kansoku-js/test/navigation.test.ts` passes, covering: one
page view after `pushState`; one page view after `pushState` immediately followed by
`replaceState` to the same path (dedupe); no page view for a hash-only change; one page view
after `history.back()`; `history.pushState === original` after `stop()` and after
`shutdown()`; no page view for a `pushState` made while stopped and one for the next `pushState`
after `start()`; a client created with `autoStart: false` records no initial page view and
leaves `history.pushState` untouched until `start()`; and `stop()` then `start()` on the same
URL records no second initial page view. The happy-dom script in Validation and Acceptance
prints two page views.

### Milestone 3 — identity API

Scope: `identify`, `alias`, `group`, `setIdentifiers`, and `reset`. At the end, an application
can describe who the user is with the same semantics as the Haskell SDK, invalid identity
evidence never reaches the server, and `reset()` forgets the user without losing queued
events.

Create `src/identity-api.ts` with functions that take the internal client object and implement
each method, then wire them into `client.ts`. Each one builds with `buildEvent` and hands the
result to `enqueueBuilt`. `identify(userId, traits)` validates that `userId` is a non-empty
string (otherwise drop with reason `invalid`, calling `onDrop` with a detail message, never
throwing), calls `identity.setUserId(userId)`, then builds `identify` with `properties = traits
?? {}`; because the store was updated first, `buildEvent` stamps `userId` and the current
`anonymousId`. `alias(previousId, newId, properties)` validates both ids are non-empty
strings and builds `alias` with `properties = { previousId, newId, ...properties }` and the
explicit `ids` argument of `buildEvent`, `{ anonymousId: previousId, userId: newId }`, which
overrides the stored ids for this one event (`alias` is the only capture call that passes
`ids`; the identity store is not touched, so later events keep the current ids); it does not
change the stored user id. `group(organizationId,
properties)` validates the id, calls `identity.setOrganizationId(organizationId)`, and builds
`group` with `properties ?? {}`; `buildEvent` stamps `userId` (if any) and `organizationId`.
`setIdentifiers(map)` runs
`validateIdentifiers(map)`; when there are problems it calls `onDrop` with reason `invalid`
and an empty `events` list and changes nothing; when valid it replaces the stored identifiers
with the given entries (pass an empty object to clear them). `reset()` calls
`identity.clearUserId()`, `identity.clearIdentifiers()`, `identity.clearOrganizationId()`,
removes `kansoku.exposures`, calls `identity.rotateAnonymousId()`, then `session.rotate()`
(which emits `session_start` when sessions autocapture is on), and leaves the queue untouched.
Because `reset` does not touch the queue, events enqueued before logout still carry the old
ids, which is the correct attribution.

Verification: `bun test packages/kansoku-js/test/identity-api.test.ts` passes, asserting the
exact event JSON for each helper (see Validation and Acceptance), that `localStorage` holds
the expected keys after `identify` and `group`, that invalid identifiers produce an `onDrop`
call with reason `invalid` and no event, and that after `reset()` the next event carries a new
`anonymousId`, a new `sessionId`, and no `userId`.

### Milestone 4 — experiments, gating, SSR safety, documentation, ADRs

Scope: the exposure helper, the two capture gates, import safety without a DOM, the README,
and the ADR records. At the end, the full package test suite passes, the package can be
imported in a DOM-less process, and the durable decisions are recorded.

Create `src/experiment.ts` with `recordExposure(state, experiment, variant, properties,
options)`. Validate both names with `validateExperimentName`; on failure drop with reason
`invalid` (detail naming the offending field) and return. Build the dedupe key
`${experiment}\u0000${variant}` and read `kansoku.exposures` from storage as JSON
`{ "sessionId": string, "keys": string[] }`; when the stored `sessionId` differs from the
current session the record is stale and treated as empty. If the key is present and
`options?.force` is not `true`, return without emitting. Otherwise call
`buildEvent("experiment_viewed", { ...properties, experiment, variant }, options)` (the
validated names win; `schemaVersion` comes from the resolved pins, built-in 1), pass the result
to `enqueueBuilt`, then append the key and write the record back. Wire `experiment(...)` into
the client with the signature
`experiment(experiment, variant, properties?, options?: ExperimentOptions)` and export
`ExperimentOptions` (`{ force?: boolean }`) from `src/types.ts` and `src/index.ts`. The React
plan's `useExperiment` calls this method with no options and relies on the default per-session
dedupe to survive StrictMode's double effects; `force` is for applications only.

Implement the gates in `client.ts`. Add `isDoNotTrackEnabled()` and
`isGlobalPrivacyControlEnabled()` to `src/context.ts`: inside each function, the first returns
`true` when `navigator.doNotTrack`, `window.doNotTrack`, or `navigator.msDoNotTrack` equals
`"1"`, and the second returns `true` when `navigator.globalPrivacyControl === true`; both return
`false` otherwise or when the globals are absent (Chrome and Safari expose neither property).
The client is "capture-suppressed" when `isOptedOut()` is true, when `respectDoNotTrack` is
`true` and DNT is enabled, or when `respectGlobalPrivacyControl` is `true` and GPC is enabled.
Autocapture (the initial page view and navigation page views) checks the suppression at each
capture and skips silently; the `installNavigationCapture` patch is still installed so that
`optIn()` later resumes page views. Explicit methods added by this plan perform the same
opted-out check that the public `track()` performs before `buildEvent`, dropping with reason
`opted_out` exactly as `track()` does; extend that shared check so a signal-suppressed client
drops explicit events with the same reason. Factor the check into one helper in `client.ts` so
`track()` and the capture methods cannot diverge.

Prove SSR safety with `scripts/ssr-smoke.ts`: it imports `packages/kansoku-js/src/index.ts`
in a plain `bun run` (which does not apply the test preload, so no DOM globals exist), calls
`createKansoku({ baseUrl: "http://localhost:0", writeKey: "ksk_w_test", persistQueue: false })`,
calls `page()`, `identify("u")`, `experiment("exp", "a")`, `stop()`, `start()`, and `reset()`,
awaits `shutdown()`, and prints `ssr-smoke: ok` if nothing threw. Add a `just ssr-smoke` recipe that runs it and
include it in `just check`.

Update `packages/kansoku-js/README.md` with sections for page views and autocapture (including
how to disable autocapture and call `page()` manually, and the note that the initial page view
is recorded at `createKansoku`, so initialise after the `<title>` element or pass
`properties.title`), attribution, context, identity (`identify`, `alias`, `group`,
`setIdentifiers`, `reset`, with the server's identifier rules), experiments (exposure
semantics, dedupe, `force`), privacy (`optOut`, `respectGlobalPrivacyControl`,
`respectDoNotTrack`, what context is and is not collected), and the lifecycle as it affects
capture (`autoStart: false` defers the initial page view and the History patch to `start()`;
`stop()` removes the patch).

Record decisions in `docs/adr/`. Allocate the next handle with `okf id next docs/adr --profile
docs/adr/profile.dhall ADR`, create `docs/adr/<N>-browser-capture-defaults.md` following the
frontmatter of the existing records (fields `type`, `title`, `description`, `timestamp`,
`docId`, `status`, `date`, plus the `generated` block the existing records carry), and update
the identity and session persistence record with the `reset()` semantics and the `exposures`
key, advancing its `timestamp`. Run `okf log add` for each changed record as the existing
`log.md` entries show, then validate.

Verification: `bun test packages/kansoku-js` passes in full; `bun run scripts/ssr-smoke.ts`
prints `ssr-smoke: ok`; `just check` passes (type-check, lint, format, contracts, ssr-smoke);
`okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce
--log-enforce` passes.


## Concrete Steps

All commands run from `/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts` inside the
dev shell. Confirm the prerequisites first:

```bash
sed -n '/^## Progress/,/^## Surprises/p' docs/plans/2-kansoku-js-core-event-envelope-identity-and-session-state-batched-delivery-and-exit-flush.md
ls packages/kansoku-js/src packages/kansoku-js/src/contract test/setup test/helpers docs/adr
bun test packages/kansoku-js
```

Every milestone of the second plan must be checked, the listed directories must exist, and
its tests must pass before you change anything.

Create the new modules and add the tests milestone by milestone. A representative test for
Milestone 1 (`packages/kansoku-js/test/page.test.ts`) looks like this; adapt the fetch-mock
helper's actual API after reading `test/helpers/fetch-mock.ts`:

```typescript
import { describe, expect, test } from "bun:test"
import { createKansoku } from "../src/index.ts"
import { createFetchMock } from "../../../test/helpers/fetch-mock.ts"

describe("page()", () => {
  test("records attribution, properties, and context", async () => {
    history.replaceState(null, "", "/pricing?utm_source=newsletter&utm_campaign=launch")
    Object.defineProperty(document, "referrer", { value: "https://search.example/", configurable: true })
    document.title = "Pricing"
    const fetchMock = createFetchMock() // answers 202 { accepted: n, rejected: [] } by default
    const client = createKansoku({
      baseUrl: "https://analytics.example.test",
      writeKey: "ksk_w_test",
      persistQueue: false,
      autocapture: { pageViews: false, sessions: false },
      fetch: fetchMock.fetch,
    })
    client.page({ section: "plans" })
    await client.flush()
    const [request] = fetchMock.requests
    expect(request.url).toBe("https://analytics.example.test/v1/batch")
    const [event] = JSON.parse(request.body)
    expect(event.eventName).toBe("page_view")
    expect(event.schemaVersion).toBe(1)
    expect(event.url).toBe("https://app.example.test/pricing?utm_source=newsletter&utm_campaign=launch")
    expect(event.referrer).toBe("https://search.example/")
    expect(event.utmSource).toBe("newsletter")
    expect(event.utmCampaign).toBe("launch")
    expect(event.utmMedium).toBeUndefined()
    expect(event.properties).toEqual({
      url: "https://app.example.test/pricing?utm_source=newsletter&utm_campaign=launch",
      path: "/pricing",
      title: "Pricing",
      section: "plans",
    })
    expect(event.context.library).toEqual({ name: "kansoku-js", version: expect.any(String) })
    expect(event.context.locale).toBe("en-US")
    expect(typeof event.context.timezone).toBe("string")
    expect(event.context.screen).toEqual({ width: expect.any(Number), height: expect.any(Number) })
    await client.shutdown()
  })
})
```

Run a single test file while iterating, then the package:

```bash
bun test packages/kansoku-js/test/page.test.ts
bun test packages/kansoku-js
```

Expected final transcript shape (counts will differ; zero failures is the requirement):

```text
bun test v1.4.2

packages/kansoku-js/test/attribution.test.ts:
✓ readAttribution > maps utm_* query fields and omits empty ones
...
packages/kansoku-js/test/navigation.test.ts:
✓ navigation capture > pushState records one page_view
✓ navigation capture > pushState followed by replaceState to the same path records one page_view
✓ navigation capture > hash-only change records nothing
✓ navigation capture > history.back() records a page_view
✓ navigation capture > shutdown restores history.pushState
...

 N pass
 0 fail
```

For Milestone 4, create the smoke script and recipe, then run them:

```bash
cat > scripts/ssr-smoke.ts <<'EOF'
import { createKansoku } from "../packages/kansoku-js/src/index.ts"

if (typeof window !== "undefined") throw new Error("ssr-smoke must run without DOM globals")
const client = createKansoku({ baseUrl: "http://localhost:0", writeKey: "ksk_w_test", persistQueue: false })
client.page()
client.identify("u_1")
client.experiment("exp", "a")
client.stop()
client.start()
client.reset()
await client.shutdown()
console.log("ssr-smoke: ok")
EOF
bun run scripts/ssr-smoke.ts
```

Expected output:

```text
ssr-smoke: ok
```

Add the recipe to `justfile` beside the existing check recipes and include it in `check`:

```just
# Import kansoku-js without DOM globals and exercise the capture API (SSR safety)
ssr-smoke:
    bun run scripts/ssr-smoke.ts

check: typecheck lint format-check check-contracts ssr-smoke
```

Allocate and write the ADR records, then validate:

```bash
okf id list docs/adr --profile docs/adr/profile.dhall
okf id next docs/adr --profile docs/adr/profile.dhall ADR
# create docs/adr/<N>-browser-capture-defaults.md and update the identity/session record
okf log add --help
okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce
```

The validate command must report no violations. Finish with the repository checks:

```bash
just check
bun test
bun run scripts/build.ts packages/kansoku-js
```

Commit at each milestone boundary with Conventional Commits and the trailers the MasterPlan
requires:

```text
feat(kansoku-js): capture page views with attribution and context

MasterPlan: docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md
ExecPlan: docs/plans/3-kansoku-js-browser-capture-page-views-navigation-attribution-identity-helpers-and-experiments.md
Intention: intention_01m4ymqn7xe1a8tz8v7r78e34y
```


## Validation and Acceptance

Required acceptance for the whole plan is: `bun test packages/kansoku-js` reports zero
failures with the test files named in each milestone present; `bun run scripts/ssr-smoke.ts`
prints `ssr-smoke: ok`; `just check` passes; the ADR validation command passes; and the
behaviours below are observable.

Page view shape. With the page at
`https://app.example.test/pricing?utm_source=newsletter&utm_campaign=launch`, referrer
`https://search.example/`, and title `Pricing`, the batched event is, apart from generated
ids and timestamps:

```json
{
  "eventId": "<uuid>",
  "eventName": "page_view",
  "schemaVersion": 1,
  "source": "web",
  "occurredAt": "<iso-8601>",
  "receivedAt": "<iso-8601>",
  "anonymousId": "<uuid>",
  "sessionId": "<uuid>",
  "url": "https://app.example.test/pricing?utm_source=newsletter&utm_campaign=launch",
  "referrer": "https://search.example/",
  "utmSource": "newsletter",
  "utmCampaign": "launch",
  "properties": {
    "url": "https://app.example.test/pricing?utm_source=newsletter&utm_campaign=launch",
    "path": "/pricing",
    "title": "Pricing"
  },
  "context": {
    "locale": "en-US",
    "timezone": "America/Los_Angeles",
    "screen": { "width": 1024, "height": 768 },
    "viewport": { "width": 1024, "height": 768 },
    "userAgent": "Mozilla/5.0 …",
    "library": { "name": "kansoku-js", "version": "0.1.0" }
  }
}
```

Navigation. The following script, run with `bun test` so the DOM preload applies (save it as
`packages/kansoku-js/test/navigation-demo.test.ts` or run the equivalent assertions inside
`navigation.test.ts`), produces two page views, for `/` and `/docs`, and no third one for the
hash change:

```typescript
import { expect, test } from "bun:test"
import { createKansoku } from "../src/index.ts"
import { createFetchMock } from "../../../test/helpers/fetch-mock.ts"

test("SPA navigation yields deduplicated page views", async () => {
  history.replaceState(null, "", "/")
  const fetchMock = createFetchMock()
  const client = createKansoku({
    baseUrl: "https://analytics.example.test",
    writeKey: "ksk_w_test",
    persistQueue: false,
    autocapture: { sessions: false },
    fetch: fetchMock.fetch,
  })
  history.pushState(null, "", "/docs")
  history.replaceState(null, "", "/docs")      // same key: deduplicated
  location.hash = "#install"                   // hash-only: ignored
  await new Promise((resolve) => setTimeout(resolve, 10))
  await client.flush()
  const names = fetchMock.requests.flatMap((r) => JSON.parse(r.body).map((e) => e.properties.path))
  expect(names).toEqual(["/", "/docs"])
  await client.shutdown()
})
```

Identity shapes. After `identify("user_42", { plan: "pro" })` the event has `eventName`
`"identify"`, `userId` `"user_42"`, the current `anonymousId`, `properties` `{ "plan": "pro" }`,
and no `schemaVersion`; every later event carries `userId`. After `alias("anon-1",
"user_42")` the event has `eventName` `"alias"`, `anonymousId` `"anon-1"`, `userId`
`"user_42"`, and `properties` `{ "previousId": "anon-1", "newId": "user_42" }`, and the stored
user id is unchanged. After `group("org_7", { tier: "enterprise" })` the event has `eventName`
`"group"`, `organizationId` `"org_7"`, the current `userId` if any, and `properties`
`{ "tier": "enterprise" }`; later events carry `organizationId`. After
`setIdentifiers({ device: "dev-1", email_sha256: "ab12…" })` later events carry exactly that
`identifiers` object; `setIdentifiers({ fingerprint: "has space" })` calls `onDrop` with
reason `invalid`, emits nothing, and leaves the stored identifiers unchanged. After `reset()`
the next event has a different `anonymousId`, a different `sessionId`, no `userId`, no
`organizationId`, and no `identifiers`, and events enqueued before the call are delivered
unchanged.

Experiments. `experiment("pricing_page", "variant_b")` twice in one session yields one
`experiment_viewed` with `schemaVersion` 1 and `properties`
`{ "experiment": "pricing_page", "variant": "variant_b" }`; a third call with `{ force: true }`
yields a second event; `experiment("Pricing Page", "b")` yields `onDrop` with reason `invalid`
and no event; after `reset()` the first call records again.

Gating. With `optOut: true`, `createKansoku` records no initial page view and `pushState`
records nothing, while `track("x")` produces `onDrop` with reason `opted_out`; after
`optIn()`, the next `pushState` records a page view. With `respectDoNotTrack: true` and
`navigator.doNotTrack` stubbed to `"1"`, behaviour is identical to opt-out; with the default
`respectDoNotTrack: false` the same stub has no effect. With `respectGlobalPrivacyControl: true`
and `navigator.globalPrivacyControl` stubbed to `true` (define it with
`Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true })`,
since happy-dom does not implement the property), behaviour is identical to opt-out; with the
default `false` the same stub has no effect.

Lifecycle. `createKansoku({ autoStart: false })` records nothing and leaves `history.pushState`
untouched; `start()` records the initial page view and installs the patch; `stop()` restores
`history.pushState` and a subsequent `pushState` records nothing; `start()` again records no
second initial page view for the same URL and the next `pushState` records one.

Proposals that are not required acceptance: capturing `hashchange` as page views behind an
option; attaching `document.referrer` only on the first page view of a session; and using the
Navigation API (`window.navigation` and its `currententrychange` event) instead of patching
`history.pushState` where the browser provides it, which avoids monkey-patching but is not yet
available in every evergreen browser and is absent from happy-dom. Each is a scope change for
the MasterPlan to decide.


## Idempotence and Recovery

Every step is additive and repeatable. Re-running the tests, the smoke script, the build, and
the ADR validation has no side effects. This plan does not change `src/envelope.ts`; every
capture module calls `buildEvent(name, properties, options, webFields?, ids?)` (the `ids`
argument for `alias`) and `enqueueBuilt`, `registerContextProvider`, and `onStart` by name.
If a second-plan test fails after this plan's edits to `client.ts`, the shared opt-out helper
is the likely cause; keep `track()`'s observable behaviour identical and
re-run `bun test packages/kansoku-js`. If happy-dom does not fire `popstate` for `history.back()` in the
installed version, dispatch `new PopStateEvent("popstate")` in the test and note it in
Surprises & Discoveries. If `okf id next` reports a handle that already exists, re-run `okf id
list` and use the next free positive integer it reports; never pick a number by counting
files. Nothing in this plan touches the server, the vendored contracts, or the generated
types, so there is no data to back up.


## Interfaces and Dependencies

Prerequisite: the second plan,
`docs/plans/2-kansoku-js-core-event-envelope-identity-and-session-state-batched-delivery-and-exit-flush.md`,
is Complete in the MasterPlan registry. Its `buildEvent(name, properties, options, webFields?)`
in `src/envelope.ts` (with the explicit `ids` argument `alias` uses), and on the internal
client object `enqueueBuilt(event)`, `registerContextProvider(fn): () => void`, and
`onStart(install)`, plus the public `start()`, `stop()`, and `autoStart`, the identity store,
the session manager (session persisted as
`{ id, lastActivityAt }` under `kansoku.session`), the storage adapter, the constants and
validators, and `ResolvedKansokuOptions` in `src/types.ts`, are the internal interfaces this
plan depends on; `stats.dropped` includes rejections. The first plan's test harness
(`test/setup/dom.ts`, `test/helpers/fetch-mock.ts`) and `contracts/events.json` are the test
inputs.

Libraries: no new runtime dependency is permitted; `kansoku-js` stays dependency-free. Dev
dependencies are unchanged (`@happy-dom/global-registrator`, `@types/bun`). The modules this
plan creates — `packages/kansoku-js/src/page.ts`, `src/navigation.ts`, `src/attribution.ts`,
`src/context.ts`, `src/experiment.ts`, `src/identity-api.ts` — must not read `window`,
`document`, `navigator`, `history`, `location`, or `screen` at module scope; every access is
inside a function with an existence guard.

Interfaces other plans depend on: the `KansokuClient` members `page`, `identify`, `alias`,
`group`, `experiment`, `setIdentifiers`, and `reset`, and the `ExperimentOptions` type, all
exported from `packages/kansoku-js/src/index.ts`; the `autocapture.pageViews` option and its
value in `client.config`, which the React plan reads to warn when `usePageView` is used while
autocapture is still on; the guarantee that the initial page view and the History patch are
bound to `start()`/`stop()`, which the React plan relies on to drive the client from an effect
(`autoStart: false` at construction, `start()` in the effect, `stop()` in its cleanup) without a
duplicate `page_view` under StrictMode; the `respectGlobalPrivacyControl` and
`respectDoNotTrack` gates documented by EP-6; the per-session exposure dedupe under `kansoku.exposures`, which the
React plan's `useExperiment` relies on under StrictMode (it always uses the default dedupe and
never passes `{ force: true }`; `force` exists only for applications that deliberately
re-record an exposure); and the guarantee that importing
`kansoku-js` and calling `createKansoku` without a DOM neither throws nor touches globals,
which the React plan relies on for server-side rendering. The storage key `kansoku.exposures`
joins the key list owned by the second plan's identity and session persistence ADR.

# kansoku-js

Browser SDK for the Kansoku analytics service. Zero runtime dependencies; ESM with TypeScript declarations.

```typescript
import { createKansoku } from "kansoku-js"

const analytics = createKansoku({
  baseUrl: "https://analytics.example.com",
  writeKey: "ksk_w_public_write_key",
})
analytics.track("signup_started", { plan: "team" })
await analytics.flush()
```

## Browser capture

By default the client records the initial `page_view`, History API navigations and
`session_start`. Initialise after the page title is set. Page views include the full URL,
path, title, document referrer and UTM attribution (`utmSource`, `utmMedium`, `utmCampaign`,
`utmContent`, `utmTerm`). History changes are captured on the next task so a router's
push/replace pair records once; hash-only changes are ignored.

Call `page(properties?, options?)` for explicit page views. Disable automatic capture with
`autocapture: { pageViews: false, sessions: false }`. `autoStart: false` defers the initial
page view and History patch until `start()`. `stop()` removes the patch; restarting on the
same URL does not record another initial view.

Each event collects locale, timezone, screen size, viewport size, user agent and library
version. `options.context` can override these values. No IP address, fingerprint or precise
location is collected by the SDK. URLs and caller-supplied properties may contain personal
data: use `beforeSend` to redact them.

## Identity and experiments

`identify(userId, traits?, options?)` persists the user ID and sends governed set traits with
explicit schema version 2. `identifyOnce(userId, traits?, options?)` does the same with set-once
version 1. Both preserve the anonymous ID for server stitching. Governed string traits are
`plan`, `signup_source`, `initial_plan`, `country` and `role`; `company_size` is a finite,
nonnegative integer. Omitted traits stay unchanged and null is rejected. Set-once initializes
an unset value; a later set replaces it. An explicit `{ schemaVersion: 1 }` on identify retains
identity-only behavior. Current traits can reclassify historical metrics and are public
analytics observations, never access-control facts.
`alias(previousId, newId, properties?)` links identities for one event and leaves the stored
user unchanged. `group(organizationId, properties?)` persists the organisation for later
events. `setIdentifiers({ device, fingerprint, email_hmac, email_sha256, cookie })` replaces optional
identity signals; provide only the keys needed. Values must contain 1–256 printable,
non-space ASCII characters. The anonymous ID already supplies the implicit cookie signal.

`reset()` clears user, organisation, signals and exposure history and rotates anonymous and
session IDs. Events already queued retain their original attribution. Call it explicitly at logout.

`experiment(name, variant, properties?, { force?: boolean })` records `experiment_viewed`
when a variant is actually shown. Names match `^[a-z0-9_.:-]{1,128}$`. The same pair is sent
once per session unless `force: true` is given; it can be recorded again after `reset()`.
The SDK records exposure and does not assign variants or evaluate feature flags.

`respectGlobalPrivacyControl: true` honors `navigator.globalPrivacyControl === true`.
`respectDoNotTrack: true` honors the legacy DNT signal. Both default to false. These gates
and opt-out silently skip automatic capture; explicit calls report `opted_out` drops.

## Core API

`track(name, properties?, options?)` queues an event with anonymous and session IDs.
`flush()` waits for pending batches. `stats` reports queued, accepted, rejected and dropped
counts. `onDrop(info)` receives `queue_full`, `rejected`, `permanent_error`,
`retries_exhausted`, `before_send`, `opted_out` or `invalid` and the affected events.
`beforeSend(event)` can redact fields or return `null` to drop an event.

The client starts automatically. Pass `autoStart: false` to defer listeners and timers;
call `start()` to activate them and `stop()` to remove them and begin a final flush.
Both calls are idempotent and reversible. Framework integrations should pair them in their
effect setup and cleanup. `shutdown()` stops, awaits the final flush and permanently closes
the client. Explicit tracking while stopped still queues events.

`optOut()` persists suppression and drops queued events; `optIn()` resumes acceptance.
`getAnonymousId()`, `getUserId()` and `getSessionId()` expose current identity.
Sessions renew after thirty minutes of inactivity by default.

## Delivery and storage

All deliveries use `POST /v1/batch` with the public write key in `X-Api-Key`.
HTTP 202 ends delivery, including individual rejections, which are counted as drops.
400, 401, 403, 404 and non-retryable 503 responses are permanent. Oversized batches (413)
are split; an oversized single event is dropped. Unknown outcomes, transient 503 responses,
network failures and timeouts retry with the same IDs and bounded exponential full jitter.

Defaults: flush at 20 events or every five seconds, 100 events and 1 MiB per request,
1000 queued events, five retries, ten-second request timeout. The newest event is dropped
when the queue is full. `schemaVersions` supplies event-level pins; a call's
`options.schemaVersion` takes precedence. Supported versions are integers in `1..65535`.

Identity, session and opt-out state use localStorage by default. Choose `storage: "cookie"`,
`"memory"` or a custom `{ get, set, remove }` adapter. Keys use `storageKeyPrefix` (`kansoku`):
`.anonymous_id`, `.user_id`, `.organization_id`, `.identifiers`, `.session`, `.opt_out`.
The `.queue` mirror always uses per-tab sessionStorage (`persistQueue: false` disables it).
Blocked browser storage falls back to memory. No fingerprint is generated. Keyed email identifiers are opaque backend-produced values; never expose the HMAC pepper to browser code. The normalization and rotation contract is owned by `mori://shinzui/kansoku` (`docs/guides/send-events.md`; artifact-level URI pending).

On page exit, keepalive fetch attempts bodies up to 60 KiB. Browsers also limit aggregate
in-flight keepalive bytes, so exit delivery is best effort. Unanswered events remain in
sessionStorage for the next same-tab load; closing the tab can lose them.

The package imports safely without browser globals. Supported Node versions can use
`require(esm)` (Node 20.19+, or 22.12+ on Node 22). Jest's default CommonJS mode needs an
ESM transform allowlist or native ESM configuration.

## TypeScript reference

```typescript
export interface KansokuOptions {
  baseUrl: string
  writeKey: string
  sourceService?: string
  autoStart?: boolean
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
  autocapture?: { pageViews?: boolean; sessions?: boolean }
  optOut?: boolean
  respectDoNotTrack?: boolean
  respectGlobalPrivacyControl?: boolean
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null
  onDrop?: (info: DropInfo) => void
  fetch?: typeof globalThis.fetch
  now?: () => number
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  debug?: boolean
}

export interface KansokuClient {
  page(properties?: JsonObject, options?: TrackOptions): void
  identify(userId: string, traits?: JsonObject, options?: TrackOptions): void
  identifyOnce(userId: string, traits?: JsonObject, options?: TrackOptions): void
  alias(previousId: string, newId: string, properties?: JsonObject): void
  group(organizationId: string, properties?: JsonObject): void
  experiment(
    experiment: string,
    variant: string,
    properties?: JsonObject,
    options?: ExperimentOptions,
  ): void
  setIdentifiers(identifiers: Partial<Record<IdentifierKind, string>>): void
  reset(): void
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
  readonly stats: Readonly<KansokuStats>
  readonly config: ResolvedKansokuOptions
}
export interface ExperimentOptions {
  force?: boolean
}
```

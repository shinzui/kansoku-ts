---
id: 2
slug: kansoku-js-core-event-envelope-identity-and-session-state-batched-delivery-and-exit-flush
title: "kansoku-js core: event envelope, identity and session state, batched delivery, and exit flush"
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

# kansoku-js core: event envelope, identity and session state, batched delivery, and exit flush

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.


## Purpose / Big Picture

Kansoku (観測, "observation") is the portfolio's self-hosted analytics service. Its Haskell
server accepts analytics events over HTTP and stores them in ClickHouse. Today a web page that
wants to send events to Kansoku has to hand-write HTTP calls, invent its own anonymous
identifier and session, and reimplement the server's retry rules. After this plan, the
`kansoku-js` package in this repository does all of that:

```typescript
import { createKansoku } from "kansoku-js"

const kansoku = createKansoku({
  baseUrl: "http://localhost:8080",
  writeKey: "ksk_w_…",
  sourceService: "marketing-site",
})

kansoku.track("cta_clicked", { cta: "pricing" })
await kansoku.flush()
console.log(kansoku.stats) // { queued: 0, accepted: 1, rejected: 0, dropped: 0 }
```

Behind that call the client builds an event that matches the server's `AnalyticsEvent` schema
exactly, stamps it with a persisted anonymous identifier and a session identifier that renews
after thirty minutes of inactivity, emits a `session_start` event when a new session begins,
keeps events in a bounded queue that survives page reloads, sends them to `POST /v1/batch` in
batches with the credential in the `X-Api-Key` header, interprets the server's partial
acceptance response, retries only the failures the server contract says are retryable, flushes
whatever remains when the user leaves the page, and tells the application about every event it
had to drop and why. Nothing in this plan records page views or identifies users; the sibling
plan `docs/plans/3-kansoku-js-browser-capture-page-views-navigation-attribution-identity-helpers-and-experiments.md`
adds those on top of the engine built here.

You can see it working by running the package's unit tests, which exercise the whole pipeline
against a scripted `fetch`, and by running a smoke script that builds the package and sends real
HTTP requests to a tiny in-process mock server.


## Progress

- [ ] M1 — Envelope, constants, and validation: `buildEvent` produces schema-valid
  `AnalyticsEvent` objects, the event-name and schema-version constants exist, client-side
  validation mirrors the server's structural rules, and a catalog-driven contract test proves
  every built-in event satisfies `contracts/events.json`. Accepted when
  `bun test packages/kansoku-js/test/envelope.test.ts packages/kansoku-js/test/validate.test.ts packages/kansoku-js/test/contract.test.ts`
  passes with no DOM globals loaded.
- [ ] M2 — Storage, identity, and session: the three storage adapters (localStorage with memory
  fallback, cookie, memory), the identity store, and the session manager persist under the
  documented keys and formats; a session that lapses after the timeout produces a new
  `sessionId` and a `session_start` event. Accepted when
  `bun test packages/kansoku-js/test/storage.test.ts packages/kansoku-js/test/identity.test.ts packages/kansoku-js/test/session.test.ts`
  passes under happy-dom.
- [ ] M3 — Queue, transport, retry, and accounting: `track` enqueues, `flush` delivers batches
  to `/v1/batch`, and every server outcome (202 with rejections, 400, 401, 413 split, 503
  retryable, network error, retry exhaustion) updates `stats` and calls `onDrop` exactly as the
  delivery contract specifies; `beforeSend` and opt-out gate the pipeline. Accepted when
  `bun test packages/kansoku-js/test/queue.test.ts packages/kansoku-js/test/retry.test.ts packages/kansoku-js/test/transport.test.ts packages/kansoku-js/test/client.test.ts`
  passes.
- [ ] M4 — Lifecycle, persistence, and the public surface: `pagehide` and hidden
  `visibilitychange` trigger a chunked keepalive exit flush; a persisted queue is restored by the
  next `createKansoku`; `shutdown` detaches listeners and flushes; the package README documents
  the surface; the two ADRs exist and validate. Accepted when
  `bun test packages/kansoku-js` passes in full, `just build kansoku-js` succeeds, and
  `bun packages/kansoku-js/scripts/smoke.ts` prints `accepted: 3`.


## Surprises & Discoveries

(None yet.)


## Decision Log

- Decision: Every delivery, even of a single event, uses `POST /v1/batch`; the single-event
  route `POST /v1/events` is not used by the SDK.
  Rationale: The batch route returns partial-acceptance results, so one code path handles every
  outcome. The single-event route would need a second response parser for no gain.
  Date: 2026-10-14

- Decision: The exit transport is `fetch` with `keepalive: true`, never
  `navigator.sendBeacon`. Exit payloads are chunked so each request body stays at or below
  61,440 bytes (60 KiB).
  Rationale: Kansoku accepts the write key only in the `X-Api-Key` or `Authorization` header,
  and the Beacon API cannot set request headers. Browsers cap the total in-flight keepalive body
  at 64 KiB per origin, so a single oversized exit request would be refused outright.
  Date: 2026-10-14

- Decision: Rejected events, permanent HTTP errors, and retry exhaustion are dropped with a
  reason and counted; nothing is ever re-sent after the server has answered 202, 400, 401, 403,
  404, or a single-event 413. Only 503-with-`retryable: true`, network errors, timeouts, and
  unparseable responses are retried, and a batch stays in the queue between retries.
  Rationale: This is the server's documented contract (ADR-1 of the server). Retrying a 202
  would duplicate accepted events; retrying 4xx can never succeed. An unparseable or absent
  response leaves the outcome unknown, and the server deduplicates by `eventId`, so a retry is
  safe.
  Date: 2026-10-14

- Decision: `stats.dropped` counts every drop, including server rejections; `stats.rejected` is
  the subset that the server rejected. Both are exposed as plain numbers.
  Rationale: Matches the Haskell SDK's `droppedCount`, which also folds rejections into drops,
  while still letting an application distinguish contract violations from capacity loss.
  Date: 2026-10-14

- Decision: Timing and I/O are injectable (`fetch`, `now`, `timers`), and tests use those
  injection points instead of a fake-timer library.
  Rationale: `bun test` has no first-class fake timers that also cover `AbortController`
  timeouts; explicit injection keeps every test deterministic and keeps the core modules free of
  global side effects.
  Date: 2026-10-14

- Decision: Modules other than `lifecycle.ts`, `storage.ts`, `identity.ts`, and `session.ts`
  must not touch `window`, `document`, `navigator`, or `localStorage` at module scope or in
  their default code paths. `globalThis.crypto` is allowed because Node, Bun, and browsers all
  provide it.
  Rationale: The MasterPlan reserves the option of extracting these modules into a Node SDK
  later. Importing the package on a server during server-side rendering must not throw.
  Date: 2026-10-14


## Outcomes & Retrospective

(To be filled during and after implementation.)


## Context and Orientation

This repository, `kansoku-ts`, is a Bun workspace that will publish two npm packages:
`kansoku-js` (this plan and the next) and `kansoku-react` (a later plan). It is the TypeScript
companion of the Kansoku server, which lives in the sibling checkout at `../kansoku` and is
registered in Mori as `mori://shinzui/kansoku`. Everything below assumes that the foundation
plan `docs/plans/1-workspace-foundation-vendored-kansoku-contracts-and-generated-wire-types.md`
is complete. Check its Progress section before starting; if any item there is unchecked, stop
and finish it first.

### Terms used in this plan

A **write key** is a public Kansoku credential with the prefix `ksk_w_`. It may ingest events
and nothing else, and it is designed to be embedded in a browser bundle. The server stamps every
accepted event with the account that owns the key, so the body's optional `accountId` is
ignored. The key travels in the `X-Api-Key` request header; the server also accepts
`Authorization: Bearer <key>`, and when both are present `Authorization` wins even if it is
malformed. This SDK always uses `X-Api-Key`.

The **batch endpoint** is `POST /v1/batch`. Its body is a JSON array of events. A body that
parses as an array of events always returns HTTP 202, even when every event is invalid; this is
**partial acceptance**. The 202 body, called `BatchAck`, is
`{"accepted": <count>, "rejected": [{"index": <zero-based input index>, "eventId": "<optional>", "errors": ["<human text>"]}]}`.
Events listed in `rejected` have been fully processed by the server and must never be re-sent;
re-sending the batch would duplicate the accepted events. A body that cannot be decoded as an
event array returns HTTP 400 instead.

The **error envelope** is the JSON body `{"code": "<string>", "message": "<string>", "retryable": <boolean>}`
returned with HTTP 400, 404, 413, and 503. Only `code` and `retryable` are machine-readable
contract; `message` and the batch `errors` strings are for people and may change. HTTP 401 has
no body. HTTP 413 means the request body exceeded the configurable cap (default 5 MiB) or the
batch exceeded the configurable event cap (default 500); it is permanent for that request, and
the client must split the batch or shrink events. HTTP 503 with `retryable: true` means storage
was unavailable and the same request may be retried.

The **anonymous ID** is a random identifier this SDK generates once per browser and persists.
The server treats `anonymousId` as the implicit `cookie` identity signal, so it must not be
repeated inside `identifiers`. A **session** is a run of activity in one browser; this SDK
generates a `sessionId`, renews it after `sessionTimeoutMs` of inactivity (default thirty
minutes), and emits a `session_start` event whose `properties.sessionId` equals the new
identifier.

**Identifiers** are additional identity signals in the optional `identifiers` object. The
server accepts only the keys `cookie`, `device`, `fingerprint`, and `email_sha256`; each value
must be 1 to 256 characters, all printable, non-space ASCII. Anything else makes the whole event
invalid.

A **schema version** pins a governed event to an immutable published shape. `schemaVersion` is
optional; absence means version 1, never the latest. Values outside `1..65535` are rejected.
The public **schema catalog** at `GET /v1/schemas` (no credential needed) lists every governed
event, its versions, required properties, types, and validation patterns; the same document is
vendored in this repository at `contracts/events.json`.

**Keepalive fetch** is `fetch(url, { keepalive: true })`. The browser lets such a request
outlive the page that started it, which is what makes delivery during navigation possible.
Browsers cap the total in-flight keepalive body size at 64 KiB per origin and refuse requests
that would exceed it.

**happy-dom** is a JavaScript implementation of browser APIs (`window`, `document`,
`localStorage`, events) used so `bun test` can run DOM-dependent tests without a real browser.
EP-1 registered it globally for the test runner through `bunfig.toml`.

A **storage adapter** is this SDK's small interface over wherever state is kept: `localStorage`,
a cookie, or memory. The SDK talks only to the adapter, so a page that blocks storage degrades
to memory instead of throwing.

### The tree this plan starts from

After EP-1 the repository looks like this (only the parts this plan touches are listed):

```text
kansoku-ts/
  package.json                 private root; "workspaces": ["packages/*", "examples/*"]
  bunfig.toml                  [test] preload = ["./test/setup/dom.ts"]
  tsconfig.base.json           shared compiler options with "lib": ["ES2022", "DOM", "DOM.Iterable"]
  justfile                     install, check, test, build <package>, sync-contracts, generate-schema, check-contracts
  contracts/
    KANSOKU_COMMIT             server commit the contracts were copied from
    openapi.json               copy of the server's docs/api/openapi.json
    events.json                copy of the server's docs/contracts/events.json (the schema catalog)
  scripts/
    build.ts                   Bun.build ESM + CJS, then tsc declaration emit, for one package
    sync-contracts.ts
  test/
    setup/dom.ts               registers happy-dom globals
    helpers/fetch-mock.ts      scripted fetch used by every network test
  packages/
    kansoku-js/
      package.json             name "kansoku-js", "type": "module", exports map, sideEffects false
      tsconfig.json            extends ../../tsconfig.base.json
      tsconfig.build.json      declaration-only emit into dist/
      README.md                placeholder from EP-1
      src/
        index.ts               exports `version` only, from EP-1
        generated/schema.ts    openapi-typescript output; do not edit; excluded from lint/format
      test/                    empty or a single smoke test from EP-1
    kansoku-react/             untouched by this plan
```

`packages/kansoku-js/src/generated/schema.ts` exports `components` and `paths` types generated
from `contracts/openapi.json`. The types this plan uses are
`components["schemas"]["AnalyticsEvent"]`, `components["schemas"]["BatchAck"]`,
`components["schemas"]["RejectedEvent"]`, `components["schemas"]["ErrorEnvelopeWire"]`,
`components["schemas"]["SchemaCatalog"]`, and `components["schemas"]["EventSource"]`. Never
hand-write a wire type; re-export these.

Run every command in this plan from the repository root
`/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts` inside the Nix dev shell (`direnv`
loads it automatically; otherwise `nix develop`). The shell provides Bun 1.4.2, TypeScript 7.0.2
as `tsc`, oxlint, oxfmt, and `just`.

### The wire contract, verbatim

The `AnalyticsEvent` schema in `contracts/openapi.json` has these required fields: `eventId`
(non-empty string, the producer-generated idempotency key), `eventName` (non-empty string),
`source` (one of `web`, `app`, `service`, `worker`, `email`, `agent`), `occurredAt` and
`receivedAt` (UTC timestamps as JSON strings, for example `2026-07-20T12:00:00Z`; fractional
seconds are accepted), `properties` and `context` (JSON objects, `{}` when empty). Its optional
fields are `accountId`, `anonymousId`, `userId`, `sessionId`, `organizationId`, `identifiers`
(object of string values), `sourceService`, `url`, `referrer`, `utmSource`, `utmMedium`,
`utmCampaign`, `utmContent`, `utmTerm`, `correlationId`, `causationId`, `sourceEventId`,
`sourceGlobalPosition`, and `schemaVersion` (integer; the generated type is unbounded, the
server enforces `1..65535`). Unknown JSON fields are ignored by the server today, but producers
must not rely on them being stored.

The server replaces `receivedAt` with its own clock and rejects any event whose `occurredAt` is
later than that server-stamped time (the rejection text reads "occurredAt is in the future
relative to the server clock"). A browser whose clock runs ahead of the server therefore loses
events; this SDK cannot measure the skew because the response `Date` header is not exposed
cross-origin, so it sends `occurredAt` honestly and reports such rejections through `onDrop`.
The MasterPlan records a server-side handoff for this; do not work around it here.

Responses. `POST /v1/batch` and `POST /v1/events` return 202 (accepted), 400 (malformed body or
single-event validation failure), 401 (missing, malformed, unknown, or revoked credential; no
body), 404, 413 (payload too large), and 503 (storage unavailable). `GET /v1/schemas` is
unauthenticated and returns 200 with the `SchemaCatalog`
`{"catalogVersion": 1, "service": "kansoku", "events": {"<name>": {"versions": [...]}}}`.
Browser CORS applies to `/v1/*` only; the server pre-approves the `Content-Type`, `X-Api-Key`,
and `Authorization` request headers and the `GET` and `POST` methods, caches preflight for an
hour, and wraps its size-limit middleware inside CORS so browser JavaScript can read a 413 body.

Retry guidance from the server's producer guide (`docs/guides/send-events.md` in
`mori://shinzui/kansoku`): retry transient network failures, 503 responses whose envelope says
`retryable: true`, and interrupted requests with no response, using bounded exponential backoff
and the same `eventId` values; never automatically retry 400, 401, 403, 404, 413, or per-event
batch rejections. The queue-to-ClickHouse boundary is at-least-once and `eventId` is the storage
idempotency key, which is why re-sending an unanswered batch is safe.

### The Haskell SDK this plan mirrors

The server repository ships `kansoku-client` (`kansoku-client/src/Kansoku/Client.hs` in
`mori://shinzui/kansoku`, documented in `docs/guides/haskell-sdk.md`). Its defaults are
batches of 100 events, a five-second flush interval, a 10,000-event bounded buffer, five
retries, and a 100-millisecond exponential-backoff base. Its loss accounting is the model for
this plan: when the buffer is full the newest event is dropped; permanent delivery failure drops
the batch; server-side rejections are counted as drops; everything is summed in `droppedCount`.
Its `close` flushes before stopping; `flush` waits for the drained batches but reports no
per-event result.

Its identity helpers define the event shapes that EP-3 will emit through this plan's envelope
builder, so the builder must be able to express them. `identify userId anonymousId traits`
emits an event named `identify` with top-level `userId` and `anonymousId` and the traits as
`properties`. `alias previousId newId pairs` emits `alias` with `anonymousId = previousId`,
`userId = newId`, and `properties` containing `previousId` and `newId` plus any extra pairs.
`group ids organizationId pairs` emits `group` with the caller's `userId` and the top-level
`organizationId`. All three are reserved event names with no governed schema (the catalog lists
`identify` at version 1 with an empty property list).

### Architecture Decision Records

Local ADRs live under `docs/adr/`, which EP-1 installs as a profile-governed OKF bundle with
the descriptor `docs/adr/profile.dhall`. Before creating a record, scan the existing filenames
and headings there; at the time of writing none exist beyond what EP-1 created. This plan must
create two records in milestone M4 following the workflow in `agents/skills/exec-plan/ADR.md`:
one titled "Delivery semantics and exit transport for kansoku-js" and one titled "Identity and
session persistence policy for kansoku-js". Allocate each handle with `okf id next`, never by
counting files; validate strictly; append to the bundle log. The Concrete Steps section shows
the commands.

The server's decisions that bind this plan are in Mori as the bundle
`mori://shinzui/kansoku/okf/adrs`. Cite them by these exact handles:

- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-1` — SDK-grade ingest contract boundaries.
  Partial acceptance on `/v1/batch`; 202 ends the delivery attempt; rejected events are never
  retried; 413 is permanent and the client splits or shrinks; CORS scoped to `/v1/*` with the
  three pre-approved headers; defaults of 500 events per batch and 5 MiB per body.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-3` — API-key authentication and account-scoped
  analytics. Write keys ingest only; both header transports accepted; `Authorization` takes
  precedence; the credential is the sole source of tenancy; unknown or revoked keys return 401
  and the SDK must treat that as permanent.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-5` — Evidence-based multi-signal identity
  resolution. The closed identifier vocabulary and value rules above; `anonymousId` is the
  implicit cookie signal; cookie bindings are created only by `identify` and `alias` events.
- `mori://shinzui/kansoku/okf/adrs/concepts/ADR-7` — Versioned event schema governance. Immutable
  versions from 1; absence means 1; `1..65535`; the public catalog and its committed copy.

No other ADR, local or remote, constrains this plan.


## Plan of Work

The work proceeds in four milestones, each adding one layer and each verifiable by named test
files. Keep the layering discipline from the Decision Log: milestone M1 and the queue, transport,
and retry modules of M3 are pure TypeScript with no DOM access; only `storage.ts`,
`identity.ts`, `session.ts`, and `lifecycle.ts` touch browser globals, and they do so inside
functions, never at import time.

### M1 — Envelope, constants, and validation

Create `packages/kansoku-js/src/contract/wire.ts`, which re-exports the generated wire types
under short names (`AnalyticsEvent`, `BatchAck`, `RejectedEvent`, `ErrorEnvelopeWire`,
`SchemaCatalog`, `EventSource`) and defines `JsonValue` and `JsonObject` as the recursive JSON
types the public API uses for `properties` and `context`.

Create `packages/kansoku-js/src/contract/events.ts` with the event-name constants and built-in
schema-version pins. The names are `page_view`, `session_start`, `experiment_viewed`,
`identify`, `alias`, and `group`; the pins are `page_view: 1`, `session_start: 1`, and
`experiment_viewed: 1`. The three reserved identity names carry no pin because the server does
not govern their properties. Also export the identifier-kind list, the schema-version bounds
`1` and `65535`, and the experiment-name pattern `^[a-z0-9_.:-]{1,128}$` (used by EP-3 and by
the catalog test here).

Create `packages/kansoku-js/src/contract/validate.ts`, which mirrors the server's structural
validation so the SDK can drop an event with reason `invalid` before spending a request on it:
`eventId` and `eventName` non-empty, `properties` and `context` plain objects, `schemaVersion`
absent or an integer in `1..65535`, `identifiers` absent or an object whose keys are in the
closed set and whose values are 1–256 printable non-space ASCII characters (the character test
is `code >= 0x21 && code <= 0x7e`). It returns an array of human-readable error strings; empty
means valid.

Create `packages/kansoku-js/src/envelope.ts` with `buildEvent`. The pure function receives an
explicit dependencies record (the current identity snapshot with `anonymousId`, optional
`userId`, `organizationId`, and `identifiers`; the current `sessionId`; the resolved client
options; and the `baseContext` described below) followed by the five call parameters that the
client re-exposes on its internal object as `buildEvent(name, properties, options, webFields?, ids?)`,
and returns an `AnalyticsEvent`. `webFields` is the optional top-level web-field object (`url`,
`referrer`, `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`). `ids` is an
optional override slot `{ anonymousId?: string; userId?: string }`: when present, each defined
field replaces the value read from the identity snapshot for that one event only, and the
identity store is not touched. `track` never passes `webFields` or `ids`; EP-3's `alias` is the
only caller of `ids`, because an alias event must carry `anonymousId = previousId` and
`userId = newId` on one event without changing the stored identity. The rules are fixed: `eventId` is
`globalThis.crypto.randomUUID()` when available and otherwise a fallback of the current time in
base 36 joined with 16 random base-36 characters; `source` is always `"web"`; `sourceService`
copies the option; `occurredAt` is `new Date(options.occurredAt ?? now()).toISOString()` and
`receivedAt` is the identical string; `properties` and `context` are always objects (callers
may pass `undefined`), and `context` is the merge of a `baseContext` argument supplied by the
client (the results of its registered context providers, see M3) with `options.context` spread
on top so the caller's keys win; `anonymousId` and `sessionId` are always stamped; `userId`,
`organizationId`, and `identifiers` are stamped only when the identity snapshot has them;
`schemaVersion` is stamped only when an explicit `options.schemaVersion` or a pin (from the
caller's `schemaVersions` option merged over the built-in defaults) exists for that name.
This plan leaves `webFields` undefined on every event it builds; a unit test in
`envelope.test.ts` must nevertheless cover both the `webFields` stamping and the `ids` override
(an event built with `ids: { anonymousId: "anon-old", userId: "user-new" }` carries those two
values while the identity snapshot still reports the stored ones).

Write `packages/kansoku-js/test/envelope.test.ts` and `packages/kansoku-js/test/validate.test.ts`
for the rules above, and `packages/kansoku-js/test/contract.test.ts`, which loads
`contracts/events.json` with `Bun.file` and, for every built-in pinned event, builds a
representative event and asserts that each property the catalog marks `required` is present
with the declared type and that each property with a `pattern` matches it. The catalog's
`page_view` version 1 requires `properties.url` as a string; `session_start` version 1 requires
`properties.sessionId`; `experiment_viewed` version 1 requires `properties.experiment` and
`properties.variant` matching `[a-z0-9_.:-]{1,128}`. The same test asserts the catalog's
`catalogVersion` is `1` and `service` is `"kansoku"`, so a future contract refresh that changes
either is noticed here.

### M2 — Storage, identity, and session

Create `packages/kansoku-js/src/storage.ts` with the `StorageAdapter` interface (`get`, `set`,
`remove`) and three implementations. `memoryStorage()` is a `Map`. `localStorageAdapter()`
probes `globalThis.localStorage` inside a `try` by writing and removing a probe key and returns
the memory adapter when the probe throws or `localStorage` is undefined; every later call is
also wrapped so a quota error degrades to memory for that call. `cookieStorage({ domain })`
reads and writes `document.cookie` with `path=/`, `SameSite=Lax`, `Secure` when the page is
`https:`, and a 400-day expiry, which is the longest browsers honour. `resolveStorage(option)`
maps the `storage` option (`"localStorage"` default, `"cookie"`, `"memory"`, or a caller-provided
adapter) to an instance. All keys are prefixed with `storageKeyPrefix` (default `kansoku`)
followed by a dot.

Create `packages/kansoku-js/src/identity.ts` with an identity store over the adapter. It owns
the keys `<prefix>.anonymous_id` (generated with the same UUID routine as `eventId` when absent),
`<prefix>.user_id`, `<prefix>.identifiers` (JSON object), and `<prefix>.organization_id`. It
exposes `snapshot()` (the four values), `setUserId`, `setIdentifiers` (validated through
`validate.ts`; invalid input throws a `TypeError` so EP-3 can surface it), `setOrganizationId`,
`rotateAnonymousId`, and `clearUser` (removes user, identifiers, and organization but keeps the
anonymous ID). EP-3's `identify`, `alias`, `group`, `setIdentifiers`, and `reset` are thin
wrappers over these methods.

Create `packages/kansoku-js/src/session.ts` with the session manager. It persists
`<prefix>.session` as `{"id": "<uuid>", "lastActivityAt": <epoch ms>}`. `current(nowMs)`
returns `{ id, started }`: when the record is absent or `nowMs - lastActivityAt >
sessionTimeoutMs`, it generates a new identifier, persists it, and returns `started: true`;
otherwise it returns the existing identifier with `started: false`. `touch(nowMs)` updates
`lastActivityAt`; `rotate(nowMs)` forces a new session. The client (M3) calls `current` before
building every event and, when `started` is true and `autocapture.sessions` is not `false`,
enqueues a `session_start` event with `properties.sessionId` set to the new identifier ahead of
the event that triggered the roll.

Tests `storage.test.ts`, `identity.test.ts`, and `session.test.ts` run under happy-dom (the
preload from EP-1 registers it for every test file). The storage test must include a case where
`localStorage.setItem` is stubbed to throw and assert the adapter falls back to memory without
propagating the error.

### M3 — Queue, transport, retry, and accounting

Create `packages/kansoku-js/src/queue.ts`: a bounded FIFO of `AnalyticsEvent` with
`enqueue(event): boolean` (returns `false` when `maxQueueSize` is reached, and the caller drops
the new event with reason `queue_full`), `peekBatch(maxEvents, maxBytes)` (returns the longest
prefix whose JSON size, measured with `TextEncoder`, stays within `maxBytes`, always at least
one event), `remove(eventIds)`, `size`, `toJSON()`, and `restore(events)`. When `persistQueue`
is on, the client writes `queue.toJSON()` to `<prefix>.queue` after every enqueue and every
removal; the queue itself knows nothing about storage.

Create `packages/kansoku-js/src/retry.ts` with `backoffDelayMs(attempt, baseMs, random)`
implementing full jitter: `random() * Math.min(30_000, baseMs * 2 ** attempt)`, and with the
outcome classifier used by the client. Outcomes are a discriminated union: `accepted` (with the
parsed `BatchAck`), `permanent` (HTTP 400, 401, 403, 404, or a 413 for a single event, with the
status and envelope when present), `too_large` (HTTP 413 for a batch of more than one event),
and `retryable` (HTTP 503 whose envelope says `retryable: true`, any network error, a timeout,
any 2xx or 5xx whose body cannot be parsed as the expected shape, and any status not listed
above). A 503 whose envelope says `retryable: false` is `permanent`.

Create `packages/kansoku-js/src/transport.ts` with `sendBatch(deps, events, { keepalive })`.
It serialises the array, calls the injected `fetch` with method `POST`, the URL
`${baseUrl}/v1/batch`, headers `Content-Type: application/json` and `X-Api-Key: <writeKey>`,
and, unless `keepalive` is set, an `AbortController` signal that fires after
`requestTimeoutMs`. It never throws; it returns an outcome from `retry.ts`.

Create `packages/kansoku-js/src/client.ts` with `createKansoku`. Option resolution applies the
defaults from the Interfaces section and freezes the result as `client.config`. Construction
wires the storage adapter, identity store, session manager, queue (restoring `<prefix>.queue`
when `persistQueue` is on), and, if `document` exists, the lifecycle hooks from M4. It starts
the flush interval with the injected `timers`. Opt-out state is `<prefix>.opt_out` in storage.
The `respectDoNotTrack` option is resolved into `client.config` here but not acted upon: EP-3
implements the Do-Not-Track gate (reading `navigator.doNotTrack`) and routes suppressed events
through this plan's `opted_out` drop path, so EP-2 adds no browser-sniffing code for it.

`createKansoku` returns the public `KansokuClient`, but internally it builds a richer object
that EP-3 extends. Besides the public members, the internal client object exposes three
non-exported hooks. `enqueueBuilt(event)` runs validation, `beforeSend`, enqueue, persistence,
and the flush threshold for an already-built `AnalyticsEvent`, so capture events built by EP-3
share the exact pipeline `track` uses. `registerContextProvider(fn: () => JsonObject): () => void`
registers a function that is called every time the client constructs an event; the results of
all providers are merged in registration order into a `baseContext` object that `buildEvent`
places beneath the caller's `TrackOptions.context`, so caller keys win. EP-2 registers no
providers itself; EP-3's context module registers one. The returned function unregisters the
provider. `onShutdown(fn: () => void): void` registers a callback that `shutdown()` runs at its
start, before detaching listeners and before the final flush; EP-3 uses it to unpatch the
History API. The internal object also re-exposes the envelope builder as
`buildEvent(name, properties, options, webFields?, ids?)`, already bound to the identity store,
session manager, resolved config, and context providers, so EP-3 builds capture events with it
and hands them to `enqueueBuilt`; the `ids` slot is the per-event identity override that only
EP-3's `alias` uses. These hooks live on the internal object only and never appear on the
exported `KansokuClient` type.

`track(eventName, properties, options)` runs the pipeline in this order: if opted out, call
`onDrop` with reason `opted_out` and return; obtain the session (emitting `session_start` first
when it rolled); call the registered context providers and build the envelope; then hand the
event to `enqueueBuilt`, which validates and drops with reason `invalid` on errors, applies
`beforeSend` and drops with reason `before_send` when it returns `null`, enqueues and drops with
reason `queue_full` when the queue refuses, persists, and starts a flush when
`queue.size >= flushAt`.

`flush()` returns the in-flight flush promise when one exists, otherwise starts one. A flush
repeatedly takes `peekBatch(maxBatchEvents, maxBatchBytes)` until the queue is empty. For each
batch it loops over attempts: `accepted` removes the batch from the queue, adds `accepted` to
stats, and for every entry in `rejected` adds one to `stats.rejected` and `stats.dropped` and
calls `onDrop` once with reason `rejected` and the rejected events (matched by `index` into the
batch); `permanent` removes the batch and drops it with reason `permanent_error` and the status
in `detail`; `too_large` removes the batch from the queue, splits it in half, and pushes both
halves to the front of the work list so they are sent next (a half of one event that still
returns 413 is `permanent`); `retryable` waits `backoffDelayMs(attempt)` using the injected
timers and tries again while `attempt < maxRetries`, after which the batch is removed and
dropped with reason `retries_exhausted`. The queue is persisted after every removal. `stats`
exposes `queued` (live queue size), `accepted`, `rejected`, and `dropped`.

`optOut()` persists the flag, drops the queue contents with reason `opted_out`, and stops
accepting events; `optIn()` clears the flag. `shutdown()` is finished in M4.

Tests `queue.test.ts`, `retry.test.ts`, `transport.test.ts`, and `client.test.ts` use the
scripted fetch from `test/helpers/fetch-mock.ts`. EP-1 owns that helper, and its agreed shape is
`createFetchMock()` returning `{ fetch, requests, respondWith }`: `fetch` is the function to
inject through the `fetch` option; `requests` is the array of recorded requests (URL, method,
lower-cased headers, parsed JSON body); `respondWith(status, body)` enqueues the next response,
and a thrown `Error` passed in place of a body produces a network error. Do not write a second
mock. `client.test.ts` must cover, at minimum: three tracked events and a
flush produce one request with three events and `stats.accepted === 3`; a 202 with one
rejection calls `onDrop` once with reason `rejected` and the right event and leaves
`stats.rejected === 1`; a 400 drops the batch with `permanent_error`; a 401 drops with
`permanent_error`; a 413 on a four-event batch is followed by two two-event requests; a 503
with `retryable: true` is retried until a 202 and the queue is unchanged between attempts;
`maxRetries` consecutive network errors end in `retries_exhausted`; `beforeSend` returning
`null` drops with `before_send`; `queue_full` fires when `maxQueueSize` is exceeded; `optOut`
suppresses tracking; a rolled session emits `session_start` before the triggering event; and a
`session_start` event is suppressed when `autocapture.sessions` is `false`.

### M4 — Lifecycle, persistence, and the public surface

Create `packages/kansoku-js/src/lifecycle.ts` with `attachExitFlush(target, onExit)`. It adds a
`visibilitychange` listener that calls `onExit` when `document.visibilityState === "hidden"`,
and a `pagehide` listener that calls `onExit`, and returns a detach function. It guards against
double invocation for the same hidden transition and re-arms when visibility returns to
`visible`. The client's `onExit` is an exit flush: it takes every queued event, groups them into
chunks whose serialised body is at most 61,440 bytes, and for each chunk calls `sendBatch` with
`keepalive: true` without awaiting the result before starting the next; when a response does
arrive it is processed exactly like a normal flush (so events are removed from the persisted
queue only after a 202). Events for which no response arrives stay in `<prefix>.queue` and are
restored and re-sent by the next `createKansoku` on that origin with the same `eventId` values.

Finish `shutdown()`: it first runs every callback registered through the internal `onShutdown`
hook in registration order, then detaches the lifecycle listeners, clears the interval timer,
awaits `flush()`, and makes later `track` calls drop with reason `opted_out` wrapped in
`detail: "shutdown"`. A `client.test.ts` case registers an `onShutdown` callback and a context
provider through the internal object and asserts the callback ran before the final request was
sent and that the provider's keys appear in every event's `context` beneath the caller's keys. `createKansoku` must be callable more than once in one page (tests do this), so
nothing may be a module-level singleton.

Export the public surface from `packages/kansoku-js/src/index.ts`: `createKansoku`, `version`,
the types `KansokuOptions`, `ResolvedKansokuOptions`, `KansokuClient`, `TrackOptions`,
`DropInfo`, `DropReason`, `IdentifierKind`, `StorageAdapter`, `JsonObject`, `JsonValue`, and
`AnalyticsEvent`, and the constants from `contract/events.ts`. EP-3 will add more exports to
the same file.

Write the README section "Core API" in `packages/kansoku-js/README.md` covering construction,
`track`, `flush`, `shutdown`, opt-out, `stats`, drop reasons, and the delivery guarantees in
plain language, and add `packages/kansoku-js/scripts/smoke.ts`, which starts a `Bun.serve`
server on an ephemeral port that answers `POST /v1/batch` with a 202 acknowledgement of every
event, imports `createKansoku` from `../dist/index.js`, tracks three events, flushes, and prints
`accepted: 3`. Finally create the two ADRs and validate them (see Concrete Steps).

Tests `lifecycle.test.ts` (dispatching `pagehide` on happy-dom's `window` and asserting chunked
keepalive requests) and a persistence case in `client.test.ts` (create a client, track, do not
flush, create a second client with the same storage, flush, and assert the first client's
events were sent) complete the suite.


## Concrete Steps

All commands run from `/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts`.

Confirm the foundation is in place before writing code:

```bash
just check-contracts            # regenerates schema.ts and fails if it would change
bun test                        # EP-1's suite; expected: all pass, 0 fail
ls packages/kansoku-js/src/generated/schema.ts test/helpers/fetch-mock.ts contracts/events.json
```

Create the M1 files and run only the pure tests:

```bash
mkdir -p packages/kansoku-js/src/contract packages/kansoku-js/test
# create src/contract/wire.ts, src/contract/events.ts, src/contract/validate.ts, src/envelope.ts
# create test/envelope.test.ts, test/validate.test.ts, test/contract.test.ts
bun test packages/kansoku-js/test/envelope.test.ts packages/kansoku-js/test/validate.test.ts packages/kansoku-js/test/contract.test.ts
```

Expected shape of the output (counts will differ):

```text
bun test v1.4.2

packages/kansoku-js/test/envelope.test.ts:
✓ buildEvent stamps required fields and source web
✓ buildEvent omits schemaVersion for unpinned names
...
 18 pass
 0 fail
```

The public types that EP-3 and EP-4 rely on, as they must appear in
`packages/kansoku-js/src/types.ts` at the end of this plan (EP-3 adds the members marked in the
MasterPlan as EP-3 to `KansokuClient` in the same file):

```typescript
import type { AnalyticsEvent, JsonObject } from "./contract/wire.ts"

export type IdentifierKind = "cookie" | "device" | "fingerprint" | "email_sha256"

export interface StorageAdapter {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export interface KansokuOptions {
  baseUrl: string                         // e.g. "https://analytics.example.com"; no trailing slash
  writeKey: string                        // ksk_w_… ; sent as X-Api-Key
  sourceService?: string                  // stamps AnalyticsEvent.sourceService
  flushAt?: number                        // default 20 events
  flushIntervalMs?: number                // default 5000
  maxQueueSize?: number                   // default 1000; newest event dropped when full
  maxBatchEvents?: number                 // default 100 (server cap 500)
  maxBatchBytes?: number                  // default 1_048_576 (server cap 5 MiB)
  maxRetries?: number                     // default 5
  retryBaseDelayMs?: number               // default 500; exponential, full jitter, 30 s cap
  requestTimeoutMs?: number               // default 10000
  persistQueue?: boolean                  // default true
  storage?: "localStorage" | "cookie" | "memory" | StorageAdapter   // default "localStorage"
  storageKeyPrefix?: string               // default "kansoku"
  cookieDomain?: string                   // only for the cookie adapter
  sessionTimeoutMs?: number               // default 1_800_000 (30 min)
  schemaVersions?: Record<string, number> // per-event pins; merged over built-in defaults
  autocapture?: { pageViews?: boolean; sessions?: boolean }   // defaults true/true; pageViews is EP-3
  optOut?: boolean                        // start opted out
  respectDoNotTrack?: boolean             // default false
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null
  onDrop?: (info: DropInfo) => void
  fetch?: typeof globalThis.fetch         // injectable for tests
  now?: () => number                      // injectable clock, epoch milliseconds
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  debug?: boolean
}

export type ResolvedKansokuOptions = Readonly<Required<Omit<KansokuOptions, "beforeSend" | "onDrop" | "cookieDomain">> & Pick<KansokuOptions, "beforeSend" | "onDrop" | "cookieDomain">>

export type DropReason =
  | "queue_full" | "rejected" | "permanent_error" | "retries_exhausted"
  | "before_send" | "opted_out" | "invalid"

export interface DropInfo { reason: DropReason; events: AnalyticsEvent[]; detail?: string }

export interface TrackOptions { schemaVersion?: number; occurredAt?: Date; context?: JsonObject }

export interface KansokuStats { queued: number; accepted: number; rejected: number; dropped: number }

export interface KansokuClient {
  track(eventName: string, properties?: JsonObject, options?: TrackOptions): void
  flush(): Promise<void>
  shutdown(): Promise<void>
  optOut(): void
  optIn(): void
  isOptedOut(): boolean
  getAnonymousId(): string
  getUserId(): string | undefined
  getSessionId(): string
  readonly stats: Readonly<KansokuStats>
  readonly config: ResolvedKansokuOptions
  // EP-3 appends: page, identify, alias, group, experiment, setIdentifiers, reset
}
```

Create the M2 files and run their tests:

```bash
# create src/storage.ts, src/identity.ts, src/session.ts
# create test/storage.test.ts, test/identity.test.ts, test/session.test.ts
bun test packages/kansoku-js/test/storage.test.ts packages/kansoku-js/test/identity.test.ts packages/kansoku-js/test/session.test.ts
```

Create the M3 files and run their tests. A representative `client.test.ts` case, using EP-1's
`createFetchMock()` helper:

```typescript
import { describe, expect, test } from "bun:test"
import { createKansoku } from "../src/index.ts"
import { createFetchMock } from "../../../test/helpers/fetch-mock.ts"

const immediate = {
  setTimeout: ((fn: () => void) => { fn(); return 0 }) as unknown as typeof setTimeout,
  clearTimeout: (() => {}) as typeof clearTimeout,
}

describe("partial acceptance", () => {
  test("one rejected event is dropped and never re-sent", async () => {
    const net = createFetchMock()
    net.respondWith(202, { accepted: 2, rejected: [{ index: 1, eventId: "e2", errors: ["bad"] }] })
    const drops: string[] = []
    const kansoku = createKansoku({
      baseUrl: "http://kansoku.test",
      writeKey: "ksk_w_test",
      storage: "memory",
      autocapture: { sessions: false },
      timers: immediate,
      fetch: net.fetch,
      onDrop: (info) => drops.push(info.reason),
    })
    kansoku.track("a"); kansoku.track("b"); kansoku.track("c")
    await kansoku.flush()
    expect(net.requests).toHaveLength(1)
    expect(net.requests[0]?.headers["x-api-key"]).toBe("ksk_w_test")
    expect(kansoku.stats).toEqual({ queued: 0, accepted: 2, rejected: 1, dropped: 1 })
    expect(drops).toEqual(["rejected"])
  })
})
```

```bash
# create src/queue.ts, src/retry.ts, src/transport.ts, src/client.ts, src/types.ts
# create test/queue.test.ts, test/retry.test.ts, test/transport.test.ts, test/client.test.ts
bun test packages/kansoku-js/test/queue.test.ts packages/kansoku-js/test/retry.test.ts packages/kansoku-js/test/transport.test.ts packages/kansoku-js/test/client.test.ts
```

Create the M4 files, run the whole package suite, build, and run the smoke script:

```bash
# create src/lifecycle.ts, finish src/client.ts shutdown, update src/index.ts and README.md
# create test/lifecycle.test.ts, scripts/smoke.ts
bun test packages/kansoku-js
just check                      # tsc --noEmit, oxlint, oxfmt --check
just build kansoku-js
bun packages/kansoku-js/scripts/smoke.ts
```

Expected smoke output:

```text
mock kansoku listening on http://127.0.0.1:<port>
accepted: 3
```

Create the two ADRs. Inspect the bundle first, allocate handles, write the records, validate,
and log:

```bash
ls docs/adr
okf id list docs/adr --profile docs/adr/profile.dhall
okf id next docs/adr --profile docs/adr/profile.dhall ADR      # prints the next free ADR-N
```

Each record is one Markdown file at the bundle root with the frontmatter the profile requires.
Use the handle `okf id next` printed; the example below assumes it printed `ADR-1`:

```markdown
---
type: Architecture Decision Record
title: Delivery semantics and exit transport for kansoku-js
description: Deliver only through POST /v1/batch with X-Api-Key, retry only transient outcomes, split on 413, and flush on exit with chunked keepalive fetch because headers rule out sendBeacon.
timestamp: 2026-10-20T00:00:00Z
docId: ADR-1
status: Accepted
date: 2026-10-20
---

# ADR 1: Delivery semantics and exit transport for kansoku-js

## Context
...
## Decision
...
## Alternatives considered
...
## Consequences
...
```

Replace the timestamp and date with the day you write it. Write the second record ("Identity
and session persistence policy for kansoku-js": storage keys, formats, adapter fallback order,
thirty-minute inactivity timeout, what `reset` clears) with the next handle. Then:

```bash
okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce
okf log add docs/adr <docId> "<one-line summary>"      # check `okf log add --help` for the exact form
okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce
```

Both validations must exit 0. If the local profile or descriptor path differs from this
example, follow the installed descriptor; never hand-pick a handle.

Commit at milestone boundaries with the trailers the MasterPlan requires:

```text
feat(kansoku-js): add envelope builder, event constants, and contract validation

MasterPlan: docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md
ExecPlan: docs/plans/2-kansoku-js-core-event-envelope-identity-and-session-state-batched-delivery-and-exit-flush.md
Intention: intention_01m4ymqn7xe1a8tz8v7r78e34y
```


## Validation and Acceptance

The plan is complete when all of the following hold.

Running `bun test packages/kansoku-js` from the repository root reports zero failures and the
suite includes the eleven named test files (`envelope`, `validate`, `contract`, `storage`,
`identity`, `session`, `queue`, `retry`, `transport`, `client`, `lifecycle`).

The same three M1 test files also pass without happy-dom, proving M1 has no DOM dependency.
The repository-wide switch is the environment variable `KANSOKU_TEST_NO_DOM=1`, which makes
EP-1's `test/setup/dom.ts` preload skip registering the DOM globals:

```bash
KANSOKU_TEST_NO_DOM=1 bun test packages/kansoku-js/test/envelope.test.ts packages/kansoku-js/test/validate.test.ts packages/kansoku-js/test/contract.test.ts
```

The contract test proves that `buildEvent` output for `page_view`, `session_start`, and
`experiment_viewed` satisfies the vendored catalog at `contracts/events.json`, and fails if
`catalogVersion` or `service` changes.

In `client.test.ts`, the eleven behaviours listed in M3 and the persistence case from M4 each
have a test, and each observes only public behaviour: the recorded requests, `stats`, and
`onDrop` calls.

The lifecycle test dispatches `pagehide` after queueing enough events to exceed 61,440 bytes of
JSON and asserts that more than one request was made, every request had `keepalive: true`, and
no request body exceeded 61,440 bytes.

`just check` passes (type-check, lint, format). `just build kansoku-js` produces
`packages/kansoku-js/dist/index.js`, `dist/index.cjs`, `dist/index.d.ts`, and `dist/index.d.cts`,
and `bun packages/kansoku-js/scripts/smoke.ts` prints `accepted: 3` after a real HTTP round trip
to the in-process mock.

Importing the built module in a non-browser runtime does not throw:

```bash
bun -e 'import("./packages/kansoku-js/dist/index.js").then(m => console.log(typeof m.createKansoku))'
# expected: function
```

Both ADRs exist under `docs/adr/`, were allocated with `okf id next`, and
`okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce`
exits 0.

Proposed but not required by this plan: a live run against a real `kansoku-server` (owned by
EP-5), and a real-browser test of exit flush during navigation (also EP-5). This plan's
happy-dom lifecycle test is the representative producer/consumer check the MasterPlan asks for;
EP-5 repeats it in Chromium.


## Idempotence and Recovery

Every step in this plan is additive and can be rerun. Tests are hermetic: they use the memory
storage adapter or happy-dom's `localStorage`, which is fresh per test file, and the scripted
`fetch`, so they never touch the network or leave files behind. `just build kansoku-js` rewrites
`packages/kansoku-js/dist/` from scratch each time; delete the directory if a partial build
confuses `tsc`. The smoke script binds an ephemeral port and exits on completion; if it is
interrupted, nothing persists.

If `just check-contracts` fails at the start, do not edit `schema.ts` by hand; run
`just generate-schema` and inspect the diff, which means EP-1's pin and generated file are out
of step and must be reconciled in that plan before continuing here.

If `okf validate` fails after writing an ADR, fix the frontmatter it names; do not delete or
renumber an existing record. If a handle was allocated and the record abandoned, leave the gap;
`okf id next` never fills gaps.

If a milestone is handed off mid-way, record in Progress which test files pass and which
behaviours from the M3 list remain, so the next contributor can resume from the failing test.


## Interfaces and Dependencies

Prerequisites from the parent MasterPlan: this plan hard-depends on EP-1
(`docs/plans/1-workspace-foundation-vendored-kansoku-contracts-and-generated-wire-types.md`)
being Complete. It consumes EP-1's workspace layout, `tsconfig.base.json`, `scripts/build.ts`,
`contracts/openapi.json`, `contracts/events.json`, the generated
`packages/kansoku-js/src/generated/schema.ts`, `bunfig.toml` with the happy-dom preload, and
`test/helpers/fetch-mock.ts`. It installs the two ADRs into the bundle EP-1 created at
`docs/adr/`.

Runtime dependencies: none. `kansoku-js` must have an empty `dependencies` field in
`packages/kansoku-js/package.json`. Dev dependencies come from the workspace root
(`@types/bun`, `@happy-dom/global-registrator`); do not add others for this plan.

Platform APIs relied upon: `fetch` with `keepalive` and `AbortController` (all evergreen
browsers, Node 18+, Bun), `globalThis.crypto.randomUUID` (with the fallback described in M1),
`TextEncoder`, `localStorage` and `document.cookie` (inside the storage adapters only),
`document.visibilityState`, and the `visibilitychange` and `pagehide` events (inside
`lifecycle.ts` only).

Modules this plan owns, by full path under `packages/kansoku-js/src/`: `index.ts`, `types.ts`,
`client.ts`, `envelope.ts`, `queue.ts`, `transport.ts`, `retry.ts`, `storage.ts`,
`identity.ts`, `session.ts`, `lifecycle.ts`, `contract/wire.ts`, `contract/events.ts`, and
`contract/validate.ts`. Later plans extend `index.ts`, `types.ts`, and `client.ts`; they do not
restructure them.

Interfaces later plans depend on: the `KansokuOptions`, `ResolvedKansokuOptions`,
`KansokuClient`, `TrackOptions`, `DropInfo`, `DropReason`, `IdentifierKind`, and
`StorageAdapter` types in `types.ts` exactly as shown in Concrete Steps; `buildEvent` in
`envelope.ts` accepting an optional top-level web-field argument (`url`, `referrer`,
`utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`) that EP-3 populates; the
identity store methods `snapshot`, `setUserId`, `setIdentifiers`, `setOrganizationId`,
`rotateAnonymousId`, and `clearUser` in `identity.ts`; the session manager methods `current`,
`touch`, and `rotate` in `session.ts`; the constants and pattern in `contract/events.ts`; the
validators in `contract/validate.ts`; and the storage keys `<prefix>.anonymous_id`,
`<prefix>.user_id`, `<prefix>.identifiers`, `<prefix>.organization_id`, `<prefix>.session`,
`<prefix>.queue`, and `<prefix>.opt_out` (EP-3 adds `<prefix>.exposures`).

The internal client object, which `createKansoku` builds and EP-3 extends, exposes three hooks
that are never part of the exported `KansokuClient` type. `enqueueBuilt(event: AnalyticsEvent): void`
runs validation, `beforeSend`, enqueue, persistence, and the flush threshold for an already-built
event, so EP-3's capture events share `track`'s pipeline. `registerContextProvider(fn: () => JsonObject): () => void`
registers a provider called on every event construction; results are merged in registration
order into the `baseContext` passed to `buildEvent`, beneath the caller's `TrackOptions.context`;
the return value unregisters. EP-2 registers none; EP-3's context module registers one.
`onShutdown(fn: () => void): void` registers a callback run at the start of `shutdown()`, before
listeners are detached and before the final flush; EP-3 uses it to unpatch the History API.
The internal object re-exposes the envelope builder as
`buildEvent(name, properties, options, webFields?, ids?)`, bound to the identity store, session
manager, resolved config, and context providers (the pure function in `envelope.ts` takes those
as an explicit dependencies record ahead of the same five parameters). `webFields` is the
optional top-level web-field object (`url`, `referrer`, `utmSource`, `utmMedium`,
`utmCampaign`, `utmContent`, `utmTerm`). `ids` is `{ anonymousId?: string; userId?: string }`;
when present, each defined field overrides the identity-store value for that event only and
the store is untouched. `track` never passes `webFields` or `ids`; EP-3's `alias` is the only
caller of `ids`, so it can stamp `anonymousId = previousId` and `userId = newId` on one event.

`respectDoNotTrack` is resolved into `client.config` by this plan but the gate itself is EP-3's:
EP-3 reads `navigator.doNotTrack` and reuses this plan's `opted_out` drop path.

Server contract this plan implements, by canonical handle:
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-1`, `mori://shinzui/kansoku/okf/adrs/concepts/ADR-3`,
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-5`, and
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-7`, with the producer guide at
`docs/guides/send-events.md` and the Haskell SDK at `kansoku-client/src/Kansoku/Client.hs` in
`mori://shinzui/kansoku` (artifact-level URIs pending).

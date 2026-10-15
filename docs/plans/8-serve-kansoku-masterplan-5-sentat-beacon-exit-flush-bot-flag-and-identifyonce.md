---
id: 8
slug: serve-kansoku-masterplan-5-sentat-beacon-exit-flush-bot-flag-and-identifyonce
title: "Serve Kansoku MasterPlan 5: sentAt, beacon exit flush, bot flag, and identifyOnce"
kind: exec-plan
created_at: 2026-10-15T15:01:32Z
intention: "intention_01m4zwwdrjesytazp5tb39fe3n"
provenance:
  created_by:
    model: "claude-fable-5-1"
    harness: "claude-code"
    at: 2026-10-15T15:01:32Z
---

# Serve Kansoku MasterPlan 5: sentAt, beacon exit flush, bot flag, and identifyOnce

This ExecPlan is a living document. Update its living sections and durable ADRs as work
proceeds. It delivers the four browser-side inputs that the server initiative
`mori://shinzui/kansoku/masterplans/5-act-on-rev-1-close-silent-loss-paths-add-metric-filters-and-enrich-web-analytics`
expects from this repository but does not own: a `sentAt` stamp for clock-skew correction
(server EP-29), a `sendBeacon` exit flush against the server's beacon route (server EP-39), a
client-side bot flag the server's enrichment reads (server EP-33), and an `identifyOnce`
helper for set-once user traits (server EP-40).


## Purpose / Big Picture

After this plan, a browser whose clock runs ahead no longer loses events, because every
request carries the time it was sent and the server corrects the skew; the last events before
a navigation or tab close reach the server through the browser's beacon queue, including a
new `page_leave` event with time on page; crawler traffic is flagged in `context.bot` so the
server can exclude it from web metrics; and applications can record set-once traits such as
`signup_source` with one call. Each capability is harmless against a server that has not yet
shipped its counterpart, and each becomes typed and conformance-tested once the vendored
contracts are refreshed at a server commit that includes it.


## Progress

- [ ] M1: Every delivered event carries `sentAt` stamped at transport time, restamped on retry, and the live clock-skew test passes against a server with EP-29 while still skipping cleanly against one without it.
- [ ] M2: With `exitTransport: "beacon"`, the exit flush and a new `page_leave` event go through `POST /v1/beacon` as a `text/plain` envelope with no preflight, falling back to keepalive fetch when beacon is unavailable or refuses the payload.
- [ ] M3: `context.bot` is set from a bundled, versioned user-agent list, with `botDetection` modes `flag`, `drop` and `off`, inside the package size budget.
- [ ] M4: `identifyOnce(userId, traits)` emits `identify_once` from `kansoku-js` and `kansoku-react`, with the schema version pinned once the catalog declares it.
- [ ] M5: Contracts re-vendored at a server commit containing EP-29, EP-39 and EP-40, generated types regenerated, and the live suite exercising all four behaviours end to end.


## Surprises & Discoveries

(None yet.)


## Decision Log

- Decision: Stamp `sentAt` at transport time, on the serialized copy, not on the queued event.
  Rationale: The SDK validates events against the vendored schema before queueing, and
  `sentAt` must reflect the actual send moment, including retries, so the server's formula
  `receivedAt - (sentAt - occurredAt)` sees the real transit delay.
  Date: 2026-10-15
- Decision: `exitTransport` defaults to `"keepalive"` in the release that introduces it, and
  flips to `"beacon"` in the first release after the server's beacon route is published.
  Rationale: A beacon to a route that does not exist is a silent loss; the default must follow
  the server.
  Date: 2026-10-15
- Decision: Bot detection flags by default and never drops silently unless configured.
  Rationale: The server's enrichment plan excludes flagged rows from web metrics while keeping
  them countable; a dropped event cannot be audited.
  Date: 2026-10-15
- Decision: `identifyOnce` is a separate event name, not a reserved key inside `identify`.
  Rationale: Mirrors the server's decision in EP-40; the catalog governs both events.
  Date: 2026-10-15


## Outcomes & Retrospective

(To be filled during and after implementation.)


## Context and Orientation

`kansoku-js` builds events in `buildEvent` (`packages/kansoku-js/src/envelope.ts`), which sets
`occurredAt` from the configured clock and copies it into `receivedAt` (the server overwrites
`receivedAt`). Delivery is `sendBatch` in `packages/kansoku-js/src/transport.ts`, a `fetch` of
`POST /v1/batch` with the write key in `X-Api-Key`, taking a `keepalive` flag; the client's
`deliver` (`packages/kansoku-js/src/client.ts` around line 201) splits on 413 and retries with
backoff, and `exitFlush` (around line 255) sends up to 60 KiB with keepalive when
`attachExitFlush` in `packages/kansoku-js/src/lifecycle.ts` fires on `visibilitychange`,
`pagehide` and `pageshow`. Unsent events stay mirrored in per-tab sessionStorage. Context is
assembled in `packages/kansoku-js/src/context.ts` (locale, timezone, screen, viewport, user
agent, SDK version). Identity helpers live in `packages/kansoku-js/src/identity-api.ts`; the
React bindings expose them through `useKansoku()` and hooks under
`packages/kansoku-react/src/hooks/`. Events are validated against generated types in
`packages/kansoku-js/src/contract/` and `packages/kansoku-js/src/generated/schema.ts`, which
derive from the vendored server contracts under `contracts/` pinned by
`contracts/KANSOKU_COMMIT`; refresh with `just sync-contracts --from <checkout> --ref <commit>`
then `just generate-schema`, and `just check-contracts` detects drift
([ADR 1](../adr/0001-vendor-kansoku-contracts-at-a-pinned-commit.md)). Delivery and exit
semantics are recorded in [ADR 2](../adr/0002-delivery-semantics-and-exit-transport.md),
capture defaults in [ADR 4](../adr/0004-browser-capture-defaults.md). `just check` enforces
the size budget; `just test-smoke` runs Playwright under `test/smoke/`; `just test-live` runs
the opt-in server conformance under `test/live/`, which already includes
`clock-skew.test.ts`.

Server-side counterparts, cited by their canonical handles: `sentAt` acceptance and skew
correction in `mori://shinzui/kansoku/plans/29-correct-client-timestamp-skew-and-count-ingest-rejections`;
the beacon route in `mori://shinzui/kansoku/plans/39-beacon-ingest-route-for-page-exit-delivery`
(a `text/plain` or JSON body `{"writeKey": …, "batch": […]}`, write keys only, same 202 shape,
response not readable by the browser); the `context.bot` flag read by
`mori://shinzui/kansoku/plans/33-acquisition-and-device-enrichment-with-bot-flagging`; and the
`identify_once` event declared by
`mori://shinzui/kansoku/plans/40-person-properties-set-and-set-once-user-traits`. The server
ignores unknown JSON fields and accepts undeclared event names, which is why each milestone
can ship before its counterpart without errors.


## Plan of Work

### M1: `sentAt`

In `sendBatch`, serialize each event with an added `sentAt` set to the current ISO time at
the moment of the request, leaving queued events untouched so validation and the mirror are
unaffected; a retry produces a new `sentAt`. Add a unit test with a controlled clock. Update
`test/live/clock-skew.test.ts` to detect `sentAt` in the served `/openapi.json`'s
`AnalyticsEvent` schema: when present, expect an event with `occurredAt` 90 seconds ahead to
be accepted; when absent, keep the current expectation. Document the field in
`docs/guides/delivery-and-privacy.md`.

### M2: Beacon exit flush and `page_leave`

Add `exitTransport: "keepalive" | "beacon"` to the options. Under `"beacon"`, `exitFlush`
builds the envelope `{ writeKey, batch }` as a `Blob` of type `text/plain`, splits to stay under
60 KiB per call, and calls `navigator.sendBeacon(baseUrl + "/v1/beacon", blob)`; a `true`
return counts the events as delivered best-effort and removes them from the mirror, a `false`
return or missing `sendBeacon` falls back to the existing keepalive path. Add
`autocapture.pageLeave` (default true) emitting `page_leave` on `pagehide` with
`durationMs` since the current page view and the page's `url` and `path`, queued ahead of the
exit flush. Record beacon sends in `stats`. Extend the Playwright smoke test to assert the
request appears with no preflight and that `page_leave` arrives when the tab closes.
Update ADR 2.

### M3: Bot flag

Add `packages/kansoku-js/src/bot.ts` with a versioned regular-expression list seeded from the
user agents posthog-js blocks by default plus generic tokens (`bot`, `crawler`, `spider`,
`headless`, `lighthouse`), and a `botDetection` option: `"flag"` (default) sets
`context.bot = true`; `"drop"` suppresses capture through the opt-out path with a `bot` drop
reason; `"off"` does nothing. Keep the list under a stated byte budget and update the size
check. Unit-test with twenty known bot and twenty browser strings. Update ADR 4.

### M4: `identifyOnce`

Add `identifyOnce(userId, traits)` beside `identify` in `identity-api.ts`, emitting
`identify_once` with the same user-id validation and the schema version from
`schemaVersions` when configured; expose it on the React client and add `useIdentifyOnce`
mirroring `useIdentify`. Document in `docs/guides/react.md` and the getting-started guide.

### M5: Contract refresh and conformance

Once the server repository contains EP-29, EP-39 and EP-40, run `just sync-contracts --from
<server checkout> --ref <commit>` and `just generate-schema`, commit the pin, types and
contracts together, pin `identify_once` to version 1 in the examples, and extend the live
suite: skew acceptance, a beacon envelope accepted at `/v1/beacon`, and an `identify_once`
followed by a metrics query with `filter=user:signup_source:eq:newsletter` returning the
expected point. Each live test skips with a clear message when the served OpenAPI lacks the
feature.


## Concrete Steps

```bash
nix develop
just install
just check
just test
just test-smoke
KANSOKU_LIVE_BASE_URL=http://localhost:8080 KANSOKU_LIVE_WRITE_KEY=... KANSOKU_LIVE_SERVICE_TOKEN=... just test-live
just sync-contracts --from ../kansoku --ref <commit> && just generate-schema && just check-contracts
```


## Validation and Acceptance

1. M1: a batch sent at T carries `sentAt` within one second of T on every event and a different
   value on retry; the live skew test passes or skips by feature detection.
2. M2: in Chromium, closing the tab after a `cta_clicked` produces a `text/plain` POST to
   `/v1/beacon` with no OPTIONS, containing `cta_clicked` and `page_leave` with a positive
   `durationMs`; with `exitTransport: "keepalive"` behaviour is unchanged.
3. M3: `Googlebot` sets `context.bot`; `"drop"` reports a `bot` drop and sends nothing; a
   normal browser string is unflagged; `just check` size budget passes.
4. M4: `identifyOnce("u-1", { signup_source: "newsletter" })` queues `identify_once` with the
   traits and the configured version; the React hook calls it once per mount.
5. M5: `just check-contracts` is clean after the refresh and the three live tests pass against
   a server at or after the pinned commit.


## Idempotence and Recovery

All options default to current behaviour except `sentAt`, which is additive and ignored by
older servers. The beacon default flip is a documented release note. Re-vendoring contracts
is repeatable and reviewed as one commit.


## Interfaces and Dependencies

Soft dependencies on the four server plans named above; nothing here fails without them.
Claims the `exitTransport`, `botDetection` and `autocapture.pageLeave` options, the
`page_leave` event name, the `identifyOnce` helper and `useIdentifyOnce` hook, and the `bot`
drop reason. Related local plan:
`docs/plans/7-cross-origin-identity-parent-domain-cookies-and-link-handoff.md`, which shares
the exit and identity code paths; land M2 here before or after that plan's handoff but rebase
`client.ts` carefully.

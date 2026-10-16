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
  reviews:
    - model: "gpt-6-astra"
      harness: "codex-cli"
      at: 2026-10-15T15:43:16Z
      verdict: "changes-requested"
      note: "Original draft review found correctness gaps; findings corrected by the accompanying update, with native acceptance still required."
  revisions:
    - model: "gpt-6-astra"
      harness: "codex-cli"
      at: 2026-10-15T15:43:16Z
      mode: "update"
      note: "Reconcile first-release APIs, domain semantics, dependencies and acceptance with the source-validated MP-5 review."
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-10-16T01:19:47Z
      mode: "implement"
      note: "Implement the M4 governed identity/helper portion as the pinned consumer of server EP-40; remaining transport/browser release milestones stay with the joint final gate."
---

# Serve Kansoku MasterPlan 5: sentAt, beacon exit flush, bot flag, and identifyOnce


## Purpose / Big Picture


Match the server's initial-release contracts for timestamp input, beacon delivery, bot flags,
identity vocabulary and governed traits. Server coordination is
`mori://shinzui/kansoku/masterplans/5-act-on-rev-1-close-silent-loss-paths-add-metric-filters-and-enrich-web-analytics`.
Delivery remains best effort; a queued beacon is not server acceptance.

## Progress


- [x] M1: Transport-time sentAt uses the event clock and immutable event IDs across retries.
- [x] M2: Lifecycle-safe beacon/keepalive exit delivery and governed page_leave pass browsers.
- [x] M3: Bot flags and email_hmac vocabulary agree with server/generated types.
- [x] M4: identify v2 and identify_once v1 helpers validate and update identity consistently.
- [ ] M5: Final contract pin and required live/browser conformance pass without feature skips.

## Surprises & Discoveries

M4 implementation (2026-10-16): the pinned catalog generates one shared runtime trait map
and operation versions. Both helpers validate before mutating active identity and preserve
explicit per-call/configured legacy overrides. useIdentifyOnce follows the existing hook
lifecycle, including StrictMode suppression and logout reset; no-DOM SSR stays inert.
Unit/type/lint/strict-ADR checks pass (69 unit cases plus two explicit SSR cases); JavaScript
9140-byte and React 1812-byte gzip outputs remain below their 10240/3072 budgets. Alias helper
arguments now reserve previousId/newId against custom-property overrides, with the shared
shape fixture asserting the conflicting-input case. A required
live fixture asserts actual accepted helper envelopes and server stitching/current-value
precedence. The owned packaged server passed it in legacy, http and http/dup telemetry modes,
one non-skipped live case per mode (23 assertions each), using SDK commit
6adee63714a631985cb9be1ec0e5f9fec7a4ecb6 and server contract pin
6517962 in `mori://shinzui/kansoku` (commit artifact URI pending). Evidence is recorded by
`mori://shinzui/kansoku/plans/40-person-properties-set-and-set-once-user-traits`.
M4 is complete; the other transport/browser/release milestones remain open for the joint gate.


M1/M2 acceptance (2026-10-16): the eight new transport/lifecycle/privacy unit cases cover
serialization clocks, retries/splits, Unicode envelope bytes, cross-instance budget sharing,
false/missing/throw fallback, original view attribution, SPA/BFCache intervals, beforeSend,
and privacy transitions. The Chromium consumer checks same/cross-origin text/plain without
OPTIONS, denied-origin zero rows, real keepalive quota refusal, oversized event retention,
and retained BFCache state with distinct view IDs. The standard headless-shell delegate disables
BFCache, so the proof explicitly uses full Chromium and waits for navigation commit rather
than a load event that restoration does not emit. The server harness records the consumer
commit and built JavaScript SHA-256 and refuses missing/zero/skipped required browser cases.

Server schemaVersion defaults to v1; a v2 schema does not upgrade existing helper payloads.
The initial proposal removed mirrored events after sendBeacon returned true and treated a
60 KiB allowance as independent for each call. Neither proves receipt or respects the shared
keepalive quota. The injectable `now` clock must stamp sentAt as well as occurredAt.

## Decision Log


On 2026-10-15 coordinate the first SDK release with the implemented server rather than silently
shipping unsupported capabilities. Keep exitTransport=keepalive by default; beacon is an explicit
option until the supported server contract is published. Preserve event IDs/content on retry,
restamp only sentAt, and keep queued-beacon accounting separate from acknowledged delivery.
Page-leave is lifecycle telemetry, not user engagement. Set-once initializes; later set may replace.

## Outcomes & Retrospective

M1, M2 and M4 are complete. The pinned server implements both beacon media types and shared
credential admission/deduplication. The SDK stamps only serialization copies, retains true
beacon submissions for acknowledged retries, shares one document byte allowance, and emits
privacy-gated page leaves with original view attribution. Opt-out and suppressed exits retire
old snapshots so opt-in cannot resurrect a former user's leave event.

The full unit suite has 77 passing cases and two separate no-DOM/SSR cases. Source build,
types, lint, format, package, contract and strict-ADR checks pass. JavaScript gzip is 10150 bytes;
React is 1843 bytes. Required packaged Chromium acceptance has six non-skipped cases, including
actual shared quota refusal and an actual restored BFCache document. The owned server also
passes the required governed-trait live case in all three telemetry modes. Runtime consumer
commit is 0a4eea715b5f34fad8593e3dfd123ce407976c95; its artifact hash is recorded by
`mori://shinzui/kansoku/plans/39-beacon-ingest-route-for-page-exit-delivery`.
The source contract pin is server commit 3d0e3d8 under `mori://shinzui/kansoku`
(commit artifact URI pending). M3 bot/email_hmac and local cross-origin behavior pass the required real-server/browser checks; M5 remains open for
`mori://shinzui/kansoku/plans/38-single-tenant-consumption-guide-for-dashboards-and-experiments`.

## Context and Orientation


`packages/kansoku-js/src/client.ts` owns deliver/exitFlush and `config.now`; `transport.ts`
serializes requests; `envelope.ts` stamps events; `lifecycle.ts` owns exit listeners.
`identity-api.ts`, `identity.ts`, `session.ts` own helper and persistence behavior.
`contract/validate.ts` checks generated wire contracts; `contracts/KANSOKU_COMMIT` pins them.
React hooks live under `packages/kansoku-react/src/hooks/`. Read local ADRs
[1](../adr/0001-vendor-kansoku-contracts-at-a-pinned-commit.md),
[2](../adr/0002-delivery-semantics-and-exit-transport.md),
[4](../adr/0004-browser-capture-defaults.md) and proposed
[8](../adr/0008-initial-release-server-coordination.md).

## Plan of Work


### M1: Timestamp and retry identity


Serialize sentAt using config.now immediately before each normal, split, retry or beacon request.
Leave queued occurredAt/eventId/producer content unchanged; restamp the serialization copy only.
The server correction is future-only: future occurredAt with sentAt >= occurredAt becomes
receivedAt-(sentAt-occurredAt); past timestamps are preserved. Test with the same injected skewed
clock for creation and transmission, not real Date.now mixed with fake event time.
Server ownership is
`mori://shinzui/kansoku/plans/29-correct-client-timestamp-skew-and-count-ingest-rejections` and
retry identity is
`mori://shinzui/kansoku/plans/30-pipeline-backpressure-and-storage-outage-resilience`.
A lost acknowledgement followed by retry must produce one logical event and stable metric totals.

### M2: Exit lifecycle


Add exitTransport=keepalive|beacon. Beacon uses text/plain UTF-8 JSON `{writeKey,batch}` at
/v1/beacon. Count complete envelope UTF-8 bytes, including credential and sentAt; budget at most
60 KiB of outstanding exit data per document, including keepalive. Do not send multiple maximum
batches under the assumption that the browser grants an independent quota. A false return or
missing API falls back to keepalive if budget allows; true means queued_best_effort, not accepted.
Keep mirrored events until actual acknowledgement or an explicit bounded expiry policy, using
server deduplication for a later retry; expose queued/expired separately from accepted statistics.
A true beacon return cannot trigger HTTP-error fallback because responses are unavailable.

Add autocapture.pageLeave as a Boolean option, default true, governed by the same privacy gates.
Coordinate visibilitychange and pagehide to avoid duplicate exit attempts. Emit at most one
page_leave per page-view lifecycle, with event-time/session snapshot from that page (do not start
a new session just to report an old page leaving), durationMs from a monotonic elapsed timer,
and the same original event ID on replay. Handle SPA transitions and BFCache restoration with
explicit tests, resetting page timing only on a genuine new view/resume interval. Opt-out/GPC
suppression and beforeSend apply. Page-leave cannot guarantee complete active-time measurement.
Server schema page_leave v1 and session semantics are owned by
`mori://shinzui/kansoku/plans/29-correct-client-timestamp-skew-and-count-ingest-rejections` and
`mori://shinzui/kansoku/plans/34-session-analytics-duration-bounce-entry-and-exit-pages`;
transport is `mori://shinzui/kansoku/plans/39-beacon-ingest-route-for-page-exit-delivery`.

### M3: Bot and identifiers


Add a versioned licensed/synthetic bot matcher and botDetection=flag|drop|off (default flag).
Flag mode adds Boolean context.bot without overriding an existing true; drop mode uses explicit
loss accounting and privacy suppression; off adds nothing. Measure package size. Server still
performs its own classification. Add email_hmac to generated/exported identifier types and
validator fixtures from the refreshed contract; never compute or distribute a server pepper in
browser code. Server kind ownership is
`mori://shinzui/kansoku/plans/32-time-aware-identity-bindings-and-bounded-resolution-cost`.

### M4: Governed identity helpers


identify defaults explicitly to schemaVersion=2; identifyOnce(userId,traits) defaults to v1 and
updates active userId exactly like identify. Both require a valid user ID, use the same queue,
and apply the declared trait types. Explicit version overrides remain visible; identify v1 is
identity-only and does not mutate governed current traits. Omitted traits leave existing values;
null is not a deletion operation. Set-once initializes a field, later set can replace it.
Do not allow custom alias properties to overwrite previousId/newId. Include the server's
identify_once implicit-cookie binding in live tests. React useIdentifyOnce follows the actual
useIdentify lifecycle and avoids duplicate capture on StrictMode restarts; "once" describes
server trait semantics, not a promise that React mounts once. Server ownership is
`mori://shinzui/kansoku/plans/40-person-properties-set-and-set-once-user-traits`.

### M5: Required contract release gate


After server EP-29/30/31/32/33/34/39/40 land, sync contracts at their containing commit, regenerate
schema and update runtime validators/fixtures/examples together. Include bot behavior and
email_hmac, not only the three original features. Local optional tests may feature-detect older
servers, but required release mode fails missing credentials, unsupported routes or zero/pending
cases. Server EP-38 owns the joint gate. Use a JSON filter:
`filter={"dimension":"user:signup_source","op":"eq","value":"newsletter"}`,
URL-encoded by the test client; the former colon grammar is withdrawn before initial release.

## Concrete Steps


From this repository inside nix develop, use the server's owned acceptance environment for live
data; do not mutate an ambient deployment. Add required-mode support before claiming the last
command is release evidence.

```bash
just install
just test
just test-smoke
just sync-contracts --from ../kansoku --ref <verified-server-commit>
just generate-schema
just check
KANSOKU_REQUIRE_LIVE=1 just test-live
```

The harness supplies KANSOKU_LIVE_BASE_URL, write key and service token privately. Contract checks
currently compare HEAD; preserve regenerated changes and review/commit the pin with generated
artifacts before requiring that committed drift check to pass.

## Validation and Acceptance


Test sentAt on retry, splitting and beacon with controlled skew; identical retries leave server
counts unchanged. Browser tests cover allowed/disallowed origins, no OPTIONS for text/plain,
quota refusal, competing lifecycle events, BFCache, SPA navigation, oversized envelope and page
session snapshots. Assert no accepted increment on beacon true. Bot fixture, size and SSR checks
pass. Both trait helpers emit explicit versions, email_hmac validates, and post-identifyOnce
anonymous history gains the expected current trait. Required live checks exercise rate limiting,
partial rejection, null groups and JSON filters against the final server without skips.

## Idempotence and Recovery


Refresh contracts reproducibly. Optional legacy-server development is not compatibility acceptance.
Queued delivery may still be lost at tab closure; local retention and retries remain bounded.
Do not silently fall back from an invalid filter to a broader population.

## Interfaces and Dependencies


Server milestones are hard prerequisites for corresponding live acceptance, not for pure unit
work. Whole-plan completion waits for all server counterparts named above. Local EP-7 is
`docs/plans/7-cross-origin-identity-parent-domain-cookies-and-link-handoff.md`; both share lifecycle
and identity code and require integration of reset/handoff behavior. Runtime ADR updates happen
with implementation; ADR-8 records the proposed coordination now.

Revision note (2026-10-15): reconcile timestamp clock, quota/acknowledgement semantics, schema
versions, email_hmac, JSON filters and mandatory conformance with the reviewed server MP-5.

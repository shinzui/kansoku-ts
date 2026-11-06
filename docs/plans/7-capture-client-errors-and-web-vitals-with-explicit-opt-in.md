---
id: 7
slug: capture-client-errors-and-web-vitals-with-explicit-opt-in
title: "Capture client errors and web vitals with explicit opt-in"
kind: exec-plan
created_at: 2026-11-06T13:52:03Z
intention: "intention_01m6qf2482enbtg9rjf07zdvt7"
provenance:
  created_by:
    model: "gpt-6.1-sol"
    harness: "codex-cli"
    at: 2026-11-06T13:52:03Z
---


# Capture client errors and web vitals with explicit opt-in

This ExecPlan is a living document. Keep Progress, Surprises & Discoveries, Decision Log,
and Outcomes & Retrospective current. This is an unimplemented follow-up requested by
`mori://shinzui/kansoku/okf/improvement-requests/concepts/IR-8` and
`mori://shinzui/kansoku/plans/57-declare-client-error-and-web-vital-events`.

## Purpose / Big Picture


Applications can independently enable browser error reporting and page-performance measurements
without writing listeners or a second transport. Both features are disabled by default. A browser
smoke test must show a sanitized uncaught error and one final LCP measurement reaching Kansoku
with the page URL, session and identity, while the default configuration emits neither.
This plan records future work; server event declarations alone do not start capture.

## Progress


- [ ] Milestone 1: Independently opt-in error capture emits bounded sanitized errors, deduplicates repeated delivery and enforces finite rates through the shared privacy/delivery path.
- [ ] Milestone 2: Independently opt-in vital capture emits at most one final sample per supported metric per page view, with correct units and documented navigation/finalization semantics.
- [ ] Milestone 3: Real-browser/public-server evidence, SSR and React lifecycle tests, documentation and ADR updates prove the complete optional behavior without changing defaults.

## Surprises & Discoveries


## Decision Log


Decision (2026-11-06): Add independent `autocapture.clientErrors` and `autocapture.webVitals`
Boolean options, both false by default. Keep all events in the existing queue and privacy path.
This extends the deliberately narrow defaults in ADR-4 only by explicit application choice.

Decision (2026-11-06): Preserve the server's current engagement classification: `client_error`
and `web_vital` count as engagement and can change bounce and observed-duration reports.
Document that consequence and require a deliberate product decision before enabling capture.
Changing retained server session semantics is separate migration/rebuild work.

## Outcomes & Retrospective


## Context and Orientation


`packages/kansoku-js/src/types.ts` defines `KansokuOptions.autocapture` (currently pageViews and
sessions), and `packages/kansoku-js/src/client.ts` resolves defaults, owns `start`/`stop` installers,
privacy suppression, `beforeSend`, envelope construction and enqueue. `page.ts`, `navigation.ts`
and `session.ts` own page detection, History changes and inactivity rotation. `queue.ts`,
`transport.ts`, `retry.ts` and `lifecycle.ts` already own retries and exit delivery. Extend these
paths; do not add a second endpoint or retry engine. `packages/kansoku-react/src/provider.tsx`
owns effect activation; confirm its actual exports before editing. Browser-global-free import
means importing either package without window/document/navigator causes no side effects or error.

[ADR-2](../adr/0002-delivery-semantics-and-exit-transport.md) keeps event IDs across retries and
requires reversible start/stop. [ADR-4](../adr/0004-browser-capture-defaults.md) captures page views
and sessions by default, suppresses automatic events under privacy policy, and keeps browser
globals out of imports. [ADR-5](../adr/0005-react-binding-boundary.md) delegates all delivery and
deduplication to the core; React StrictMode repeats setup/cleanup and must not duplicate reports.
Read `docs/guides/delivery-and-privacy.md` when changing this boundary.

The published contracts are owned by `mori://shinzui/kansoku`. Resolve that project with Mori
and sync its generated event/OpenAPI artifacts through `scripts/sync-contracts.ts` after the
server plan is published. `client_error` v1 requires message (1–256 Unicode code points), type
(1–128 code points) and Boolean handled. Never send stack traces or personal data. False means
uncaught error or unhandled rejection. `web_vital` v1 requires metric exactly LCP, INP, CLS, FCP
or TTFB and nonnegative numeric value. LCP is Largest Contentful Paint; INP Interaction to Next
Paint; CLS Cumulative Layout Shift; FCP First Contentful Paint; TTFB Time to First Byte. All use
milliseconds except unitless CLS, which may exceed one. Zero is a valid measurement; unavailable
measurements are absent, never invented zeros. Both events use top-level URL, sessionId,
sourceService, source=web and available identity. There is no unit property.

## Plan of Work


### Milestone 1: Optional bounded error capture


Add the two public options to `types.ts` and resolved defaults in `client.ts`. Introduce
`packages/kansoku-js/src/errors.ts` with a start/stop installer for browser error and
unhandledrejection listeners. Forward only bounded sanitized message/type labels and
handled=false. Avoid stringifying arbitrary rejection objects, URLs, stack traces or user
values. Use fixed fallback labels when a safe label cannot be derived; truncate by Unicode
code point, not UTF-16 code unit. Provide explicit label redaction policy in the guide and keep
`beforeSend` as the application's final inspection/suppression hook.

Deduplicate the same Error object using weak identity and repeated sanitized labels within a
bounded one-second window; cap label-cache memory. Limit to 10 accepted error reports per page
view and 30 per rolling 60 seconds per client. Count before enqueue so retries cannot consume
another allowance; clear per-page budget on a new logical view, preserve the rolling budget
across stop/start. Test deterministic clocks and repeated promise/error callbacks, rejection
primitives, object cycles, huge messages and surrogate pairs. Ordinary repeated distinct errors
outside the dedupe window remain eligible until their budget is exhausted. Teardown removes
only listeners this client installed. Opt-out and shutdown detach and suppress capture; opt-in
and restart reattach once when enabled. Disabled flags attach no listeners. Verify emitted
payloads through the ordinary `beforeSend`, validation and batching paths before expanding work.

### Milestone 2: Final vital samples


Add `packages/kansoku-js/src/vitals.ts` and integrate with the same page lifecycle. Before
selecting a measurement dependency or implementing browser algorithms, use Mori to locate
source/docs and verify current authoritative registry versions and upstream tags. Record the
chosen algorithm/dependency and compatibility policy, with a representative browser proof first.
Do not assume PerformanceObserver alone supplies correct final INP/CLS calculations.

Use a stable logical page-view key shared with page capture. Finalize at most one event for
each supported metric for each view; repeated intermediate callbacks update pending state,
never enqueue more events. For a hard navigation, collect supported measurements for that
document and finalize on pagehide/hidden according to the selected algorithm. For client-side
navigation, finalize the outgoing view before changing attribution; do not assign document-only
LCP/FCP/TTFB to subsequent soft views unless the chosen algorithm explicitly measures them.
Start a new collection scope for supported soft-navigation measurements, and document which
metrics are unavailable there. Preserve the original page URL/session/identity while pending
measurements finalize, even if the user navigates, resets identity or rotates a session.
Repeated hidden/pagehide/BFCache/restart callbacks must not resend a finalized metric. A
stop/start on the same page preserves emitted keys; a true new view gets new keys. Stop must
clean up observers/listeners without inventing a final value. Test this policy and document
BFCache restoration explicitly. Unsupported APIs and metrics produce no sample and no exception.

Use milliseconds for LCP, INP, FCP and TTFB and unitless CLS. Reject non-finite or negative
samples before enqueue. Keep the shared event IDs, batching, retries, `beforeSend` and privacy
suppression. Do not bypass suppression on exit, re-enable observers during opt-out, or retain
pending personal data. Add measurement/lifecycle tests using injected callbacks and browser tests
for supported real measurements.

### Milestone 3: Adoption evidence and docs


Extend core privacy/lifecycle and React provider tests to cover repeated StrictMode effect
restarts, independent flags, opt-out/in, GPC/DNT suppression, beforeSend drop/redaction, listener
ownership, bounded memory/rates, unsupported APIs and imports without browser globals. Add
real-browser smoke coverage and a live-server case in `test/live` proving accepted published v1
payloads with URL/session attribution. Use the owned server harness used by existing live tests;
never reset an ambient database. Missing prerequisites must fail required mode visibly.

Document both flags and defaults, sanitized labels, finite limits, measurement finalization,
soft-navigation/unsupported policy, units, deduplication and engagement consequences in
`docs/guides/delivery-and-privacy.md` and package guides. Update ADR-4 for explicit optional
capture while preserving default page/session behavior. Follow the local ADR profile/log tooling.
Keep React a thin binding. Run required checks, record evidence and distill durable choices.

## Concrete Steps


Run from the kansoku-ts checkout. Inspect contract sync options before refreshing the server
artifacts; the generated schema is committed with its source catalog, not edited by hand.

```bash
mori path mori://shinzui/kansoku
bun scripts/sync-contracts.ts --from /path/to/resolved/kansoku --ref <published-server-commit>
nix develop -c just install-frozen
nix develop -c just build
nix develop -c just test
nix develop -c just check
nix develop -c just test-smoke
```

Read `test/live` and its current environment inputs, start an owned disposable Kansoku server,
and then run the live gate with that server's disposable write key; record exact invocation
without secrets at implementation time:

```bash
nix develop -c just test-live
git diff --check
```

All commands must exit zero with nonzero assertion counts. The first integration checkpoint is
one error delivered through the shared public-ingest path, followed by one real supported final
vital before expanding fixture variants. Check catalog/OpenAPI drift after the contract sync is
committed because `just check-contracts` compares against HEAD.

## Validation and Acceptance


Default construction emits no client_error or web_vital. Enabling only clientErrors emits only
sanitized errors; enabling only webVitals emits only supported final measurements. A fake error
message of 257 astral code points becomes at most 256 code points without splitting a pair;
error type remains at most 128. Uncaught errors and unhandled rejections carry handled=false;
stack and arbitrary rejection data never appear in captured payloads. Repeated callbacks and
React restarts create one eligible report. Eleven distinct errors in one view enqueue at most
10; more than 30 in a rolling minute across new views enqueue at most 30. After window expiry,
new eligible reports work again. All budgets and memory remain finite.

Repeated vital callbacks for one view produce at most one final event per metric with the
final selected value, URL and session from that view. Unsupported measurements are absent;
CLS 1.5 is valid and LCP uses milliseconds. Navigation, hidden/pagehide, stop/start, BFCache and
React restart tests pin the finalization policy. Opt-out/GPC/DNT and beforeSend can suppress all
capture, including exit. Retries reuse the original IDs and produce one canonical stored fact.
The real-browser and required live case prove these assertions through accepted public v1
contracts. No new automatic capture is enabled in a product without recording a decision about
its engagement/bounce/duration consequences.

## Idempotence and Recovery


Contract generators and tests are repeatable. Start/stop and opt-in/out must be reversible;
shutdown is terminal. Use stable view/finalized keys and existing event IDs to make callbacks
and retries safe. Restore owned patches/listeners only and retain other libraries' hooks.
No server migration is part of this work. Revert capture changes or disable flags to stop new
capture without changing existing server facts. Leave this plan unchecked until actual browser
and native acceptance pass.

## Interfaces and Dependencies


Public additions are `KansokuOptions.autocapture.clientErrors?: boolean` and
`KansokuOptions.autocapture.webVitals?: boolean`, each defaulting to false. Existing queue,
transport and React interfaces remain the owners of delivery and lifecycle. The server
prerequisite is `mori://shinzui/kansoku/plans/57-declare-client-error-and-web-vital-events` and
its published v1 event catalog. This is a follow-up, not a child MasterPlan. No measurement
library or version is selected yet: the implementer must use Mori source/docs and verify
current package registry releases and upstream tags before choosing a dependency or bound.

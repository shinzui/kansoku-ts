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
  revisions:
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-11-06T13:57:41Z
      mode: "update"
      note: "Pin published server contract commit and document required live credential preflight"
    - model: "claude-fable-5-1"
      harness: "claude-code"
      at: 2026-11-06T14:36:07Z
      mode: "update"
      note: "Validate against the working tree, server contract and web-vitals 6.2.3; select an on-demand measurement file, exit-time finalization and bounded-work rules"
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-11-06T15:12:53Z
      mode: "implement"
      note: "Implement optional client errors and deferred document-scoped web vitals with browser and live acceptance"
---


# Capture client errors and web vitals with explicit opt-in

This ExecPlan is a living document. Keep Progress, Surprises & Discoveries, Decision Log,
and Outcomes & Retrospective current. This follow-up was requested by
`mori://shinzui/kansoku/okf/improvement-requests/concepts/IR-8` and
`mori://shinzui/kansoku/plans/57-declare-client-error-and-web-vital-events`.

## Purpose / Big Picture


Applications can independently enable browser error reporting and page-performance measurements
without writing listeners or a second transport. Both features are disabled by default. A browser
smoke test must show a sanitized uncaught error and one final LCP measurement reaching Kansoku
with the page URL, session and identity, while the default configuration emits neither.
An application that leaves both flags off gets no extra listeners or observers and never
downloads measurement code, and the `kansoku-js` entry bundle stays inside its existing 10 KiB
gzip budget either way. Both options must still be explicitly enabled; server event declarations alone do not
start capture.

## Progress


- [x] Milestone 1 (2026-11-06; error suite and combined 104-test suite pass; `just check` passes with entry 10230 bytes gzip): Independently opt-in error capture emits bounded sanitized errors, deduplicates repeated delivery, and enforces finite rates and bounded per-error work through the shared privacy/delivery path, inside the entry bundle budget.
- [x] Milestone 2 (2026-11-06; deterministic lifecycle/privacy tests and Chromium navigation proof pass; measurement file 3613 bytes gzip): Independently opt-in vital capture loads its measurement code on demand, emits at most one final sample per supported metric per measured page view with correct units, and delivers exit-time samples in the exit request under the documented finalization policy.
- [ ] Milestone 3: Real-browser/public-server evidence, SSR and React lifecycle tests, documentation and ADR updates prove the complete optional behavior without changing defaults.

## Surprises & Discoveries


Plan validation on 2026-11-06, before any implementation, found the following. Each one changed
the plan.

The entry bundle cannot hold a measurement library. Building `packages/kansoku-js` and running
`bun scripts/check-size.ts` printed the first block; the second is the gzip size of the two ES
module builds inside the `web-vitals` 6.2.3 npm tarball. 8565 plus 3339 bytes exceeds the
10240-byte budget, and that would be charged to applications that never opt in.

```text
package          raw      gzip     budget
kansoku-js         22992     8565    10240 ok

dist/web-vitals.js              raw=8967  gzip=3339
dist/web-vitals.attribution.js  raw=15677 gzip=5587
```

`scripts/build.ts` cannot emit an on-demand file today. With Bun 1.4.2 and the script's current
options, a dynamic `import()` of a local module is inlined into the entry; only `splitting: true`
turns it into a separate file. A two-module probe printed:

```text
splitting=false  entry-point index.js          hasMarker=true   hasDynamicImport=false
splitting=true   entry-point index.js          hasMarker=false  hasDynamicImport=true
                 chunk       lazy-3b1j01jb.js  hasMarker=true
```

`web-vitals` has no teardown. Its five functions return nothing, and its README warns that each
call "creates a `PerformanceObserver` instance and registers event listeners for the lifetime of
the page" and should not be repeated per page load. `stop()` therefore cannot remove the
library's observers, and a React StrictMode restart must not register them twice.

The library's final values can arrive after this SDK's exit request. It reports final CLS and INP
(and LCP, unless a key press or click finalized it earlier) from `visibilitychange` listeners on
`window`. `packages/kansoku-js/src/lifecycle.ts` runs the exit flush on the first of `pagehide`
or `visibilitychange`, and the HTML Standard's document-unloading steps fire `pagehide` before
`visibilitychange` when the user navigates away or closes the tab. On that path a sample
enqueued from the library's final callback misses the exit batch and waits in the queue mirror
until the same tab loads the SDK again.

After a BFCache restore the library reports TTFB as a constant zero (`initMetric('TTFB', 0,
'back-forward-cache', …)` in its `src/onTTFB.ts`), which is not a measurement.

Every enqueue rewrites the whole queue mirror. `persist()` in `packages/kansoku-js/src/client.ts`
serializes the full queue into `sessionStorage`, and `enqueueBuilt` calls it once per event.
Several samples finalized inside a `pagehide` handler would each pay that cost while the browser
is trying to leave the page.

The server's owned harness pins this SDK's live totals. `scripts/identity_browser_acceptance.py`
in `mori://shinzui/kansoku` requires exactly `9 pass` from `bun test test/live` and `2 passed`
from `test/smoke/live-examples.pw.ts`, which match today's nine live cases and two live examples.
A new live case fails that gate until the server harness is updated.

Mori has no `web-vitals` project (`mori registry search` finds nothing for `web-vitals` or
`vitals`), so the npm tarball was read directly. `mori path` also cannot yet resolve the two
`mori://shinzui/kansoku/...` artifact URIs cited at the top of this plan; the project URI
resolves and both files exist in that checkout.

Implementation proof (2026-11-06): Chromium delivered FCP and TTFB in ordinary batches and
LCP=28 ms, CLS=0 and INP=80 ms in the navigation exit request. The observed order was
`pagehide`, then `visibilitychange`. A second sink subscribed to the same measurement module
and saved its latest callbacks through visibilitychange; each exit value matched the library's
final callback exactly. The pending-value design therefore remains selected. The browser test
asserts the batch received by the HTTP mock because Playwright's departing-page request events
omit the keepalive request. The default example never requests the measurement file.

The build uses Bun ESM splitting, yielding exactly the entry and one `vitals-<hash>.js` file,
with no shared runtime chunk. `just check` measured 10230 bytes gzip for the entry (10240 budget)
and 3613 for measurement code (5120 budget). This leaves little entry headroom; future changes
must continue measuring the built artifact. The complete local suite reports 104 passing cases
plus three SSR cases; real browser smoke reports three passing cases. Required live evidence
is still running under the owned server harness. FRIC-1 records and resolves the shared-test
helper cleanup issue; it did not alter capture behavior.

## Decision Log


Decision (2026-11-06): Add independent `autocapture.clientErrors` and `autocapture.webVitals`
Boolean options, both false by default. Keep all events in the existing queue and privacy path.
This extends the deliberately narrow defaults in ADR-4 only by explicit application choice.

Decision (2026-11-06): Preserve the server's current engagement classification: `client_error`
and `web_vital` count as engagement and can change bounce and observed-duration reports.
Document that consequence and require a deliberate product decision before enabling capture.
Changing retained server session semantics is separate migration/rebuild work.

Decision (2026-11-06): Measure vitals with the `web-vitals` standard build, pinned exactly at
6.2.3, as a build-time dependency compiled into a separate file that the entry imports on demand.
It is the reference implementation, matches how Chrome measures these metrics, has no
dependencies, and already bounds its own work: it observes with `buffered: true`, keeps only the
ten longest interactions for INP, and ignores event-timing entries shorter than 40 ms. Verified
on 2026-11-06: npm `latest` is 6.2.3, published 2026-10-05, and upstream tag `v6.2.3` exists in
`GoogleChrome/web-vitals`. Rejected: hand-written algorithms, which must track specification
changes and repeat known INP and CLS subtleties; the attribution build, which is 5587 bytes and
exposes element selectors and resource URLs; a runtime or optional peer dependency, which ADR-6
forbids and which breaks the build of any consumer that does not install it; and inlining into
the entry, which exceeds the budget. Verify the registry and tag again if implementation starts
after a newer release.

Decision (2026-11-06): A measured page view is one document load or one BFCache restoration, and
its samples belong to the first page view recorded in it. Client-side route changes get no
samples of their own and do not re-attribute pending ones, so later views in a single-page
application have no vitals (absent, not zero) and document-lifetime CLS and INP are reported
against the landing view, as the Chrome User Experience Report does. The library cannot read or
reset CLS and INP on demand when this SDK detects a route change. Its `reportSoftNavs` option
measures browser-detected soft navigations only in Chromium 151 and later, changes how the
initial view is finalized, reports TTFB as zero, and can disagree with this SDK's History-based
view detection; adopting it is separate follow-up work with its own decision.

Decision (2026-11-06): FCP and TTFB are final when first reported and are enqueued then. LCP,
CLS and INP are registered with `reportAllChanges: true`, held only as the latest value, and
emitted once at the first exit transition through `core.onExit`, the hook `page_leave` already
uses. This puts final samples in the exit batch whether `pagehide` or `visibilitychange` fires
first. The accepted cost: a value can omit entries the browser had not delivered at exit, and
changes after the user returns to a previously hidden tab are not reported. Upstream discourages
`reportAllChanges` in production because of report volume; here each callback only overwrites a
number. Rejected: enqueueing from the library's own final callbacks, which misses the exit batch
on navigation; and a second exit request for late samples, which needs in-flight tracking in the
delivery engine. Milestone 2's browser proof states when to reverse this.

Decision (2026-11-06): Captured errors and vitals copy the envelope of a recorded page view, as
`leavePage` does for `page_leave`, instead of calling `core.buildEvent`. Automatic capture
therefore never renews or rotates a session and never emits `session_start`. The copied envelope
is retired, with any unsent samples, when the user opts out or `reset()` changes the anonymous
ID. This replaces the earlier wording that preserved identity across a reset, which contradicted
`docs/guides/delivery-and-privacy.md` and the existing page-leave behavior. An error with no page
view to copy falls back to `core.buildEvent` with the current URL; vitals with no page view in
their scope are not emitted.

Decision (2026-11-06): Error capture uses only bubble-phase `error` and `unhandledrejection`
listeners on `window`. It does not listen in the capture phase, assign `window.onerror`, wrap
timers, event targets, `fetch`, promises or `console`, call `preventDefault`, or read `stack`.
Budgets are charged when a report is handed to the shared pipeline, whatever `beforeSend`,
validation or a full queue decide afterwards, so an error storm costs a bounded number of
envelope builds and `beforeSend` calls. While capture is suppressed the handlers stay attached
and return early, as automatic page views do, instead of detaching on opt-out.

Decision (2026-11-06): Labels come only from the `name` and `message` strings of a value that
looks like an error. Anything else gets fixed labels and never the thrown value. Messages keep
their first line, and URL-like, email-like and long digit or hexadecimal runs are replaced by
fixed placeholders. Thrown strings and objects routinely carry user data, and stable labels keep
the server's `prop:message` grouping useful.

## Outcomes & Retrospective


Milestones 1 and 2 implement both optional paths and prove their local/browser behavior. The
contract refresh is committed as f199e23. Required server acceptance remains pending, so
Milestone 3 remains open. ADR-4 and ADR-6 now preserve the durable privacy, lifecycle and
packaging decisions. FRIC-1 is resolved by explicit cleanup hooks in the new capture suites.

## Context and Orientation


`packages/kansoku-js/src/types.ts` defines `KansokuOptions.autocapture` (currently `pageViews`,
`sessions` and `pageLeave`). `packages/kansoku-js/src/client.ts` resolves defaults in
`resolveOptions` and owns the `start`/`stop` installers registered through `onStart`, privacy
suppression, `beforeSend`, envelope construction and enqueue. In the same file `createKansoku`
keeps `pageSnapshot`, the envelope of the last successfully enqueued page view, and `leavePage`
copies it to build `page_leave` without touching the session. Listeners registered with
`core.onExit` run at the start of `exitFlush`, immediately before the exit batch is chosen.
`page.ts`, `navigation.ts` and `session.ts` own page detection, History changes and inactivity
rotation. `queue.ts`, `transport.ts`, `retry.ts` and `lifecycle.ts` already own retries and exit
delivery; `lifecycle.ts` triggers one exit per transition, on the first of `pagehide` or
`visibilitychange` to hidden. Extend these paths; do not add a second endpoint or retry engine.
`packages/kansoku-js/src/contract/events.ts` lists built-in event names and schema versions.
`packages/kansoku-react/src/provider.tsx` starts an owned client in an effect and stops it in
cleanup; the flags reach the core through `options.autocapture`, so the binding needs tests
rather than new logic. Browser-global-free import means importing either package without
window/document/navigator causes no side effects or error.

[ADR-2](../adr/0002-delivery-semantics-and-exit-transport.md) keeps event IDs across retries and
requires reversible start/stop. [ADR-4](../adr/0004-browser-capture-defaults.md) captures page views
and sessions by default, suppresses automatic events silently under privacy policy, never renews
a session to report an old view, and keeps browser globals out of imports.
[ADR-5](../adr/0005-react-binding-boundary.md) delegates all delivery and deduplication to the
core; React StrictMode repeats setup/cleanup and must not duplicate reports.
[ADR-6](../adr/0006-two-browser-packages-and-esm-distribution.md) gives both packages no runtime
dependencies, one minified ESM bundle each, and gzip budgets of 10 KiB for `kansoku-js` and 3 KiB
for `kansoku-react`, enforced by `scripts/check-size.ts` inside `just check`. `scripts/build.ts`
bundles everything not listed under a package's `dependencies` or `peerDependencies` and names
its single output `index.js`. Read `docs/guides/delivery-and-privacy.md` when changing this
boundary.

Terms used below. A logical page view is one successful `client.page()` call, automatic or
explicit. The back/forward cache (BFCache) keeps a page alive in memory after the user leaves it,
so Back or Forward restores it without a new load; the restoration fires `pageshow` with
`persisted` true, and this SDK already records a new page view then. A soft navigation is a route
change inside a single-page application through the History API, with no new document. An exit
transition is the page becoming hidden or unloading. The queue mirror is the per-tab
`sessionStorage` copy of undelivered events that survives a reload. React StrictMode is React's
development mode, which runs every effect's setup, cleanup and setup again. GPC (Global Privacy
Control) and DNT (Do Not Track) are browser privacy signals the SDK honors when the application
asks it to. A `PerformanceObserver` is the browser API that delivers timing entries
asynchronously; its `buffered` option replays entries recorded before the observer existed.

The published contracts are owned by `mori://shinzui/kansoku`. `contracts/KANSOKU_COMMIT`
currently pins e18b4f4, which predates both events. Commit 021ec1a on that project's `master`
publishes them in catalog version 5. Sync its generated event/OpenAPI artifacts through
`scripts/sync-contracts.ts` and regenerate types with `just generate-schema`. The new pin spans
nine server contract commits, not only these two events: the OpenAPI document grows by about
3,400 lines and the catalog version moves from 4 to 5, which
`packages/kansoku-js/test/contract.test.ts` currently asserts as 4. `client_error` v1
requires message (1–256 Unicode code points), type (1–128 code points) and Boolean handled.
Never send stack traces or personal data. False means uncaught error or unhandled rejection.
`web_vital` v1 requires metric exactly LCP, INP, CLS, FCP or TTFB and nonnegative numeric value.
LCP is Largest Contentful Paint; INP Interaction to Next Paint; CLS Cumulative Layout Shift; FCP
First Contentful Paint; TTFB Time to First Byte. All use milliseconds except unitless CLS, which
may exceed one. Zero is a valid measurement; unavailable measurements are absent, never invented
zeros. Both events use top-level URL, sessionId, sourceService, source=web and available
identity. There is no unit property. The server accepts undeclared extra properties, so keeping
stack traces and personal data out is entirely this SDK's job: send exactly the declared
properties. The request and the server plan are the files
`docs/improvement-requests/declare-client-error-and-web-vital-events.md` and
`docs/plans/57-declare-client-error-and-web-vital-events.md` in the checkout that
`mori path mori://shinzui/kansoku` prints.

`web-vitals` (Apache-2.0, no dependencies, source `GoogleChrome/web-vitals`) is Google's
reference implementation of the five metrics. Mori has no project for it; read the README and
`src/` in its npm tarball. The facts this plan depends on, checked against 6.2.3, are these.
Each `onCLS`, `onINP`, `onLCP`, `onFCP` and `onTTFB` call returns nothing and installs observers
and listeners for the life of the document, so each is called once per document. It observes
with `buffered: true`, so loading it late loses no entries, and its README recommends deferring
it behind user-impacting code. INP is not reported without an interaction; CLS, FCP and LCP are
not reported for a page loaded in the background. CLS works only in Chromium; the other four
also work in Firefox and Safari. After a BFCache restore it issues new metric objects with new
`id` values and `navigationType` `back-forward-cache`; `metric.id` is unique per metric
instance. It registers no `unload` or `beforeunload` listener; either would make pages
ineligible for BFCache.

`test/live` runs in a process without a DOM: `just test-live` sets `KANSOKU_TEST_NO_DOM=1` and
`test/live/env.ts` throws if `window` exists. `KANSOKU_REQUIRE_LIVE=1` already turns missing
credentials into an error there and in `test/smoke/live-examples.pw.ts`. Listeners and observers
cannot run in `test/live`; the Playwright file is where a real browser reaches a real server.
`test/smoke/vanilla.pw.ts` runs the built examples in Chromium against a local HTTP mock on port
4180 that also receives requests sent after the page leaves. The owned server harness lives in
`mori://shinzui/kansoku`: `nix develop -c just acceptance` there, with `KANSOKU_SDK_PROJECT`
pointing at this checkout and `KANSOKU_REQUIRE_SDK=1`, starts disposable stores and a packaged
server and supplies credentials privately. Its `scripts/identity_browser_acceptance.py` runs
this SDK's whole `test/live` directory and the single file `test/smoke/live-examples.pw.ts` in
required mode and asserts exact totals: nine passing live cases and two passing live examples,
with no skips. Any case added here changes those totals.

## Plan of Work


### Milestone 1: Optional bounded error capture


At the end of this milestone an application that sets `autocapture.clientErrors` gets one
sanitized `client_error` event per distinct uncaught error or unhandled rejection, within fixed
budgets, and an application that does not set it has no error listeners. Unit tests under
`packages/kansoku-js/test` prove it with a deterministic clock, and `just check` still passes
the size budget.

Sync and commit the contracts first (see Concrete Steps). Add the two public options to
`types.ts`, default both to false in `resolveOptions`, and add `client_error` and `web_vital` at
version 1 to `BUILT_IN_SCHEMA_VERSIONS` in `packages/kansoku-js/src/contract/events.ts`.
Introduce `packages/kansoku-js/src/errors.ts` with an installer, registered through `onStart`,
that returns its teardown. It stays in the entry bundle because it must be listening before
early errors occur, so keep it small: the entry has about 1.6 KiB of gzip headroom, which the
loader in Milestone 2 also shares.

Listeners. Use `window.addEventListener("error", handler)` without the capture flag and
`window.addEventListener("unhandledrejection", handler)`. In the bubble phase `window` receives
only script errors; with capture it would also receive every failed image, script and stylesheet
load. Do not assign `window.onerror` or `window.onunhandledrejection`, do not wrap timers, event
targets, `fetch`, promises or `console`, and never call `preventDefault` or `stopPropagation`:
the application and the console must behave exactly as they would without the SDK. Teardown
removes only listeners this client installed. Errors in workers and in other frames are out of
scope. With no `window` the installer does nothing, and a disabled flag attaches no listeners.

Handler cost. The handler runs synchronously inside the application's failure path, possibly
thousands of times in a loop, so every step is bounded and the cheapest checks come first.
Return at once if the handler is already running (a re-entrancy flag, so a failure inside the
SDK's own reporting cannot recurse) or if a budget is exhausted, before reading anything from the
thrown value. Then dedupe. Call `core.isSuppressed()` only after those in-memory checks, because
it reads shared storage, and skip silently when it is true: `enqueueBuilt` would otherwise report
an `opted_out` drop for an automatic event. Wrap the body in `try`/`catch` and never rethrow.
Never read `stack`: engines format stack traces lazily on first access, and the contract forbids
sending them. Read `name` and `message` inside the `try`, since a thrown value can be a proxy or
define throwing getters. Slice a message to a fixed prefix, for example 1024 UTF-16 code units,
before any scanning or pattern matching, so cost does not grow with message size, and truncate by
walking at most 256 or 128 code points rather than spreading the whole string into an array.
Keep the dedupe cache and the rolling window in fixed-size structures pruned on access; start no
timers.

Labels. Derive labels only from a value that looks like an error: an object whose `name` and
`message` are strings, which covers `Error` subclasses and `DOMException`. `type` is that `name`
when it is a short identifier and a fixed label otherwise; `message` is the sanitized `message`.
For everything else use fixed labels and never the value: a thrown or rejected string, number or
plain object can hold user input, and stringifying an arbitrary object can run application code
or walk a cycle. That includes `ErrorEvent.message` when no error object is available, except the
exact cross-origin placeholder `Script error.`, which is itself a fixed label. Fixed labels are
constants such as type `UnhandledRejection` with message `Non-error promise rejection`.
Sanitizing a message means keeping its first line, collapsing whitespace, and replacing URL-like,
email-like and long digit or hexadecimal runs with fixed placeholders such as `<url>`, using
patterns that cannot backtrack on the bounded prefix. An empty result uses a fixed label because
the contract requires at least one code point. Truncate by Unicode code point, not UTF-16 code
unit. Forward exactly `message`, `type` and `handled: false`. Describe this policy in the guide
and keep `beforeSend` as the application's final inspection and suppression hook.

Dedupe and budgets. Deduplicate the same Error object using weak identity and repeated sanitized
labels within a bounded one-second window; cap label-cache memory. Limit to 10 error reports per
logical page view and 30 per rolling 60 seconds per client. Charge both when a report is handed
to `enqueueBuilt`, so retries cannot consume another allowance and a `beforeSend` that drops
everything still caps the work. Clear the per-view budget when `client.page()` records a new
view; preserve the rolling budget across stop/start. Read time from `config.now` so tests can
drive it, and treat a clock that moves backwards as an expired window. Ordinary repeated distinct
errors outside the dedupe window remain eligible until their budget is exhausted.

Attribution. Build each event by copying the current `pageSnapshot` envelope the way `leavePage`
does: a new `eventId`, event name `client_error`, current timestamps, schema version 1 and the
three declared properties. That carries the top-level URL, session, identity, source service and
context of the view the user is on without renewing the session. With no snapshot, because no
page view was recorded or opt-out or reset retired it, fall back to `core.buildEvent` with the
top-level `url` taken from `location.href`. Send every event through `core.enqueueBuilt` so bot
handling, validation, `beforeSend` and batching apply unchanged.

Lifecycle. `stop()` and `shutdown()` remove the listeners and `start()` reattaches them once.
Opt-out, GPC and DNT suppress capture through the early return above, and opt-in resumes it with
no reattachment.

Test with a deterministic clock: repeated promise and error callbacks, rejection primitives,
object cycles, proxies and throwing getters, multi-megabyte messages, surrogate pairs at the
truncation boundary, a failed image load (no report), `defaultPrevented` left unchanged, an
exhausted budget under a `beforeSend` that drops everything (its call count stays within the
budget), a `beforeSend` that itself reports an error (no recursion), and listener counts across
stop/start. Verify one emitted payload through the ordinary `beforeSend`, validation and
batching paths before expanding variants.

### Milestone 2: Final vital samples


At the end of this milestone an application that sets `autocapture.webVitals` gets at most one
`web_vital` event per supported metric for each document load or BFCache restoration, delivered
in a normal batch or in the exit request, while `dist/index.js` contains no measurement code. A
browser proof comes before the unit variants.

Packaging. Add `web-vitals` at exactly 6.2.3 to `devDependencies` of
`packages/kansoku-js/package.json`, so `scripts/build.ts` compiles it in and the published
package keeps no runtime dependencies. Adding it changes `bun.lock`; run `just install` once and
commit the lockfile, because `install-frozen` refuses a stale one. Create
`packages/kansoku-js/src/vitals.ts`, which imports the five functions from the standard
`web-vitals` entry (never `web-vitals/attribution`), and load it from the client with a relative
dynamic `import("./vitals.js")`. Keep `vitals.ts` free of imports from the rest of the SDK and
pass it what it needs as arguments, so the build yields exactly one extra file and no shared
chunk. Change `scripts/build.ts` so that import becomes a separate
file in `dist`: either enable `splitting`, which adds a small module-loading preamble to the
entry, or build `src/vitals.ts` as a second entry point and keep the import external. Choose by
measured entry size, keep the entry named `index.js`, and give the new file a name
`scripts/check-size.ts` can find. Vite, Rollup, webpack and esbuild split a relative dynamic
import into an on-demand file, and it also works unbundled in a browser, so no `exports` entry
is needed. Give the new file its own 5 KiB gzip budget in `scripts/check-size.ts` and keep the
entry at 10 KiB. Minification drops the library's Apache-2.0 header, so ship the upstream license
text with the package in a notices file listed under `files`.

Loading. Request the file only when the flag is on, a `document` exists and the client is
started. Do it from an idle callback with a bounded timeout, or a timer where
`requestIdleCallback` is missing, rather than synchronously in `start()`, so it does not compete
with the application's own startup. Request it once per client. Catch a failed import and report
it only through `debug`: an unhandled rejection from the SDK's own loader would be captured by
its own error listener. A page hidden before the file loads has no samples for that visit.

Registration. Inside `vitals.ts`, call each of the five library functions at most once per
document, in module scope, and fan results out to a set of per-client sinks. The module keeps
the latest value of each metric for the current scope (five numbers), so a sink added later,
including after a stop/start, still sees values reported while it was detached. `start()` adds
the client's sink and its `core.onExit` listener; `stop()` removes both without emitting
anything. The library's observers stay for the life of the document because it offers no way to
remove them; with no sinks they only maintain the library's own bounded state. This is what
makes StrictMode's setup, cleanup and setup, and any stop/start, safe: no second registration and
no second sample. Keep the library's defaults for everything except `reportAllChanges` on LCP,
CLS and INP; in particular do not lower INP's 40 ms `durationThreshold`, which bounds how often
the event-timing observer calls back. Do not create further `PerformanceObserver` instances,
poll `performance.getEntries*`, or add `unload` or `beforeunload` listeners, which are unreliable
and make the page ineligible for BFCache.

Scope and attribution. A scope starts with the document and again at each BFCache restoration.
Bind it to the first page view recorded in it: the first successful `client.page()` after load,
or the view that the existing persisted-`pageshow` handler in `createKansoku` records, which
then starts the new scope. Keep that envelope separately from `pageSnapshot`, which later route
changes replace. Client-side navigation does not finalize, re-attribute or restart anything.
Build each event by copying the bound envelope as in Milestone 1, with properties exactly
`{ metric, value }`. If the scope has no page view yet, hold values until one is recorded; if
none ever is, emit nothing. The copied envelope preserves the original URL, session and identity
however long finalization takes and across route changes and session rotation. Retire it, with
any unsent samples, when the user opts out or `reset()` changes the anonymous ID, as `leavePage`
already does. Check `core.isSuppressed()` before enqueueing and skip silently.

Finalization. Enqueue FCP and TTFB when they are reported. For LCP, CLS and INP, each
`core.onExit` call enqueues the latest value of every metric whose `metric.id` this client has
not emitted, then records the id. That yields the value at the first exit transition; a metric
first reported after the user returns to the tab, typically INP, goes out at the next one, and
later changes to an emitted metric are ignored. The per-client set of emitted ids survives
stop/start; a BFCache restoration brings new ids, so clear the set when a scope starts and it
never holds more than five. `core.onExit` runs before the exit batch
is selected, so these samples leave in the exit request on both the tab-switch path and the
navigation path. Enqueue all samples of one exit with a single queue-mirror write: add an
internal way to enqueue several built events and persist once, rather than calling `persist()`
per sample inside a `pagehide` handler.

Values. Pass values through in the library's units: milliseconds for LCP, INP, FCP and TTFB and
unitless CLS. Reject non-finite or negative samples before enqueue. Drop TTFB whose
`navigationType` is `back-forward-cache`. Unsupported APIs and metrics produce no sample and no
exception. Keep the shared event IDs, batching, retries, `beforeSend` and privacy suppression.
Do not bypass suppression on exit or retain pending personal data.

Prototype first. Before the unit variants, build the bundle, serve a page that uses it in
Chromium through Playwright with the flag on, and observe at the HTTP mock: that FCP and TTFB
arrive in a normal batch; that after an interaction and a navigation to another document, LCP,
CLS and INP for the first page arrive in the exit request rather than only after the tab loads
the SDK again; the order in which `pagehide` and `visibilitychange` fire on that navigation; and
the gzip size of `dist/index.js` with no measurement code in it. Record the results in Surprises
& Discoveries. Keep the pending-value design if the exit request carries all three metrics.
Discard it if it does not, or if exit values are materially lower than the library's own final
callbacks report; then enqueue from those final callbacks and add one further exit request for
samples that arrive after the exit batch, excluding events already in flight, and record that
decision.

For unit tests under happy-dom, which has no real performance entries, let tests replace the
loader with a fake module through an internal seam that is not exported, and drive metric
callbacks by hand. Add browser tests for supported real measurements.

### Milestone 3: Adoption evidence and docs


Extend core privacy/lifecycle and React provider tests to cover repeated StrictMode effect
restarts, independent flags, opt-out/in, GPC/DNT suppression, beforeSend drop/redaction, listener
ownership, bounded memory/rates, unsupported APIs and imports without browser globals. Under
`test/ssr` and `scripts/ssr-smoke.ts`, both flags set must do nothing and must not import the
measurement file.

Give `examples/vanilla-vite/src/main.ts` an explicit switch, for example a query parameter, that
turns both flags on, and a button that throws an uncaught error, so the default example keeps
exercising default behavior. In `test/smoke/vanilla.pw.ts` assert against the port-4180 mock
that the default page sends neither event and never requests the measurement file, and that the
switched-on page sends one sanitized `client_error` and, after leaving the page, one final LCP
`web_vital`, each carrying the page view's URL, session and identity. In
`test/smoke/live-examples.pw.ts` drive the same page against the owned server and read both
event names back through the metrics API. In `test/live`, which has no DOM, add a case that
sends the exact payloads the capture modules build, exporting their pure payload builders for
it, and asserts acceptance with no rejected index, plus rejection of a 257-code-point message.
That proves the SDK's bounds match the published v1 contracts. Run these under the owned server
harness and never reset an ambient database. The harness asserts exact pass totals, so extend the
existing vanilla live example instead of adding a third, and match the one new `test/live` case
with a change from nine to ten in `scripts/identity_browser_acceptance.py` in
`mori://shinzui/kansoku`, committed in that repository alongside this work; otherwise the
server's joint gate fails. Missing prerequisites must fail required mode visibly.

Document both flags and defaults, sanitized labels, finite limits, measurement finalization,
soft-navigation/unsupported policy, units, deduplication and engagement consequences in
`docs/guides/delivery-and-privacy.md` and package guides. State plainly what is not captured:
failed resource loads, worker and frame errors, vitals for later single-page routes, vitals when
no page view is recorded, visits hidden before the measurement file loads, and TTFB after a
BFCache restore. State that the first hidden transition fixes CLS, INP and LCP, and that exit-time
samples make vitals an engagement event on nearly every measured visit rather than a few. Update
ADR-4 for explicit optional capture while preserving default page/session behavior, and ADR-6
for the on-demand measurement file, its budget, the build-time dependency and the license
notice. Follow the local ADR profile/log tooling. Keep React a thin binding. Run required checks,
record evidence and distill durable choices.

## Concrete Steps


Run from the kansoku-ts checkout. The sibling checkout in the sync command is the path
resolved by the Mori command; if the checkout layout differs, use that resolved path.
Commit 021ec1a in `mori://shinzui/kansoku` publishes the required v1 contracts. Do not edit
generated schemas by hand.

```bash
nix develop -c just install-frozen
mori path mori://shinzui/kansoku
nix develop -c just sync-contracts --from ../kansoku --ref 021ec1a
nix develop -c just generate-schema
```

The sync prints `pinned mori://shinzui/kansoku @ 021ec1a…` followed by the two files it wrote.
Update the catalog-version assertion in `packages/kansoku-js/test/contract.test.ts` from 4 to 5,
run `nix develop -c just test` and `nix develop -c just typecheck`, and fix anything else the
wider contract refresh breaks before starting Milestone 1. Commit `contracts/`,
`packages/kansoku-js/src/generated/` and those fixes together before running
`just check-contracts`, which compares against HEAD. Every commit for this plan uses
Conventional Commits and these trailers:

```text
ExecPlan: docs/plans/7-capture-client-errors-and-web-vitals-with-explicit-opt-in.md
Intention: intention_01m6qf2482enbtg9rjf07zdvt7
```

Then, for each milestone:

```bash
nix develop -c just build
nix develop -c just test
nix develop -c just check
nix develop -c just test-smoke
```

`just check` prints the size table; `kansoku-js` must read `ok` against 10240 and the
measurement file `ok` against 5120. `just test-smoke` needs Chromium once:
`node node_modules/@playwright/test/cli.js install chromium`.

For live evidence, run the owned harness in the server checkout with `KANSOKU_SDK_PROJECT` set to
this checkout, or start an owned disposable server and export `KANSOKU_LIVE_BASE_URL`,
`KANSOKU_LIVE_WRITE_KEY`, `KANSOKU_LIVE_SERVICE_TOKEN`, `KANSOKU_SMOKE_BASE_URL` and
`KANSOKU_SMOKE_WRITE_KEY` from it. Required mode already fails on absent credentials. Run the
live examples as a single file, as the harness does: with `KANSOKU_SMOKE_BASE_URL` exported,
`just test-smoke` would point the mock-based `vanilla.pw.ts` at the real server. Record the
harness invocation without secrets:

```bash
KANSOKU_REQUIRE_LIVE=1 nix develop -c just test-live
KANSOKU_REQUIRE_LIVE=1 nix develop -c node node_modules/@playwright/test/cli.js test \
  --config test/smoke/playwright.config.ts test/smoke/live-examples.pw.ts
git diff --check
```

The live suite must report ten passing cases and the live examples two, with no skips.

All commands must exit zero with nonzero assertion counts and no skipped live case. The first
integration checkpoint is one error delivered through the shared public-ingest path, followed by
Milestone 2's browser proof of one real final vital in the exit request, before expanding fixture
variants.

## Validation and Acceptance


Default construction emits no client_error or web_vital, attaches no error listener, registers
no observer and never requests the measurement file; `dist/index.js` stays within 10 KiB gzip and
contains no measurement code. Enabling only clientErrors emits only sanitized errors; enabling
only webVitals emits only supported final measurements. A fake error message of 257 astral code
points becomes at most 256 code points without splitting a pair; error type remains at most 128.
Uncaught errors and unhandled rejections carry handled=false; stack and arbitrary rejection data
never appear in captured payloads, and a thrown string or object yields fixed labels. A failed
image load produces no report, and capture never changes `defaultPrevented`. Repeated callbacks
and React restarts create one eligible report. Eleven distinct errors in one view enqueue at most
10; more than 30 in a rolling minute across new views enqueue at most 30, and a `beforeSend` that
drops every error is called no more often than those budgets allow. After window expiry, new
eligible reports work again. All budgets and memory remain finite.

Repeated vital callbacks for one measured view produce at most one final event per metric with
the selected value and the URL and session of the first page view in that scope. Stop/start and
React restarts call each library function once per document. Unsupported measurements are
absent; CLS 1.5 is valid and LCP uses milliseconds. A client-side route change produces no
further vitals and does not change the URL of pending ones. A BFCache restoration yields new
samples for the restored view and no TTFB. After `reset()` or opt-out, samples pending under the
old identity are never sent. Finalizing several metrics at one exit performs one queue-mirror
write. In a real browser, LCP, CLS and INP for a page the user navigates away from are in the
exit request. Opt-out/GPC/DNT and beforeSend can suppress all capture, including exit. Retries
reuse the original IDs and produce one canonical stored fact. The real-browser and required live
cases prove these assertions through accepted public v1 contracts. No new automatic capture is
enabled in a product without recording a decision about its engagement/bounce/duration
consequences.

## Idempotence and Recovery


Contract generators and tests are repeatable. Start/stop and opt-in/out must be reversible;
shutdown is terminal. Use the library's metric ids as finalized keys and existing event IDs to
make callbacks and retries safe. Restore owned patches/listeners only and retain other libraries'
hooks. The library's observers cannot be removed once registered in a document; stopping detaches
this SDK's sinks, and turning the flag off keeps later documents from loading the measurement
file. No server migration is part of this work. Revert capture changes or disable flags to stop
new capture without changing existing server facts. If the build change for the on-demand file
fails `verifyBundle` or a package check, revert `scripts/build.ts` alone; Milestone 1 does not
depend on it. Leave this plan unchecked until actual browser and native acceptance pass.

## Interfaces and Dependencies


Public additions are `KansokuOptions.autocapture.clientErrors?: boolean` and
`KansokuOptions.autocapture.webVitals?: boolean`, each defaulting to false. Existing queue,
transport and React interfaces remain the owners of delivery and lifecycle. Internal additions
are `packages/kansoku-js/src/errors.ts`, `packages/kansoku-js/src/vitals.ts`, a way to enqueue
several built events with one queue-mirror write, and a test-only loader seam; none is exported.
The published `kansoku-js` package gains a second file in `dist`, loaded only on demand, with its
own size budget, and a third-party notices file. The server prerequisite is
`mori://shinzui/kansoku/plans/57-declare-client-error-and-web-vital-events` and its published v1
event catalog. One coordinated change lands in `mori://shinzui/kansoku`: the live-case total in
`scripts/identity_browser_acceptance.py` moves from nine to ten. This is a follow-up, not a
child MasterPlan.

The one new dependency is `web-vitals` 6.2.3, pinned exactly as a build-time `devDependency` of
`packages/kansoku-js`, standard build only. Mori has no source for it, so the npm registry and
the upstream `v6.2.3` tag were checked directly on 2026-11-06. Check both again before changing
the pin, and read the new release's README for changes to callback timing, teardown or
soft-navigation behavior, since this plan's finalization policy depends on them.

Revision note (2026-11-06): validated against the working tree, the server contract at 021ec1a
and `web-vitals` 6.2.3. Selected the measurement library and an on-demand file because the entry
bundle cannot hold it; replaced per-route finalization with document-scoped measurement
finalized at the first exit transition; aligned attribution and reset handling with page leave;
added bounded-work rules for the error handler and the exit path; and corrected stale statements
about `autocapture`, required live mode and the DOM-less live suite.

# Delivery and privacy

The SDK follows `mori://shinzui/kansoku/okf/adrs/concepts/ADR-1`: deliver JSON arrays to
`POST /v1/batch`, with `Content-Type: application/json` and the public write key in `X-Api-Key`.
A valid HTTP 202 acknowledgement ends delivery for the entire batch. Rejected event indices
are counted as drops and are never retried. HTTP 400, 401, 403, 404 and a non-retryable 503
are permanent. A 413 batch splits into halves; a single event still receiving 413 is dropped.
Network errors, timeouts, HTTP 429 and retryable server failures retry with unchanged event
IDs, exponential backoff, full jitter and bounded attempts. A positive whole-second
`Retry-After` is a minimum delay. Normal and beacon requests share the server credential bucket.

The bounded queue drops the newest event when full. `stats` and `onDrop` expose loss;
`beforeSend` can redact or drop an event. Redacted events are checked again before queuing.
Default delivery is at 20 events or five seconds, with 100 events and 1 MiB per request.
The server's default caps are 500 events and 5 MiB. A wrong/revoked key returns 401; correct
the key rather than retrying. A single-event 413 requires shrinking the event.

`start()` and `stop()` activate and deactivate capture, listeners and timers. Stopping
begins a flush and preserves state. `shutdown()` stops, awaits pending delivery and closes
the client. React providers drive the reversible pair from their effect lifecycle.

Page exit uses `exitTransport: "keepalive"` by default. Opt in to `"beacon"` for the supported
`POST /v1/beacon` route: the SDK sends `text/plain` JSON `{writeKey,batch}` with a public write
key in the body and no credential headers. Simple cross-origin delivery avoids a preflight,
but the server must allow the exact origin before ingest side effects. Service tokens are
rejected on this route. A false, absent or throwing `sendBeacon` falls back to keepalive.
A true return has no HTTP-response fallback: it means browser queue admission.

All SDK instances in one Document share a conservative 60-KiB complete UTF-8 body budget,
including credentials and send timestamps. One exit batch is selected; oversized and
unselected events remain pending for normal delivery. Keepalive reservations release when the
request settles; unobservable true-beacon reservations last for that Document, including BFCache.
Only a valid 202 increments `stats.accepted`; true beacon admission increments
`stats.bestEffortQueued` and retains the sessionStorage mirror. Exit 413s also retain pending
events for later normal splitting. Reload/retry keeps event IDs, and durable server identity
prevents duplicate metrics. Tab closure or exhausted normal retries can still lose events.

Automatic `page_leave` is enabled unless disabled in autocapture. It closes the original
page's view/session identity using monotonic elapsed time on SPA transitions or exit.
Visibility/pagehide for one transition do not emit twice; BFCache restoration begins a new
view interval. It may extend observed duration without turning a one-page bounce into
engagement. Suppressed or reset identity snapshots are retired before later capture.

Each request stamps a fresh `sentAt` copy using the injected event clock; queued producer
content and `occurredAt` remain unchanged across splitting/retries. The server corrects future
clock skew using send/receive timing and a fallback tolerance, preserving past events and the
supported `[1970-01-01,2100-01-01)` UTC range. Rejections are reported through normal loss hooks.

Identity/session/opt-out/exposure state uses the selected adapter, localStorage by default.
Keys under the default prefix are `.anonymous_id`, `.user_id`, `.organization_id`,
`.identifiers`, `.session`, `.opt_out` and `.exposures`. The `.queue` mirror always uses
per-tab sessionStorage to avoid tabs overwriting each other's pending events. Blocked browser
storage degrades to memory. `reset()` rotates anonymous and session IDs and clears user,
organisation, optional identity signals and exposure history; queued events keep their old
attribution. Already-open clients reread shared identity/session/privacy state before capture
or delivery. Cookie persistence failures use memory and a redacted debug message, without
falling back to localStorage. See [cross-origin identity](cross-origin-identity.md). `optOut()` drops queued events and suppresses new capture; `optIn()` resumes it.

`respectGlobalPrivacyControl` honors GPC when true; `respectDoNotTrack` honors legacy DNT
when true. Both default to false and use the same suppression path as opt-out. Automatic
events skip silently while suppressed; explicit calls report `opted_out` drops.

`botDetection` is `"flag"` by default, using a versioned synthetic user-agent matcher to set
Boolean `context.bot`. `"drop"` reports `onDrop` reason `bot` without enqueueing; `"off"` skips
SDK detection. It cannot disable the server's independent user-agent classification. These
handwritten rules are synthetic coverage, not an empirical accuracy claim.

Context contains locale, timezone, screen/viewport dimensions, user agent and SDK version.
The SDK does not compute an IP address, precise location or fingerprint. Full URLs, referrers
and caller properties can still contain personal data; redact them in `beforeSend` as needed.
Only public write keys belong in browser bundles. Metrics service tokens stay server-side.

For CORS failures, check the server's `KANSOKU_CORS_ORIGINS` exact origin allowlist. CORS
covers `/v1/*` and permits Content-Type, X-Api-Key and Authorization; it does not authenticate
a request. Full original URLs and caller JSON remain producer data; removing a handoff parameter
from the address bar does not erase the initial request from upstream logs.

[Documentation index](../README.md)

## Optional client errors and web vitals

Both features are disabled by default and can be enabled independently:

```typescript
createKansoku({
  baseUrl: "https://analytics.example.com",
  writeKey: "ksk_w_public",
  autocapture: { clientErrors: true, webVitals: true },
})
```

The React provider accepts the same options. Decide whether these events should affect your
product reports before enabling them: the server counts `client_error` and `web_vital` as
engagement, which can reduce bounce rate and change observed session duration. Exit samples
make vitals an engagement event on nearly every measured visit.

Error capture listens for uncaught script errors and unhandled promise rejections in the current
window. It never reads stacks, changes default error handling, wraps application functions, or
captures failed resource loads, worker errors or errors in other frames. It sends only `type`,
`message` and `handled: false`. Values with string `name` and `message` fields are treated as
error-like; other rejected values receive fixed labels without being serialized. Type labels
must be short identifiers (at most 128 code points). Messages scan only the first 1024 UTF-16
code units, keep the first line, replace HTTP URLs, email-like text, long numbers and hexadecimal
identifiers with placeholders, collapse whitespace, and retain at most 256 Unicode code points.
Sanitizing is deliberately conservative and cannot recognize all personal data; inspect or drop
labels, page URLs and context with `beforeSend` for your application.

The same error object is captured once per client. Repeated sanitized labels are deduplicated
for one second. At most ten reports per successfully recorded page view and thirty per rolling
minute reach the shared pipeline, including reports later dropped by `beforeSend`, validation
or queue capacity. A new page view resets the ten-report allowance; stop/start preserves the
rolling limit and deduplication. No maintenance timer is used. Opt-out and configured GPC/DNT
silently suppress automatic capture. Stop removes this client's error listeners; start restores
them once. Captured errors copy the latest recorded page view's URL, identity and session without
renewing the session; without a view they use the current URL and ordinary envelope construction.

Vital measurement code loads from a separate file during an idle callback (with a one-second
timeout), or a timer where idle callbacks are unavailable. Leaving `webVitals` off never downloads
that file or installs its observers. The standard `web-vitals` 6.2.3 build measures LCP (Largest
Contentful Paint), INP (Interaction to Next Paint), CLS (Cumulative Layout Shift), FCP (First
Contentful Paint) and TTFB (Time to First Byte). Values use milliseconds except unitless CLS,
which can exceed one. Zero is a valid measurement; unsupported or unavailable metrics are absent.
Only `metric` and `value` are sent. INP needs a qualifying interaction; CLS requires browser
layout-shift support. Visits hidden before measurement code attaches have no samples.

A measurement scope is one document load or BFCache restoration. Its first successfully recorded
page view supplies the URL, session, identity and context for all samples. Later single-page
routes get no new vitals and do not change pending attribution. Without a page view, no vitals
are sent. FCP and TTFB are emitted when first reported. The latest observed LCP, CLS and INP are
emitted once at the first exit transition where each is available, before selecting the exit
batch. Entries not delivered by the browser by that instant can be omitted. Later updates to an
emitted metric are ignored; a metric first available after returning to the tab can be sent on
the next exit. BFCache restores begin a new scope and omit the library's synthetic zero TTFB.
Opt-out and identity reset retire the old scope and unsent samples. A subsequent document load
or BFCache restore can measure a new scope.

Stop detaches the client sink and exit hook; restart reconnects without duplicating measurements.
The library has no observer teardown: after loading, its observers remain for the document's
lifetime, maintaining bounded measurement state even when no clients subscribe. The module
registers measurement functions once per document and shares them across clients. No `unload` or
`beforeunload` listener is installed. All events use the existing validation, `beforeSend`, bot
policy, queue, privacy gates and delivery retries with stable event IDs. Several vital samples
finalized at one exit require one queue-mirror write; exit delivery remains best effort.

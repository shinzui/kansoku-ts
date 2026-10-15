# Delivery and privacy

The SDK follows `mori://shinzui/kansoku/okf/adrs/concepts/ADR-1`: deliver JSON arrays to
`POST /v1/batch`, with `Content-Type: application/json` and the public write key in `X-Api-Key`.
A valid HTTP 202 acknowledgement ends delivery for the entire batch. Rejected event indices
are counted as drops and are never retried. HTTP 400, 401, 403, 404 and a non-retryable 503
are permanent. A 413 batch splits into halves; a single event still receiving 413 is dropped.
Network errors, timeouts and unknown responses retry with unchanged event IDs, exponential
backoff, full jitter and bounded attempts.

The bounded queue drops the newest event when full. `stats` and `onDrop` expose loss;
`beforeSend` can redact or drop an event. Redacted events are checked again before queuing.
Default delivery is at 20 events or five seconds, with 100 events and 1 MiB per request.
The server's default caps are 500 events and 5 MiB. A wrong/revoked key returns 401; correct
the key rather than retrying. A single-event 413 requires shrinking the event.

`start()` and `stop()` activate and deactivate capture, listeners and timers. Stopping
begins a flush and preserves state. `shutdown()` stops, awaits pending delivery and closes
the client. React providers drive the reversible pair from their effect lifecycle.

Page exit attempts keepalive fetch with bodies at most 60 KiB. Beacon cannot send the
required credential header. Browsers also cap aggregate in-flight keepalive bytes, so
delivery on exit is best effort. A document can disappear before its acknowledgement
handler runs; same-tab reload may retry the same event ID, which is the server's idempotency
key. Unanswered events stay in sessionStorage. Tab closure can lose them.

Identity/session/opt-out/exposure state uses the selected adapter, localStorage by default.
Keys under the default prefix are `.anonymous_id`, `.user_id`, `.organization_id`,
`.identifiers`, `.session`, `.opt_out` and `.exposures`. The `.queue` mirror always uses
per-tab sessionStorage to avoid tabs overwriting each other's pending events. Blocked browser
storage degrades to memory. `reset()` rotates anonymous and session IDs and clears user,
organisation, optional identity signals and exposure history; queued events keep their old
attribution. `optOut()` drops queued events and suppresses new capture; `optIn()` resumes it.

`respectGlobalPrivacyControl` honors GPC when true; `respectDoNotTrack` honors legacy DNT
when true. Both default to false and use the same suppression path as opt-out. Automatic
events skip silently while suppressed; explicit calls report `opted_out` drops.

Context contains locale, timezone, screen/viewport dimensions, user agent and SDK version.
The SDK does not compute an IP address, precise location or fingerprint. Full URLs, referrers
and caller properties can still contain personal data; redact them in `beforeSend` as needed.
Only public write keys belong in browser bundles. Metrics service tokens stay server-side.

For CORS failures, check the server's `KANSOKU_CORS_ORIGINS` exact origin allowlist. CORS
covers `/v1/*` and permits Content-Type, X-Api-Key and Authorization; it does not authenticate
a request. Browsers whose clocks run ahead may receive timestamp rejections; the SDK reports
them rather than changing recorded event times.

[Documentation index](../README.md)

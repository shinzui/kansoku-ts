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
Blocked browser storage falls back to memory. No fingerprint is generated.

On page exit, keepalive fetch attempts bodies up to 60 KiB. Browsers also limit aggregate
in-flight keepalive bytes, so exit delivery is best effort. Unanswered events remain in
sessionStorage for the next same-tab load; closing the tab can lose them.

The package imports safely without browser globals. Supported Node versions can use
`require(esm)` (Node 20.19+, or 22.12+ on Node 22). Jest's default CommonJS mode needs an
ESM transform allowlist or native ESM configuration.

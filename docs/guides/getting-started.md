# Send a first browser event

Start a local server using `mori://shinzui/kansoku` and its
`docs/guides/getting-started.md` (artifact-level URI pending). In that checkout's Nix shell:

```bash
just up
```

Leave it running. In another terminal in the same server checkout:

```bash
nix develop
just migrate
just ch-migrate
just issue-key write dev "browser quickstart"
just issue-key service dev "metrics quickstart"
just run
```

Save both printed credentials. The write key may be embedded in a browser. Keep the service
token on the server or in a terminal; never put it in a `VITE_*` variable. The server defaults
to port 8080; if occupied, set `KANSOKU_SERVER_PORT` to an unused port before starting it.
Confirm `/health` returns `OK` and `/ready` returns a ready status.

In this SDK checkout, enter `nix develop`, run `just install`, and copy
`examples/vanilla-vite/.env.example` to `.env.local` in that directory. Set the server URL
and write key, then run:

```bash
just dev-vanilla
```

This builds the SDK first. Open the printed Vite URL, visit Pricing and Docs, click Track CTA
and Flush. The stats show accepted events. The example imports `kansoku-js` through its
package export map; there is no source alias.

After npm publication, install with `bun add kansoku-js`. In a Vite or other bundled browser
application, initialise after setting the page title:

```typescript
import { createKansoku } from "kansoku-js"

const analytics = createKansoku({
  baseUrl: "http://localhost:8080",
  writeKey: "ksk_w_replace_with_your_write_key",
})
analytics.track("cta_clicked", { cta: "pricing" })
await analytics.flush()
```

Initial and SPA page views and session starts are automatic. To read metrics, use the service
token for the same account in a terminal. Supply today's UTC date and tomorrow's date:

```bash
curl --fail-with-body --get http://localhost:8080/metrics/page-views \
  --header "Authorization: Bearer $KANSOKU_SERVICE_TOKEN" \
  --data-urlencode "from=$TODAY" --data-urlencode "to=$TOMORROW" \
  --data-urlencode 'groupBy=route'
```

The writer updates metrics asynchronously; retry after a few seconds if no points appear.
Counts accumulate in the account. For isolated live conformance, set
`KANSOKU_LIVE_BASE_URL`, `KANSOKU_LIVE_WRITE_KEY` and optionally
`KANSOKU_LIVE_SERVICE_TOKEN`, then run `just test-live`. For required release conformance,
supply all three and run `KANSOKU_REQUIRE_LIVE=1 just test-live`: missing credentials, failing
routes and feature mismatches must fail, with zero skipped cases. The suite checks the pinned schema
catalog before relying on it. Override `KANSOKU_LIVE_MAX_BATCH_EVENTS` if the server's ingest
batch cap differs from its default 500.

[Documentation index](../README.md)

[Cross-origin identity and shared properties](cross-origin-identity.md).

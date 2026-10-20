# Instrument an application before the server is ready

Use `createNoopClient()` to add instrumentation before a Kansoku server is available.
It implements the same `KansokuClient` interface as the real client, so tracking calls and
React hooks can stay in place while analytics is off. It sends no requests, stores no
identity or events, and does not require a server URL or write key.

The factory is currently exported from `kansoku-react`, not `kansoku-js`. This approach
therefore requires `kansoku-react` and its peer dependencies, including React, even when
calling the client directly.

Create a shared client once in your browser application's initialization code. For example,
in `analytics.ts`:

```typescript
import { createKansoku } from "kansoku-js"
import type { KansokuClient } from "kansoku-js"
import { createNoopClient } from "kansoku-react"

// Read these values from your application's configuration.
const analyticsEnabled = false
const baseUrl = ""
const writeKey = ""

export const analytics: KansokuClient = analyticsEnabled
  ? createKansoku({ baseUrl, writeKey })
  : createNoopClient()
```

Only the selected factory runs. While `analyticsEnabled` is `false`, the empty URL and key
are never passed to `createKansoku`. This flag belongs to your application configuration;
it is not an SDK option.

Use the shared client wherever you instrument application behavior:

```typescript
import { analytics } from "./analytics.js"

analytics.identify("user_42", { plan: "team" })
analytics.track("checkout_started", { cartSize: 3 })
await analytics.flush()
```

With the no-op client, these calls do nothing and `flush()` resolves without sending
anything. Events are discarded, so they will not be replayed when analytics is enabled.

In React, pass that same client to the provider. Existing hooks work with either client:

```tsx
import { KansokuProvider, useTrack } from "kansoku-react"

import { analytics } from "./analytics.js"

function CheckoutButton() {
  const track = useTrack()
  return <button onClick={() => track("checkout_started")}>Checkout</button>
}

export function App() {
  return (
    <KansokuProvider client={analytics}>
      <CheckoutButton />
    </KansokuProvider>
  )
}
```

This example initializes the client in the browser. For server-rendered applications, see
the [React guide](react.md) for the provider's SSR behavior. A provider receiving an external
client does not manage its lifecycle; `createKansoku` starts automatically by default, and
your application owns any later stop or shutdown.

When the server is ready, configure its URL and browser write key, set `analyticsEnabled`
to `true`, and reload or redeploy the application. All instrumentation then uses the real
client. Calling `start()` or `optIn()` on an existing no-op client does not activate it.

You do not need `optOut: true` for this workflow: opt-out is a persisted privacy preference
that requires `optIn()` to clear. `autoStart: false` also does not disable instrumentation;
explicit calls can still queue events, and `flush()` can send them.

[Documentation index](../README.md)

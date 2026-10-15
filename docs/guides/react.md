# Use Kansoku in React

Use `just dev-react` for the workspace example after filling in its `.env.local` from
`.env.example`. It runs React StrictMode and React Router against built package exports.
After publication, install `kansoku-js`, `kansoku-react` and `react` in your application.

```tsx
import { KansokuProvider, useTrack, useIdentify, useExperiment } from "kansoku-react"

function AnalyticsButton({ userId }: { userId?: string }) {
  const track = useTrack()
  useIdentify(userId, { plan: "team" })
  useExperiment("checkout_copy", "b")
  return <button onClick={() => track("checkout_started")}>Checkout</button>
}

export function App() {
  return (
    <KansokuProvider
      options={{ baseUrl: "https://analytics.example.com", writeKey: "ksk_w_public" }}
    >
      <AnalyticsButton userId="user_42" />
    </KansokuProvider>
  )
}
```

The provider starts and stops a client it creates from options. Options are read once; remount
with a key to reconfigure. Pass `client={analytics}` to retain lifecycle ownership yourself.
The provider never shuts down an external client. SSR returns a no-op client and emits no
requests; a missing provider in the browser throws.

React Router requires no additional page tracking. For manual page views, set
`autocapture: { pageViews: false }` and call `usePageView(pathname + search)`. A development
warning explains if both capture paths are enabled.

`useIdentify` follows user-ID changes, and undefined does not imply logout. Get the client
with `useKansoku()` and call `reset()` explicitly. `useExperiment` records a rendered exposure;
the core deduplicates each experiment/variant pair per session, including StrictMode effects.

[Documentation index](../README.md)

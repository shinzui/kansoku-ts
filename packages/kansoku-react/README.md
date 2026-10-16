# kansoku-react

React bindings for `kansoku-js`, with no runtime dependencies beyond the React and SDK peers.

```bash
bun add kansoku-js kansoku-react react
```

```tsx
import { KansokuProvider, useTrack, useIdentify, useExperiment } from "kansoku-react"

export function App() {
  return (
    <KansokuProvider
      options={{ baseUrl: "https://analytics.example.com", writeKey: "ksk_w_public" }}
    >
      <Signup />
    </KansokuProvider>
  )
}

function Signup() {
  const track = useTrack()
  useIdentify("user_42", { plan: "team" })
  useExperiment("signup_copy", "b")
  return <button onClick={() => track("signup_started")}>Sign up</button>
}
```

`KansokuProvider` reads `options` once. Remount with a `key` to reconfigure or change ownership
mode. It constructs without capture, starts from an effect, stops on cleanup and never calls
`shutdown()`. StrictMode's setup/cleanup/setup cycle is supported. You can instead pass
`client={analytics}`; you then own its entire lifecycle, and the provider leaves it untouched.

`useKansoku()` returns the client for `flush()`, `reset()`, `group()` and other methods.
It throws if called without a provider in the browser; server rendering returns a no-op client.
`useIdentifyOnce(userId, traits?)` follows the same user/client lifecycle as `useIdentify`,
emitting explicit identify_once v1. It suppresses duplicate StrictMode effect setup; set-once
is a server trait operation. A later identify v2 may replace the initialized value.

`useTrack()` returns a stable tracking callback. `useIdentify(userId, traits?)` identifies on
ID changes, ignoring traits object identity. An undefined user does not reset identity:
call `useKansoku().reset()` explicitly on logout. `useExperiment(name, variant, properties?)`
records exposure from an effect and relies on the core's per-session dedupe.

## Routing

React Router and other History API routers require no additional page-view code. Automatic
capture is enabled by default. For explicit control, disable page autocapture and use a key:

```tsx
import { usePageView } from "kansoku-react"
import { useLocation } from "react-router"

function PageTracking() {
  const location = useLocation()
  usePageView(location.pathname + location.search, { section: "app" })
  return null
}
// Provider options must include autocapture: { pageViews: false } for this pattern.
```

`usePageView(key, properties?)` emits on mount and key changes. It warns once in development
when automatic page capture is still enabled, because using both counts views twice.

Server rendering produces HTML without browser globals or network capture. Both packages
are ESM-only; Node 20.19+ (22.12+ on Node 22) supports `require(esm)`. Jest's default
CommonJS mode needs both packages in its ESM transform allowlist or native ESM configuration.
TypeScript consumers install compatible `@types/react` (an optional peer for JS consumers).

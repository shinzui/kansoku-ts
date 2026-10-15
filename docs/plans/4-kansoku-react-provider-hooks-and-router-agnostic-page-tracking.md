---
id: 4
slug: kansoku-react-provider-hooks-and-router-agnostic-page-tracking
title: "kansoku-react: provider, hooks, and router-agnostic page tracking"
kind: exec-plan
created_at: 2026-10-15T02:11:18Z
intention: "intention_01m4ymqn7xe1a8tz8v7r78e34y"
master_plan: "docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md"
provenance:
  created_by:
    model: "claude-fable-5-1"
    harness: "claude-code"
    at: 2026-10-15T02:11:18Z
  revisions:
    - model: "claude-fable-5-1"
      harness: "claude-code"
      at: 2026-10-15T03:17:45Z
      mode: "update"
      note: "Provider drives start/stop from an effect (no shutdown workaround), ReactElement typing, memoised context, optional @types/react peer"
    - model: "gpt-6.1-sol"
      harness: "codex-cli"
      at: 2026-10-15T04:03:32Z
      mode: "implement"
      note: "Implement provider, lifecycle-safe hooks and SSR no-op client"
---

# kansoku-react: provider, hooks, and router-agnostic page tracking

This ExecPlan is a living document. The sections Progress, Surprises & Discoveries,
Decision Log, and Outcomes & Retrospective must be kept up to date as work proceeds.
If durable project context changes, update or create ADRs in docs/adr/ in the same change.


## Purpose / Big Picture

After this plan, a React application records analytics into Kansoku by wrapping its component
tree once and calling hooks, with no HTTP code and no direct handling of the `kansoku-js`
client object. A developer runs `bun add kansoku-js kansoku-react`, writes:

```tsx
import { KansokuProvider, useTrack } from "kansoku-react"

export function App() {
  return (
    <KansokuProvider options={{ baseUrl: "https://analytics.example.com", writeKey: "ksk_w_…" }}>
      <SignupButton />
    </KansokuProvider>
  )
}

function SignupButton() {
  const track = useTrack()
  return <button onClick={() => track("signup_started", { plan: "team" })}>Sign up</button>
}
```

and sees a `signup_started` event (plus the automatic `page_view` and `session_start` events
that `kansoku-js` already records) arrive at the server's `POST /v1/batch` endpoint. The same
application can identify the logged-in user with `useIdentify(user?.id)`, record that a user
was shown an experiment variant with `useExperiment("checkout_copy", "variant_b")`, take
explicit control of page views with `usePageView(location.pathname + location.search)`, and
reach the underlying client with `useKansoku()` for anything else (`flush`, `reset`, `group`).
All of this is safe to render on a server (hooks become no-ops where there is no browser) and
safe under React StrictMode, which deliberately runs every effect's setup and cleanup once extra
in development: the provider constructs the client without side effects and drives its
reversible `start()`/`stop()` lifecycle from an effect, so the extra cycle simply restarts it.

The package is a thin binding. It contains no analytics logic of its own: every hook is a
small wrapper around one method of the `kansoku-js` client described below, so behaviour,
persistence, retries, and contract conformance are owned and tested once, in `kansoku-js`.
You can see it working by running the package's test suite, which drives the hooks under a
simulated browser and asserts the exact events handed to a mocked `fetch`.


## Progress

- [x] (2026-10-14; browser/SSR tests and directive-preserving build accepted) M1: `KansokuProvider` (constructing with `autoStart: false`, `start()` in its effect,
  `stop()` in the cleanup, memoised context value), the React context, `useKansoku`, and the
  server-side no-op client exist in `packages/kansoku-react`; the package builds with `just build` to the export-map
  layout (`dist/index.js`, `dist/index.js.map`, `dist/index.d.ts`; ESM only) and
  `dist/index.js` begins with the `"use client";` directive.
- [x] (2026-10-14; browser/SSR tests and directive-preserving build accepted) M2: `useTrack`, `usePageView`, `useIdentify`, and `useExperiment` are implemented with the
  one-time development warning in `usePageView`, and `bun run typecheck` passes for the package.
- [x] (2026-10-14; browser/SSR tests and directive-preserving build accepted) M3: `bun test packages/kansoku-react` passes under happy-dom with the fetch mock,
  including the StrictMode provider-restart and single-exposure tests and a server-rendering test that runs with
  `KANSOKU_TEST_NO_DOM=1`; `packages/kansoku-react/README.md` documents both the plain and the React
  Router usage; the "React binding boundary" ADR is recorded in `docs/adr/`.


## Surprises & Discoveries

The SSR test lives under test/ssr/ssr.test.tsx so the shared no-DOM recipe actually selects it. Dependency ranges resolve React/React DOM 19.3.0 under the existing release-age gate. The package declaration build has no Node ambient types; its development-warning environment guard uses a local declaration rather than adding Node types to browser exports.


## Decision Log

- Decision: `kansoku-react` is a thin binding over the `kansoku-js` client and contains no
  analytics logic, persistence, or transport code. Every hook delegates to exactly one client
  method, and the provider never changes `kansoku-js` defaults.
  Rationale: Behaviour must be implemented and verified once. A second implementation would
  drift from the delivery contract that `kansoku-js` proves against the server. React Router and
  similar routers call `history.pushState`, which `kansoku-js` autocapture already patches, so
  React needs no router integration of its own.
  Date: 2026-10-14

- Decision: Under server-side rendering, `useKansoku` returns a no-op client instead of
  throwing, while on the client side it throws when no provider is mounted.
  Rationale: Components that call hooks are rendered on the server by frameworks such as
  Next.js and Remix before they are hydrated in the browser. A throw would break server
  rendering for every consumer; a silent no-op on the client would hide a real misconfiguration.
  Date: 2026-10-14

- Decision: The provider constructs a client from `options` exactly once per mounted provider,
  with `autoStart: false` inside a lazy `useState` initialiser, and drives its lifecycle from an
  effect: `client.start()` in the setup and `client.stop()` in the cleanup. It never calls
  `shutdown()`, and it never starts or stops a client passed in through `client`.
  Rationale: React requires effect setup and cleanup to be symmetric and runs setup → cleanup →
  setup once extra under StrictMode in development; constructing a side-effecting client during
  render and shutting it down in a cleanup can only be made to work with a timing workaround.
  This is the pattern TanStack Query's `QueryClientProvider` uses (`client.mount()` /
  `client.unmount()`), and `kansoku-js` exposes the matching reversible pair for it. Whoever
  creates the client decides when it dies: an application that constructs the client itself may
  share it with non-React code, so the provider leaves such a client alone. (Supersedes the
  2026-10-14 draft decision that the provider called `shutdown()` on unmount with a deferred,
  cancellable timer to survive StrictMode.)
  Date: 2026-10-14

- Decision: Components are typed with `ReactElement` from `react`, never the global
  `JSX.Element`; the context value is memoised with `useMemo`; the provider renders
  `<KansokuContext.Provider>` (not the React 19 `<KansokuContext>` shorthand); every hook effect
  lists the client in its dependency array; and `@types/react` is an optional peer dependency.
  Rationale: `@types/react` 19 removed the global `JSX` namespace, so `JSX.Element` does not
  compile against the pinned types. An unmemoised `{ client }` literal re-renders every consumer
  on every provider render. The `.Provider` form is the one that works across the whole
  `^18.0.0 || ^19.0.0` peer range. Listing the client keeps hooks correct when a provider is
  remounted with a `key` or receives a different `client` prop. The optional `@types/react` peer
  (the convention zustand and Radix use) lets TypeScript consumers resolve the React types the
  declaration files import without forcing JavaScript consumers to install them.
  Date: 2026-10-14

- Decision: The built output must start with the `"use client";` directive, injected through the
  per-package `"kansoku": { "banner": "\"use client\";" }` manifest field that EP-1's shared
  build script reads and passes to `Bun.build` as `banner`, rather than relying on the source
  directive surviving bundling. This plan only sets the field; the mechanism belongs to EP-1.
  Rationale: Two 2026-10-14 experiments with Bun 1.4.2. The first showed CommonJS output burying
  the directive after the module helpers (moot since the packages became ESM-only). The second,
  on an ESM build of a module with an external `react` import, showed the bundler emitting the
  hoisted `import` statement first and the source-level directive after it, where it is an inert
  expression. React Server Components bundlers require the directive in the file's prologue, so
  the banner is still the only reliable way to put it there.
  Date: 2026-10-14


## Outcomes & Retrospective

The provider, context, no-op server client and all five hooks are implemented. Eleven React browser tests and one no-DOM SSR test pass, including StrictMode restart and exposure behavior, external-client ownership and stable context/callbacks. The ESM build starts with the use-client banner and the React boundary ADR validates.


## Context and Orientation

This repository, `kansoku-ts`, hosts the TypeScript SDKs for Kansoku, the portfolio's
self-hosted analytics server (Mori project `mori://shinzui/kansoku`; artifact-level URIs for its
documents are pending). It is a Bun workspace: the root `package.json` is private and declares
`"workspaces": ["packages/*", "examples/*"]`; the two publishable packages live at
`packages/kansoku-js` and `packages/kansoku-react`. The repository's MasterPlan,
`docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md`, coordinates six
plans; this is the fourth. It hard-depends on the third,
`docs/plans/3-kansoku-js-browser-capture-page-views-navigation-attribution-identity-helpers-and-experiments.md`,
being Complete, because every hook here wraps a method that plan adds to the client. When you
start, confirm that `packages/kansoku-js/src/index.ts` exports `createKansoku` and that the
`KansokuClient` type in `packages/kansoku-js/src/types.ts` has the `page`, `identify`, `alias`,
`group`, `experiment`, `setIdentifiers`, and `reset` members listed below. If it does not, stop:
the prerequisite is not met.

Terms used in this plan, defined once here.

- **Hook**: a React function whose name starts with `use` and that may only be called while a
  component renders. Hooks let a component read context and run effects.
- **Context**: React's mechanism for passing a value down a component tree without threading
  it through props. A **provider** is the component that supplies the value
  (`<Ctx.Provider value={…}>`); any descendant reads it with `useContext(Ctx)`.
- **Effect**: code React runs after a component has rendered (`useEffect`), re-running when
  listed dependencies change and running a cleanup function before re-running or on unmount.
- **StrictMode**: a development-only React wrapper that deliberately mounts, unmounts, and
  remounts components and runs effects twice to surface impure code. Anything that must happen
  once per logical mount needs protection against this.
- **Server-side rendering (SSR)**: rendering React components to an HTML string on a server
  (`react-dom/server`'s `renderToString`) before the browser takes over. There is no `window`,
  `document`, `localStorage`, or `fetch` with page lifecycle during SSR. This plan detects SSR
  with exactly one test: `typeof window === "undefined"`.
- **`"use client"` directive**: a string literal that must appear at the very top of a module's
  code (only comments may precede it). React Server Components frameworks read it to learn that
  the module runs in the browser. Hooks and providers are browser-only, so this package's entry
  module carries it, and the built file must too (the bundler hoists `import` statements above
  it, which is why EP-1's banner puts it back on line 1).
- **Peer dependency**: a dependency the consuming application must install itself, declared in
  `peerDependencies`, so there is exactly one copy of `react` (and of `kansoku-js`) in the app.
- **`renderHook`**: a helper from `@testing-library/react` that mounts a throwaway component
  which calls the hook under test and exposes its return value and a `rerender` function.
- **Lazy initialiser**: the function form of `useState(() => …)`. React calls it on the first
  render only, to compute the initial state; under StrictMode it is called twice and one result
  is discarded, which is harmless when the function has no side effects, as `createKansoku`
  with `autoStart: false` has not.
- **Lockstep version**: both packages in this repository are released with the same version
  number through a changesets fixed group, so `kansoku-react@0.1.0` peer-depends on
  `kansoku-js@^0.1.0`. The peer range is written literally in the manifest because the release
  pipeline publishes with `npm publish`, which does not rewrite Bun `workspace:` ranges.

**The `kansoku-js` surface this package wraps.** The following is the complete public type
surface of `kansoku-js` after EP-2 and EP-3, copied from the MasterPlan's Integration Points so
you do not need to read those plans. `createKansoku(options)` returns a `KansokuClient`.

```typescript
export interface KansokuOptions {
  baseUrl: string                         // e.g. "https://analytics.example.com"; no trailing slash
  writeKey: string                        // ksk_w_… ; sent as X-Api-Key
  sourceService?: string                  // stamps AnalyticsEvent.sourceService
  autoStart?: boolean                     // default true; the provider passes false and calls start() itself
  flushAt?: number                        // default 20 events
  flushIntervalMs?: number                // default 5000
  maxQueueSize?: number                   // default 1000; newest event dropped when full
  maxBatchEvents?: number                 // default 100 (server cap 500)
  maxBatchBytes?: number                  // default 1 MiB (server cap 5 MiB)
  maxRetries?: number                     // default 5
  retryBaseDelayMs?: number               // default 500; exponential, full jitter, 30 s cap
  requestTimeoutMs?: number               // default 10000
  persistQueue?: boolean                  // default true
  storage?: "localStorage" | "cookie" | "memory" | StorageAdapter   // default localStorage
  storageKeyPrefix?: string               // default "kansoku"
  cookieDomain?: string                   // only for the cookie adapter
  sessionTimeoutMs?: number               // default 1_800_000 (30 min)
  schemaVersions?: Record<string, number> // per-event pins; merged over built-in defaults
  autocapture?: { pageViews?: boolean; sessions?: boolean }   // defaults true/true
  optOut?: boolean                        // start opted out
  respectDoNotTrack?: boolean             // default false
  respectGlobalPrivacyControl?: boolean   // default false
  beforeSend?: (event: AnalyticsEvent) => AnalyticsEvent | null
  onDrop?: (info: DropInfo) => void
  fetch?: typeof globalThis.fetch         // injectable for tests
  now?: () => number                      // injectable clock
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  debug?: boolean
}

export type DropReason =
  | "queue_full" | "rejected" | "permanent_error" | "retries_exhausted"
  | "before_send" | "opted_out" | "invalid"

export interface DropInfo { reason: DropReason; events: AnalyticsEvent[]; detail?: string }

export interface KansokuClient {
  track(eventName: string, properties?: JsonObject, options?: TrackOptions): void
  flush(): Promise<void>
  start(): void                            // idempotent; attaches listeners, interval, History patch, initial page_view
  stop(): void                             // idempotent inverse; detaches and begins a non-blocking flush
  shutdown(): Promise<void>                // stop(), await flush(), then refuse further events; never called by this package
  optOut(): void
  optIn(): void
  isOptedOut(): boolean
  getAnonymousId(): string
  getUserId(): string | undefined
  getSessionId(): string
  readonly stats: Readonly<{ queued: number; accepted: number; rejected: number; dropped: number }>
  readonly config: ResolvedKansokuOptions
  page(properties?: JsonObject, options?: TrackOptions): void
  identify(userId: string, traits?: JsonObject): void
  alias(previousId: string, newId: string, properties?: JsonObject): void
  group(organizationId: string, properties?: JsonObject): void
  experiment(experiment: string, variant: string, properties?: JsonObject, options?: ExperimentOptions): void
  setIdentifiers(identifiers: Partial<Record<IdentifierKind, string>>): void
  reset(): void
}

export interface TrackOptions { schemaVersion?: number; occurredAt?: Date; context?: JsonObject }
export interface ExperimentOptions { force?: boolean }
export type IdentifierKind = "cookie" | "device" | "fingerprint" | "email_sha256"
```

Three facts about that client matter for the hooks. First, `client.config` is the resolved
option set, so `client.config.autocapture.pageViews` tells you whether `kansoku-js` is already
recording page views by patching `history.pushState`/`replaceState` and listening for
`popstate`; the default is `true`, which means a React Router application is covered with no
React code at all. Second, `client.experiment(experiment, variant)` records the pair in the
current session (storage key `kansoku.exposures`) and emits `experiment_viewed` only once per
session for that pair, so a StrictMode double effect produces one event. The fourth argument,
`options?: ExperimentOptions`, carries `{ force: true }` to bypass that dedupe; `useExperiment`
never passes `force` and relies on the default per-session dedupe, so the dedupe lives entirely
in `kansoku-js`.
Third, `client.shutdown()` stops the client, awaits a final flush, and then refuses further
events for good; calling it on a client that someone else still uses would silently stop their
tracking, which is why the provider never calls it. Fourth, the lifecycle is reversible:
`createKansoku({ ..., autoStart: false })` constructs a client with no observable side effects
(no listeners, no timer, no History patch, no initial `page_view`), `client.start()` activates
all of those (recording the initial `page_view` at that moment, deduplicated by URL), and
`client.stop()` deactivates them, removes the History patch, begins a non-blocking flush, and
keeps identity, session, queue, and the page-view dedupe key. Both are idempotent, so
`start()` → `stop()` → `start()` on the same URL records exactly one initial `page_view`. That
is the property the provider's effect relies on.

**Why exposure is recorded on mount.** The server's experiment analytics (canonical handle
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-6`) count a user as exposed to a variant only when
an `experiment_viewed` event says the variant was actually shown; assignment that is never
rendered is not exposure. In React, "shown" is "the component rendering the variant has
mounted", which is why `useExperiment` emits in an effect on mount and again only when the
`(experiment, variant)` pair changes, and why it relies on the per-session dedupe for StrictMode.

**The package scaffold left by EP-1.** `packages/kansoku-react` already exists with:
`package.json` (`"name": "kansoku-react"`, `"type": "module"`, `"sideEffects": false`,
`"files": ["dist", "README.md", "CHANGELOG.md"]`, the export map below, `main`, `module`,
`types`); `tsconfig.json` extending `../../tsconfig.base.json` (which supplies
`"lib": ["ES2022", "DOM", "DOM.Iterable"]` and `"jsx": "react-jsx"`); `tsconfig.build.json`
used for declaration emit; `src/index.ts` with a placeholder export; and `test/` with nothing
in it. The shared build script `scripts/build.ts <package-dir>` runs `Bun.build` once (ESM to
`dist/index.js`, `target: "browser"`, peers external) and then `tsc -p tsconfig.build.json` to
emit `dist/index.d.ts`; both packages are ESM-only, so there is no CommonJS output.
`just build` runs it for every package.

```json
{
  "type": "module",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./package.json": "./package.json"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "engines": { "node": ">=20.19.0" }
}
```

**The test harness left by EP-1.** `bunfig.toml` at the repository root preloads
`test/setup/dom.ts` for every `bun test` run; that file calls
`GlobalRegistrator.register()` from `@happy-dom/global-registrator`, installing `window`,
`document`, `localStorage`, `history`, and friends onto the global object so browser code runs
in Bun. When the environment variable `KANSOKU_TEST_NO_DOM=1` is set, the same setup file skips
the registration, which is the repository-wide way to run a test without a DOM; EP-1's `just
test` recipe already runs the DOM suite and then the no-DOM command used by this plan's
server-rendering test. `test/helpers/fetch-mock.ts` exports a scripted `fetch` replacement that records every
request (URL, method, headers, parsed JSON body) and answers with whatever the test scripted
(by default an HTTP 202 `{"accepted": n, "rejected": []}` acknowledgement). Pass it to
`createKansoku` through the `fetch` option; pass `timers` and `now` for deterministic timing.
Read both helper files before writing tests; their exact export names are the ones you use.

**Architecture Decision Records.** Local ADRs live in `docs/adr/`, a profile-governed OKF bundle
installed by EP-1 (see `agents/skills/exec-plan/ADR.md` for the allocation and validation
commands). Scan its filenames before you start; at planning time no record concerns React. This
plan creates one short ADR, "React binding boundary", recording that `kansoku-react` is a thin
wrapper with no second implementation, that it peer-depends on `kansoku-js` at the lockstep
version, that the provider starts and stops only clients it creates and never shuts one down,
and that hooks are no-ops under SSR.
The only server ADR this plan depends on is ADR-6, cited above by its canonical Mori handle.
The server's ingest contract, authentication, identity, and schema-version rules are consumed
entirely through `kansoku-js` and are documented in EP-2 and EP-3.

**Module layout you will create.**

```text
packages/kansoku-react/
  src/index.ts               "use client" directive; re-exports everything public
  src/context.ts             the React context object and its value type
  src/provider.tsx           KansokuProvider
  src/noop-client.ts         the server-side no-op KansokuClient
  src/hooks/useKansoku.ts
  src/hooks/useTrack.ts
  src/hooks/usePageView.ts
  src/hooks/useIdentify.ts
  src/hooks/useExperiment.ts
  test/provider.test.tsx
  test/hooks.test.tsx
  test/ssr.test.tsx          run with KANSOKU_TEST_NO_DOM=1 (see Concrete Steps)
  README.md
```

Current package versions on npm as of 2026-10-14, for pinning: `react` and `react-dom` 19.3.1,
`@types/react` and `@types/react-dom` 19.3.0, `@testing-library/react` 16.3.3. Bun in the dev
shell is 1.4.2; TypeScript is 7.0.2; enter the shell with `nix develop` or let `direnv` do it.


## Plan of Work

The work is three milestones. The first makes the provider and the context usable and proves
the package builds to the published shape with the directive in place. The second adds the four
convenience hooks. The third proves everything with tests under happy-dom and one server-side
rendering test, writes the README, and records the ADR.

### Milestone 1 — Provider, context, `useKansoku`, server-side no-op, and a correct build

At the end of this milestone a React tree wrapped in `KansokuProvider` can obtain the client
through `useKansoku()`, server rendering of that tree produces HTML without touching browser
globals, and `just build` emits files that start with `"use client";`.

`src/context.ts` creates `KansokuContext = createContext<KansokuContextValue | null>(null)`
where `KansokuContextValue` is `{ client: KansokuClient }`. Keep the value an object so it can
grow later without changing the context type.

`src/noop-client.ts` exports `createNoopClient(): KansokuClient`, an object whose methods
(including `start` and `stop`) do nothing, whose `flush` and `shutdown` return a resolved
promise, whose `getAnonymousId` and
`getSessionId` return the empty string, whose `getUserId` returns `undefined`, whose
`isOptedOut` returns `true`, whose `stats` are all zero, and whose `config` is a frozen object
with `autocapture: { pageViews: false, sessions: false }` so no hook warns. Import only the
`KansokuClient` type from `kansoku-js` here (`import type`), never the runtime, so this module
is safe wherever React runs.

`src/provider.tsx` exports `KansokuProvider` with props
`({ client: KansokuClient } | { options: KansokuOptions }) & { children: ReactNode }`. When
`client` is given, the provider uses it as is and never starts, stops, or shuts it down. When
`options` is given, the provider creates the client exactly once for the lifetime of the mounted
provider in a lazy `useState` initialiser: `createKansoku({ ...options, autoStart: false })`
when `typeof window !== "undefined"`, and `createNoopClient()` under SSR, where `createKansoku`
is never called. Later changes to the `options` object are ignored (document this: options are
read once; to reconfigure, remount with a `key`). Construction with `autoStart: false` has no
observable side effects, so StrictMode's double invocation of the initialiser in development
is harmless (the discarded instance holds no listeners, timer, or patch). The provider then
runs one effect, keyed on the client, that is the whole lifecycle:

```tsx
useEffect(() => {
  if (!ownsClient) return
  client.start()
  return () => {
    client.stop()
  }
}, [client, ownsClient])
```

Under StrictMode React runs setup → cleanup → setup, which is `start()` → `stop()` → `start()`
on the same client; `kansoku-js` guarantees that sequence leaves the client started with one
initial `page_view` recorded. On a real unmount `stop()` removes the History patch, detaches the
listeners, and begins a flush of anything queued; the instance is then garbage-collected with the
provider. The context value is `useMemo(() => ({ client }), [client])` so consumers do not
re-render on every provider render, and the provider renders `<KansokuContext.Provider value={…}>`
rather than React 19's bare `<KansokuContext value={…}>` because the peer range includes React
18. Write tests for the StrictMode restart and for the unmount stop (M3).

`src/hooks/useKansoku.ts` exports `useKansoku(): KansokuClient`. It reads the context; if the
value is present it returns `value.client`; if it is absent and `typeof window === "undefined"`
it returns a shared no-op client; otherwise it throws
`new Error("useKansoku must be used inside <KansokuProvider>")`.

`src/index.ts` begins with the line `"use client"` (the project formatter strips semicolons, so
the directive is a bare string statement; that is valid). It re-exports `KansokuProvider`,
`KansokuContext`, `useKansoku`, the four hooks from M2, `createNoopClient`, and the types
`KansokuProviderProps`, `KansokuContextValue`. It also re-exports the `KansokuClient`,
`KansokuOptions`, `TrackOptions`, `JsonObject`, and `IdentifierKind` types from `kansoku-js`
so consumers can import everything they need from one package.

Build directive: EP-1's shared build script contract includes a per-package banner. Add to
`packages/kansoku-react/package.json` the field `"kansoku": { "banner": "\"use client\";" }`;
`scripts/build.ts` reads that field and passes it as the `banner` option to `Bun.build`, so
this plan changes nothing in the script. The 2026-10-14 experiments behind this are in the
Decision Log: without a banner, Bun's ESM output hoists the external `import` of `react` above
the source-level directive, which demotes it to an inert string. Acceptance for the build is
that `head -1 dist/index.js` prints `"use client";`.

Manifest changes: set `peerDependencies` to `{ "react": "^18.0.0 || ^19.0.0", "kansoku-js":
"^0.1.0", "@types/react": ">=18" }` and `peerDependenciesMeta` to
`{ "@types/react": { "optional": true } }`, so TypeScript consumers get the React types the
emitted declaration files import while JavaScript consumers are not forced to install them
(EP-1's scaffold already uses these values; confirm rather than retype). The `kansoku-js` peer range is a literal semver range, not a `workspace:` range:
the release pipeline (EP-6) publishes with `npm publish` because `bun publish` cannot attach
provenance, and `npm publish` does not rewrite `workspace:` protocols, so a `workspace:^` peer
would be published verbatim and be uninstallable. The changesets fixed group keeps the literal
range in step with each release. Set `devDependencies` to `react`, `react-dom`, `@types/react`,
`@types/react-dom`, `@testing-library/react` at the versions above plus `"kansoku-js":
"workspace:*"` so the workspace link exists for type-checking and tests (devDependencies are
not published, so the `workspace:` protocol is harmless there), and declare no `dependencies`.

### Milestone 2 — The four hooks

`useTrack()` returns a function with the same signature as `client.track`, memoised with
`useCallback` on the client so its identity is stable across renders (consumers pass it to
`useEffect` dependency arrays). Every effect in this milestone lists `client` in its dependency
array beside its own keys, so a provider remounted with a `key` or handed a different `client`
prop re-runs the hooks against the new instance; `useKansoku()` returns a stable reference for
the life of one provider, so this adds no re-runs in the normal case.

`usePageView(key: string, properties?: JsonObject)` runs an effect keyed on `key` (and
`client`): it calls `client.page(properties)` whenever `key` changes, including the first mount. Before the first
call it checks `client.config.autocapture.pageViews`; if that is `true` and
`process.env.NODE_ENV !== "production"`, it logs exactly once per page load, through
`console.warn`, the message
`kansoku-react: usePageView is active but kansoku-js autocapture.pageViews is still enabled; pass autocapture: { pageViews: false } to createKansoku or KansokuProvider options to avoid duplicate page_view events`.
Keep the "once" flag in module scope. Guard the `process.env.NODE_ENV` read so it does not throw
where `process` is undefined (`typeof process !== "undefined" && process.env?.NODE_ENV`). The
hook does not disable autocapture itself: the MasterPlan decides that the provider and hooks
never change `kansoku-js` defaults, and double counting is the application's misconfiguration to
fix.

`useIdentify(userId: string | undefined, traits?: JsonObject)` runs an effect keyed on `userId`
(and `client`) only: traits are read from a ref so a new object literal each render does not
re-identify, the "latest ref" pattern React recommends until `useEffectEvent` is available
across the whole peer range. It
calls `client.identify(userId, traits)` when `userId` is a non-empty string and differs from the
last identified value held in a ref; it does nothing when `userId` becomes `undefined`, because
logout semantics (`reset()`) are the application's explicit decision.

`useExperiment(experiment: string, variant: string, properties?: JsonObject)` runs an effect
keyed on `experiment` and `variant` (and `client`) that calls `client.experiment(experiment,
variant, properties)`, with `properties` read from a ref like `useIdentify`'s traits. It never
passes the `options` argument, so `force` is never set and the default
per-session dedupe applies. It adds no dedupe of its own; `kansoku-js` already emits once per
session per pair, and the hook documents that in its doc comment so a future reader does not
add a second layer.

All hooks obtain the client through `useKansoku()`, so under SSR they call the no-op client and
nothing happens.

### Milestone 3 — Tests, README, ADR

Tests run under the repository harness: `bun test packages/kansoku-react` loads
`test/setup/dom.ts` through `bunfig.toml`, so `document` exists and `@testing-library/react`
can mount components. Every test creates a real `kansoku-js` client with the fetch mock,
`persistQueue: false`, `autocapture: { pageViews: false, sessions: false }` unless the test is
about autocapture, `flushAt: 1` so each event is sent immediately, and injected `timers`.
Assertions read the recorded requests from the mock and inspect the JSON array body. The
required tests are listed in Validation and Acceptance.

The server-side rendering test is different: it must run with no DOM globals, otherwise
`typeof window === "undefined"` is false and the test proves nothing. `bunfig.toml`'s preload
applies to every file in a run, so this test is executed as a separate command with the
repository-wide switch that makes `test/setup/dom.ts` skip DOM registration:
`KANSOKU_TEST_NO_DOM=1 bun test packages/kansoku-react/test/ssr.test.tsx`. EP-1's `just test`
recipe already runs the DOM suite and this command, so no new recipe is needed. The SSR test imports
`renderToString` from `react-dom/server`, renders a tree with `KansokuProvider options={…}` and a
component that calls every hook, asserts the HTML string is produced, asserts the fetch mock
received no requests, and asserts `useKansoku()` outside any provider returned the no-op client
without throwing.

`README.md` for the package covers installation, the plain-app example from Purpose, a React
Router example that shows no extra code is needed for page views, an explicit `usePageView`
example that passes `autocapture: { pageViews: false }`, `useIdentify` on login, `useExperiment`
with a note that exposure is deduped per session, how to reach `flush`/`reset`/`group` through
`useKansoku`, the SSR behaviour, the lifecycle (the provider starts and stops a client it
created and never shuts it down; pass `client` to manage the lifecycle yourself), and the
module format: the package is ESM-only, Node 20.19 and later `require()` it without
configuration, and Jest in its default CommonJS mode needs `kansoku-react` and `kansoku-js`
added to its ESM transform allowlist (`transformIgnorePatterns`) or Jest's native ESM mode.

The ADR "React binding boundary" is created in `docs/adr/` following
`agents/skills/exec-plan/ADR.md` (allocate the handle with `okf id next`, validate with
`okf validate … --strict --profile-enforce --log-enforce`, add the log entry).


## Concrete Steps

All commands run from the repository root
`/Users/shinzui/Keikaku/bokuno/kansoku-project/kansoku-ts` inside the Nix dev shell.

Confirm the prerequisite and the scaffold:

```bash
grep -nE "page\(|identify\(|experiment\(|reset\(" packages/kansoku-js/src/types.ts
ls packages/kansoku-react packages/kansoku-react/src
cat scripts/build.ts
cat test/setup/dom.ts test/helpers/fetch-mock.ts
```

Add dependencies to the React package (run inside its directory so Bun writes to its manifest):

```bash
cd packages/kansoku-react
bun add --dev react@19.3.1 react-dom@19.3.1 @types/react@19.3.0 @types/react-dom@19.3.0 @testing-library/react@16.3.3 kansoku-js@workspace:*
cd ../..
```

Then confirm `peerDependencies` in `packages/kansoku-react/package.json` reads
`"react": "^18.0.0 || ^19.0.0"`, `"kansoku-js": "^0.1.0"`, and `"@types/react": ">=18"`, with
`"peerDependenciesMeta": { "@types/react": { "optional": true } }` (edit by hand if EP-1 left
anything else; the `||` range and the meta block are simpler to write than to pass through
`bun add --peer`), and run `bun install` at the root. Never write a `workspace:` range under
`peerDependencies`; it is published verbatim by `npm publish`.

Create the modules listed in Context and Orientation, then type-check and build:

```bash
bun run --filter kansoku-react typecheck
just build
head -1 packages/kansoku-react/dist/index.js
ls packages/kansoku-react/dist
```

Expected transcript for the last two commands (the listing also contains one `.d.ts` per source
module, such as `context.d.ts`, `provider.d.ts`, and a `hooks/` directory, and no `.cjs` or
`.d.cts` file):

```text
"use client";
index.d.ts  index.js  index.js.map  …
```

Run the DOM tests and the SSR test:

```bash
bun test packages/kansoku-react
KANSOKU_TEST_NO_DOM=1 bun test packages/kansoku-react/test/ssr.test.tsx
```

`just test` runs both of those commands in sequence.

Expected shape of the first command's output (names are the required tests; counts must match):

```text
bun test v1.4.2

packages/kansoku-react/test/provider.test.tsx:
✓ KansokuProvider creates one client from options and shares it through useKansoku
✓ KansokuProvider leaves a client passed in through the client prop untouched
✓ KansokuProvider starts a client it created and stops it on unmount
✓ KansokuProvider under StrictMode restarts its client and records one initial page_view
✓ KansokuProvider does not re-render consumers when it re-renders
✓ useKansoku throws outside a provider in the browser

packages/kansoku-react/test/hooks.test.tsx:
✓ useTrack sends a track event with the given name and properties
✓ useTrack returns the same function across renders
✓ usePageView emits page_view on mount and again only when the key changes
✓ usePageView warns once in development when autocapture.pageViews is enabled
✓ useIdentify identifies once per userId and ignores trait object identity
✓ useIdentify does nothing when userId is undefined
✓ useExperiment under StrictMode emits exactly one experiment_viewed per pair
✓ useExperiment emits again when the variant changes

 14 pass
 0 fail
```

Record the ADR, then run the repository checks:

```bash
okf id next docs/adr --profile docs/adr/profile.dhall ADR
# create docs/adr/<N>-react-binding-boundary.md with the allocated docId
okf log add docs/adr --profile docs/adr/profile.dhall
okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce --log-enforce
just check
```

Commit at milestone boundaries with the required trailers:

```text
feat(react): add KansokuProvider, context, useKansoku, and SSR no-op client

MasterPlan: docs/masterplans/1-kansoku-browser-sdks-kansoku-js-and-kansoku-react.md
ExecPlan: docs/plans/4-kansoku-react-provider-hooks-and-router-agnostic-page-tracking.md
Intention: intention_01m4ymqn7xe1a8tz8v7r78e34y
```


## Validation and Acceptance

Acceptance is behavioural and observed through the fetch mock, the build output, and the SSR
render. All of the following are required.

Provider and context. Rendering `<KansokuProvider options={{ baseUrl: "http://k.test",
writeKey: "ksk_w_test", fetch: mock, flushAt: 1, … }}>` around a component that calls
`useKansoku().track("hello")` results in exactly one request to `http://k.test/v1/batch` with
header `X-Api-Key: ksk_w_test`, method `POST`, and a JSON array body containing one event whose
`eventName` is `"hello"`, `source` is `"web"`, and `properties` is `{}`. Rendering the same
provider twice (two sibling providers) creates two distinct clients with different
`getAnonymousId()` results only when their storage prefixes differ; with the same prefix they
share the persisted anonymous ID, which is correct behaviour, so the test uses `storage:
"memory"` to show two instances. Passing `client` instead of `options` and unmounting the
provider leaves `client.stats`, the mock, and `history.pushState` untouched (no flush request
from the provider, no patch removed). Passing `options` (with `autocapture.pageViews` left on
for this test) results in `history.pushState` being wrapped only after the effect ran and one
`page_view` request; unmounting through `unmount()` from Testing Library restores the original
`history.pushState` and produces one additional flush request if events were queued, proving
`stop()` ran. Mounting a provider inside `<React.StrictMode>` records exactly one `page_view`
for the initial URL, leaves `history.pushState` wrapped, and a `track` call after the
double-mount is sent, proving the restart left the client active. A consumer component that
counts its renders re-renders zero times when the provider re-renders with the same client
(force the provider to re-render through a parent state change), proving the memoised context
value.

`useKansoku` outside a provider: in the DOM test, calling it through `renderHook` without a
wrapper rejects with the error message `useKansoku must be used inside <KansokuProvider>`.

`useTrack`: the returned function sends the event; `renderHook`'s `rerender()` yields the same
function reference (`Object.is` true).

`usePageView`: with `autocapture: { pageViews: false }`, `renderHook(({ key }) =>
usePageView(key), { initialProps: { key: "/a" } })` sends one `page_view` whose
`properties.url` is the current `window.location.href`; `rerender({ key: "/a" })` sends nothing
more; `rerender({ key: "/b" })` sends a second `page_view`. With autocapture left at its default
and `NODE_ENV` unset, the hook calls `console.warn` (spy on it with `spyOn(console, "warn")`)
exactly once across two mounts, and the message contains `autocapture.pageViews`.

`useIdentify`: `renderHook(({ id }) => useIdentify(id, { plan: "team" }), { initialProps: { id:
undefined } })` sends nothing; `rerender({ id: "user_1" })` sends one `identify` event with
`userId: "user_1"`, an `anonymousId` equal to `client.getAnonymousId()`, and `properties: { plan:
"team" }`; `rerender({ id: "user_1" })` with a new traits object sends nothing; `rerender({ id:
"user_2" })` sends a second `identify`; `rerender({ id: undefined })` sends nothing and
`client.getUserId()` is still `"user_2"`.

`useExperiment`: inside `<React.StrictMode>`, mounting a component that calls
`useExperiment("checkout_copy", "b")` results in exactly one `experiment_viewed` event with
`schemaVersion: 1` and `properties: { experiment: "checkout_copy", variant: "b" }`; rerendering
with variant `"c"` results in a second event.

Server-side rendering: `KANSOKU_TEST_NO_DOM=1 bun test packages/kansoku-react/test/ssr.test.tsx` passes;
the test asserts `typeof window === "undefined"`, that `renderToString` of a provider with
`options` plus components calling all five hooks returns a non-empty string, that the fetch mock
recorded zero requests, and that `useKansoku()` rendered outside any provider does not throw.

Build: `just build` succeeds; `head -1 dist/index.js` is `"use client";`; there is no
`dist/index.cjs`; `dist/index.d.ts` declares `KansokuProvider`, `useKansoku`, `useTrack`,
`usePageView`, `useIdentify`, `useExperiment`, and `createNoopClient`.

Repository checks: `just check` (type-check, lint, format, and, after EP-1, the ADR validation)
passes, and `okf validate docs/adr --strict --profile docs/adr/profile.dhall --profile-enforce
--log-enforce` passes with the new ADR.

Proposals that are not required acceptance: a `KansokuErrorBoundary`, a `useFlushOnRouteChange`
hook, and a Next.js `app/` example. Record them in the Decision Log only if the user asks for
them.


## Idempotence and Recovery

Every step is additive and repeatable. Re-running `bun add` with the same versions is a no-op;
`bun install` at the root re-links the workspace. `just build` overwrites `dist/` completely, so
a half-finished build is fixed by running it again. Tests have no persistent state: each test
constructs its client with `storage: "memory"` or clears `localStorage` in `beforeEach`, and the
fetch mock is recreated per test. The StrictMode test has no timing in it: `start()` and
`stop()` are synchronous and idempotent, so if it fails the provider is calling something other
than that pair (never `shutdown()`) or `kansoku-js` is recording a second initial `page_view`
after a restart, which is a bug in EP-3's dedupe key, not a reason to add sleeps. If the server-rendering test finds `window`
defined, `KANSOKU_TEST_NO_DOM=1` was not exported for that command; rerun it with the variable
set rather than changing the test. The ADR allocation is safe to repeat: `okf id next`
only reads; if validation fails, fix the frontmatter and run it again. Nothing in this plan
touches the server, the `kansoku-js` package sources, or published registries.


## Interfaces and Dependencies

Prerequisite: `docs/plans/3-kansoku-js-browser-capture-page-views-navigation-attribution-identity-helpers-and-experiments.md`
must be Complete per the MasterPlan registry, which guarantees the `KansokuClient` surface
reproduced in Context and Orientation, including `client.config.autocapture.pageViews` and the
per-session dedupe inside `client.experiment`. EP-1's artifacts are assumed present: the
workspace, `packages/kansoku-react` scaffold with the export map, `scripts/build.ts`,
`bunfig.toml` preload, `test/setup/dom.ts`, `test/helpers/fetch-mock.ts`, and the `docs/adr/`
bundle with `profile.dhall`.

Runtime dependencies: none. Peer dependencies: `react` `^18.0.0 || ^19.0.0`, `kansoku-js`
`^0.1.0` as a literal range kept in step by the changesets fixed group (never `workspace:`,
because `npm publish` does not rewrite it), and `@types/react` `>=18` marked optional in
`peerDependenciesMeta`. Development dependencies: `kansoku-js`
`workspace:*` for local resolution, `react`, `react-dom`, `@types/react`, `@types/react-dom`
19.3.x and `@testing-library/react` 16.3.3.
`react-dom` is used only by tests (`react-dom/server` for SSR, Testing Library for DOM mounts).

Types this package defines that other work depends on, all exported from
`packages/kansoku-react/src/index.ts`:

```typescript
export type KansokuProviderProps =
  ({ client: KansokuClient; options?: never } | { options: KansokuOptions; client?: never }) &
  { children: ReactNode }

export interface KansokuContextValue { client: KansokuClient }

export function KansokuProvider(props: KansokuProviderProps): ReactElement
export function useKansoku(): KansokuClient
export function useTrack(): KansokuClient["track"]
export function usePageView(key: string, properties?: JsonObject): void
export function useIdentify(userId: string | undefined, traits?: JsonObject): void
export function useExperiment(experiment: string, variant: string, properties?: JsonObject): void
export function createNoopClient(): KansokuClient
```

`ReactElement` and `ReactNode` are imported as types from `react`; the global `JSX` namespace
was removed in `@types/react` 19, so `JSX.Element` must not appear anywhere in the package.

Consumers of this plan: EP-5 (`docs/plans/5-examples-live-contract-conformance-and-real-browser-smoke-test.md`)
builds the `examples/react-vite` application on `KansokuProvider`, `useTrack`, and
`useIdentify`, and EP-6 (`docs/plans/6-release-engineering-package-checks-size-budget-docs-and-trusted-publishing.md`)
runs `publint` and `@arethetypeswrong/cli` against this package's `dist/` and publishes it in
lockstep with `kansoku-js`. This plan changes nothing outside its package: the `"use client";`
banner is applied by EP-1's shared build script from the per-package
`"kansoku": { "banner": … }` manifest field, and the no-DOM test switch
`KANSOKU_TEST_NO_DOM=1` is honoured by EP-1's `test/setup/dom.ts`; `kansoku-react` only sets
the field and uses the switch.

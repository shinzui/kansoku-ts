---
type: Bug Report
title: kansoku-react's published bundle uses the development JSX runtime, so KansokuProvider throws in production
description: kansoku-react 0.1.0's dist/index.js imports jsxDEV from react/jsx-dev-runtime, which React's production build exports as undefined, so rendering KansokuProvider under NODE_ENV=production throws "TypeError, w is not a function".
generated:
  by: process:claude-code
  at: "2026-11-07T16:20:00Z"
bugId: BUG-2
status: fixed
fixedVersion: 0.1.1
resolution: >-
  scripts/build.ts defines process.env.NODE_ENV as the production literal for kansoku-react,
  selecting react/jsx-runtime independently of the build environment. The package-smoke gate
  renders both provider forms from dist in fresh development and production Node processes,
  checking context identity, HTML and no network activity. Verified by
  docs/plans/10-build-kansoku-react-with-the-production-jsx-runtime.md. Released in 0.1.1
  through GitHub Actions run 42425302058, with production rendering verified from a clean
  npm consumer. Published 0.1.0 remains affected.
severity: unusable
workaround: >-
  Do not render KansokuProvider in a production build. Create the client with kansoku-js's
  createKansoku and give it to components through KansokuContext (`<KansokuContext value={{
  client }}>`, or `.Provider` on React 18); the hooks read the same context and contain no JSX.
  mori://tan/tan-ng-labs's portal works this way.
origin: mori://tan/tan-ng-labs/plans/17-replace-the-portal-s-vendored-kansoku-sdk-with-the-published-npm-packages
affects: mori://shinzui/kansoku-ts/packages/kansoku-react
affectedVersion: 0.1.0
environment: >-
  kansoku-react 0.1.0 from npm with react and react-dom 19.2.0 under Node 22.23.3. The repository's
  own packages/kansoku-react/dist/index.js, built at 6ccd933, imports the same module. Any
  production build resolves react/jsx-dev-runtime to React's production file, so browser bundles
  made by Vite, webpack or Bun in production mode are affected too; that was inferred from React's
  entry point and not run in a browser.
observed: >-
  dist/index.js contains `import{jsxDEV as w}from"react/jsx-dev-runtime"` and calls `w(...)` to
  render the context provider. react/jsx-dev-runtime.js loads
  cjs/react-jsx-dev-runtime.production.js when NODE_ENV is production, and that file sets
  `exports.jsxDEV = void 0`. renderToString of `<KansokuProvider options={...}>child</KansokuProvider>`
  returns "child" with NODE_ENV unset, and throws `TypeError: w is not a function` with
  NODE_ENV=production.
expected: >-
  KansokuProvider works in production builds. It is the first thing packages/kansoku-react/README.md
  shows, and ADR-5 requires the package to "preserve React 18/19 compatible provider syntax". The
  published bundle should use the production JSX runtime, react/jsx-runtime, which scripts/build.ts
  already lists as external.
reproduction:
  - "In an empty directory, install kansoku-js@0.1.0, kansoku-react@0.1.0, react@19.2.0 and react-dom@19.2.0."
  - 'Run `grep -o ''from"react/jsx[^"]*"'' node_modules/kansoku-react/dist/index.js` and observe `from"react/jsx-dev-runtime"`.'
  - 'Write a module that renders `React.createElement(KansokuProvider, { options: { baseUrl: "https://k.test", writeKey: "w", sourceService: "s" } }, "child")` with react-dom/server''s renderToString.'
  - 'Run it with Node; observe it renders "child".'
  - "Run it with NODE_ENV=production; observe `TypeError: w is not a function`."
reviews:
  - kind: model
    reviewer: process:claude-code
    reviewed_at: "2026-11-07T16:20:00Z"
    document_timestamp: "2026-11-07T16:20:00Z"
    scope: content-and-metadata
    outcome: commented
    provider: anthropic
    model: claude-opus-5-5
    effort: unspecified
    context: >-
      Author review from the reproduction above run on 2026-11-07 against the npm packages, and
      from reading scripts/build.ts and React 19.2.0's jsx-dev-runtime entry. Found while
      investigating BUG-3. No independent verification is claimed.
---

# kansoku-react's published bundle uses the development JSX runtime, so KansokuProvider throws in production

**Reported by:** a `claude-code` session working on
`mori://tan/tan-ng-labs/plans/17-replace-the-portal-s-vendored-kansoku-sdk-with-the-published-npm-packages`,
which uses kansoku-js and kansoku-react 0.1.0 from npm in the labs portal. Found while reproducing
BUG-3.

## What happens

`KansokuProvider` is written in TSX (`packages/kansoku-react/src/provider.tsx`), and the root
`tsconfig.base.json` sets `"jsx": "react-jsx"`. `scripts/build.ts` bundles it with `Bun.build`,
which compiles JSX for development unless told otherwise, so the published module imports the
development runtime:

```text
import{jsxDEV as w}from"react/jsx-dev-runtime"
```

React's `react/jsx-dev-runtime` entry loads its production file when `NODE_ENV` is `production`,
and that file exports `jsxDEV` as `undefined`. So the provider works in a development server and
throws as soon as the application is built for production:

```text
NODE_ENV=(unset):     rendered "child"
NODE_ENV=production:  TypeError: w is not a function
```

`scripts/build.ts` marks `react/jsx-runtime` as external, which suggests the production runtime was
intended. The hooks and `KansokuContext` contain no JSX and are not affected.

## Why it matters

- The README's first example is `KansokuProvider`, so following it ships an application that
  crashes in production. Under server rendering, the server render throws. In the browser, the
  provider's subtree fails to render.
- Nothing in `just check` catches it. The vitest suites and `ssr-smoke` run the TypeScript sources
  in development mode, and `package-smoke` imports only kansoku-js. No check renders the built
  `dist/index.js` with `NODE_ENV=production`.

## Suggested fixes, for the owner to decide

1. Build kansoku-react with the production JSX runtime, for example with Bun.build's JSX
   development option turned off or `NODE_ENV=production` set for the build, and check that
   `dist/index.js` imports `react/jsx-runtime`.
2. Add a smoke that imports the built `dist/index.js` and renders `KansokuProvider` with
   `NODE_ENV=production`, and run it in `just check`.
3. Publish a patch release, since 0.1.0 on npm is affected.

## Workaround

Create the client with `createKansoku` and provide it through `KansokuContext`. The hooks read
that context, so they work unchanged.

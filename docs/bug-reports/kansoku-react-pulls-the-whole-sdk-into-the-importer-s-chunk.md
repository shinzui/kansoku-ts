---
type: Bug Report
title: Importing anything from kansoku-react pulls the whole kansoku-js SDK into the importer's chunk
description: kansoku-react 0.1.0 is one bundled module that statically imports createKansoku for KansokuProvider, so an application that imports only KansokuContext or a hook still gets all of kansoku-js in its entry chunk, and its own dynamic import of kansoku-js no longer splits.
generated:
  by: process:claude-code
  at: "2026-11-07T16:20:00Z"
bugId: BUG-3
status: reported
severity: degraded
workaround: >-
  Make the bundler resolve kansoku-js to a stub when kansoku-react is the importer, and never render
  KansokuProvider. mori://tan/tan-ng-labs's portal does this with a Vite `pre` plugin in
  web/apps/portal/vite.config.ts, plus `optimizeDeps.exclude: ["kansoku-react"]` so the dev server
  applies the same stub. It then loads the SDK with `import("kansoku-js")` and provides the client
  through KansokuContext. The alternative is not to use kansoku-react and write the context and
  hooks locally.
origin: mori://tan/tan-ng-labs/plans/17-replace-the-portal-s-vendored-kansoku-sdk-with-the-published-npm-packages
affects: mori://shinzui/kansoku-ts/packages/kansoku-react
affectedVersion: 0.1.0
environment: >-
  kansoku-js and kansoku-react 0.1.0 from npm, bundled by Vite 8.3.4 (Rolldown) in production mode.
  First seen in the labs portal (TanStack Start, Vite 8.3.4), where the SDK landed in a 700 KB
  entry chunk, and reproduced on 2026-11-07 in a two-file application. Other bundlers were not
  tried.
observed: >-
  dist/index.js is a single module that begins `import{createKansoku as v}from"kansoku-js"` and
  defines KansokuProvider, KansokuContext and the hooks together. An application whose entry imports
  only KansokuContext from kansoku-react and loads the SDK with `await import("kansoku-js")` builds to
  a 30,756-byte entry chunk that contains kansoku-js (the `/v1/batch` code), and no separate SDK
  chunk. The same application without the kansoku-react import builds to a 2,359-byte entry and a
  25,938-byte kansoku-js chunk loaded on demand. Both package manifests declare `"sideEffects":
  false`, but the unused provider's static import still decides chunk placement.
expected: >-
  An application that does not render KansokuProvider should be able to keep kansoku-js out of its
  entry chunk and load it on demand. ADR-6 says "Browser imports are small and tree-shakeable" and
  keeps "The React entry ... at 3 KiB", and kansoku-js itself splits its web-vitals code into an
  on-demand file so that "disabled applications never request the file". The React binding should
  not undo that for applications that load the SDK lazily.
reproduction:
  - "In an empty directory, install kansoku-js@0.1.0, kansoku-react@0.1.0, react@19.2.0 and vite@8.3.4, with an index.html that loads src/main.js as a module."
  - 'Write src/main.js that imports `{ KansokuContext }` from kansoku-react, keeps a reference to it (for example `window.ctx = KansokuContext`), and exports a function that does `await import("kansoku-js")`.'
  - "Run `vite build` and list dist/assets; observe one entry chunk of about 30 KB that contains `/v1/batch`, and no kansoku-js chunk."
  - "Remove the kansoku-react import and build again; observe a small entry of about 2 KB and a separate chunk of about 26 KB containing `/v1/batch`."
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
      Author review from the two-variant Vite build run on 2026-11-07 and the labs portal's build on
      2026-11-06 (plan 17's Surprises & Discoveries). No independent verification is claimed.
---

# Importing anything from kansoku-react pulls the whole kansoku-js SDK into the importer's chunk

**Reported by:** a `claude-code` session working on
`mori://tan/tan-ng-labs/plans/17-replace-the-portal-s-vendored-kansoku-sdk-with-the-published-npm-packages`.
The labs portal loads the SDK only after its runtime configuration enables analytics and a
signed-in subject is verified. It wanted kansoku-react's context and hooks without the SDK in
every page's entry.

## What happens

`scripts/build.ts` bundles `packages/kansoku-react/src/index.ts` into one `dist/index.js`. Because
`src/provider.tsx` imports `createKansoku` from `kansoku-js`, that single module begins with a
static import of the SDK, whatever the importer uses:

```text
"use client";
var c="0.1.0";var x=c;import{createKansoku as v}from"kansoku-js";import{...}from"react";...
```

An application that imports only `KansokuContext` still has a static edge to kansoku-js. A module
reached both statically and dynamically goes into the static chunk, so the application's own
`import("kansoku-js")` stops splitting:

| Application entry                                                | Entry chunk                    | kansoku-js chunk        |
| ---------------------------------------------------------------- | ------------------------------ | ----------------------- |
| `KansokuContext` from kansoku-react, plus `import("kansoku-js")` | 30,756 bytes, contains the SDK | none                    |
| `import("kansoku-js")` only                                      | 2,359 bytes                    | 25,938 bytes, on demand |

Both packages declare `"sideEffects": false`, but that does not help here. In the labs portal the
SDK ended up in a 700 KB entry chunk, and a `manualChunks` rule made it worse, because Rolldown
moved Vite's preload helper into the SDK chunk.

## Why it matters

- Applications that defer analytics, for consent, configuration or sign-in, cannot use
  kansoku-react without loading the SDK on every page. Those are the applications that care
  about the SDK's size budget.
- The workaround is a bundler-specific stub that every such consumer has to write and maintain.

## Suggested fixes, for the owner to decide

1. Keep the provider apart from the rest. Publish a second entry point (for example
   `kansoku-react/provider`) or preserve modules in `dist/`, so `KansokuContext` and the hooks
   carry no import of kansoku-js except type imports.
2. Or have `KansokuProvider` load the SDK lazily: `import("kansoku-js")` inside its effect, with
   the no-op client until then. That changes when the client exists, so it needs a decision under
   ADR-5.
3. Add a check that builds a context-only consumer and asserts the SDK is not in its entry chunk.

## Workaround

Stub kansoku-js for kansoku-react's import in the bundler and provide the client through
`KansokuContext`, as the labs portal does. Because of BUG-2, a production application has to
provide the client through `KansokuContext` today anyway.

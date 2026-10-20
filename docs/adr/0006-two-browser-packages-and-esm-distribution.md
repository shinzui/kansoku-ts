---
type: Architecture Decision Record
title: Two browser packages and ESM distribution
description: Publish a dependency-free browser SDK and a thin React binding as one ESM build each.
docId: ADR-6
status: Accepted
date: 2026-10-14
timestamp: 2026-10-20T23:45:00Z
generated:
  by: process:codex
  at: 2026-10-15T04:18:00Z
---

# Two browser packages and ESM distribution

## Context

The initiative needs a browser SDK and React integration. A third shared core package would
add release overhead before another runtime needs one. The server owns ingest and metrics
contracts, while browser applications must never receive metrics service tokens.

## Decision

Publish exactly kansoku-js and kansoku-react. Keep envelope, validation, queue, transport
and retry modules free of DOM imports and module-scope browser access. React delegates to
the browser client. Both packages have no runtime dependencies; React and kansoku-js are
peers of the binding. Exclude metrics clients, replay, click/form capture, flag evaluation,
Node producers and other framework bindings from this initiative.

Build one minified ESM bundle with a linked source map and declaration set, with types and default export conditions.
Use explicit .js relative imports in declarations. Declare Node >=20.19.0 for require(esm)
support; Node 22 consumers need 22.12 or later. Keep the React use-client banner first.
Check packed declarations with publint and attw's esm-only profile. Enforce gzip budgets
of 10 KiB for kansoku-js and 3 KiB for kansoku-react.

Builds require bun >=1.4.2, declared as engines.bun in the private root package.json and
enforced by scripts/build.ts before it bundles. The build imports each bundle and compares its
runtime exports, by name and typeof, with the source entry module before it reports success.

## Alternatives considered

A separate core package adds another versioned artifact without another runtime consumer.
Dual ESM/CommonJS builds duplicate output and can create distinct React context instances.
Bundling framework peers risks multiple copies of React in applications.

## Consequences

A future runtime can extract pure modules after a real need appears. Browser imports are
small and tree-shakeable. Jest in its default CommonJS mode needs ESM transforms; Node's
native require(esm) path is the supported CommonJS consumption strategy.

Production distribution uses Bun minification while preserving declarations, ESM exports,
linked debugging maps and the React use-client banner. The existing size budgets remain
unchanged as transport, bot and handoff features are added. Package/SSR/type checks validate
the built artifact. A local build does not claim a registry publication.

bun older than 1.4.2 is unsupported for building: bun 1.3.13 drops the kansoku-js entry's named
re-exports under sideEffects false and still reports success
([BUG-1](../bug-reports/bun-1-3-drops-entry-named-reexports.md)). The published packages are
plain ESM, so consumers of the built artifacts need no particular bun.

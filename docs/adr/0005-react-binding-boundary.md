---
type: Architecture Decision Record
title: React binding boundary
description: Keep React bindings thin and drive owned clients through reversible effects with a no-op server-rendering path.
docId: ADR-5
status: Accepted
date: 2026-10-14
timestamp: 2026-10-15T04:10:00Z
generated:
  by: process:codex
  at: 2026-10-15T04:10:00Z
---

# React binding boundary

## Context

React StrictMode repeats effect setup and cleanup. Server rendering lacks a browser.
Duplicating delivery, identity or capture logic in a binding would create divergent SDKs.

## Decision

`kansoku-react` delegates every analytics operation to `kansoku-js`. A provider-owned
client is created once with autoStart disabled, started in an effect and stopped in cleanup.
It is never shut down by the provider. A caller-owned client is neither started nor stopped
by the binding. Options are read once; remount to change configuration or ownership mode.

Memoize the context value and tracking callback. Hook effects depend on the client and
their semantic keys; traits and properties are read through refs. The core owns exposure
dedupe. Router integrations use the core's History capture by default; explicit usePageView
warns when automatic capture is enabled.

Under server rendering, return a no-op client and create no browser client. In the browser,
useKansoku without a provider throws. Publish an ESM module beginning with a use-client
banner; preserve React 18/19 compatible provider syntax and declaration types.

## Alternatives considered

Deferred shutdown timers obscure lifecycle ownership and make StrictMode timing-dependent.
A second delivery implementation duplicates the contract. Silently accepting a missing
provider in the browser hides configuration errors.

## Consequences

Providers work under StrictMode and SSR. External clients remain usable by non-React code.
The binding has no transport or persistence implementation and peers on React and kansoku-js.

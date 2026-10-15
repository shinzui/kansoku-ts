---
type: Architecture Decision Record
title: Browser capture defaults
description: Capture page views and session starts through the shared delivery engine with explicit privacy gates and lifecycle ownership.
docId: ADR-4
status: Accepted
date: 2026-10-14
timestamp: 2026-10-15T04:05:00Z
generated:
  by: process:codex
  at: 2026-10-15T04:05:00Z
---

# Browser capture defaults

## Context

Browser and React consumers must use identical envelopes, identity rules and delivery
behavior. Framework effect restarts must not count another view of the same page.

## Decision

Capture only page views and session starts automatically. Collect locale, timezone, screen,
viewport, user agent and library version per event. Add full URL, referrer and UTM fields
to page views. Caller properties and context can override their respective defaults.
Do not compute fingerprints, precise location or IP addresses.

Bind the initial page view and History API patch to start/stop installers. Capture navigation
on the next task and dedupe by origin, path and query; ignore hashes. Keep the key across
stop/start, and preserve patches installed by other libraries during teardown.

All helpers use the core envelope and enqueue pipeline. Alias overrides identity for one
event; identify and group persist state. Experiment exposure is deduplicated per session
and pair after successful enqueue, with an explicit force option. This follows
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-5` and
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-6`.

Opt-out and opt-in GPC/DNT checks share one suppression path. Automatic capture skips
silently while suppressed; explicit calls report drops. Reset may still clear identity.
No browser global is read at module import time.

## Alternatives considered

Click, form and replay capture have no consumer in this initiative. Router-specific
integration duplicates History observation. A deferred terminal shutdown workaround in
React is unnecessary with the reversible core lifecycle.

## Consequences

Vanilla apps need one construction call. React can drive lifecycle from an effect safely.
Full URLs can contain personal data; applications must redact them with beforeSend where
needed. Privacy signals are explicit application policy options.

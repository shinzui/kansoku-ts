---
type: Architecture Decision Record
title: Browser capture defaults
description: Capture page views and session starts through the shared delivery engine with explicit privacy gates and lifecycle ownership.
docId: ADR-4
status: Accepted
date: 2026-10-14
timestamp: 2026-10-16T04:26:26Z
generated:
  by: process:codex
  at: 2026-10-15T04:05:00Z
---

# Browser capture defaults

## Context

Browser and React consumers must use identical envelopes, identity rules and delivery
behavior. Framework effect restarts must not count another view of the same page.

## Decision

Capture page views, session starts and best-effort page leaves automatically. Collect locale, timezone, screen,
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

## Page-leave lifecycle

A successful page view retains its identity/session and URL snapshot. A SPA transition or
first exit closes that view once with a monotonic nonnegative durationMs, through the same
privacy, validation and beforeSend pipeline. It never renews a session merely to report an old
view. Page leave is lifecycle telemetry rather than user engagement, and cannot guarantee
complete time measurement. `autocapture.pageLeave=false` disables it. Visibility and pagehide
share one exit transition; a persisted BFCache pageshow starts a new view interval. Ordinary
stop/start keeps the existing view and navigation dedupe key.

## Bot hint policy

Default botDetection=flag adds Boolean context.bot using a bounded handwritten synthetic v1
matcher, preserving existing true. drop accounts for suppressed bot events through onDrop and
dropped statistics; off adds no client flag. The ordinary opt-out/GPC/DNT gate precedes bot
handling. This small matcher imports no third-party rule database and does not claim empirical
accuracy; the server independently classifies the actual request UA. Client off cannot disable
server bot classification.

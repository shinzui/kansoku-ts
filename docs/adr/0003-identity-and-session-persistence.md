---
type: Architecture Decision Record
title: Identity and session persistence
description: Share browser identity through an adapter while keeping the pending delivery queue in per-tab storage.
docId: ADR-3
status: Accepted
date: 2026-10-14
timestamp: 2026-10-15T04:00:00Z
generated:
  by: process:codex
  at: 2026-10-15T04:00:00Z
---

# Identity and session persistence

## Context

Identity should survive reloads and be shared across tabs. A delivery queue shared by tabs
would be overwritten and replayed by multiple clients. Storage can be blocked by a browser.

## Decision

Use the selected adapter (localStorage by default, cookie, memory or a custom adapter) for
`kansoku.anonymous_id`, `user_id`, `organization_id`, `identifiers`, `session` and `opt_out`.
Every key uses the configured prefix followed by a dot. Anonymous IDs are random, never
derived from browser characteristics. Session records are `{ id, lastActivityAt }`; activity
renews the session after thirty minutes of inactivity by default. A new session emits
`session_start` before its triggering event unless disabled.

The queue mirror `kansoku.queue` is an array of pending events in sessionStorage regardless
of the identity adapter. Restore valid events with unchanged event IDs; retain them until
terminal delivery. Browser storage adapters degrade to memory if unavailable or throwing.
Cookie values use path `/`, SameSite=Lax, Secure on HTTPS and at most a 400-day lifetime.

Only the server's closed identifier vocabulary is accepted, as described by
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-5`.

## Alternatives considered

A localStorage queue is unsafe across tabs. Memory alone loses events on every reload.
Fingerprinting to derive anonymous IDs would add data collection without a consumer need.

## Consequences

Same-tab reloads can retry unanswered deliveries. Closing a tab loses its queue when exit
delivery fails. Custom storage adapters must implement the get, set and remove contract.

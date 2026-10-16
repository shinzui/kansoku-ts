---
type: Architecture Decision Record
title: Identity and session persistence
description: Share browser identity through an adapter while keeping the pending delivery queue in per-tab storage.
docId: ADR-3
status: Accepted
date: 2026-10-14
timestamp: 2026-10-16T04:26:26Z
generated:
  by: process:codex
  at: 2026-10-15T04:05:00Z
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

`identify` defaults to explicit schema version 2; `identifyOnce` defaults to version 1.
Both validate declared scalar traits and a nonempty user ID before changing active identity.
Both preserve the anonymous ID, allowing server implicit-cookie stitching, then enqueue through
the ordinary privacy and delivery gates. Per-call or configured version overrides remain
explicit: identify v1 is identity-only. Null is rejected for governed scalar traits; omitted
properties do not change current values. Set-once initializes a value and a later set can replace
it. These public producer observations are never authorization facts. The server owns ordering,
storage and erasure in `mori://shinzui/kansoku/okf/adrs/concepts/ADR-16`.

React `useIdentifyOnce` follows user/client changes like `useIdentify`. A ref suppresses
duplicate effect setup under StrictMode while an absent user resets the hook's remembered
identity. The name describes server trait semantics, not a guarantee of one React mount.

`kansoku.exposures` stores `{ sessionId, keys }`, where each key joins experiment and
variant with a NUL separator. A stale session invalidates these keys. `reset()` clears
user, organisation, signals and exposures, rotates anonymous and session IDs and records
a new session start when enabled. Queued events keep their original IDs and attribution.

## Alternatives considered

A localStorage queue is unsafe across tabs. Memory alone loses events on every reload.
Fingerprinting to derive anonymous IDs would add data collection without a consumer need.

## Consequences

Same-tab reloads can retry unanswered deliveries. Closing a tab loses its queue when exit
delivery fails. Custom storage adapters must implement the get, set and remove contract.

## Shared origins and explicit handoff

Before capture, identity snapshots reread the selected adapter. A successful persistent read
that returns missing never resurrects an old memory fallback value. Cookie adapters verify
persistence and use only memory on failure, with redacted debug output. Already-open siblings
therefore observe completed shared reset/logout and opt-out changes. A newly observed opt-out
drops that tab's pending queue; historical queued attribution is otherwise immutable. Page
snapshots with a rotated anonymous identity are retired rather than emitted as a former user.

Parent-domain cookies are recommended for sibling subdomains with one prefix/account.
Producer session IDs can be shared, but server sessions remain source-service scoped. Explicit
linkTo handoff decorates exact allowlisted HTTP(S) destinations only after start and privacy
admission. Startup acceptance defaults false and strips the parameter before attribution even
when ignored. Fresh identities adopt; existing logged-out identities merge a cookie signal
without overwriting a different cookie or other signals. Authenticated recipients never attach
an incoming unsolicited identity. Exactly one bounded identifier is accepted. This is replayable
analytics evidence, not authentication; initial URL/referrer/log exposure precedes stripping.

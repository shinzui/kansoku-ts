---
type: Architecture Decision Record
title: Initial release server coordination
description: Coordinate browser delivery and identity contracts with the first Kansoku deployment using mandatory live acceptance.
docId: ADR-8
status: Accepted
date: 2026-10-15
timestamp: 2026-10-16T05:41:50Z
generated:
  by: process:codex
  at: 2026-10-15T15:41:12Z
---

# Initial release server coordination

## Context

Plans 7 and 8 consume the initial server initiative at
`mori://shinzui/kansoku/masterplans/5-act-on-rev-1-close-silent-loss-paths-add-metric-filters-and-enrich-web-analytics`.
The review found incompatible timestamp, schema, beacon and session assumptions.
The implementation and final joint acceptance now pass; existing accepted ADRs retain the
runtime details and this record accepts their initial-release coordination.

## Decision

Use one injected clock for event and transport timestamps, preserving logical event IDs/content
on retry. Beacon queue admission is distinct from server acknowledgement and shares a per-document
keepalive budget; lifecycle events cannot trigger duplicate acceptance accounting. Retried mirrored
events rely on the server's durable deduplication contract. identify and identifyOnce explicitly
select governed schema versions, and generated identifier vocabulary includes email_hmac without
shipping any secret pepper. Page-leave is best-effort lifecycle telemetry with the original page's
session identity, not a guaranteed engagement signal.

Cross-origin handoff is opt-in, destination-allowlisted and gated by privacy suppression. It must
not attach an incoming arbitrary identifier to an already authenticated user. Parent-domain
storage needs synchronization for open-tab reset/logout, and it does not imply one server session
across distinct sourceService values. URL identifiers can be exposed before JavaScript strips them;
the handoff is not authentication. Failed cookie persistence does not silently expand persistence.

Release acceptance requires the final server contract pin and zero skipped feature checks. Local
optional compatibility tests are not release evidence. JSON filters and nullable namespaced group
values follow the server-generated API. Accepted server decisions are retained in
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-11`; this repository's accepted ADRs 2–4 and 6
retain delivery, identity/privacy and artifact boundaries. Bot detection defaults to a versioned
handwritten flag matcher, with explicit drop/off policies; it cannot disable independent
server classification. No empirical accuracy or external rule-database license is implied.

## Consequences

The final packaged server gate passes required live, protocol, real-example, identity/bot and
beacon/BFCache browser checks without feature skips, and the generated contract pin is refreshed
to the completed server source. An ordinary clean-clone workflow also passes with the previously
accepted SDK. Default keepalive remains stable; beacon is explicit and queued transport is not
guaranteed delivery. Cross-origin identity remains evidence-based and conflicts can remain
unresolved. This accepts source/local-package contracts without publishing or deploying them.

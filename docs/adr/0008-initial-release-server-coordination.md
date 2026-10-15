---
type: Architecture Decision Record
title: Initial release server coordination
description: Coordinate browser delivery and identity contracts with the first Kansoku deployment using mandatory live acceptance.
docId: ADR-8
status: Proposed
date: 2026-10-15
timestamp: 2026-10-15T15:41:12Z
generated:
  by: process:codex
  at: 2026-10-15T15:41:12Z
---

# Initial release server coordination

## Context

Plans 7 and 8 consume the initial server initiative at
`mori://shinzui/kansoku/masterplans/5-act-on-rev-1-close-silent-loss-paths-add-metric-filters-and-enrich-web-analytics`.
The review found incompatible timestamp, schema, beacon and session assumptions.
Existing ADRs describe current behavior; this record is proposed until implementation evidence
and updates to those accepted decisions are complete.

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
values follow the server-generated API. Proposed server decisions are tracked in its MasterPlan;
this repository's implementation updates ADRs 2–4 when the corresponding behavior lands.

## Consequences

SDK and server may develop independently but release together only after actual browser/native
conformance. Default keepalive remains until the supported beacon route is published; no queued
transport is described as guaranteed delivery. Cross-origin identity remains evidence-based and
conflicts may intentionally remain unresolved.

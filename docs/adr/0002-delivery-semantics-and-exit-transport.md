---
type: Architecture Decision Record
title: Delivery semantics and exit transport
description: Share one batch delivery engine with bounded retries, loss accounting and a reversible capture lifecycle.
docId: ADR-2
status: Accepted
date: 2026-10-14
timestamp: 2026-10-15T04:00:00Z
generated:
  by: process:codex
  at: 2026-10-15T04:00:00Z
---

# Delivery semantics and exit transport

## Context

`mori://shinzui/kansoku/okf/adrs/concepts/ADR-1` defines partial batch acceptance.
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-3` requires header credentials.
Framework consumers need lifecycle setup and cleanup that can run repeatedly.

## Decision

Deliver arrays exclusively to `/v1/batch` with `X-Api-Key`. A valid 202 acknowledgement
ends delivery for every event, including rejections. Count rejections as drops. Treat
400, 401, 403, 404 and non-retryable 503 responses as permanent; split 413 batches until
single-event failures can be dropped. Retain split halves in the persisted queue until
their terminal responses so interruption between halves does not lose them.

Retry unknown outcomes with the same event IDs using bounded exponential full jitter.
One normal flush drains the queue; concurrent callers share its promise. Response
accounting removes event IDs once, including overlapping exit requests.

Exit delivery uses keepalive fetch in bodies no larger than 60 KiB. The browser also
caps aggregate in-flight keepalive bytes; this is best effort, and failed or unanswered
requests remain in the tab's queue mirror. Oversized individual events remain there for
normal delivery. Exit attempts do not schedule delayed retries after teardown.

Construction attaches nothing. `start` activates timers and installers; `stop` reverses
them and begins a flush. Both are idempotent. `shutdown` closes acceptance, stops, and
awaits the final flush. Registered context providers survive a stop/start cycle.

## Alternatives considered

Beacon cannot send the required credential header. Removing a split batch before its
halves finish creates a persistence gap. A terminal-only lifecycle is unsuitable for
React StrictMode's repeated effect setup and cleanup.

## Consequences

Framework bindings own activation without duplicating delivery logic. Navigation delivery
is best effort; tab closure with a failed request can lose pending events. The SDK exposes
accepted, rejected and dropped counts plus drop callbacks rather than claiming exactly-once
network delivery.

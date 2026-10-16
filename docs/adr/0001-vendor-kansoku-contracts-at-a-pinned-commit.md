---
type: Architecture Decision Record
title: Vendor Kansoku contracts at a pinned commit
description: Generate SDK wire types from committed server contracts and refresh their source pin explicitly.
docId: ADR-1
status: Accepted
date: 2026-10-14
timestamp: 2026-10-16T01:36:00Z
generated:
  by: process:codex
  at: 2026-10-15T03:45:00Z
---

# Vendor Kansoku contracts at a pinned commit

## Context

The SDK consumes an HTTP contract owned by `mori://shinzui/kansoku`. The upstream
contract is described by `mori://shinzui/kansoku/okf/adrs/concepts/ADR-1` and
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-7`. A clean SDK checkout must build and
test without that server checkout or a running service.

## Decision

Commit the server's OpenAPI document and event catalog under `contracts/`, together
with their full source commit in `contracts/KANSOKU_COMMIT`. Generate and commit
`packages/kansoku-js/src/generated/schema.ts` with `openapi-typescript`. Handwritten
code imports wire types only through `src/contract/wire.ts`.

Refresh with `scripts/sync-contracts.ts`, which reads committed objects with `git show`,
then regenerate types and review the entire change. Builds and tests read only vendored
files. The catalog's `identifierKinds` also generates the committed
`src/generated/identifier-kinds.ts` vocabulary; runtime validation and the public
`IdentifierKind` union consume that single generated list. A new identifier kind therefore
requires an explicit server contract refresh. The live conformance suite compares `GET /v1/schemas` with the vendored catalog.

The same refresh generates `src/generated/trait-schema.ts` from the governed identify and
identify_once declarations. Runtime helper validation and default operation versions consume
that map. Generation fails if the two operations disagree on trait types or required numeric
constraints; hand-maintained trait vocabularies would permit validation drift.

## Alternatives considered

Reading a sibling checkout or fetching a server during builds makes builds depend on
external state. Handwriting DTOs permits silent contract drift. Both were rejected.

## Consequences

Contract upgrades are explicit reviewable changes. The local generated-file check catches
stale types; the live check catches a server catalog that differs from the chosen pin.
The generator's TypeScript 5 peer is a development dependency; the pinned development
shell compiler performs SDK type checking and declaration emission.

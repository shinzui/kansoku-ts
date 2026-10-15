---
id: 7
slug: cross-origin-identity-parent-domain-cookies-and-link-handoff
title: "Cross-origin identity: parent-domain cookies and link handoff"
kind: exec-plan
created_at: 2026-10-15T14:55:23Z
intention: "intention_01m4zwwdrjesytazp5tb39fe3n"
provenance:
  created_by:
    model: "claude-fable-5-1"
    harness: "claude-code"
    at: 2026-10-15T14:55:23Z
---

# Cross-origin identity: parent-domain cookies and link handoff

This ExecPlan is a living document. Update its living sections and durable ADRs as work
proceeds. It answers the second of two gaps identified on 2026-10-15 while planning
`mori://shinzui/kansoku/masterplans/5-act-on-rev-1-close-silent-loss-paths-add-metric-filters-and-enrich-web-analytics`:
a marketing site and the product application on different origins get different anonymous
ids, so a marketing visit does not stitch to the signup that follows it.


## Purpose / Big Picture

A visitor who reads `www.example.com/pricing`, clicks "Start free trial", signs up on
`app.example.com` and is identified there will be one person in Kansoku, with the pricing
page view attributed to them. Two mechanisms make that true. For sibling subdomains, the SDK
already has a cookie storage adapter that can hold the anonymous id on the parent domain; this
plan documents it as the recommended setup, proves it in a real browser, and makes sure
every identity-bearing key travels with it. For links between unrelated sites (or where
cookies are not wanted), a link helper carries the anonymous id in the URL and the
receiving page adopts it or records it as a second cookie signal, so the server's identity
evidence links both ids when the user identifies.


## Progress

- [ ] M1: The "one account, several properties" guide documents `storage: "cookie"` with `cookieDomain`, and a Chromium smoke test across two subdomains shows one anonymous id and one session on both.
- [ ] M2: `linkTo(url)` and the start-up handoff adopt or record an incoming anonymous id with the parameter stripped from the address bar, covered by unit tests and the smoke test.
- [ ] M3: A live conformance test proves that a marketing-origin page view followed by an app-origin identify resolves to one canonical user through the server's funnel endpoint.


## Surprises & Discoveries

(None yet.)


## Decision Log

- Decision: Parent-domain cookies are the recommended mechanism for subdomains; the URL
  handoff is for cross-site links and cookie-free deployments.
  Rationale: The cookie adapter exists and shares every identity key; a URL parameter is
  visible in history and referrers and should be the exception.
  Date: 2026-10-15
- Decision: On arrival with an incoming id, adopt it as the anonymous id when the receiving
  origin has no persisted identity; otherwise keep the local anonymous id and store the incoming
  value as the `cookie` entry of `identifiers`.
  Rationale: Two anonymous ids cannot be aliased without a user, but the server binds every
  entry of `identifiers` to the user on identify (`mori://shinzui/kansoku/okf/adrs/concepts/ADR-5`),
  so recording the marketing-site id as a second cookie signal links both histories the moment
  the user identifies, without discarding events already recorded under the local id.
  Date: 2026-10-15
- Decision: The parameter name is `kansoku_aid`, values are validated with the same rules as
  identifier values (1 to 256 printable non-space ASCII characters), and the parameter is
  removed from the address bar after reading unless `crossOriginLink.stripParam` is false.
  Rationale: Validation keeps a crafted link from injecting arbitrary strings into identity
  evidence; stripping keeps the id out of bookmarks and copied links.
  Date: 2026-10-15


## Outcomes & Retrospective

(To be filled during and after implementation.)


## Context and Orientation

`kansoku-js` (`packages/kansoku-js`) persists identity through a storage adapter chosen in
`createKansoku` options: `storage` is `"localStorage"` (default), `"cookie"`, `"memory"` or
a custom adapter, and `cookieDomain` scopes the cookie adapter
(`packages/kansoku-js/src/types.ts`, `resolveStorage` in `packages/kansoku-js/src/storage.ts`,
wired at `packages/kansoku-js/src/client.ts` line 87). `cookieStorage({ domain })` writes
`Path=/; SameSite=Lax; Secure` on HTTPS with a 400-day maximum lifetime, degrading to memory
when cookies are unavailable. `createIdentity` in `packages/kansoku-js/src/identity.ts`
reads or creates `<prefix>.anonymous_id` and persists `user_id`, `organization_id` and
`identifiers` through the same adapter; `createSession` in `session.ts` persists the session
record there too; the delivery queue mirror always uses per-tab sessionStorage
([ADR 3](../adr/0003-identity-and-session-persistence.md)). None of the guides under
`docs/guides/` mention `cookieDomain` or the subdomain case, and the examples under
`examples/` use the default localStorage adapter.

Attribution already reads `location.search` once per page view (`attribution.ts`), and
`navigation.ts` wraps `history.replaceState` for SPA navigation; the handoff must read the
parameter before attribution captures the URL and must call the original `replaceState`
without emitting a navigation page view. Identifier validation lives in
`packages/kansoku-js/src/contract/validate.ts`. The server treats the top-level
`anonymousId` as the implicit `cookie` signal and binds every `identifiers` entry to the
user on an event carrying `userId`; the vocabulary is `cookie`, `device`, `fingerprint`,
`email_sha256` (`mori://shinzui/kansoku/okf/adrs/concepts/ADR-5`). Browser checks run with
Playwright under `test/smoke/` (`just test-smoke`), opt-in server conformance under
`test/live/` (`just test-live`, configured by `KANSOKU_LIVE_*` variables), and unit tests with
`just test`; `just check` runs typecheck, lint, format, SSR smoke, contract, package, size and
ADR checks.

An "origin" is scheme plus host plus port; `www.example.com` and `app.example.com` are
different origins but share the registrable domain `example.com`, which is what a cookie with
`Domain=.example.com` is scoped to. Chromium accepts `--host-resolver-rules` at launch, which
lets a test map `www.example.test` and `app.example.test` to the local Vite server without
touching the hosts file.


## Plan of Work

### M1: Document and prove the parent-domain cookie setup

Add `docs/guides/cross-origin-identity.md` (and link it from `docs/README.md` and
`getting-started.md`): why one Kansoku account should hold both properties, the
configuration `createKansoku({ …, sourceService: "marketing-site", storage: "cookie", cookieDomain: ".example.com" })`
on every property, what travels in the cookie (anonymous id, user id, organisation id,
identifiers, session, opt-out) and what does not (the per-tab queue), the cookie attributes
and lifetime, the consent note (a first-party identifier cookie; `respectGlobalPrivacyControl`
and `respectDoNotTrack` apply unchanged), and the server-side pairing with
`filter=source_service:eq:…` and `groupBy=host` once
`mori://shinzui/kansoku/plans/31-metric-property-filters-and-dual-grouping` lands. Review
`cookieStorage` for the case where `cookieDomain` is set but the current host is not under it
(the browser silently drops the cookie): detect it and fall back to localStorage with a
`debug` warning. Add a smoke test that launches Chromium with host-resolver rules, loads the
vanilla example on `www.example.test`, then on `app.example.test`, and asserts both pages
report the same anonymous id and session id through the example's stats panel.

### M2: Link handoff

Add `linkTo(url: string | URL): string` to the client, appending `kansoku_aid=<anonymousId>`
to the given URL, and a `crossOriginLink` option `{ accept?: boolean; stripParam?: boolean }`
(both default true). During `createKansoku` start-up, before attribution reads the URL, read
`kansoku_aid`; if `accept` is true and the value validates, apply the Decision Log rule
through `createIdentity` (a new `adoptAnonymousId` for the fresh case, `setIdentifiers` with
`cookie` for the other) and, if `stripParam` is true, rewrite the address with the original
`history.replaceState` so no page view is emitted. Export `linkTo` from `kansoku-react`'s
`useKansoku()` as well. Extend the smoke test with a cross-site hop between
`www.example.test` and `app.another.test` without cookies, asserting adoption on a fresh
profile and the `identifiers.cookie` path on a profile that already has an id.

### M3: Live conformance

Under `test/live/`, add a test that posts a `page_view` under anonymous id A from
`sourceService: "marketing-site"`, then an `identify` with `userId: U` and
`identifiers: { cookie: A }` from `sourceService: "app"` under anonymous id B, then queries
`GET /metrics/funnel?steps=page_view,identify` for the window and asserts one user completed
both steps. Skip when `KANSOKU_LIVE_SERVICE_TOKEN` is unset, as the other live tests do.


## Concrete Steps

```bash
nix develop
just install
just check
just test
just test-smoke
KANSOKU_LIVE_BASE_URL=http://localhost:8080 KANSOKU_LIVE_WRITE_KEY=... KANSOKU_LIVE_SERVICE_TOKEN=... just test-live
```

Expected: the smoke suite prints the shared anonymous id for both subdomain pages, the
cross-site cases pass on fresh and pre-seeded profiles, and the live funnel test reports two
steps with one user.


## Validation and Acceptance

1. M1: with `cookieDomain: ".example.test"`, two subdomains show one anonymous id and one
   session; with a mismatched `cookieDomain`, the SDK falls back to localStorage and logs a
   debug warning; the guide exists and is linked.
2. M2: `linkTo("https://app.example.test/signup")` returns the URL with `kansoku_aid`; a fresh
   profile adopts the id; a seeded profile keeps its id and records `identifiers.cookie`;
   an invalid value is ignored; the parameter is gone from `location.search` before the first
   page view is captured, and no extra page view is emitted.
3. M3: the live funnel count is one user at both steps.
4. `just check` passes, including the size budget and ADR validation.


## Idempotence and Recovery

Documentation and additive options; defaults preserve current behaviour (`accept` applies
only when the parameter is present). Removing `crossOriginLink` support leaves cookies as the
mechanism. No server change is required.


## Interfaces and Dependencies

No local hard dependencies. Soft dependency on the server's
`mori://shinzui/kansoku/plans/31-metric-property-filters-and-dual-grouping` for the
`source_service` and `host` query dimensions referenced in the guide. Claims the `kansoku_aid`
parameter name, the `crossOriginLink` option and the `linkTo` export. Update
[ADR 3](../adr/0003-identity-and-session-persistence.md) with the cross-origin rules
(parent-domain cookie recommendation, handoff adoption rule, parameter validation) following
`agents/skills/exec-plan/ADR.md` and run `just adr-check`.

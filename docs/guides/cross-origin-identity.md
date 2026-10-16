# One account across several properties

Use the same Kansoku account, public write-key scope and storage prefix for related properties.
Account membership alone does not join anonymous browsers on different origins. The server
resolves evidence; the SDK must first carry an identifier between the properties.

For sibling subdomains, configure parent-domain cookies on every property:

```typescript
const analytics = createKansoku({
  baseUrl: "https://analytics.example.com",
  writeKey: "ksk_w_public_write_key",
  sourceService: "marketing-site", // use "app" on the application
  storage: "cookie",
  cookieDomain: ".example.com",
})
```

The anonymous ID, user, organization, mapped identifiers, producer session, opt-out and exposure
state use that adapter/prefix. Pending events remain in each tab's sessionStorage. Cookies use
Path=/, SameSite=Lax, Secure on HTTPS and at most 400 days. The SDK verifies cookie writes;
blocked cookies or a mismatched domain use memory, with a redacted diagnostic in debug mode.
This fallback never switches to localStorage. Memory fallback cannot share state across origins.

Already-open clients reread shared identity and opt-out before new capture. Reset on one property
clears user/organization/signals and rotates shared anonymous/session IDs; subsequent captures
on its sibling use that state. Queued events retain their original attribution. Observing shared
opt-out drops that tab's pending events. Application authentication/logout remains the application's
responsibility; an analytics identifier is not an authorization credential.

A shared producer session ID does not merge server sessions across sourceService values.
Server session keys include account/source_service/session_id. Use a JSON source filter for
property-specific reporting, for example:

```json
{ "dimension": "source_service", "op": "eq", "value": "marketing-site" }
```

## Explicit links between unrelated sites

Enable only the receiving sites you intend to decorate:

```typescript
const marketing = createKansoku({
  baseUrl,
  writeKey,
  crossOriginLink: { allowedOrigins: ["https://app.another.example"] },
})
const href = marketing.linkTo("https://app.another.example/signup?campaign=launch")
```

The receiving application opts in before start/page capture:

```typescript
const app = createKansoku({
  baseUrl,
  writeKey,
  crossOriginLink: {
    accept: true,
    allowedOrigins: ["https://www.example.com"],
  },
})
```

`allowedOrigins` contains exact HTTP(S) origins, including a nondefault port. Paths, wildcards,
credentials and non-HTTP schemes are not supported configuration. `linkTo` decorates only an
allowlisted cross-origin HTTP(S) destination while the client is started and privacy permits
capture. It removes stale kansoku_aid parameters before considering a new one. React exposes the
same method through useKansoku(). Acceptance defaults false.

At first start, the client always removes incoming kansoku_aid parameters from the address bar
before attribution. Exactly one valid printable ASCII value can be accepted. A fresh identity
adopts it. An existing logged-out identity keeps its own anonymous ID and adds the incoming
cookie signal, preserving other mapped identifiers. A different existing cookie signal wins.
An already-identified recipient ignores the incoming identity. Duplicate/invalid parameters,
opt-out, requested GPC/DNT suppression and disabled acceptance also prevent import.

Later identify/identifyOnce supplies the user binding; handoff alone does not merge two anonymous
histories or resolve conflicting evidence. Forwarded/stale links are replayable and must never
be treated as login. The parameter reaches the destination's initial HTTP request before JavaScript
can strip it and may reach access logs/history or referrers. Use a restrictive policy such as
Referrer-Policy: no-referrer in the site and redact URLs where needed; stripping cannot recall
an initial request. first-party identifiers and explicit handoff should follow the application's
consent/privacy policy. Existing opt-out/GPC/DNT and beforeSend gates apply.

The server identity and session boundaries are recorded in
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-5` and
`mori://shinzui/kansoku/okf/adrs/concepts/ADR-13`.

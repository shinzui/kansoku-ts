# Kansoku browser SDKs

`kansoku-js` records page views, sessions, identity and experiment exposure and delivers
events to a self-hosted Kansoku server. `kansoku-react` supplies a provider and hooks.
Both packages are ESM-only, typed and have zero runtime dependencies.

The first npm release is being prepared. Try the built packages through the workspace:

```bash
nix develop
just install
just dev-vanilla
# or: just dev-react
```

Set the example's `.env.local` from `.env.example` first. Use a public write key;
keep metrics service tokens out of browser bundles.

[Get started](docs/guides/getting-started.md) · [React](docs/guides/react.md) ·
[Delivery and privacy](docs/guides/delivery-and-privacy.md) · [Documentation](docs/README.md)

Run `just check` and `just test` for local verification, `just test-smoke` for Chromium
(install it once using `node node_modules/@playwright/test/cli.js install chromium`),
and `just test-live` for opt-in server conformance. Tests skip live checks when unconfigured.

[Cross-origin identity and shared properties](docs/guides/cross-origin-identity.md).

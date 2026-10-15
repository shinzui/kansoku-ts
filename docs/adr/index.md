---
okf_version: "0.2"
---

# Files

- [profile.dhall](profile.dhall)

# Architecture Decision Record

- [Vendor Kansoku contracts at a pinned commit](0001-vendor-kansoku-contracts-at-a-pinned-commit.md) - Generate SDK wire types from committed server contracts and refresh their source pin explicitly.
- [Delivery semantics and exit transport](0002-delivery-semantics-and-exit-transport.md) - Share one batch delivery engine with bounded retries, loss accounting and a reversible capture lifecycle.
- [Identity and session persistence](0003-identity-and-session-persistence.md) - Share browser identity through an adapter while keeping the pending delivery queue in per-tab storage.
- [Browser capture defaults](0004-browser-capture-defaults.md) - Capture page views and session starts through the shared delivery engine with explicit privacy gates and lifecycle ownership.
- [React binding boundary](0005-react-binding-boundary.md) - Keep React bindings thin and drive owned clients through reversible effects with a no-op server-rendering path.
- [Two browser packages and ESM distribution](0006-two-browser-packages-and-esm-distribution.md) - Publish a dependency-free browser SDK and a thin React binding as one ESM build each.
- [Lockstep versioning and trusted publishing](0007-lockstep-versioning-and-trusted-publishing.md) - Prepare both packages as a fixed release group with tokenless publishing gated on maintainer release decisions.

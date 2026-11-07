# Bundle Update Log

## 2026-11-07

- **Addition**: FRIC-3 records detour tooling friction with https://github.com/actions/setup-node: setup-node token configuration prevents OIDC publishing
- **Update**: FRIC-2 resolved: Resolve the release PR policy block after observing a successful Changesets workflow.
- **Addition**: FRIC-2 records detour environment friction with https://github.com/shinzui/kansoku-ts: Repository policy blocks Changesets release PR creation

## 2026-11-06

- **Update**: FRIC-1 resolved: Resolve the capture-suite isolation failure with explicit per-file cleanup.
- **Addition**: FRIC-1 records detour tooling friction with mori://shinzui/kansoku-ts: Shared test helper cleanup is scoped to its first importer
- **Adoption**: Adopt the `friction-log` profile (`coordination.frictionLog`) from https://raw.githubusercontent.com/shinzui/okf-profiles/v0.23.0/package.dhall.

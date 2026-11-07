---
type: Friction Entry
title: "setup-node token configuration prevents OIDC publishing"
description: "The release workflow reached npm publishing but setup-node registry configuration injected a placeholder token and npm rejected publication with E404."
generated:
  by: "codex-cli/gpt-6.1-sol"
  at: "2026-11-07T22:24:27Z"
frictionId: FRIC-3
status: logged
impact: detour
kind: tooling
origin: "mori://shinzui/kansoku-ts"
affects: "https://github.com/actions/setup-node"
plan: "docs/plans/6-release-engineering-package-checks-size-budget-docs-and-trusted-publishing.md"
workaround: "Remove setup-node registry-url so it does not configure placeholder token authentication, verify the npm runtime inside nix develop, and retry the workflow."
---

# setup-node token configuration prevents OIDC publishing

## Attempted

Publish kansoku-js and kansoku-react 0.1.1 through release workflow run 42420176998.

## Encountered

All package checks passed, but npm PUT for kansoku-js returned E404 with NODE_AUTH_TOKEN set to the setup-node placeholder.

```text
NODE_AUTH_TOKEN: XXXXX-XXXXX-XXXXX-XXXXX; E404: Not Found - PUT https://registry.npmjs.org/kansoku-js
```

## Workaround

Remove setup-node registry-url so it does not configure placeholder token authentication, verify the npm runtime inside nix develop, and retry the workflow.

---
type: Friction Entry
title: "setup-node token configuration prevents OIDC publishing"
description: "The release workflow reached npm publishing but setup-node registry configuration injected a placeholder token and npm rejected publication with E404."
generated:
  by: "codex-cli/gpt-6.1-sol"
  at: "2026-11-07T22:24:27Z"
frictionId: FRIC-3
status: "resolved"
impact: detour
kind: tooling
origin: "mori://shinzui/kansoku-ts"
affects: "https://github.com/actions/setup-node"
plan: "docs/plans/6-release-engineering-package-checks-size-budget-docs-and-trusted-publishing.md"
workaround: "Inspect trust separately for each npm package, register the missing kansoku-js publisher, and publish through the corrected OIDC workflow."
resolution: "Authenticated inspection found no kansoku-js publisher; registering it allowed workflow 42425302058 to publish both packages successfully. The title records an initial token-configuration suspicion that was not confirmed as the root cause."
amended:
  - by: "codex-cli/gpt-6.1-sol"
    at: "2026-11-07T23:30:42Z"
    change: "Resolve publication authorization after diagnosing missing per-package trust and observing successful GitHub publication."
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

## Diagnosis correction

The title records the initial suspicion. Removing setup-node token configuration did not
resolve publication. Authenticated inspection subsequently confirmed that kansoku-js had
no trusted publisher configured. Registering each package separately is required; the
placeholder token was not established as the cause of the authorization failure.

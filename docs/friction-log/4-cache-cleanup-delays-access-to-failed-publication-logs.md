---
type: Friction Entry
title: "Cache cleanup delays access to failed publication logs"
description: "The release job remained in magic-nix-cache-action cleanup for several minutes after npm failure, preventing retrieval of completed OIDC diagnostics."
generated:
  by: "codex-cli/gpt-6.1-sol"
  at: "2026-11-07T22:35:20Z"
frictionId: FRIC-4
status: "resolved"
impact: detour
kind: tooling
origin: "mori://shinzui/kansoku-ts"
affects: "https://github.com/DeterminateSystems/magic-nix-cache-action"
plan: "docs/plans/6-release-engineering-package-checks-size-budget-docs-and-trusted-publishing.md"
workaround: "Retain GitHub Actions caching with use-gha-cache enabled and use-flakehub disabled."
resolution: "Release workflow explicitly enables GitHub caching and disables the unused FlakeHub backend; run 42425302058 finished successfully, including cache cleanup. Removing caching entirely was rejected after a slow cold validator build."
amended:
  - by: "codex-cli/gpt-6.1-sol"
    at: "2026-11-07T23:30:43Z"
    change: "Resolve cache cleanup friction with explicit backend configuration and successful end-to-end workflow evidence."
---

# Cache cleanup delays access to failed publication logs

## Attempted

Read completed npm OIDC diagnostics from workflow run 42420863425.

## Encountered

GitHub refused to provide logs while post-action cache cleanup kept the failed job running.

```text
Publish and diagnostic steps completed; Post Run DeterminateSystems/magic-nix-cache-action@v13 remained in_progress.
```

## Workaround

Cancel the already-failed workflow during cache cleanup to make its completed diagnostic logs available.

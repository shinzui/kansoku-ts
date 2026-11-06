---
type: Friction Entry
title: "Shared test helper cleanup is scoped to its first importer"
description: "Bun test cached the capture helper hook in its first importing file, leaving later capture clients active between tests."
generated:
  by: "codex-cli/gpt-6.1-sol"
  at: "2026-11-06T15:23:27Z"
frictionId: FRIC-1
status: "resolved"
impact: detour
kind: tooling
origin: "mori://shinzui/kansoku-ts"
affects: "mori://shinzui/kansoku-ts"
plan: "docs/plans/7-capture-client-errors-and-web-vitals-with-explicit-opt-in.md"
workaround: "Export cleanupCapture and register afterEach(cleanupCapture) explicitly in each new capture test file."
resolution: "The new error and vitals test files register exported cleanup explicitly, and the combined suite now passes."
amended:
  - by: "codex-cli/gpt-6.1-sol"
    at: "2026-11-06T15:24:26Z"
    change: "Resolve the capture-suite isolation failure with explicit per-file cleanup."
---

# Shared test helper cleanup is scoped to its first importer

## Attempted

Run nix develop -c just test after isolated capture suites passed.

## Encountered

Later error and React cases captured a recursive error from a previous fixture whose shutdown hook had not run.

```text
Isolated errors suite: 6 pass; combined suite: resource rejection and reset cases each received an extra recursive error.
```

## Workaround

Export cleanupCapture and register afterEach(cleanupCapture) explicitly in each new capture test file.

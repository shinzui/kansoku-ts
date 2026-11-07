---
type: Friction Entry
title: "Repository policy blocks Changesets release PR creation"
description: "GitHub Actions completed package checks but repository policy prevented the Changesets action from opening its version PR."
generated:
  by: "codex-cli/gpt-6.1-sol"
  at: "2026-11-07T22:16:41Z"
frictionId: FRIC-2
status: "resolved"
impact: detour
kind: environment
origin: "mori://shinzui/kansoku-ts"
affects: "https://github.com/shinzui/kansoku-ts"
plan: "docs/plans/6-release-engineering-package-checks-size-budget-docs-and-trusted-publishing.md"
workaround: "Enable Actions pull-request creation in repository workflow permissions, retain read-only defaults, and rerun the workflow."
resolution: "Repository Actions pull-request creation is enabled with read-only default permissions; release run 42419849099 succeeded and created version PR 1."
amended:
  - by: "codex-cli/gpt-6.1-sol"
    at: "2026-11-07T22:19:49Z"
    change: "Resolve the release PR policy block after observing a successful Changesets workflow."
---

# Repository policy blocks Changesets release PR creation

## Attempted

Run release.yml after the production JSX patch changeset reached master.

## Encountered

Changesets versioned both packages but could not create the version pull request.

```text
GitHub Actions is not permitted to create or approve pull requests. Run 42406855302.
```

## Workaround

Enable Actions pull-request creation in repository workflow permissions, retain read-only defaults, and rerun the workflow.

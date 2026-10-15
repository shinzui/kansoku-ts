---
type: Architecture Decision Record
title: Lockstep versioning and trusted publishing
description: Prepare both packages as a fixed release group with tokenless publishing gated on maintainer release decisions.
docId: ADR-7
status: Accepted
date: 2026-10-14
timestamp: 2026-10-15T04:18:00Z
generated:
  by: process:codex
  at: 2026-10-15T04:18:00Z
---

# Lockstep versioning and trusted publishing

## Context

The React binding peers on the browser package. npm publish does not rewrite workspace
ranges, and provenance/trusted publishing require npm rather than Bun's publisher.
The packages have not been published, and license/visibility decisions belong to the maintainer.

## Decision

Use a Changesets fixed group. Start manifests at 0.0.0 and prepare one minor changeset for
0.1.0. Read SDK version exports from package metadata so versioning cannot leave stale
constants. Keep the kansoku-js peer range literal and use workspace:* only for development.

Build and check packed tarballs before release. Use npm >=11.5.1 with GitHub OIDC and
id-token write permission. The workflow pins Changesets Action v2.1.2 at its release commit
and uses its renamed version-script, publish-script, commit-message and pr-title inputs.
It remains disabled unless KANSOKU_RELEASE_ENABLED is explicitly enabled after preconditions.
No token is stored by this project.

The maintainer chooses the license and repository visibility before publication. Automatic
provenance requires a public repository. If the repository stays private, the maintainer
must explicitly set KANSOKU_NPM_PROVENANCE=false and accept the absence of provenance.
The first publish is an interactive maintainer bootstrap; register trusted publishers for
shinzui/kansoku-ts, workflow release.yml, on both npm package settings pages afterward.

## Alternatives considered

Independent versions add a compatibility matrix. workspace peer ranges are not portable
through npm publish. A long-lived NPM_TOKEN adds secret management without a need. Enabling
automatic release before the first-publish decisions could publish an unlicensed artifact.

## Consequences

Both package versions and peer compatibility move together. Release automation is prepared
and locally reviewable but activation, license, visibility and first publish remain explicit
maintainer actions. No published version may be overwritten.

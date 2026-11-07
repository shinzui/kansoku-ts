---
okf_version: "0.2"
---

# Files

- [profile.dhall](profile.dhall)

# Friction Entry

- [Shared test helper cleanup is scoped to its first importer](1-shared-test-helper-cleanup-is-scoped-to-its-first-importer.md) - Bun test cached the capture helper hook in its first importing file, leaving later capture clients active between tests.
- [Repository policy blocks Changesets release PR creation](2-repository-policy-blocks-changesets-release-pr-creation.md) - GitHub Actions completed package checks but repository policy prevented the Changesets action from opening its version PR.
- [setup-node token configuration prevents OIDC publishing](3-setup-node-token-configuration-prevents-oidc-publishing.md) - The release workflow reached npm publishing but setup-node registry configuration injected a placeholder token and npm rejected publication with E404.
- [Cache cleanup delays access to failed publication logs](4-cache-cleanup-delays-access-to-failed-publication-logs.md) - The release job remained in magic-nix-cache-action cleanup for several minutes after npm failure, preventing retrieval of completed OIDC diagnostics.

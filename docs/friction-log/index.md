---
okf_version: "0.2"
---

# Files

- [profile.dhall](profile.dhall)

# Friction Entry

- [Shared test helper cleanup is scoped to its first importer](1-shared-test-helper-cleanup-is-scoped-to-its-first-importer.md) - Bun test cached the capture helper hook in its first importing file, leaving later capture clients active between tests.

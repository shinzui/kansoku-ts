---
okf_version: "0.2"
---

# Files

- [profile.dhall](profile.dhall)

# Bug Report

- [Bundling kansoku-js from source with bun 1.3.13 drops the entry module's named re-exports](bun-1-3-drops-entry-named-reexports.md) - With "sideEffects" false in packages/kansoku-js/package.json, bun 1.3.13 bundles src/index.ts into a 604-byte module whose export list names createKansoku and version but never defines them, and scripts/build.ts reports success on it.


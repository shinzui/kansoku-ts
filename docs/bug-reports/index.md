---
okf_version: "0.2"
---

# Files

- [profile.dhall](profile.dhall)

# Bug Report

- [Bundling kansoku-js from source with bun 1.3.13 drops the entry module's named re-exports](bun-1-3-drops-entry-named-reexports.md) - With "sideEffects" false in packages/kansoku-js/package.json, bun 1.3.13 bundles src/index.ts into a 604-byte module whose export list names createKansoku and version but never defines them, and scripts/build.ts reports success on it.
- [kansoku-react's published bundle uses the development JSX runtime, so KansokuProvider throws in production](kansoku-react-bundles-the-development-jsx-runtime.md) - kansoku-react 0.1.0's dist/index.js imports jsxDEV from react/jsx-dev-runtime, which React's production build exports as undefined, so rendering KansokuProvider under NODE_ENV=production throws "TypeError, w is not a function".
- [Importing anything from kansoku-react pulls the whole kansoku-js SDK into the importer's chunk](kansoku-react-pulls-the-whole-sdk-into-the-importer-s-chunk.md) - kansoku-react 0.1.0 is one bundled module that statically imports createKansoku for KansokuProvider, so an application that imports only KansokuContext or a hook still gets all of kansoku-js in its entry chunk, and its own dynamic import of kansoku-js no longer splits.

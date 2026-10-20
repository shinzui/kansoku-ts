---
type: Bug Report
title: Bundling kansoku-js from source with bun 1.3.13 drops the entry module's named re-exports
description: With "sideEffects" false in packages/kansoku-js/package.json, bun 1.3.13 bundles src/index.ts into a 604-byte module whose export list names createKansoku and version but never defines them, and scripts/build.ts reports success on it.
generated:
  by: process:claude-code
  at: "2026-10-20T21:15:00Z"
bugId: BUG-1
status: reported
severity: degraded
workaround: >-
  Build with bun 1.4.2, the version this repository's `nix develop` shell provides, which
  bundles all 24 modules; or bundle a one-line wrapper entry, `export * from
  ".../packages/kansoku-js/src/index.ts"`, which yields the same 14 exports; or remove
  "sideEffects": false from packages/kansoku-js/package.json before bundling. tan-ng-labs
  uses the wrapper and fails its image build unless the bundle imports with createKansoku
  defined as a function.
origin: mori://tan/tan-ng-labs/plans/2-deploy-kansoku-to-the-intranet-as-a-shared-analytics-service-for-nagare-apps
affects: mori://shinzui/kansoku-ts/packages/kansoku-js
affectedVersion: unreleased
environment: >-
  Source at 33d6ab8df99f7b4bb1eb5caca7df8a9c346966c6 and at df1269a
  (packages/kansoku-js/src/index.ts and package.json are identical between them). bun 1.3.13
  from the nixpkgs that mori://shinzui/kansoku's flake pins, on aarch64-darwin and
  x86_64-linux, inside and outside the Nix sandbox. bun 1.4.2 from this repository's
  `nix develop` shell does not reproduce it.
observed: >-
  `bun build packages/kansoku-js/src/index.ts --target=browser --format=esm --minify
  --outfile=out.js` prints "Bundled 4 modules" and writes 604 bytes: the contract constants
  and `export{K as version,j as createKansoku,...}` with `K` and `j` never defined.
  `bun scripts/build.ts packages/kansoku-js` writes a 684-byte dist/index.js of the same
  shape and prints its success line. Importing the file fails: Node reports
  `SyntaxError: Export 'K' is not defined in module`, bun an AggregateError. Deleting
  "sideEffects": false yields a correct 22,909-byte bundle; a wrapper entry that star
  re-exports index.ts yields the same; bundling src/client.ts directly yields 47 KB; bun 1.4.2
  bundles 24 modules into 22,912 bytes from the unmodified tree.
expected: >-
  One minified ESM bundle of the whole SDK with createKansoku and version defined, as ADR-6
  ("Build one minified ESM bundle ... Production distribution uses Bun minification") and
  packages/kansoku-js/README.md ("ESM with TypeScript declarations"; `import { createKansoku }
  from "kansoku-js"`) describe, and a build script that fails rather than reports success
  when the bundle is incomplete.
reproduction:
  - "Check out 33d6ab8 (or df1269a) and obtain bun 1.3.13 (for example `nix shell --inputs-from <a checkout of mori://shinzui/kansoku> nixpkgs#bun`); `bun --version` prints 1.3.13."
  - "Run `bun build packages/kansoku-js/src/index.ts --target=browser --format=esm --minify --outfile=/tmp/kansoku.js`."
  - "Observe `Bundled 4 modules` and a 604-byte file ending in `export{K as version,j as createKansoku,...}`; `grep -c function /tmp/kansoku.js` prints 0."
  - "Run `node --input-type=module -e 'await import(\"/tmp/kansoku.js\")'`; observe `SyntaxError: Export 'K' is not defined in module`."
  - "Run `bun scripts/build.ts packages/kansoku-js`; observe the success line `kansoku-js: dist/index.js, ...` and a 684-byte dist/index.js of the same shape."
  - "Delete the \"sideEffects\" key from packages/kansoku-js/package.json and repeat step 2; observe a 22,909-byte bundle that imports with createKansoku as a function. Restore the file and repeat step 2 under `nix develop` (bun 1.4.2); observe `Bundled 24 modules` and 22,912 bytes."
reviews:
  - kind: model
    reviewer: process:claude-code
    reviewed_at: "2026-10-20T21:15:00Z"
    document_timestamp: "2026-10-20T21:15:00Z"
    scope: content-and-metadata
    outcome: commented
    provider: anthropic
    model: claude-fable-5-1
    effort: unspecified
    context: >-
      Author review from the reproduction matrix run on 2026-10-20 (bun 1.3.13 through the
      CLI and through scripts/build.ts, bun 1.4.2 through the CLI, with and without
      "sideEffects", wrapper and direct entries). No independent verification attestation is
      claimed.
---

# Bundling kansoku-js from source with bun 1.3.13 drops the entry module's named re-exports

**Reported by:** a `claude-code` session implementing
`mori://tan/tan-ng-labs/plans/2-deploy-kansoku-to-the-intranet-as-a-shared-analytics-service-for-nagare-apps`,
which hosts the SDK first-party on the Nagare intranet from source at
`33d6ab8df99f7b4bb1eb5caca7df8a9c346966c6`. `packages/kansoku-js/src/index.ts` and
`packages/kansoku-js/package.json` are unchanged at `df1269a`, the default branch head on
2026-10-20.


## What happens

`packages/kansoku-js/src/index.ts` is four re-exports: `export { version } from
"./version.js"`, `export { createKansoku } from "./client.js"`, type-only re-exports, and
`export * from "./contract/events.js"`. `packages/kansoku-js/package.json` declares
`"sideEffects": false`.

With bun 1.3.13 the bundler keeps the `export *` target and the two generated constant modules
it imports (`Bundled 4 modules`), drops `client.ts` and `version.ts` with everything they
import, and still emits the entry's export list:

```text
export{K as version,j as createKansoku,e as SESSION_START,t as PAGE_VIEW,...}
```

`K` and `j` are never defined. The file is 604 bytes minified, or 684 bytes through the
repository's own `scripts/build.ts`, which prints `kansoku-js: dist/index.js, dist/index.js.map,
dist/index.d.ts` and exits 0. Node refuses the module with `SyntaxError: Export 'K' is not
defined in module`; bun throws an AggregateError. bun 1.4.2 bundles 24 modules into 22,912
bytes from the same tree.

| bun | entry | `sideEffects` | result |
| --- | --- | --- | --- |
| 1.3.13 CLI, `--minify` | `src/index.ts` | `false` | 604 bytes, exports undefined |
| 1.3.13 CLI, no minify | `src/index.ts` | `false` | 1,327 bytes, exports undefined |
| 1.3.13 `scripts/build.ts` (`Bun.build`) | `src/index.ts` | `false` | 684 bytes, exports undefined, exit 0 |
| 1.3.13 CLI | `src/index.ts` | key removed | 22,909 bytes, correct |
| 1.3.13 CLI | wrapper `export * from ".../src/index.ts"` | `false` | 22,909 bytes, correct, 14 exports |
| 1.3.13 CLI | entry importing then re-exporting `createKansoku` | `false` | 604 bytes, exports undefined |
| 1.3.13 CLI | `export { createKansoku } from "./client.ts"` (`.ts` or no suffix) | `false` | 604 bytes, exports undefined |
| 1.3.13 CLI | `src/client.ts` | `false` | 47,244 bytes, correct |
| 1.4.2 CLI, `--minify` | `src/index.ts` | `false` | 22,912 bytes, correct, 24 modules |
| 1.4.2 `scripts/build.ts` | `src/index.ts` | `false` | 22,992 bytes, correct |


## Why it matters

- The repository's build does not fail on the broken artifact. `just build` runs
  `scripts/build.ts`, which checks `result.success` from `Bun.build` and then runs `tsc`;
  neither sees anything wrong. `just check` runs `check-packages` (publint, attw) and
  `check-size`, which inspect declarations and byte budgets, not whether `dist/index.js`
  imports. `packages/kansoku-js/scripts/smoke.ts` imports `dist/index.js` and would throw,
  but it is not part of `check` or `ci`. A bun downgrade in the dev shell, or a consumer's
  older bun, therefore ships an SDK that cannot be imported, with a green build.
- Bundling from source is the only consumption path today: `docs/guides/getting-started.md`
  says `bun add kansoku-js` applies "after npm publication". The intranet's SDK host builds
  from the pinned source with the bun of `mori://shinzui/kansoku`'s nixpkgs, which is 1.3.13,
  and shipped a 604-byte `kansoku.js` on the first attempt.


## Analysis

- The trigger is the combination of `"sideEffects": false` and named `export { x } from`
  statements in the entry module. Without the key, or with a star re-export (even a wrapper
  whose only statement is `export * from ".../src/index.ts"`), the bundle is complete. The
  entry's named re-exports appear to be treated as references into a side-effect-free module
  that tree shaking then removes, without the rule that an exported binding keeps its module.
- bun 1.4.2 is not affected, so bun may already carry the fix. Only 1.3.13 and 1.4.2 were
  tried; the affected range is not established.
- No matching upstream report was found. A search for bun issues about `sideEffects: false`
  with dropped named re-exports returned nothing for 1.3.x; the nearest is
  [oven-sh/bun#5344](https://github.com/oven-sh/bun/issues/5344) (2023, duplicated exports
  when one entry re-exports another), a different symptom.


## Suggested fixes, for the owner to decide

1. Make the build refuse an incomplete bundle whatever bun produced it: run
   `packages/kansoku-js/scripts/smoke.ts`, or an import of `dist/index.js` that checks
   `typeof createKansoku === "function"`, in `just check`.
2. State the minimum bun version the build is known to work with, in `scripts/build.ts` or
   `package.json` `engines.bun`, since the dev shell already pins 1.4.2 and consumers
   bundling from source have no other signal.
3. Optionally make `index.ts` robust to older bundlers: define or import the public bindings
   in the entry and export them, or re-export with `export *`, instead of bare
   `export { name } from` statements under `"sideEffects": false`.


## Workaround

Build with bun 1.4.2 (`nix develop`); or bundle a wrapper entry that star re-exports
`src/index.ts`; or drop `"sideEffects": false` before bundling. tan-ng-labs uses the wrapper and
fails its image build unless the bundle imports with `createKansoku` defined
(`apps/kansoku/flake.nix` in `mori://tan/tan-ng-labs`).

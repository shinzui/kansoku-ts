# Bundle Update Log

## 2026-11-07

- **Update**: BUG-2: record released fix in 0.1.1, verified from the npm distribution in production.
- **Update**: BUG-2: Fix production JSX compilation and add a built-provider smoke
- **Addition**: Record BUG-2 and BUG-3 from `mori://tan/tan-ng-labs/plans/17-replace-the-portal-s-vendored-kansoku-sdk-with-the-published-npm-packages`. BUG-2: kansoku-react 0.1.0's `dist/index.js` imports `jsxDEV` from `react/jsx-dev-runtime`, which React's production build exports as undefined, so `KansokuProvider` throws `TypeError: w is not a function` under `NODE_ENV=production`. BUG-3: the same single-module bundle statically imports `createKansoku`, so importing only `KansokuContext` puts all of kansoku-js in the importer's entry chunk and stops its own `import("kansoku-js")` from splitting.

## 2026-10-20

- **Update**: BUG-1 is fixed: builds require bun \>=1.4.2, scripts/build.ts refuses older bun and verifies bundle exports, and `just check` runs the kansoku-js package smoke (docs/plans/9-guard-sdk-builds-against-incomplete-bundles-and-require-bun-1-4-2.md).
- **Addition**: Create the Bug Report bundle on the `coordination.bugReports` profile from okf-profiles v0.22.0 and record BUG-1 from `mori://tan/tan-ng-labs/plans/2-deploy-kansoku-to-the-intranet-as-a-shared-analytics-service-for-nagare-apps`: bun 1.3.13 drops the entry module's named re-exports under `"sideEffects": false`, leaving a kansoku-js bundle that cannot be imported while `scripts/build.ts` reports success; bun 1.4.2 is not affected.

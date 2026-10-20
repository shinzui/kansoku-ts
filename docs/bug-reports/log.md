# Bundle Update Log

## 2026-10-20

- **Update**: BUG-1 is fixed: builds require bun >=1.4.2, scripts/build.ts refuses older bun and verifies bundle exports, and `just check` runs the kansoku-js package smoke (docs/plans/9-guard-sdk-builds-against-incomplete-bundles-and-require-bun-1-4-2.md).
- **Addition**: Create the Bug Report bundle on the `coordination.bugReports` profile from okf-profiles v0.22.0 and record BUG-1 from `mori://tan/tan-ng-labs/plans/2-deploy-kansoku-to-the-intranet-as-a-shared-analytics-service-for-nagare-apps`: bun 1.3.13 drops the entry module's named re-exports under `"sideEffects": false`, leaving a kansoku-js bundle that cannot be imported while `scripts/build.ts` reports success; bun 1.4.2 is not affected.

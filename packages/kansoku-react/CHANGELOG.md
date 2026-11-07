# kansoku-react

## 0.1.1

### Patch Changes

- 68a2e57: Fix KansokuProvider crashing in production by compiling the package with the production JSX runtime.
- kansoku-js@0.1.1

## 0.1.0

### Minor Changes

- b1c1458: Initial browser SDK: page views with navigation and attribution capture, session
  and identity helpers (including set-once traits and keyed email), experiment exposure,
  bounded persistent batching with retries, and lifecycle-safe beacon/keepalive exit delivery
  with `page_leave`. Cross-origin identity via parent-domain cookies and `linkTo` handoff,
  configurable bot flagging, and opt-in client error and web vitals capture (measurement code
  loads on demand). React provider and hooks support StrictMode and server rendering.

### Patch Changes

- Updated dependencies [b1c1458]
  - kansoku-js@0.1.0

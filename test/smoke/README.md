# Browser smoke tests

Run `node node_modules/@playwright/test/cli.js install chromium` once, then `just test-smoke`.
The tests consume built SDK exports through the Vite examples. A real local HTTP mock on
port 4180 receives batches, including requests sent after the page leaves. Ports 4173 and
4174 serve the vanilla build and React development example. No Kansoku credentials are needed.

The vanilla test puts a CTA event in sessionStorage and navigates away before the interval
flush. The HTTP mock must receive it after navigation, and reopening the same tab must not
create a second event ID. The page may disappear before its acknowledgement handler runs;
in that case reload retries the same ID and a normal acknowledgement clears the mirror.
Disabling exit listeners must fail the pre-reload receipt assertion. The React test runs development
StrictMode and React Router without explicit page-view hooks.

For a manual Chrome check, configure an example against a local server, run
`just dev-vanilla`, open DevTools Network and enable Preserve log. Filter on `batch`,
navigate Pricing and Docs, flush, then click Track CTA and immediately leave the page.
The last batch should receive 202. Return in the same tab, flush and check Application →
Session Storage → `kansoku.queue` is `[]` and the CTA was not replayed.

The `.pw.ts` suffix keeps Playwright tests separate from Bun's automatic unit-test discovery.

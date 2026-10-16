// Required browser consumer for mori://shinzui/kansoku/plans/39-beacon-ingest-route-for-page-exit-delivery.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import type { ServerResponse } from "node:http"

import { chromium } from "@playwright/test"
import type { Page } from "@playwright/test"

import type { KansokuClient, KansokuOptions } from "../packages/kansoku-js/src/types.js"

declare global {
  interface Window {
    sdk: { createKansoku(options: KansokuOptions): KansokuClient }
    client: KansokuClient
    beaconResults: boolean[]
    fallbackAttempts: number
    saved: string
  }
}
const base = process.env.KANSOKU_BEACON_BASE_URL
const key = process.env.KANSOKU_BEACON_WRITE_KEY
const service = process.env.KANSOKU_BEACON_SERVICE_TOKEN
const origin = process.env.KANSOKU_BROWSER_ORIGIN
const denied = process.env.KANSOKU_BROWSER_DENIED_ORIGIN
assert(
  base && key && service && origin && denied,
  "required owned browser fixture environment is missing",
)
const bundle = await readFile("packages/kansoku-js/dist/index.js")
const held: ServerResponse[] = []
const servers = [origin, denied].map(() =>
  createServer(async (request, response) => {
    if (request.url === "/sdk.js") {
      response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle)
      return
    }
    if (request.url === "/hold") {
      for await (const _ of request) {
      }
      held.push(response)
      return
    }
    if (request.url?.startsWith("/v1/")) {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const headers = new Headers()
      for (const name of [
        "content-type",
        "origin",
        "x-api-key",
        "authorization",
        "access-control-request-method",
        "access-control-request-headers",
      ]) {
        const value = request.headers[name]
        if (typeof value === "string") headers.set(name, value)
      }
      const upstream = await fetch(base + request.url, {
        method: request.method ?? "POST",
        headers,
        body: Buffer.concat(chunks),
      })
      response
        .writeHead(upstream.status, Object.fromEntries(upstream.headers))
        .end(Buffer.from(await upstream.arrayBuffer()))
      return
    }
    response
      .writeHead(200, { "Content-Type": "text/html", "Cache-Control": "max-age=60" })
      .end(
        request.url === "/away"
          ? "<p>away</p>"
          : '<!doctype html><title>Beacon fixture</title><script type="module">import * as sdk from "/sdk.js"; window.sdk=sdk;</script>',
      )
  }),
)
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  ignoreDefaultArgs: ["--disable-back-forward-cache"],
})
const context = await browser.newContext()
let cases = 0
const markers: string[] = []
const marker = () => "beacon_" + crypto.randomUUID().replaceAll("-", "")
async function setup(
  page: Page,
  host = origin!,
  endpoint = base!,
  extra: Pick<KansokuOptions, "autocapture"> = {},
) {
  await page.goto(host)
  await page.waitForFunction(() => Boolean(window.sdk))
  await page.evaluate(
    ({ endpoint, key, extra }) => {
      const original = navigator.sendBeacon.bind(navigator)
      window.beaconResults = []
      window.fallbackAttempts = 0
      navigator.sendBeacon = (url, body) => {
        const result = original(url, body)
        window.beaconResults.push(result)
        return result
      }
      const originalFetch = window.fetch.bind(window)
      window.fetch = ((url: RequestInfo | URL, init?: RequestInit) => {
        if (init?.keepalive) window.fallbackAttempts++
        return originalFetch(url, init)
      }) as typeof window.fetch
      window.client = window.sdk.createKansoku({
        baseUrl: endpoint,
        writeKey: key,
        exitTransport: "beacon",
        storage: "memory",
        persistQueue: true,
        storageKeyPrefix: crypto.randomUUID(),
        flushAt: 1000,
        flushIntervalMs: 3600000,
        autocapture: { pageViews: false, sessions: false },
        ...extra,
      })
    },
    { endpoint, key: key!, extra },
  )
}
async function exit(page: Page, name: string, body = "") {
  await page.evaluate(
    ({ name, body }) => {
      window.client.track(name, { body })
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }))
    },
    { name, body },
  )
}
async function count(name: string) {
  const day = new Date().toISOString().slice(0, 10),
    to = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const query = new URLSearchParams({
    from: day,
    to,
    filter: JSON.stringify({ dimension: "event_name", op: "eq", value: name }),
  })
  const response = await fetch(`${base}/metrics/events?${query}`, {
    headers: { Authorization: `Bearer ${service}` },
  })
  assert.equal(response.status, 200)
  const result = (await response.json()) as { points: Array<{ value: number }> }
  return result.points.reduce((sum, point) => sum + point.value, 0)
}
async function eventually(name: string, expected: number) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if ((await count(name)) === expected) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.equal(await count(name), expected, "stored event count")
}
try {
  for (let i = 0; i < servers.length; i++)
    await new Promise<void>((resolve, reject) => {
      servers[i]!.once("error", reject)
      servers[i]!.listen(Number(new URL([origin, denied][i]!).port), "127.0.0.1", resolve)
    })
  for (const sameOrigin of [false, true]) {
    const page = await context.newPage()
    const name = marker()
    markers.push(name)
    const beaconMethods: string[] = []
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/v1/beacon") beaconMethods.push(request.method())
    })
    await setup(page, origin, sameOrigin ? origin : base)
    const response = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/v1/beacon",
    )
    await exit(page, name)
    assert.equal((await response).status(), 202)
    assert.deepEqual(await page.evaluate(() => window.beaconResults), [true])
    assert.deepEqual(
      await page.evaluate(() => ({
        accepted: window.client.stats.accepted,
        queued: window.client.stats.queued,
      })),
      { accepted: 0, queued: 1 },
    )
    assert.deepEqual(beaconMethods, ["POST"], "text/plain beacon must not preflight")
    await eventually(name, 1)
    await page.evaluate(() => window.client.flush())
    await eventually(name, 1)
    await page.close()
    cases++
  }
  {
    const page = await context.newPage()
    const name = marker()
    await setup(page, denied)
    const response = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/v1/beacon",
    )
    await exit(page, name)
    assert.equal((await response).status(), 400)
    assert.deepEqual(await page.evaluate(() => window.beaconResults), [true])
    assert.equal(await count(name), 0)
    await page.close()
    cases++
  }
  {
    const page = await context.newPage()
    const name = marker()
    markers.push(name)
    await setup(page)
    // Fill the browser's actual shared keepalive allowance with another request.
    await page.evaluate(() => {
      void fetch("/hold", { method: "POST", body: "x".repeat(64000), keepalive: true })
    })
    await exit(page, name, "q".repeat(4096))
    assert.deepEqual(await page.evaluate(() => window.beaconResults), [false])
    assert.equal(await page.evaluate(() => window.fallbackAttempts), 2) // hold plus fallback
    assert.equal(await page.evaluate(() => window.client.stats.queued), 1)
    for (const response of held.splice(0)) response.end("released")
    await page.evaluate(() => window.client.flush())
    await eventually(name, 1)
    await page.close()
    cases++
  }
  {
    const page = await context.newPage()
    const name = marker()
    markers.push(name)
    await setup(page)
    await exit(page, name, "界".repeat(22000))
    assert.deepEqual(await page.evaluate(() => window.beaconResults), [])
    assert.equal(await page.evaluate(() => window.client.stats.queued), 1)
    await page.evaluate(() => window.client.flush())
    await eventually(name, 1)
    await page.close()
    cases++
  }
  {
    const page = await context.newPage()
    await setup(page, origin, base, { autocapture: { pageViews: true, sessions: false } })
    await page.evaluate(() => {
      window.saved = crypto.randomUUID()
      window.client.track("bfcache_fixture")
    })
    const session = await context.newCDPSession(page)
    await session.send("Page.enable")
    session.on("Page.backForwardCacheNotUsed", (event) =>
      console.log("BFCache CDP", JSON.stringify(event)),
    )
    const saved = await page.evaluate(() => window.saved)
    await page.goto(origin + "/away")
    await page.goBack({ waitUntil: "commit" })
    if ((await page.evaluate(() => window.saved)) !== saved)
      console.log(
        "BFCache diagnostic",
        await page.evaluate(() =>
          JSON.stringify(
            (
              performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming & {
                notRestoredReasons?: unknown
              }
            ).notRestoredReasons,
          ),
        ),
      )
    assert.equal(
      await page.evaluate(() => window.saved),
      saved,
      "actual BFCache restoration must retain the document",
    )
    const restored = await page.evaluate(
      () =>
        JSON.parse(
          sessionStorage.getItem(`${window.client.config.storageKeyPrefix}.queue`) ?? "[]",
        ) as Array<{ eventName: string; eventId: string }>,
    )
    assert.equal(restored.filter((event) => event.eventName === "page_view").length, 2)
    assert.equal(restored.filter((event) => event.eventName === "page_leave").length, 1)
    assert.equal(new Set(restored.map((event) => event.eventId)).size, restored.length)
    await page.evaluate(() => window.client.flush())
    await page.close()
    cases++
  }
  assert.equal(cases, 6)
  console.log(JSON.stringify({ browser: "chromium", cases, skipped: 0, markers, result: "passed" }))
} finally {
  for (const response of held.splice(0)) response.end("cleanup")
  await context.close()
  await browser.close()
  for (const server of servers) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

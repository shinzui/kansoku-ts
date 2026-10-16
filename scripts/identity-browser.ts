// Required consumer of mori://shinzui/kansoku/plans/38-single-tenant-consumption-guide-for-dashboards-and-experiments.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"

import { chromium } from "@playwright/test"
import type { BrowserContext, Page } from "@playwright/test"

import type {
  AnalyticsEvent,
  KansokuClient,
  KansokuOptions,
} from "../packages/kansoku-js/src/types.js"

declare global {
  interface Window {
    sdk: { createKansoku(options: KansokuOptions): KansokuClient }
    client: KansokuClient
    records: AnalyticsEvent[]
  }
}
const base = process.env.KANSOKU_IDENTITY_BASE_URL,
  key = process.env.KANSOKU_IDENTITY_WRITE_KEY,
  service = process.env.KANSOKU_IDENTITY_SERVICE_TOKEN
const port = Number(process.env.KANSOKU_IDENTITY_BROWSER_PORT)
assert(base && key && service && port, "required owned identity browser fixture is missing")
const www = `http://www.example.test:${port}`,
  app = `http://app.example.test:${port}`,
  other = `http://app.another.test:${port}`
const bundle = await readFile("packages/kansoku-js/dist/index.js")
const server = createServer((request, response) => {
  if (request.url === "/sdk.js") {
    response.writeHead(200, { "Content-Type": "text/javascript" }).end(bundle)
    return
  }
  response
    .writeHead(200, { "Content-Type": "text/html", "Referrer-Policy": "no-referrer" })
    .end(
      '<!doctype html><title>Identity fixture</title><script type="module">import * as sdk from "/sdk.js";window.sdk=sdk;</script>',
    )
})
const human =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
const browser = await chromium.launch({
  headless: true,
  channel: "chromium",
  args: [
    "--no-proxy-server",
    "--host-resolver-rules=MAP www.example.test 127.0.0.1,MAP app.example.test 127.0.0.1,MAP app.another.test 127.0.0.1",
  ],
})
const context = await browser.newContext({ userAgent: human })
let cases = 0
const unique = () => crypto.randomUUID().replaceAll("-", "")
interface Settings {
  sourceService: string
  storageKeyPrefix: string
  storage?: "memory" | "localStorage" | "cookie"
  cookieDomain?: string
  crossOriginLink?: { accept?: boolean; allowedOrigins: readonly string[] }
  autoPage?: boolean
  botDetection?: "flag" | "drop" | "off"
  debug?: boolean
  optOut?: boolean
  privacy?: "gpc" | "dnt"
}
async function setup(page: Page, url: string, settings: Settings) {
  await page.goto(url)
  await page.waitForFunction(() => Boolean(window.sdk))
  await page.evaluate(
    ({ base, key, settings }) => {
      window.records = []
      const fetch = window.fetch.bind(window)
      window.fetch = ((url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).startsWith(base) && init?.body)
          window.records.push(...JSON.parse(String(init.body)))
        return fetch(url, init)
      }) as typeof window.fetch
      if (settings.privacy)
        Object.defineProperty(
          navigator,
          settings.privacy === "gpc" ? "globalPrivacyControl" : "doNotTrack",
          { value: settings.privacy === "gpc" ? true : "1", configurable: true },
        )
      window.client = window.sdk.createKansoku({
        baseUrl: base,
        writeKey: key,
        storage: "localStorage",
        flushAt: 1000,
        flushIntervalMs: 3600000,
        ...settings,
        respectGlobalPrivacyControl: settings.privacy === "gpc",
        respectDoNotTrack: settings.privacy === "dnt",
        autocapture: { pageViews: settings.autoPage ?? false, sessions: false, pageLeave: false },
      })
    },
    { base: base!, key: key!, settings },
  )
}
async function pageEvent(page: Page) {
  await page.evaluate(async () => {
    window.client.page()
    await window.client.flush()
  })
}
async function identify(page: Page, user: string) {
  await page.evaluate(async (user) => {
    window.client.identify(user, { plan: "pro" })
    await window.client.flush()
  }, user)
}
async function metric(name: string, sources: string[], extra: Record<string, string> = {}) {
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10),
    to = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  const query = new URLSearchParams({
    from,
    to,
    filter: JSON.stringify({ dimension: "source_service", op: "in", value: sources }),
    ...extra,
  })
  const response = await fetch(`${base}/metrics/${name}?${query}`, {
    headers: { Authorization: `Bearer ${service}` },
  })
  assert.equal(response.status, 200)
  return (await response.json()) as {
    points: Array<{ value: number; group: Record<string, string | null> }>
  }
}
async function eventually(check: () => Promise<boolean>, label: string) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.equal(await check(), true, label)
}
async function funnel(sources: string[], expected: number, total: number) {
  await eventually(async () => {
    const answer = await metric("events", sources)
    return answer.points.reduce((sum, point) => sum + point.value, 0) === total
  }, "both sites' facts are projected before checking identity")
  const matches = async () => {
    const answer = await metric("funnel", sources, { steps: "page_view,identify", groupBy: "host" })
    const marketing = answer.points.filter((point) => point.group.host === new URL(www).hostname)
    return marketing.length === 2 && marketing[0]!.value === 1 && marketing[1]!.value === expected
  }
  await eventually(matches, "marketing-origin canonical funnel")
  if (expected === 0) {
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(await matches(), true)
  }
}

try {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, "127.0.0.1", resolve)
  })
  {
    const prefix = unique(),
      left = await context.newPage(),
      right = await context.newPage()
    const sources = [prefix + "_marketing", prefix + "_app"]
    await setup(left, www, {
      sourceService: sources[0]!,
      storageKeyPrefix: prefix,
      storage: "cookie",
      cookieDomain: ".example.test",
    })
    await setup(right, app, {
      sourceService: sources[1]!,
      storageKeyPrefix: prefix,
      storage: "cookie",
      cookieDomain: ".example.test",
    })
    assert.equal(
      await left.evaluate(() => window.client.getAnonymousId()),
      await right.evaluate(() => window.client.getAnonymousId()),
    )
    assert.equal(
      await left.evaluate(() => window.client.getSessionId()),
      await right.evaluate(() => window.client.getSessionId()),
    )
    await identify(left, "shared-" + prefix)
    await left.evaluate(() => {
      window.client.setIdentifiers({ device: "shared-device", email_hmac: "v1:opaque" })
      window.client.group("shared-org")
    })
    await pageEvent(left)
    await pageEvent(right)
    const before = await right.evaluate(() => window.records.at(-1))
    assert.equal(before?.userId, "shared-" + prefix)
    assert.deepEqual(before?.identifiers, { device: "shared-device", email_hmac: "v1:opaque" })
    assert.equal(before?.organizationId, "shared-org")
    await eventually(async () => {
      const answer = await metric("sessions", sources)
      return answer.points.reduce((sum, point) => sum + point.value, 0) === 2
    }, "source-scoped sessions")
    await left.evaluate(() => window.client.reset())
    await right.evaluate(async () => {
      window.client.track("after_reset")
      await window.client.flush()
    })
    const after = await right.evaluate(() => window.records.at(-1))
    assert.equal(after?.userId, undefined)
    assert.equal(after?.identifiers, undefined)
    assert.equal(after?.organizationId, undefined)
    assert.equal(after?.anonymousId, await left.evaluate(() => window.client.getAnonymousId()))
    assert.equal(after?.sessionId, await left.evaluate(() => window.client.getSessionId()))
    await right.evaluate(() => window.client.track("pending_private"))
    await left.evaluate(() => window.client.optOut())
    await right.evaluate(() => window.client.track("suppressed_private"))
    assert.equal(await right.evaluate(() => window.client.isOptedOut()), true)
    assert.equal(await right.evaluate(() => window.client.stats.queued), 0)
    await left.evaluate(() => window.client.optIn())
    assert.equal(await right.evaluate(() => window.client.isOptedOut()), false)
    await left.close()
    await right.close()
    cases++
  }
  for (const mode of ["fresh", "seeded", "authenticated", "conflicting"] as const) {
    const prefix = unique(),
      market = await context.newPage(),
      destination = await context.newPage()
    const sources = [prefix + "_marketing", prefix + "_app"]
    await setup(market, www, {
      sourceService: sources[0]!,
      storageKeyPrefix: prefix + "_market",
      storage: "memory",
      crossOriginLink: { allowedOrigins: [other] },
    })
    await pageEvent(market)
    let local: string | undefined
    if (mode !== "fresh") {
      await setup(destination, other, { sourceService: sources[1]!, storageKeyPrefix: prefix })
      local = await destination.evaluate(() => window.client.getAnonymousId())
      await destination.evaluate(() => window.client.setIdentifiers({ device: "preserved-device" }))
      if (mode === "authenticated") await identify(destination, "existing-" + prefix)
      if (mode === "conflicting")
        await destination.evaluate(() =>
          window.client.setIdentifiers({ device: "preserved-device", cookie: "existing-cookie" }),
        )
    }
    const incoming = await market.evaluate(() => window.client.getAnonymousId())
    const target = await market.evaluate(
      (url) => window.client.linkTo(url),
      other + "/signup?utm_source=cross_site",
    )
    await setup(destination, target, {
      sourceService: sources[1]!,
      storageKeyPrefix: prefix,
      autoPage: true,
      crossOriginLink: { accept: true, allowedOrigins: [www] },
    })
    assert.equal(await destination.evaluate(() => location.search.includes("kansoku_aid")), false)
    assert.equal(
      await destination.evaluate(() => window.client.getAnonymousId()),
      mode === "fresh" ? incoming : local,
    )
    await identify(
      destination,
      mode === "authenticated" ? "existing-" + prefix : "handoff-" + prefix,
    )
    const records = await destination.evaluate(() => window.records)
    assert.equal(records.filter((event) => event.eventName === "page_view").length, 1)
    assert.ok(records.every((event) => !event.url?.includes("kansoku_aid")))
    const last = records.filter((event) => event.eventName === "identify").at(-1)
    if (mode === "seeded")
      assert.deepEqual(last?.identifiers, { device: "preserved-device", cookie: incoming })
    if (mode === "authenticated") assert.equal(last?.identifiers?.cookie, undefined)
    if (mode === "conflicting") assert.equal(last?.identifiers?.cookie, "existing-cookie")
    await funnel(
      sources,
      mode === "fresh" || mode === "seeded" ? 1 : 0,
      mode === "authenticated" ? 4 : 3,
    )
    await market.close()
    await destination.close()
    cases++
  }
  {
    for (const privacy of ["optOut", "gpc", "dnt"] as const) {
      const page = await context.newPage(),
        prefix = unique()
      await setup(page, other + "/?kansoku_aid=unsolicited", {
        sourceService: prefix,
        storageKeyPrefix: prefix,
        autoPage: true,
        crossOriginLink: { accept: true, allowedOrigins: [www] },
        ...(privacy === "optOut" ? { optOut: true } : { privacy }),
      })
      assert.equal(await page.evaluate(() => location.search), "")
      assert.notEqual(await page.evaluate(() => window.client.getAnonymousId()), "unsolicited")
      assert.equal(await page.evaluate(() => window.records.length), 0)
      assert.equal(
        (await page.evaluate((url) => window.client.linkTo(url), www)).includes("kansoku_aid"),
        false,
      )
      await page.close()
    }
    cases++
  }
  {
    const page = await context.newPage(),
      prefix = unique(),
      messages: string[] = []
    page.on("console", (message) => {
      if (message.type() === "debug") messages.push(message.text())
    })
    const settings: Settings = {
      sourceService: prefix,
      storageKeyPrefix: prefix,
      storage: "cookie",
      cookieDomain: ".unrelated.invalid",
      debug: true,
    }
    await setup(page, www, settings)
    const first = await page.evaluate(() => window.client.getAnonymousId())
    assert.equal(
      await page.evaluate((prefix) => localStorage.getItem(prefix + ".anonymous_id"), prefix),
      null,
    )
    await setup(page, www, settings)
    assert.notEqual(await page.evaluate(() => window.client.getAnonymousId()), first)
    assert.ok(messages.some((message) => message.includes("using memory")))
    assert.ok(messages.every((message) => !message.includes(first)))
    await page.close()
    cases++
  }
  {
    const bots: BrowserContext = await browser.newContext({
      userAgent: "Googlebot/2.1 (+http://www.google.com/bot.html)",
    })
    try {
      for (const mode of ["flag", "drop", "off"] as const) {
        const page = await bots.newPage(),
          prefix = unique()
        await setup(page, www, {
          sourceService: prefix,
          storageKeyPrefix: prefix,
          botDetection: mode,
        })
        await pageEvent(page)
        const records = await page.evaluate(() => window.records)
        if (mode === "drop") {
          assert.equal(records.length, 0)
          assert.equal(await page.evaluate(() => window.client.stats.dropped), 1)
        } else {
          assert.equal(records[0]?.context.bot, mode === "flag" ? true : undefined)
          await eventually(async () => {
            const answer = await metric("page-views", [prefix], { includeBots: "true" })
            return answer.points.reduce((sum, point) => sum + point.value, 0) === 1
          }, "server bot flag")
          const excluded = await metric("page-views", [prefix])
          assert.equal(
            excluded.points.reduce((sum, point) => sum + point.value, 0),
            0,
          )
        }
        await page.close()
      }
    } finally {
      await bots.close()
    }
    cases++
  }
  assert.equal(cases, 8)
  console.log(JSON.stringify({ browser: "chromium", cases, skipped: 0, result: "passed" }))
} finally {
  await context.close()
  await browser.close()
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

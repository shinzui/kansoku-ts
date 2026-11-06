import { createServer } from "node:http"

import { expect, test } from "@playwright/test"

import type { AnalyticsEvent } from "../../packages/kansoku-js/src/types.js"

test.skip(
  Boolean(process.env.KANSOKU_SMOKE_BASE_URL),
  "HTTP mock smoke runs without a live server override",
)

let received: AnalyticsEvent[] = []
let receivedBatches: AnalyticsEvent[][] = []
let keys: Array<string | undefined> = []
const server = createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*")
  response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Api-Key")
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  if (request.method === "OPTIONS") {
    response.writeHead(204).end()
    return
  }
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const events = JSON.parse(Buffer.concat(chunks).toString()) as AnalyticsEvent[]
  receivedBatches.push(events)
  received.push(...events)
  keys.push(request.headers["x-api-key"] as string | undefined)
  response
    .writeHead(202, { "Content-Type": "application/json" })
    .end(JSON.stringify({ accepted: events.length, rejected: [] }))
})
test.beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(4180, "127.0.0.1", resolve))
})
test.afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
test.beforeEach(() => {
  received = []
  receivedBatches = []
  keys = []
})

test("vanilla SPA capture and an exit-only event survive navigation", async ({ page }) => {
  let loads = 0
  page.on("load", () => {
    if (page.url().startsWith("http://127.0.0.1:4173")) loads++
  })
  await page.goto("/")
  await page.getByRole("link", { name: "Pricing", exact: true }).click()
  await expect(page).toHaveURL(/\/pricing$/)
  await page.waitForFunction(() =>
    JSON.parse(sessionStorage.getItem("kansoku.queue") ?? "[]").some(
      (event: { properties: { path?: string } }) => event.properties.path === "/pricing",
    ),
  )
  await page.getByRole("link", { name: "Docs", exact: true }).click()
  await page.waitForFunction(() =>
    JSON.parse(sessionStorage.getItem("kansoku.queue") ?? "[]").some(
      (event: { properties: { path?: string } }) => event.properties.path === "/docs",
    ),
  )
  await page.getByRole("button", { name: "Flush", exact: true }).click()
  await expect
    .poll(() =>
      received
        .filter((event) => event.eventName === "page_view")
        .map((event) => event.properties.path),
    )
    .toEqual(["/", "/pricing", "/docs"])
  for (const event of received.filter((event) => event.eventName === "page_view")) {
    expect(event.schemaVersion).toBe(1)
    expect(event.properties.url).toBe(
      `http://127.0.0.1:4173${event.properties.path === "/" ? "/" : event.properties.path}`,
    )
  }
  // Only this event remains pending; leave before the ordinary five-second interval.
  await page.getByRole("button", { name: "Track CTA", exact: true }).click()
  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem("kansoku.queue") ?? "[]").some(
        (event: { eventName: string }) => event.eventName === "cta_clicked",
      ),
    ),
  ).toBe(true)
  expect(received.some((event) => event.eventName === "cta_clicked")).toBe(false)
  await page.goto("about:blank")
  await expect
    .poll(() => received.filter((event) => event.eventName === "cta_clicked").length)
    .toBe(1)
  await page.goto("/")
  // The page can disappear before its acknowledgement handler runs. A reload may
  // retry the same ID; the real server uses that ID as its idempotency key.
  await page.getByRole("button", { name: "Flush", exact: true }).click()
  await page.waitForFunction(() => (sessionStorage.getItem("kansoku.queue") ?? "[]") === "[]")
  expect(
    new Set(
      received.filter((event) => event.eventName === "cta_clicked").map((event) => event.eventId),
    ).size,
  ).toBe(1)
  expect(keys.every((key) => key === "ksk_w_smoke")).toBe(true)
  expect(loads).toBe(2)
  expect(received.some((e) => e.eventName === "client_error" || e.eventName === "web_vital")).toBe(
    false,
  )
  expect(
    await page.evaluate(() =>
      performance.getEntriesByType("resource").some((e) => /vitals.*\.js/.test(e.name)),
    ),
  ).toBe(false)
})

test("React Router captures views, sign-in and one exposure per variant under StrictMode", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:4174/")
  await page.getByRole("link", { name: "Pricing", exact: true }).click()
  await page.getByText("Pricing layout: control", { exact: true }).waitFor()
  await page.getByRole("button", { name: "Toggle variant" }).click()
  await page.getByText("Pricing layout: variant_b", { exact: true }).waitFor()
  await page.getByRole("button", { name: "Toggle variant" }).click()
  await page.getByText("Pricing layout: control", { exact: true }).waitFor()
  await page.getByRole("link", { name: "Account", exact: true }).click()
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.getByText("Signed in as user_42", { exact: true }).waitFor()
  await page.getByRole("button", { name: "Flush", exact: true }).click()
  await expect.poll(() => received.filter((event) => event.eventName === "identify").length).toBe(1)
  expect(
    received
      .filter((event) => event.eventName === "experiment_viewed")
      .map((event) => event.properties.variant),
  ).toEqual(["control", "variant_b"])
  expect(
    received
      .filter((event) => event.eventName === "page_view")
      .map((event) => event.properties.path),
  ).toEqual(["/", "/pricing", "/account"])
  expect(received.filter((event) => event.eventName === "session_start")).toHaveLength(1)
})

test("optional capture delivers sanitized errors and final vitals in the navigation exit batch", async ({
  page,
}) => {
  await page.addInitScript(() => {
    for (const name of ["pagehide", "visibilitychange"])
      addEventListener(name, () => {
        sessionStorage.setItem(
          "capture-transitions",
          JSON.stringify([
            ...JSON.parse(sessionStorage.getItem("capture-transitions") ?? "[]"),
            name,
          ]),
        )
      })
  })
  await page.goto("/?capture=1")
  await expect
    .poll(() =>
      page.evaluate(() =>
        performance.getEntriesByType("resource").some((e) => /vitals-.*\.js/.test(e.name)),
      ),
    )
    .toBe(true)
  await page.getByRole("button", { name: "Flush", exact: true }).click()
  await expect
    .poll(() =>
      received
        .filter((e) => e.eventName === "web_vital")
        .map((e) => e.properties.metric)
        .sort(),
    )
    .toEqual(["FCP", "TTFB"])
  await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .find((e) => /vitals-.*\.js/.test(e.name))!.name
    const module = await import(/* @vite-ignore */ url)
    module.subscribe((sample: { name: string; value: number }) => {
      const final = JSON.parse(sessionStorage.getItem("capture-library-values") ?? "{}")
      final[sample.name] = sample.value
      sessionStorage.setItem("capture-library-values", JSON.stringify(final))
    })
  })
  await page.getByRole("button", { name: "Throw error", exact: true }).click()
  // Allow buffered event timing and the library's idle callback to settle.
  await page.waitForTimeout(350)
  await page.getByRole("button", { name: "Flush", exact: true }).click()
  await expect.poll(() => received.filter((e) => e.eventName === "client_error").length).toBe(1)
  const view = received.find((e) => e.eventName === "page_view")!
  const error = received.find((e) => e.eventName === "client_error")!
  expect(error.properties).toEqual({
    message: "Example failure <url> <email> <number>",
    type: "Error",
    handled: false,
  })
  const before = receivedBatches.length
  await page.route("**/capture-exit.html", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Done</h1>" }),
  )
  await page.goto("/capture-exit.html")
  const transitions = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("capture-transitions") ?? "[]"),
  )
  await expect
    .poll(() =>
      received
        .filter((e) => e.eventName === "web_vital")
        .map((e) => e.properties.metric)
        .sort(),
    )
    .toEqual(["CLS", "FCP", "INP", "LCP", "TTFB"])
  const exit = receivedBatches
    .slice(before)
    .flat()
    .filter((e) => e.eventName === "web_vital")
  expect(exit.map((e) => e.properties.metric).sort()).toEqual(["CLS", "INP", "LCP"])
  expect(transitions).toEqual(["pagehide", "visibilitychange"])
  const libraryValues = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem("capture-library-values") ?? "{}"),
  )
  for (const sample of exit)
    expect(sample.properties.value).toBe(libraryValues[sample.properties.metric as string])
  for (const event of [error, ...received.filter((e) => e.eventName === "web_vital")]) {
    expect(event).toMatchObject({
      url: view.url,
      sessionId: view.sessionId,
      anonymousId: view.anonymousId,
      schemaVersion: 1,
    })
  }
  console.log(
    "capture prototype:",
    JSON.stringify({ transitions, exit: exit.map((e) => e.properties) }),
  )
})

import { createServer } from "node:http"

import { expect, test } from "@playwright/test"

import type { AnalyticsEvent } from "../../packages/kansoku-js/src/types.js"

test.skip(
  Boolean(process.env.KANSOKU_SMOKE_BASE_URL),
  "HTTP mock smoke runs without a live server override",
)

let received: AnalyticsEvent[] = []
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

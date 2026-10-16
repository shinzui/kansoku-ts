import { expect, test } from "@playwright/test"
import type { APIRequestContext } from "@playwright/test"

test.use({
  userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
})

const baseUrl = process.env.KANSOKU_SMOKE_BASE_URL
const serviceToken = process.env.KANSOKU_LIVE_SERVICE_TOKEN
if (
  process.env.KANSOKU_REQUIRE_LIVE === "1" &&
  (!baseUrl || !serviceToken || !process.env.KANSOKU_SMOKE_WRITE_KEY)
)
  throw new Error("Required live examples need the real server and both credentials")
test.skip(
  !baseUrl || !serviceToken,
  "Set KANSOKU_SMOKE_BASE_URL/WRITE_KEY and KANSOKU_LIVE_SERVICE_TOKEN for live example checks",
)
const from = new Date().toISOString().slice(0, 10)
const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
async function metric(
  request: APIRequestContext,
  name: string,
  groupBy: string,
): Promise<Record<string, number>> {
  const response = await request.get(
    `${baseUrl}/metrics/${name}?from=${from}&to=${to}&groupBy=${groupBy}`,
    { headers: { Authorization: `Bearer ${serviceToken}` } },
  )
  expect(response.status()).toBe(200)
  const body = await response.json()
  return Object.fromEntries(
    body.points.map((point: { group: Record<string, string>; value: number }) => [
      point.group[groupBy],
      point.value,
    ]),
  )
}

test("vanilla browser example reaches real route metrics", async ({ page, request }) => {
  await page.goto("/")
  await page.getByRole("link", { name: "Pricing", exact: true }).click()
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
    .poll(
      async () => {
        const routes = await metric(request, "page-views", "route")
        return ["/", "/pricing", "/docs"].every((route) => (routes[route] ?? 0) >= 1)
      },
      { timeout: 15000, intervals: [500] },
    )
    .toBe(true)
})

test("React browser example reaches real identity and exposure metrics", async ({
  page,
  request,
}) => {
  const baseline = await metric(request, "events", "event_name")
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
  await expect
    .poll(
      async () => {
        const events = await metric(request, "events", "event_name")
        return ["page_view", "identify", "experiment_viewed", "session_start"].map(
          (name) => (events[name] ?? 0) - (baseline[name] ?? 0),
        )
      },
      { timeout: 15000, intervals: [500] },
    )
    .toEqual([3, 1, 2, 1])
})

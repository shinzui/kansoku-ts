import { describe, expect, test } from "bun:test"

import { baseUrl, live, serviceToken } from "./env.js"
import { liveClient, pageProperties } from "./helpers.js"

describe.skipIf(!live || !serviceToken)("live metrics", () => {
  test("a unique page view reaches the asynchronous metrics projection", async () => {
    const path = `/sdk-live-${crypto.randomUUID()}`
    const { client } = liveClient()
    client.track("page_view", pageProperties(path))
    await client.shutdown()
    expect(client.stats.accepted).toBe(1)
    const from = new Date().toISOString().slice(0, 10)
    const to = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    let found = false
    // The PostgreSQL-to-ClickHouse writer and rollups are eventually consistent.
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await fetch(
        `${baseUrl}/metrics/page-views?from=${from}&to=${to}&groupBy=route`,
        { headers: { Authorization: `Bearer ${serviceToken}` } },
      )
      expect(response.status).toBe(200)
      const body = await response.json()
      if (
        body.points?.some(
          (point: { group: { route?: string }; value: number }) =>
            (point.group.route === path || point.group.route === `https://live.test${path}`) &&
            point.value >= 1,
        )
      ) {
        found = true
        break
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 2000))
    }
    expect(found).toBe(true)
  }, 65000)
})

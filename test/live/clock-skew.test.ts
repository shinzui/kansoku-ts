import { expect, test } from "bun:test"

import { baseUrl, describeLive, serviceToken } from "./env.js"
import { liveClient, pageProperties } from "./helpers.js"

describeLive("live clock skew", () => {
  test("send-time correction preserves six queued hours rather than clamping to receipt", async () => {
    const hour = 3600000
    const source = `clock-skew-${crypto.randomUUID()}`
    const expected = Date.now() - 6 * hour
    const { client, requests } = liveClient({
      sourceService: source,
      now: () => Date.now() + 48 * hour,
    })
    client.track("page_view", pageProperties("/clock-skew"), {
      occurredAt: new Date(expected + 48 * hour),
    })
    await client.shutdown()
    expect(requests[0]?.status).toBe(202)
    const producer = requests[0]!.body[0]!
    expect(Date.parse(producer.sentAt!) - Date.parse(producer.occurredAt)).toBeGreaterThan(
      6 * hour - 1000,
    )
    const day = new Date(expected).toISOString().slice(0, 10)
    const params = new URLSearchParams({
      from: day,
      to: new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10),
      timeGrain: "hour",
      filter: JSON.stringify({ dimension: "source_service", op: "eq", value: source }),
    })
    let points: Array<{ bucket: string; value: number }> = []
    for (let attempt = 0; attempt < 60; attempt++) {
      const response = await fetch(`${baseUrl}/metrics/events?${params}`, {
        headers: { Authorization: `Bearer ${serviceToken}` },
      })
      expect(response.status).toBe(200)
      points = (await response.json()).points
      if (points.length) break
      await Bun.sleep(250)
    }
    expect(points).toHaveLength(1)
    expect(points[0]!.value).toBe(1)
    expect(points[0]!.bucket.replace(" ", "T").slice(0, 13)).toBe(
      new Date(expected).toISOString().slice(0, 13),
    )
  }, 30000)
})

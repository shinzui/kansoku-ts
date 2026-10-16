import { expect, test } from "bun:test"

import { baseUrl, describeLive, serviceToken, writeKey } from "./env.js"
import { liveClient, pageProperties } from "./helpers.js"

describeLive("live identity and duplicate retry", () => {
  test("email_hmac stitches independent SDK identities and duplicate retry counts once", async () => {
    const unique = crypto.randomUUID()
    const source = `email-handoff-${unique}`
    const email = `v1:${unique}`
    const marketing = liveClient({ sourceService: source })
    marketing.client.setIdentifiers({ email_hmac: email })
    marketing.client.track("page_view", pageProperties(`/handoff-${unique}`))
    await marketing.client.shutdown()
    const app = liveClient({ sourceService: source })
    app.client.setIdentifiers({ email_hmac: email })
    app.client.identify(`user-${unique}`)
    await app.client.shutdown()
    expect(marketing.requests[0]?.body[0]?.anonymousId).not.toBe(
      app.requests[0]?.body[0]?.anonymousId,
    )
    expect(marketing.client.stats.accepted).toBe(1)
    expect(app.client.stats.accepted).toBe(1)
    const retry = await fetch(`${baseUrl}/v1/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": writeKey },
      body: JSON.stringify(marketing.requests[0]!.body),
    })
    expect(retry.status).toBe(202)
    expect(await retry.json()).toEqual({ accepted: 1, rejected: [] })
    const params = new URLSearchParams({
      from: new Date().toISOString().slice(0, 10),
      to: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      filter: JSON.stringify({ dimension: "source_service", op: "eq", value: source }),
    })
    async function metric(name: string) {
      const response = await fetch(`${baseUrl}/metrics/${name}?${params}`, {
        headers: { Authorization: `Bearer ${serviceToken}` },
      })
      expect(response.status).toBe(200)
      return response.json() as Promise<{ points: Array<{ value: number }> }>
    }
    let count = 0
    for (let attempt = 0; attempt < 60; attempt++) {
      count = (await metric("events")).points.reduce((sum, point) => sum + point.value, 0)
      if (count === 2) break
      await Bun.sleep(250)
    }
    expect(count).toBe(2)
    params.set("steps", "page_view,identify")
    expect((await metric("funnel")).points.map((point) => point.value)).toEqual([1, 1])
    params.delete("steps")
    await Bun.sleep(300)
    expect((await metric("events")).points.reduce((sum, point) => sum + point.value, 0)).toBe(2)
  }, 30000)
})

import { expect, test } from "bun:test"

import { baseUrl, describeLive, writeKey } from "./env.js"
import { liveClient, pageProperties } from "./helpers.js"

describeLive("live ingest", () => {
  test("one governed page_view is accepted with 202", async () => {
    const { client, requests } = liveClient()
    client.track("page_view", pageProperties("/accepted"))
    await client.flush()
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ status: 202, response: { accepted: 1, rejected: [] } })
    expect(client.stats.accepted).toBe(1)
    await client.shutdown()
  })
  test("raw invalid page_view is rejected by index and the SDK never retries a rejection", async () => {
    const { client, requests, drops } = liveClient()
    client.track("page_view", {})
    await client.flush()
    await client.flush()
    expect(requests).toHaveLength(1)
    expect(requests[0]?.status).toBe(202)
    expect(requests[0]?.response).toMatchObject({ accepted: 0, rejected: [{ index: 0 }] })
    expect(drops[0]).toMatchObject({ reason: "rejected" })
    expect(drops[0]?.detail).toContain("url")
    const raw = await fetch(`${baseUrl}/v1/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": writeKey },
      body: JSON.stringify(
        requests[0]!.body.map((event) => ({ ...event, eventId: crypto.randomUUID() })),
      ),
    })
    expect(raw.status).toBe(202)
    expect(await raw.json()).toMatchObject({ accepted: 0, rejected: [{ index: 0 }] })
    await client.shutdown()
  })
  test("a batch above the configured event cap receives 413 then splits without loss", async () => {
    const count = Number(process.env.KANSOKU_LIVE_MAX_BATCH_EVENTS ?? 500) + 1
    const { client, requests } = liveClient({
      maxBatchEvents: count,
      maxQueueSize: count + 1,
      flushAt: count + 1,
    })
    for (let i = 0; i < count; i++) client.track("sdk_conformance", { n: i })
    await client.flush()
    expect(requests[0]).toMatchObject({
      status: 413,
      response: { retryable: false, code: expect.any(String) },
    })
    expect(requests.slice(1).every((request) => request.status === 202)).toBe(true)
    expect(client.stats).toEqual({
      bestEffortQueued: 0,
      queued: 0,
      accepted: count,
      rejected: 0,
      dropped: 0,
    })
    await client.shutdown()
  })
  test("a bogus key is permanent and is never retried", async () => {
    const { client, requests, drops } = liveClient({ writeKey: "ksk_w_bogus" })
    client.track("sdk_conformance")
    await client.flush()
    expect(requests.map((request) => request.status)).toEqual([401])
    expect(drops[0]?.reason).toBe("permanent_error")
    expect(client.stats.dropped).toBe(1)
    await client.shutdown()
  })
})

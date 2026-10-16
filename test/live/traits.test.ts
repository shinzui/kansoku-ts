import { describe, expect, test } from "bun:test"

import catalog from "../../contracts/events.json"
import { baseUrl, live, serviceToken } from "./env.js"
import { liveClient, pageProperties } from "./helpers.js"

if (process.env.KANSOKU_REQUIRE_LIVE === "1" && (!live || !serviceToken))
  throw new Error("Required trait acceptance needs a live server and both credentials")

describe.skipIf(!live || !serviceToken)("live governed traits", () => {
  test("helper versions persist traits and identify_once stitches preceding anonymous activity", async () => {
    const schema = await fetch(`${baseUrl}/v1/schemas`)
    expect(schema.status).toBe(200)
    expect(await schema.json()).toEqual(catalog)
    const unique = crypto.randomUUID()
    const initial = `initial-${unique}`
    const updated = `updated-${unique}`
    let clock = Date.parse("2026-07-01T12:00:00Z")
    const { client, requests, drops } = liveClient({ now: () => clock })
    async function count(plan: string, metric = "page-views") {
      const params = new URLSearchParams({
        from: "2026-07-01",
        to: "2026-07-02",
        filter: JSON.stringify({ dimension: "user:plan", op: "eq", value: plan }),
      })
      const response = await fetch(`${baseUrl}/metrics/${metric}?${params}`, {
        headers: { Authorization: `Bearer ${serviceToken}` },
      })
      expect(response.status).toBe(200)
      const body = await response.json()
      return body.points.reduce((sum: number, point: { value: number }) => sum + point.value, 0)
    }
    async function wait(plan: string, expected: number, metric = "page-views") {
      let observed = -1
      for (let attempt = 0; attempt < 30; attempt++) {
        observed = await count(plan, metric)
        if (observed === expected) break
        await new Promise<void>((resolve) => setTimeout(resolve, 500))
      }
      expect(observed).toBe(expected)
    }
    client.track("page_view", pageProperties(`/traits-${unique}`))
    await client.flush()
    clock += 1000
    client.identifyOnce(unique, { plan: initial, company_size: 2 })
    await client.flush()
    await wait(initial, 1)
    clock += 1000
    client.identify(unique, { plan: updated, company_size: 10 })
    await client.flush()
    await wait(updated, 1)
    expect(await count(initial)).toBe(0)
    clock += 1000
    client.identifyOnce(unique, { plan: `ignored-once-${unique}` })
    client.identify(unique, { plan: `ignored-v1-${unique}` }, { schemaVersion: 1 })
    await client.shutdown()
    expect(drops).toHaveLength(0)
    expect(requests.every((request) => request.status === 202)).toBe(true)
    const events = requests.flatMap((request) => request.body)
    expect(events.map((event) => event.schemaVersion)).toEqual([1, 1, 2, 1, 1])
    expect(new Set(events.map((event) => event.anonymousId)).size).toBe(1)
    expect(events[0]!.userId).toBeUndefined()
    expect(events.slice(1).every((event) => event.userId === unique)).toBe(true)
    // Await writer visibility of the final identity-only event before checking precedence.
    const ids = events.map((event) => event.eventId)
    expect(new Set(ids).size).toBe(5)
    await wait(updated, 5, "events")
    expect(await count(updated)).toBe(1)
  }, 45000)
})

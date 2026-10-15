import { expect, test } from "bun:test"

import { describeLive } from "./env.js"
import { liveClient, pageProperties } from "./helpers.js"

describeLive("live clock skew", () => {
  test("records the server response to a producer clock sixty seconds ahead", async () => {
    const { client, requests } = liveClient({ now: () => Date.now() + 60000 })
    client.track("page_view", pageProperties("/clock-skew"))
    await client.flush()
    expect(requests[0]?.status).toBe(202)
    console.log(`clock-skew: occurredAt +60s → ${JSON.stringify(requests[0]?.response)}`)
    await client.shutdown()
  })
})

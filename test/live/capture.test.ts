import { expect, test } from "bun:test"

import { errorProperties } from "../../packages/kansoku-js/src/errors.js"
import { vitalProperties } from "../../packages/kansoku-js/src/vitals.js"
import { describeLive } from "./env.js"
import { liveClient } from "./helpers.js"

describeLive("live optional capture contracts", () => {
  test("capture builders satisfy v1 and overlong messages are rejected by index", async () => {
    const { client, requests } = liveClient()
    client.track(
      "client_error",
      errorProperties(new TypeError("Example failure https://secret.test")),
    )
    client.track("web_vital", vitalProperties("LCP", 123.5))
    client.track("web_vital", vitalProperties("CLS", 1.5))
    client.track("client_error", { message: "😀".repeat(257), type: "Error", handled: false })
    await client.flush()
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({
      status: 202,
      response: { accepted: 3, rejected: [{ index: 3 }] },
    })
    expect(client.stats.accepted).toBe(3)
    expect(client.stats.rejected).toBe(1)
    await client.shutdown()
  })
})

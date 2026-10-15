import { expect, test } from "bun:test"

import { createFetchMock } from "../../../test/helpers/fetch-mock.js"
import { createInternalClient } from "../src/client.js"
import { jsonBytes } from "../src/queue.js"

test("exit flush chunks keepalive bodies, dedupes transitions, and follows start/stop", async () => {
  const mock = createFetchMock()
  const client = createInternalClient({
    baseUrl: "https://analytics.test",
    writeKey: "ksk_w_test",
    fetch: mock.fetch,
    storage: "memory",
    persistQueue: false,
    autoStart: false,
    flushAt: 100,
    autocapture: { sessions: false },
  })
  for (let i = 0; i < 4; i++) client.track("large", { body: "x".repeat(20000) })
  window.dispatchEvent(new Event("pagehide"))
  expect(mock.requests).toHaveLength(0)
  client.start()
  client.start()
  window.dispatchEvent(new Event("pagehide"))
  window.dispatchEvent(new Event("pagehide"))
  expect(mock.requests.length).toBeGreaterThan(1)
  const exitCount = mock.requests.length
  for (const request of mock.requests) {
    expect(request.keepalive).toBe(true)
    expect(jsonBytes(request.body)).toBeLessThanOrEqual(61440)
  }
  await client.flush()
  client.stop()
  await client.flush()
  client.track("paused")
  window.dispatchEvent(new Event("pagehide"))
  expect(mock.requests.length).toBeGreaterThanOrEqual(exitCount)
  const stoppedCount = mock.requests.length
  window.dispatchEvent(new Event("pagehide"))
  expect(mock.requests).toHaveLength(stoppedCount)
  client.start()
  window.dispatchEvent(new Event("pagehide"))
  expect(mock.requests.length).toBeGreaterThan(stoppedCount)
  await client.shutdown()
})

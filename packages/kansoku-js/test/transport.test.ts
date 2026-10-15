import { expect, test } from "bun:test"

import { createFetchMock, hang } from "../../../test/helpers/fetch-mock.js"
import { resolveOptions } from "../src/client.js"
import { buildEvent } from "../src/envelope.js"
import { sendBatch } from "../src/transport.js"

test("uses the batch endpoint and credential header, including keepalive", async () => {
  const mock = createFetchMock()
  const config = resolveOptions({
    baseUrl: "https://analytics.test/",
    writeKey: "ksk_w_test",
    fetch: mock.fetch,
  })
  const event = buildEvent({ identity: { anonymousId: "anon" }, sessionId: "s", config }, "test")
  expect((await sendBatch(config, [event], { keepalive: true })).kind).toBe("accepted")
  expect(mock.requests[0]).toMatchObject({
    url: "https://analytics.test/v1/batch",
    method: "POST",
    keepalive: true,
    headers: { "x-api-key": "ksk_w_test", "content-type": "application/json" },
  })
})
test("times out even when a fetch double ignores AbortSignal", async () => {
  const mock = createFetchMock()
  mock.respondWith(hang())
  const config = resolveOptions({
    baseUrl: "http://analytics.test",
    writeKey: "ksk_w_test",
    fetch: mock.fetch,
    requestTimeoutMs: 1,
  })
  expect(await sendBatch(config, [])).toMatchObject({
    kind: "retryable",
    detail: "request timeout",
  })
})

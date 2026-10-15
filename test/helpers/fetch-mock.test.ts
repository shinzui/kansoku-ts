import { expect, test } from "bun:test"

import { ack, createFetchMock, envelope, hang, networkError, status } from "./fetch-mock.js"

test("records JSON, headers, keepalive and default acknowledgement", async () => {
  const mock = createFetchMock()
  const response = await mock.fetch("https://example.com/v1/batch", {
    method: "POST",
    headers: { "X-Api-Key": "ksk_w_test" },
    body: "[{},{}]",
    keepalive: true,
  })
  expect(mock.requests[0]).toEqual({
    url: "https://example.com/v1/batch",
    method: "POST",
    headers: { "x-api-key": "ksk_w_test" },
    body: [{}, {}],
    keepalive: true,
  })
  expect(await response.json()).toEqual({ accepted: 2, rejected: [] })
})
test("plays responses in order then defaults", async () => {
  const mock = createFetchMock()
  mock.respondWith(status(401), envelope(503, "busy", true), ack(3))
  expect((await mock.fetch("https://example.com")).status).toBe(401)
  expect(await (await mock.fetch("https://example.com")).json()).toEqual({
    code: "busy",
    message: "busy",
    retryable: true,
  })
  expect(await (await mock.fetch("https://example.com")).json()).toEqual({
    accepted: 3,
    rejected: [],
  })
  expect((await mock.fetch("https://example.com")).status).toBe(202)
})
test("network errors reject and hangs remain pending", async () => {
  const mock = createFetchMock()
  mock.respondWith(networkError(), hang())
  await expect(mock.fetch("https://example.com")).rejects.toBeInstanceOf(TypeError)
  let settled = false
  void mock.fetch("https://example.com").then(() => {
    settled = true
  })
  await Promise.resolve()
  expect(settled).toBe(false)
})

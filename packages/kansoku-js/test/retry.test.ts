import { expect, test } from "bun:test"

import { backoffDelayMs, classifyResponse } from "../src/retry.js"

test("full jitter caps exponential delay at 30 seconds", () => {
  expect(backoffDelayMs(0, 500, () => 0.5)).toBe(250)
  expect(backoffDelayMs(10, 500, () => 0.5)).toBe(15000)
})
test("classifies terminal, splitting, transient and malformed responses", async () => {
  for (const status of [400, 401, 403, 404])
    expect((await classifyResponse(new Response(null, { status }), 2)).kind).toBe("permanent")
  expect((await classifyResponse(new Response(null, { status: 413 }), 2)).kind).toBe("too_large")
  expect((await classifyResponse(new Response(null, { status: 413 }), 1)).kind).toBe("permanent")
  expect(
    (await classifyResponse(Response.json({ retryable: false }, { status: 503 }), 2)).kind,
  ).toBe("permanent")
  for (const response of [
    Response.json({ retryable: true }, { status: 503 }),
    new Response("bad", { status: 202 }),
    Response.json({ accepted: 5, rejected: [] }, { status: 202 }),
  ])
    expect((await classifyResponse(response, 2)).kind).toBe("retryable")
})

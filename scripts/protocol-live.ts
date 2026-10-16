import assert from "node:assert/strict"

import { createKansoku } from "../packages/kansoku-js/dist/index.js"

const baseUrl = process.env.KANSOKU_LIVE_BASE_URL!
const writeKey = process.env.KANSOKU_LIVE_WRITE_KEY!
assert(baseUrl && writeKey, "required protocol fixture credentials")
const requests: Array<{ ids: string[]; status: number; at: number; retryAfter: number }> = []
const client = createKansoku({
  baseUrl,
  writeKey,
  storage: "memory",
  persistQueue: false,
  autoStart: false,
  autocapture: { pageViews: false, sessions: false, pageLeave: false },
  maxBatchEvents: 2,
  flushAt: 10,
  maxRetries: 3,
  retryBaseDelayMs: 1,
  fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
    const at = performance.now()
    const response = await fetch(url, init)
    requests.push({
      ids: JSON.parse(String(init?.body)).map((event: { eventId: string }) => event.eventId),
      status: response.status,
      at,
      retryAfter: Number(response.headers.get("Retry-After")),
    })
    return response
  }) as typeof fetch,
})
const stamp = new Date().toISOString()
const event = {
  eventId: crypto.randomUUID(),
  eventName: "sdk_protocol",
  source: "web",
  occurredAt: stamp,
  receivedAt: stamp,
  properties: {},
  context: {},
}
async function beacon(batch: unknown[]) {
  return fetch(baseUrl + "/v1/beacon", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ writeKey, batch }),
  })
}
assert.equal(
  (
    await beacon([
      event,
      { ...event, eventId: crypto.randomUUID() },
      { ...event, eventId: crypto.randomUUID() },
    ])
  ).status,
  413,
)
client.track("sdk_protocol")
client.track("sdk_protocol")
await client.flush()
assert.equal(client.stats.accepted, 2)
const limited = await beacon([event])
assert.equal(limited.status, 429)
assert.match(limited.headers.get("Content-Type")!, /application\/problem\+json/)
assert.equal((await limited.json()).code, "rate_limited")
assert(Number(limited.headers.get("Retry-After")) >= 1)
client.track("sdk_protocol")
await client.flush()
const retries = requests.slice(1)
assert.equal(retries[0]?.status, 429)
assert.equal(retries.at(-1)?.status, 202)
assert.equal(new Set(retries.flatMap((request) => request.ids)).size, 1)
for (let index = 1; index < retries.length; index++) {
  const previous = retries[index - 1]!
  assert(
    retries[index]!.at - previous.at >= previous.retryAfter * 1000 - 20,
    "Retry-After minimum was violated",
  )
}
assert.equal(client.stats.accepted, 3)
assert.equal(client.stats.dropped, 0)
await client.shutdown()
console.log(JSON.stringify({ cases: 3, skipped: 0, result: "passed" }))

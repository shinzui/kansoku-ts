import { afterEach, expect, spyOn, test } from "bun:test"

import { createFetchMock } from "../../../test/helpers/fetch-mock.js"
import { createInternalClient, createKansoku } from "../src/client.js"
import { exitBudget, serializeBatch } from "../src/transport.js"
import type { AnalyticsEvent, KansokuClient } from "../src/types.js"

const clients: Array<Pick<KansokuClient, "shutdown">> = []
afterEach(async () => {
  for (const client of clients.splice(0)) await client.shutdown()
  exitBudget().bytes = 0
  Reflect.deleteProperty(navigator, "sendBeacon")
})
function fixture(overrides = {}) {
  const mock = createFetchMock()
  const client = createKansoku({
    baseUrl: "https://analytics.test",
    writeKey: "ksk_w_test",
    storage: "memory",
    persistQueue: false,
    flushAt: 100,
    autocapture: { pageViews: false, sessions: false },
    exitTransport: "beacon",
    fetch: mock.fetch,
    ...overrides,
  })
  clients.push(client)
  return { client, mock }
}
const beacon = (fn: (url: string, body: Blob) => boolean) =>
  Object.defineProperty(navigator, "sendBeacon", { value: fn, configurable: true })
const hide = () => window.dispatchEvent(new Event("pagehide"))

test("beacon true retains a mirror and counts queued separately until an acknowledged retry", async () => {
  const calls: Array<{ url: string; body: Blob }> = []
  beacon((url, body) => {
    calls.push({ url, body })
    return true
  })
  const { client, mock } = fixture({ persistQueue: true, storageKeyPrefix: crypto.randomUUID() })
  client.track("exit")
  hide()
  hide()
  expect(calls).toHaveLength(1)
  expect(calls[0]!.url).toBe("https://analytics.test/v1/beacon")
  expect(calls[0]!.body.type).toBe("text/plain;charset=utf-8")
  const envelope = JSON.parse(await calls[0]!.body.text())
  expect(envelope.writeKey).toBe("ksk_w_test")
  expect(envelope.batch[0].sentAt).toBeString()
  expect(client.stats).toMatchObject({ queued: 1, bestEffortQueued: 1, accepted: 0 })
  expect(mock.requests).toHaveLength(0)
  await client.flush()
  expect((mock.requests[0]!.body as AnalyticsEvent[])[0]!.eventId).toBe(envelope.batch[0].eventId)
  expect(client.stats).toMatchObject({ queued: 0, accepted: 1, bestEffortQueued: 1 })
})

test("false, missing and throwing beacon use one keepalive fallback", async () => {
  for (const variant of ["false", "missing", "throw"]) {
    if (variant === "missing")
      Object.defineProperty(navigator, "sendBeacon", { value: undefined, configurable: true })
    else
      beacon(() => {
        if (variant === "throw") throw Error("quota")
        return false
      })
    const { client, mock } = fixture()
    client.track("fallback")
    hide()
    hide()
    expect([variant, mock.requests.length]).toEqual([variant, 1])
    expect(mock.requests[0]).toMatchObject({
      url: "https://analytics.test/v1/batch",
      keepalive: true,
    })
    await client.flush()
    await client.shutdown()
  }
})

test("whole UTF-8 envelopes share a document budget across clients and lifecycle resumes", async () => {
  const bodies: Blob[] = []
  beacon((_url, body) => {
    bodies.push(body)
    return true
  })
  const capped = fixture({ maxBatchBytes: 100 })
  capped.client.track("capped")
  hide()
  expect(bodies).toHaveLength(0)
  await capped.client.shutdown()
  const a = fixture()
  const b = fixture()
  for (const client of [a.client, b.client])
    for (let i = 0; i < 3; i++) client.track("large", { text: "界".repeat(6500) })
  hide()
  const total = bodies.reduce((sum, body) => sum + body.size, 0)
  expect(total).toBeLessThanOrEqual(61440)
  expect(total).toBeGreaterThan(39000)
  expect(a.client.stats.queued + b.client.stats.queued).toBe(6)
  window.dispatchEvent(new Event("pageshow"))
  hide()
  expect(bodies.reduce((sum, body) => sum + body.size, 0)).toBe(total)
})

test("page leave uses the original identity/session and monotonic duration once per view", async () => {
  let wall = Date.now()
  const clock = spyOn(performance, "now").mockReturnValue(100)
  const calls: Blob[] = []
  beacon((_url, body) => {
    calls.push(body)
    return true
  })
  try {
    const { client } = fixture({ now: () => wall, sessionTimeoutMs: 100 })
    client.identify("original")
    client.page()
    const originalSession = client.getSessionId()
    wall += 1000
    client.identify("later")
    clock.mockReturnValue(175)
    hide()
    hide()
    const events = JSON.parse(await calls[0]!.text()).batch as AnalyticsEvent[]
    const leaves = events.filter((event) => event.eventName === "page_leave")
    expect(leaves).toHaveLength(1)
    expect(leaves[0]).toMatchObject({
      userId: "original",
      sessionId: originalSession,
      schemaVersion: 1,
      properties: { durationMs: 75 },
    })
    expect(client.getSessionId()).not.toBe(originalSession)
  } finally {
    clock.mockRestore()
  }
})

test("SPA views close the old page and BFCache restoration creates a new interval", async () => {
  const { client, mock } = fixture({ autocapture: { pageViews: true, sessions: false } })
  history.pushState({}, "", "/beacon-spa")
  await new Promise((resolve) => setTimeout(resolve, 5))
  await client.flush()
  expect((mock.requests[0]!.body as AnalyticsEvent[]).map((event) => event.eventName)).toEqual([
    "page_view",
    "page_leave",
    "page_view",
  ])
  beacon(() => true)
  hide()
  const restored = new Event("pageshow")
  Object.defineProperty(restored, "persisted", { value: true })
  window.dispatchEvent(restored)
  hide()
  await client.flush()
  const events = mock.requests.flatMap((request) => request.body as AnalyticsEvent[])
  expect(events.filter((event) => event.eventName === "page_leave")).toHaveLength(3)
  expect(events.filter((event) => event.eventName === "page_view")).toHaveLength(3)
})

test("page leave obeys opt-out, explicit disabling and beforeSend", async () => {
  beacon(() => true)
  for (const overrides of [
    { optOut: true },
    { autocapture: { pageViews: true, sessions: false, pageLeave: false } },
    { beforeSend: (event: AnalyticsEvent) => (event.eventName === "page_leave" ? null : event) },
  ]) {
    const { client, mock } = fixture(overrides)
    client.page()
    hide()
    await client.flush()
    expect(
      mock.requests
        .flatMap((request) => request.body as AnalyticsEvent[])
        .some((event) => event.eventName === "page_leave"),
    ).toBe(false)
    await client.shutdown()
  }
})

test("retry and split serialization restamps only sentAt with the injected clock", async () => {
  let now = 1000
  const mock = createFetchMock()
  mock.respondWith(
    async () => {
      now = 2000
      return new Response(null, { status: 503 })
    },
    async () => {
      now = 3000
      return new Response(null, { status: 413 })
    },
  )
  const client = createInternalClient({
    baseUrl: "https://analytics.test",
    writeKey: "ksk_w_test",
    fetch: mock.fetch,
    now: () => now,
    autoStart: false,
    storage: "memory",
    persistQueue: false,
    retryBaseDelayMs: 0,
    autocapture: { sessions: false },
  })
  clients.push(client)
  client.track("one")
  client.track("two")
  await client.flush()
  const bodies = mock.requests.map((request) => request.body as AnalyticsEvent[])
  expect(bodies.map((body) => body.map((event) => event.sentAt))).toEqual([
    [new Date(1000).toISOString(), new Date(1000).toISOString()],
    [new Date(2000).toISOString(), new Date(2000).toISOString()],
    [new Date(3000).toISOString()],
    [new Date(3000).toISOString()],
  ])
  expect(new Set(bodies.flat().map((event) => event.occurredAt)).size).toBe(1)
  expect(new Set(bodies.flat().map((event) => event.eventId)).size).toBe(2)
  expect(JSON.parse(serializeBatch(client.config, bodies[0]!, true)).batch[0].sentAt).toBe(
    new Date(3000).toISOString(),
  )
})

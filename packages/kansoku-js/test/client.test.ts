import { expect, test } from "bun:test"

import {
  ack,
  createFetchMock,
  envelope,
  networkError,
  status,
} from "../../../test/helpers/fetch-mock.js"
import { createInternalClient, createKansoku } from "../src/client.js"
import type { AnalyticsEvent, DropInfo, KansokuOptions } from "../src/types.js"

function setup(overrides: Partial<KansokuOptions> = {}) {
  const mock = createFetchMock()
  const drops: DropInfo[] = []
  const client = createInternalClient({
    baseUrl: "https://analytics.test",
    writeKey: "ksk_w_test",
    storage: "memory",
    persistQueue: false,
    autoStart: false,
    autocapture: { sessions: false, pageViews: false },
    fetch: mock.fetch,
    retryBaseDelayMs: 0,
    onDrop: (info) => drops.push(info),
    ...overrides,
  })
  return { client, mock, drops }
}
test("three events flush once and overlapping callers share a flush", async () => {
  const { client, mock } = setup()
  for (const name of ["a", "b", "c"]) client.track(name)
  const first = client.flush()
  expect(client.flush()).toBe(first)
  await first
  expect(mock.requests).toHaveLength(1)
  expect(client.stats).toEqual({ queued: 0, accepted: 3, rejected: 0, dropped: 0 })
})
test("partial acceptance drops only rejected events and never retries them", async () => {
  const { client, mock, drops } = setup()
  mock.respondWith(ack(2, [{ index: 1, errors: ["bad"] }]))
  for (const name of ["a", "b", "c"]) client.track(name)
  await client.flush()
  await client.flush()
  expect(mock.requests).toHaveLength(1)
  expect(drops[0]).toMatchObject({ reason: "rejected", events: [{ eventName: "b" }] })
  expect(client.stats).toEqual({ queued: 0, accepted: 2, rejected: 1, dropped: 1 })
})
test("permanent HTTP outcomes drop without retrying", async () => {
  for (const response of [status(400), status(401), envelope(503, "unavailable", false)]) {
    const { client, mock, drops } = setup()
    mock.respondWith(response)
    client.track("a")
    await client.flush()
    expect(mock.requests).toHaveLength(1)
    expect(drops[0]?.reason).toBe("permanent_error")
  }
})
test("413 splits four events into two halves and preserves their IDs", async () => {
  const { client, mock } = setup()
  mock.respondWith(status(413))
  for (const name of ["a", "b", "c", "d"]) client.track(name)
  await client.flush()
  const bodies = mock.requests.map((r) => r.body as AnalyticsEvent[])
  expect(bodies.map((b) => b.length)).toEqual([4, 2, 2])
  expect(
    bodies
      .slice(1)
      .flat()
      .map((e) => e.eventId),
  ).toEqual(bodies[0]!.map((e) => e.eventId))
  expect(client.stats.accepted).toBe(4)
})
test("transient outcomes retry unchanged batches and exhaustion accounts for loss", async () => {
  const { client, mock } = setup()
  mock.respondWith(envelope(503, "busy", true), networkError(), ack(1))
  client.track("a")
  await client.flush()
  expect(mock.requests.map((r) => r.body)).toEqual(Array(3).fill(mock.requests[0]!.body))
  expect(client.stats.accepted).toBe(1)
  const exhausted = setup({ maxRetries: 1 })
  exhausted.mock.respondWith(networkError(), networkError())
  exhausted.client.track("b")
  await exhausted.client.flush()
  expect(exhausted.mock.requests).toHaveLength(2)
  expect(exhausted.drops[0]?.reason).toBe("retries_exhausted")
})
test("redaction, queue capacity, opt-out and shutdown have observable drop reasons", async () => {
  const redacted = setup({ beforeSend: () => null })
  redacted.client.track("a")
  expect(redacted.drops[0]?.reason).toBe("before_send")
  const { client, drops } = setup({ maxQueueSize: 1 })
  client.track("a")
  client.track("b")
  expect(drops[0]?.reason).toBe("queue_full")
  client.optOut()
  client.track("c")
  expect(drops.slice(1).map((d) => d.reason)).toEqual(["opted_out", "opted_out"])
  client.optIn()
  await client.shutdown()
  client.track("d")
  client.start()
  expect(drops.at(-1)).toMatchObject({ reason: "opted_out", detail: "shutdown" })
  expect(client.stats.queued).toBe(0)
})
test("session rolls ahead of its triggering event and can be disabled", async () => {
  let now = 0
  const { client, mock } = setup({
    now: () => now,
    sessionTimeoutMs: 100,
    autocapture: { sessions: true },
  })
  client.track("a")
  now = 101
  client.track("b")
  await client.flush()
  const events = mock.requests[0]!.body as AnalyticsEvent[]
  expect(events.map((e) => e.eventName)).toEqual(["session_start", "a", "session_start", "b"])
  expect(events[0]!.sessionId).not.toBe(events[2]!.sessionId)
})
test("start/stop are reversible, defer timers, and preserve context registration", async () => {
  const callbacks = new Map<number, () => void>()
  let next = 0
  const timers = {
    setTimeout: ((fn: () => void) => {
      callbacks.set(++next, fn)
      return next
    }) as unknown as typeof setTimeout,
    clearTimeout: ((id: number) => callbacks.delete(id)) as unknown as typeof clearTimeout,
  }
  const { client } = setup({ timers })
  const calls: string[] = []
  client.onStart(() => {
    calls.push("start")
    return () => calls.push("stop")
  })
  expect(callbacks.size).toBe(0)
  client.start()
  client.start()
  expect(callbacks.size).toBe(1)
  client.stop()
  client.stop()
  expect(callbacks.size).toBe(0)
  client.start()
  client.stop()
  expect(calls).toEqual(["start", "stop", "start", "stop"])
  const unregister = client.registerContextProvider(() => ({ common: "base", priority: "base" }))
  expect(client.buildEvent("a", {}, { context: { priority: "caller" } }).context).toEqual({
    common: "base",
    priority: "caller",
  })
  unregister()
  await client.shutdown()
})
test("queue survives a reload in sessionStorage with the same event IDs", async () => {
  const prefix = `persist-${crypto.randomUUID()}`
  const first = setup({ persistQueue: true, storageKeyPrefix: prefix })
  first.client.track("saved")
  const saved = JSON.parse(sessionStorage.getItem(`${prefix}.queue`)!)
  expect(localStorage.getItem(`${prefix}.queue`)).toBeNull()
  const second = setup({ persistQueue: true, storageKeyPrefix: prefix })
  await second.client.flush()
  expect(second.mock.requests[0]!.body).toEqual(saved)
  expect(JSON.parse(sessionStorage.getItem(`${prefix}.queue`)!)).toEqual([])
  sessionStorage.removeItem(`${prefix}.queue`)
})
test("public factory returns a usable core client", async () => {
  const mock = createFetchMock()
  const client = createKansoku({
    baseUrl: "https://analytics.test",
    writeKey: "ksk_w_test",
    fetch: mock.fetch,
    storage: "memory",
    persistQueue: false,
    autocapture: { sessions: false, pageViews: false },
  })
  client.track("ready")
  await client.shutdown()
  expect(client.stats.accepted).toBe(1)
})

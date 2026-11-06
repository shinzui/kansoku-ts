import { afterAll, afterEach, expect, spyOn, test } from "bun:test"

import { measurementLoader } from "../src/vitals-capture.js"
import type { Sample } from "../src/vitals.js"
import { vitalProperties } from "../src/vitals.js"
import { cleanupCapture, fixture } from "./capture-helper.js"

const unique = (events: import("../src/types.js").AnalyticsEvent[]) => [
  ...new Map(events.map((e) => [e.eventId, e])).values(),
]
const flags = { pageViews: false, pageLeave: false, sessions: false, webVitals: true }
let callback: ((sample: Sample) => void) | undefined
let loads = 0
let attaches = 0
let detaches = 0
const loader = spyOn(measurementLoader, "load")
function fake() {
  loads = attaches = detaches = 0
  callback = undefined
  loader.mockImplementation(async () => {
    loads++
    return {
      vitalProperties,
      subscribe(sink) {
        attaches++
        callback = sink
        return () => {
          detaches++
          callback = undefined
        }
      },
    }
  })
}
afterEach(cleanupCapture)
afterEach(() => loader.mockReset())
afterAll(() => loader.mockRestore())
const tick = () => new Promise((resolve) => setTimeout(resolve, 10))
function sample(name: Sample["name"], value: number, id = name as string, restored = false) {
  callback?.({ name, value, id, navigationType: restored ? "back-forward-cache" : "navigate" })
}
function exit() {
  window.dispatchEvent(new Event("pagehide"))
}
function restore() {
  const event = new Event("pageshow")
  Object.defineProperty(event, "persisted", { value: true })
  window.dispatchEvent(event)
}

test("vitals load only after opt-in and start and keep one final value per document metric", async () => {
  fake()
  const off = fixture()
  const { client, events } = fixture({ autoStart: false, autocapture: flags })
  await tick()
  expect(loads).toBe(0)
  client.start()
  client.page()
  const url = location.href
  const session = client.getSessionId()
  await tick()
  expect(loads).toBe(1)
  sample("FCP", 0)
  sample("FCP", 4)
  sample("TTFB", 20)
  sample("LCP", 120)
  sample("LCP", 220)
  sample("CLS", 1.5)
  sample("INP", 70)
  history.replaceState({}, "", "/later-route")
  client.page()
  sample("LCP", 300)
  exit()
  await client.flush()
  const captured = unique(events()).filter((e) => e.eventName === "web_vital")
  expect(captured).toHaveLength(5)
  expect(captured.map((e) => e.properties)).toContainEqual({ metric: "LCP", value: 300 })
  expect(captured.map((e) => e.properties)).toContainEqual({ metric: "CLS", value: 1.5 })
  expect(captured.map((e) => e.properties)).toContainEqual({ metric: "FCP", value: 0 })
  expect(captured.every((e) => e.url === url && e.sessionId === session)).toBe(true)
  client.stop()
  client.start()
  await tick()
  sample("LCP", 1000)
  exit()
  await client.flush()
  expect(unique(events()).filter((e) => e.eventName === "web_vital")).toHaveLength(5)
  expect(loads).toBe(1)
  expect(attaches).toBe(2)
  expect(detaches).toBe(1)
  expect(off.events()).toHaveLength(0)
})

test("held values wait for the first page; BFCache resets attribution and omits TTFB", async () => {
  fake()
  const { client, events } = fixture({ autocapture: { ...flags, pageViews: true } })
  await tick()
  sample("LCP", 42)
  exit()
  await client.flush()
  restore()
  await tick()
  sample("LCP", 18, "restored-lcp", true)
  sample("FCP", 10, "restored-fcp", true)
  sample("TTFB", 0, "restored-ttfb", true)
  exit()
  await client.flush()
  const captured = unique(events()).filter((e) => e.eventName === "web_vital")
  expect(captured.map((e) => e.properties)).toEqual([
    { metric: "LCP", value: 42 },
    { metric: "FCP", value: 10 },
    { metric: "LCP", value: 18 },
  ])
  expect(unique(events()).filter((e) => e.eventName === "page_view")).toHaveLength(2)
})

test("no page, reset, opt-out and invalid measurements cannot release old samples", async () => {
  for (const action of ["no-page", "reset", "opt-out"] as const) {
    fake()
    const { client, events } = fixture({ autocapture: flags })
    await tick()
    sample("LCP", 100)
    if (action !== "no-page") client.page()
    if (action === "reset") client.reset()
    if (action === "opt-out") {
      client.optOut()
      client.optIn()
      client.page()
    }
    exit()
    await client.flush()
    expect(unique(events()).filter((e) => e.eventName === "web_vital")).toHaveLength(0)
    await client.shutdown()
  }
  expect(vitalProperties("LCP", -1)).toBeUndefined()
  expect(vitalProperties("OTHER", 0)).toBeUndefined()
  expect(vitalProperties("CLS", NaN)).toBeUndefined()
  expect(vitalProperties("TTFB", Infinity)).toBeUndefined()
})

test("one exit with three pending measurements writes the queue mirror once before sending", async () => {
  fake()
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage")!
  const storage = sessionStorage
  const writes: string[] = []
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.getItem(key),
      removeItem: (key: string) => storage.removeItem(key),
      setItem(key: string, value: string) {
        writes.push(key)
        storage.setItem(key, value)
      },
    },
  })
  try {
    const { client } = fixture({
      persistQueue: true,
      storageKeyPrefix: "vital-mirror",
      autocapture: flags,
    })
    client.page()
    await tick()
    sample("LCP", 42)
    sample("CLS", 0)
    sample("INP", 80)
    writes.length = 0
    exit()
    expect(writes.filter((key) => key === "vital-mirror.queue")).toHaveLength(1)
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", descriptor)
  }
})

test("late import after exit and failed import are silent and never become captured errors", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof measurementLoader.load>>) => void
  loader.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const { client, events } = fixture({ autocapture: flags })
  client.page()
  await tick()
  exit()
  resolve({
    vitalProperties,
    subscribe() {
      throw new Error("must not attach after exit")
    },
  })
  await tick()
  await client.flush()
  expect(unique(events()).filter((e) => e.eventName === "web_vital")).toHaveLength(0)
  loader.mockImplementation(async () => {
    throw new Error("network")
  })
  const other = fixture({ autocapture: { ...flags, clientErrors: true } })
  await tick()
  await other.client.flush()
  expect(other.events()).toHaveLength(0)
})

test("vitals share beforeSend drop/redaction and configured privacy suppression on exit", async () => {
  fake()
  const { client, events } = fixture({
    autocapture: flags,
    beforeSend: (e) => {
      if (e.eventName !== "web_vital") return e
      return e.properties.metric === "CLS" ? null : { ...e, url: "https://redacted.test" }
    },
  })
  client.page()
  await tick()
  sample("LCP", 100)
  sample("CLS", 0)
  exit()
  await client.flush()
  const captured = unique(events()).filter((e) => e.eventName === "web_vital")
  expect(captured).toHaveLength(1)
  expect(captured[0]?.url).toBe("https://redacted.test")
  await client.shutdown()
  for (const [property, option, signal] of [
    ["doNotTrack", "respectDoNotTrack", "1"],
    ["globalPrivacyControl", "respectGlobalPrivacyControl", true],
  ] as const) {
    const previous = Object.getOwnPropertyDescriptor(navigator, property)
    try {
      fake()
      const gated = fixture({ autocapture: flags, [option]: true })
      gated.client.page()
      await tick()
      sample("LCP", 50)
      Object.defineProperty(navigator, property, { value: signal, configurable: true })
      exit()
      Object.defineProperty(navigator, property, { value: false, configurable: true })
      restore()
      exit()
      await gated.client.flush()
      expect(unique(gated.events()).filter((e) => e.eventName === "web_vital")).toHaveLength(0)
      expect(gated.drops).toHaveLength(0)
      await gated.client.shutdown()
    } finally {
      if (previous) Object.defineProperty(navigator, property, previous)
      else Reflect.deleteProperty(navigator, property)
    }
  }
})

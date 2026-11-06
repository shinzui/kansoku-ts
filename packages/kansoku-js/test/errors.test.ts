import { afterEach, expect, spyOn, test } from "bun:test"

import { errorProperties } from "../src/errors.js"
import { cleanupCapture, fixture } from "./capture-helper.js"

afterEach(cleanupCapture)

function error(value: unknown, message = "") {
  const event = new ErrorEvent("error", { error: value, message, cancelable: true })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
}
function reject(value: unknown) {
  const event = new Event("unhandledrejection", { cancelable: true })
  Object.defineProperty(event, "reason", { value })
  window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
}
const flags = { pageViews: false, sessions: false, pageLeave: false, clientErrors: true }

test("error opt-in uses the page envelope and shared beforeSend, validation and batching", async () => {
  let now = 0
  const { client, events } = fixture({
    now: () => now,
    autocapture: flags,
    beforeSend: (e) => ({ ...e, context: { reviewed: true } }),
  })
  client.page()
  const session = client.getSessionId()
  now += 2000000
  error(
    new TypeError("Failure https://secret.test/a user@example.com 123456789\nprivate second line"),
  )
  await client.flush()
  const event = events().find((e) => e.eventName === "client_error")!
  expect(event).toMatchObject({
    schemaVersion: 1,
    sessionId: session,
    url: location.href,
    context: { reviewed: true },
    properties: { message: "Failure <url> <email> <number>", type: "TypeError", handled: false },
  })
  expect(events().filter((e) => e.eventName === "session_start")).toHaveLength(0)
})

test("default installs no listeners; stop/start owns exactly one error listener", async () => {
  const add = spyOn(window, "addEventListener")
  const remove = spyOn(window, "removeEventListener")
  const baseline = fixture()
  expect(add.mock.calls.filter((c) => ["error", "unhandledrejection"].includes(c[0]))).toHaveLength(
    0,
  )
  const enabled = fixture({ autocapture: flags })
  enabled.client.start()
  enabled.client.stop()
  enabled.client.start()
  error(new Error("once"))
  await enabled.client.flush()
  expect(enabled.events().filter((e) => e.eventName === "client_error")).toHaveLength(1)
  expect(baseline.events()).toHaveLength(0)
  expect(add.mock.calls.filter((c) => c[0] === "error")).toHaveLength(2)
  expect(remove.mock.calls.filter((c) => c[0] === "error")).toHaveLength(1)
  add.mockRestore()
  remove.mockRestore()
})

test("dedupe spans stop/start, identity and one-second labels while budgets survive drops", async () => {
  let now = 0
  let calls = 0
  const { client, events } = fixture({
    now: () => now,
    autocapture: flags,
    beforeSend: (e) => {
      if (e.eventName === "client_error") {
        calls++
        error(new Error("recursive"))
        return null
      }
      return e
    },
  })
  const same = new Error("same")
  error(same)
  error(same)
  error(new Error("same"))
  client.stop()
  client.start()
  error(same)
  for (let view = 0; view < 4; view++) {
    client.page()
    for (let i = 0; i < 15; i++) error(new Error(`view${view} message${i}`))
  }
  expect(calls).toBe(30)
  now = 60001
  client.page()
  error(new Error("eligible again"))
  expect(calls).toBe(31)
  await client.flush()
  expect(events().filter((e) => e.eventName === "client_error")).toHaveLength(0)
})

test("labels bound Unicode and hostile inputs without reading stacks or serializing values", () => {
  const hostile = new Proxy(
    {},
    {
      get() {
        throw new Error("getter")
      },
    },
  )
  const cycle: Record<string, unknown> = {}
  cycle.self = cycle
  for (const value of ["private", 3, cycle, hostile, { name: "Bad type private", message: "" }]) {
    const result = errorProperties(value, true)
    expect(result.handled).toBe(false)
    expect(JSON.stringify(result)).not.toContain("private")
  }
  const value = {
    name: "RangeError",
    message: "😀".repeat(1000000),
    get stack() {
      throw new Error("stack accessed")
    },
  }
  expect(Array.from(errorProperties(value).message as string)).toHaveLength(256)
  expect(errorProperties({ name: "x".repeat(129), message: "a".repeat(1023) + "😀" }).type).toBe(
    "Error",
  )
  expect(errorProperties(undefined, false, true).message).toBe("Script error.")
  expect(
    errorProperties(
      new Error("ftp://private.test/person file:///Users/private/name www.private.test/path"),
    ).message,
  ).toBe("<url> <url> <url>")
})

test("resource failures are absent and arbitrary rejections have fixed labels", async () => {
  const { client, events } = fixture({ autocapture: flags })
  const image = document.createElement("img")
  document.body.append(image)
  image.dispatchEvent(new Event("error"))
  reject("secret token")
  reject({ private: "secret" })
  await client.flush()
  const errors = events().filter((e) => e.eventName === "client_error")
  expect(errors).toHaveLength(1)
  expect(errors[0]?.properties).toEqual({
    type: "UnhandledRejection",
    message: "Non-error promise rejection",
    handled: false,
  })
  image.remove()
})

test("privacy suppression is silent and reset retires page attribution", async () => {
  const { client, events, drops } = fixture({ autocapture: flags })
  client.page()
  const old = client.getAnonymousId()
  client.optOut()
  error(new Error("hidden"))
  client.optIn()
  client.reset()
  error(new Error("fresh"))
  await client.flush()
  const captured = events().filter((e) => e.eventName === "client_error")
  expect(captured).toHaveLength(1)
  expect(captured[0]?.anonymousId).not.toBe(old)
  expect(drops.flatMap((d) => d.events).some((e) => e.eventName === "client_error")).toBe(false)
})

test("DNT/GPC suppress error capture silently and opt-in resumes within finite view limits", async () => {
  for (const [property, option, signal] of [
    ["doNotTrack", "respectDoNotTrack", "1"],
    ["globalPrivacyControl", "respectGlobalPrivacyControl", true],
  ] as const) {
    const previous = Object.getOwnPropertyDescriptor(navigator, property)
    Object.defineProperty(navigator, property, { value: signal, configurable: true })
    try {
      const { client, events, drops } = fixture({ autocapture: flags, [option]: true })
      error(new Error("suppressed"))
      await client.flush()
      expect(events()).toHaveLength(0)
      expect(drops).toHaveLength(0)
      Object.defineProperty(navigator, property, { value: false, configurable: true })
      for (let i = 0; i < 11; i++) error(new Error(`eligible-${i}`))
      await client.flush()
      expect(events().filter((e) => e.eventName === "client_error")).toHaveLength(10)
      await client.shutdown()
    } finally {
      if (previous) Object.defineProperty(navigator, property, previous)
      else Reflect.deleteProperty(navigator, property)
    }
  }
})

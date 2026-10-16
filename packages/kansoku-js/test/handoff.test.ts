import { expect, spyOn, test } from "bun:test"

import { memoryStorage } from "../src/storage.js"
import { fixture } from "./capture-helper.js"

const policy = { accept: true, allowedOrigins: ["https://app.example.test"] }
const arrive = (query: string) => history.replaceState({}, "", `/arrival?${query}`)

test("fresh handoff adopts once and strips before the first page attribution", async () => {
  arrive("kansoku_aid=marketing-id&utm_source=email#section")
  const { client, events } = fixture({
    crossOriginLink: policy,
    autocapture: { pageViews: true, sessions: false },
  })
  expect(client.getAnonymousId()).toBe("marketing-id")
  expect(location.search).toBe("?utm_source=email")
  expect(location.hash).toBe("#section")
  await client.flush()
  expect(events()).toHaveLength(1)
  expect(events()[0]?.url).not.toContain("kansoku_aid")
  expect(events()[0]?.utmSource).toBe("email")
})

test("seeded handoff merges cookie evidence and preserves conflicting/authenticated state", () => {
  for (const [cookie, user, expected] of [
    [undefined, undefined, "incoming"],
    ["existing", undefined, "existing"],
    [undefined, "authenticated", undefined],
  ] as const) {
    const storage = memoryStorage()
    const prefix = crypto.randomUUID()
    storage.set(`${prefix}.anonymous_id`, "local")
    storage.set(
      `${prefix}.identifiers`,
      JSON.stringify({ device: "device", ...(cookie ? { cookie } : {}) }),
    )
    if (user) storage.set(`${prefix}.user_id`, user)
    arrive("kansoku_aid=incoming")
    const { client } = fixture({ storage, storageKeyPrefix: prefix, crossOriginLink: policy })
    expect(client.getAnonymousId()).toBe("local")
    const stored = JSON.parse(storage.get(`${prefix}.identifiers`)!)
    expect(stored.device).toBe("device")
    expect(stored.cookie).toBe(expected)
    expect(location.search).toBe("")
  }
})

test("ambiguous, invalid, disabled and privacy-suppressed arrivals are stripped and ignored", () => {
  for (const [query, options] of [
    ["kansoku_aid=one&kansoku_aid=two", {}],
    ["kansoku_aid=bad%20id", {}],
    ["kansoku_aid=valid", { crossOriginLink: { accept: false, allowedOrigins: [] } }],
    ["kansoku_aid=valid", { optOut: true }],
  ] as const) {
    arrive(query)
    const { client } = fixture({ crossOriginLink: policy, ...options })
    expect(client.getAnonymousId()).not.toBe("valid")
    expect(client.getAnonymousId()).not.toBe("one")
    expect(location.search).toBe("")
  }
})

test("link decoration requires start, privacy permission and an exact HTTP destination", () => {
  arrive("")
  const { client } = fixture({ autoStart: false, crossOriginLink: policy })
  expect(client.linkTo("https://app.example.test/signup?kansoku_aid=stale")).not.toContain(
    "kansoku_aid",
  )
  client.start()
  expect(
    new URL(client.linkTo("https://app.example.test/signup?next=x#hash")).searchParams.get(
      "kansoku_aid",
    ),
  ).toBe(client.getAnonymousId())
  expect(client.linkTo("https://app.example.test.attacker.test/?kansoku_aid=stale")).not.toContain(
    "kansoku_aid",
  )
  expect(client.linkTo("mailto:someone@example.test")).not.toContain("kansoku_aid")
  client.optOut()
  expect(client.linkTo("https://app.example.test/signup")).not.toContain("kansoku_aid")
  expect(() =>
    fixture({ crossOriginLink: { allowedOrigins: ["https://app.example.test/path"] } }),
  ).toThrow()
})

test("already-open clients reread shared identity, reset, sessions and opt-out before capture", async () => {
  const storage = memoryStorage(),
    prefix = crypto.randomUUID()
  const first = fixture({ storage, storageKeyPrefix: prefix })
  const second = fixture({ storage, storageKeyPrefix: prefix })
  first.client.identify("signed-in", { plan: "pro" })
  first.client.setIdentifiers({ device: "device" })
  first.client.group("org")
  second.client.track("before-reset")
  first.client.reset()
  second.client.track("after-reset")
  await second.client.flush()
  expect(second.events()[0]).toMatchObject({
    userId: "signed-in",
    organizationId: "org",
    identifiers: { device: "device" },
  })
  expect(second.events()[1]?.userId).toBeUndefined()
  expect(second.events()[1]?.identifiers).toBeUndefined()
  expect(second.events()[1]?.organizationId).toBeUndefined()
  expect(second.events()[1]?.anonymousId).toBe(first.client.getAnonymousId())
  expect(second.events()[1]?.sessionId).toBe(first.client.getSessionId())
  second.client.track("pending")
  first.client.optOut()
  second.client.track("suppressed")
  expect(second.client.stats.queued).toBe(0)
  expect(second.client.isOptedOut()).toBe(true)
  first.client.optIn()
  expect(second.client.isOptedOut()).toBe(false)
})

test("a rejected cookie domain uses only memory and a redacted debug diagnostic", () => {
  const log = spyOn(console, "debug").mockImplementation(() => {})
  try {
    const { client } = fixture({
      storage: "cookie",
      cookieDomain: "unrelated.invalid",
      debug: true,
      storageKeyPrefix: crypto.randomUUID(),
    })
    client.identify("private-user")
    expect(client.getUserId()).toBe("private-user")
    expect(log.mock.calls.flat().join(" ")).toContain("using memory")
    expect(log.mock.calls.flat().join(" ")).not.toContain("private-user")
    expect(document.cookie).not.toContain("private-user")
  } finally {
    log.mockRestore()
  }
})

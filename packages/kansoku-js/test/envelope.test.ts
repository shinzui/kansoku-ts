import { expect, test } from "bun:test"

import { buildEvent } from "../src/envelope.js"

const deps = {
  identity: { anonymousId: "stored", userId: "known" },
  sessionId: "session",
  config: { now: () => 1000, sourceService: "site", schemaVersions: { page_view: 1 } },
  baseContext: { locale: "en", key: "base" },
}
test("stamps required fields, pins, context, web fields and per-event identity", () => {
  const event = buildEvent(
    deps,
    "page_view",
    { url: "https://example.test" },
    { context: { key: "caller" } },
    { url: "https://example.test", utmSource: "email" },
    { anonymousId: "previous", userId: "next" },
  )
  expect(event).toMatchObject({
    source: "web",
    eventName: "page_view",
    schemaVersion: 1,
    sourceService: "site",
    sessionId: "session",
    anonymousId: "previous",
    userId: "next",
    occurredAt: "1970-01-01T00:00:01.000Z",
    receivedAt: "1970-01-01T00:00:01.000Z",
    context: { locale: "en", key: "caller" },
    url: "https://example.test",
    utmSource: "email",
  })
  expect(event.eventId.length).toBeGreaterThan(10)
  expect(deps.identity).toEqual({ anonymousId: "stored", userId: "known" })
})
test("omits unpinned schema versions and allows call overrides", () => {
  expect(buildEvent(deps, "custom")).not.toHaveProperty("schemaVersion")
  expect(
    buildEvent(deps, "page_view", {}, { schemaVersion: 2, occurredAt: new Date(0) }),
  ).toMatchObject({ schemaVersion: 2, occurredAt: "1970-01-01T00:00:00.000Z" })
})

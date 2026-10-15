import { expect, test } from "bun:test"

import { fixture } from "./capture-helper.js"

test("identify, alias and group match the server helper shapes", async () => {
  const { client, events } = fixture()
  const anon = client.getAnonymousId()
  client.identify("user", { plan: "pro" })
  client.alias("old-anon", "linked-user")
  client.group("org", { tier: "team" })
  client.setIdentifiers({ device: "dev-1", email_sha256: "ab12", email_hmac: "v1:opaque" })
  client.track("later")
  await client.flush()
  expect(events()[0]).toMatchObject({
    eventName: "identify",
    anonymousId: anon,
    userId: "user",
    properties: { plan: "pro" },
  })
  expect(events()[0]).not.toHaveProperty("schemaVersion")
  expect(events()[1]).toMatchObject({
    eventName: "alias",
    anonymousId: "old-anon",
    userId: "linked-user",
    properties: { previousId: "old-anon", newId: "linked-user" },
  })
  expect(events()[2]).toMatchObject({
    eventName: "group",
    organizationId: "org",
    userId: "user",
    properties: { tier: "team" },
  })
  expect(events()[3]).toMatchObject({
    userId: "user",
    organizationId: "org",
    identifiers: { device: "dev-1", email_sha256: "ab12", email_hmac: "v1:opaque" },
  })
})
test("invalid identifiers do not replace stored signals and reset preserves queued attribution", async () => {
  const { client, events, drops } = fixture()
  client.identify("user")
  client.group("org")
  client.setIdentifiers({ device: "good" })
  client.setIdentifiers({ fingerprint: "has space" })
  client.track("before")
  const anon = client.getAnonymousId(),
    session = client.getSessionId()
  client.reset()
  client.track("after")
  await client.flush()
  expect(drops[0]).toMatchObject({ reason: "invalid", events: [] })
  expect(events().find((event) => event.eventName === "before")).toMatchObject({
    anonymousId: anon,
    userId: "user",
    identifiers: { device: "good" },
  })
  const after = events().at(-1)!
  expect(after.anonymousId).not.toBe(anon)
  expect(after.sessionId).not.toBe(session)
  expect(after).not.toHaveProperty("userId")
  expect(after).not.toHaveProperty("organizationId")
  expect(after).not.toHaveProperty("identifiers")
})
test("identity and group persist under the configured keys", () => {
  const prefix = `identity-${crypto.randomUUID()}`
  const { client } = fixture({ storage: "localStorage", storageKeyPrefix: prefix })
  client.identify("persisted")
  client.group("organization")
  expect(localStorage.getItem(`${prefix}.user_id`)).toBe("persisted")
  expect(localStorage.getItem(`${prefix}.organization_id`)).toBe("organization")
  client.reset()
  expect(localStorage.getItem(`${prefix}.user_id`)).toBeNull()
})

import { expect, test } from "bun:test"

import { fixture } from "./capture-helper.js"

test("exposure dedupes per session and pair, supports force, and rejects invalid names", async () => {
  const { client, events, drops } = fixture()
  client.experiment("pricing_page", "a")
  client.experiment("pricing_page", "a")
  client.experiment("pricing_page", "a", {}, { force: true })
  client.experiment("Pricing Page", "b")
  client.reset()
  client.experiment("pricing_page", "a")
  await client.flush()
  expect(events()).toHaveLength(3)
  expect(events()[0]).toMatchObject({
    eventName: "experiment_viewed",
    schemaVersion: 1,
    properties: { experiment: "pricing_page", variant: "a" },
  })
  expect(drops[0]?.reason).toBe("invalid")
})
test("beforeSend drops do not consume the exposure dedupe key", async () => {
  let allow = false
  const { client, events } = fixture({ beforeSend: (event) => (allow ? event : null) })
  client.experiment("exp", "a")
  allow = true
  client.experiment("exp", "a")
  await client.flush()
  expect(events()).toHaveLength(1)
})

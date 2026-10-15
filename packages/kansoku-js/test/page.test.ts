import { expect, test } from "bun:test"

import { fixture } from "./capture-helper.js"

test("page includes attribution, title, context, properties and schema pin", async () => {
  history.replaceState({}, "", "/pricing?utm_source=email&utm_campaign=launch")
  document.title = "Pricing"
  Object.defineProperty(document, "referrer", { value: "https://search.test", configurable: true })
  const { client, events } = fixture()
  client.page({ section: "plans" })
  await client.flush()
  expect(events()[0]).toMatchObject({
    eventName: "page_view",
    schemaVersion: 1,
    url: location.href,
    referrer: "https://search.test",
    utmSource: "email",
    utmCampaign: "launch",
    properties: { url: location.href, path: "/pricing", title: "Pricing", section: "plans" },
    context: { library: { name: "kansoku-js" } },
  })
  client.page({ title: "caller" }, { schemaVersion: 2 })
  await client.flush()
  expect(events()[1]).toMatchObject({ schemaVersion: 2, properties: { title: "caller" } })
})
test("default capture records session_start before the initial page view", async () => {
  const { client, events } = fixture({ autocapture: {} })
  await client.flush()
  expect(events().map((event) => event.eventName)).toEqual(["session_start", "page_view"])
})

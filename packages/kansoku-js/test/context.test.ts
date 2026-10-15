import { expect, test } from "bun:test"

import { collectContext } from "../src/context.js"
import { fixture } from "./capture-helper.js"

test("collects the six browser context fields per event", async () => {
  expect(Object.keys(collectContext("test"))).toEqual([
    "library",
    "locale",
    "timezone",
    "screen",
    "viewport",
    "userAgent",
  ])
  const { client, events } = fixture()
  client.track("a", {}, { context: { locale: "caller" } })
  await client.flush()
  expect(events()[0]!.context).toMatchObject({
    locale: "caller",
    library: { name: "kansoku-js" },
    viewport: { width: window.innerWidth },
  })
})

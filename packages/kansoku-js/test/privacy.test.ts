import { expect, test } from "bun:test"

import { fixture, nextNavigation } from "./capture-helper.js"

test("opt-out silently suppresses autocapture and reports explicit calls, then resumes", async () => {
  const { client, events, drops } = fixture({ optOut: true, autocapture: {} })
  client.track("explicit")
  client.identify("user")
  client.experiment("exp", "a")
  history.pushState({}, "", "/suppressed")
  await nextNavigation()
  await client.flush()
  expect(events()).toHaveLength(0)
  expect(drops.map((info) => info.reason)).toEqual(["opted_out", "opted_out", "opted_out"])
  expect(client.getUserId()).toBeUndefined()
  client.optIn()
  history.pushState({}, "", "/opted-in")
  await nextNavigation()
  await client.flush()
  expect(events().at(-1)?.eventName).toBe("page_view")
})
test("DNT and GPC are honored only when requested", async () => {
  for (const [property, option, signal] of [
    ["doNotTrack", "respectDoNotTrack", "1"],
    ["globalPrivacyControl", "respectGlobalPrivacyControl", true],
  ] as const) {
    const previous = Object.getOwnPropertyDescriptor(navigator, property)
    Object.defineProperty(navigator, property, { value: signal, configurable: true })
    try {
      const gated = fixture({ [option]: true, autocapture: {} })
      gated.client.track("test")
      gated.client.page()
      await gated.client.flush()
      expect(gated.events()).toHaveLength(0)
      expect(gated.drops.map((info) => info.reason)).toEqual(["opted_out", "opted_out"])
      const defaultClient = fixture()
      defaultClient.client.track("test")
      await defaultClient.client.flush()
      expect(defaultClient.events()).toHaveLength(1)
    } finally {
      if (previous) Object.defineProperty(navigator, property, previous)
      else Reflect.deleteProperty(navigator, property)
    }
  }
})

test("suppressed identifyOnce reports a drop without changing active identity", () => {
  const { client, drops } = fixture({ optOut: true })
  client.identifyOnce("must-not-persist", { plan: "pro" })
  expect(client.getUserId()).toBeUndefined()
  expect(drops.at(-1)?.reason).toBe("opted_out")
})

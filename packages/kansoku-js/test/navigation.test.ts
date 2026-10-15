import { expect, test } from "bun:test"

import { fixture, nextNavigation } from "./capture-helper.js"

test("multiple SDK clients can stop out of order without leaving their own History wrappers", async () => {
  const original = history.pushState
  const first = fixture({ autocapture: { sessions: false } })
  const second = fixture({ autocapture: { sessions: false } })
  first.client.stop()
  second.client.stop()
  expect(history.pushState).toBe(original)
  await Promise.all([first.client.flush(), second.client.flush()])
})

test("captures SPA navigation once per origin/path/query and ignores hashes", async () => {
  history.replaceState({}, "", "/")
  const original = history.pushState
  const { client, events } = fixture({ autocapture: { sessions: false } })
  history.pushState({}, "", "/docs")
  history.replaceState({}, "", "/docs")
  document.title = "Docs"
  await nextNavigation()
  location.hash = "#install"
  await nextNavigation()
  await client.flush()
  expect(events().map((event) => event.properties.path)).toEqual(["/", "/docs"])
  expect(events()[1]!.properties.title).toBe("Docs")
  history.pushState({}, "", "/back-target")
  await nextNavigation()
  history.back()
  await nextNavigation()
  await client.flush()
  expect(events().at(-1)!.properties.path).toBe("/docs")
  await client.shutdown()
  expect(history.pushState).toBe(original)
})
test("autoStart defers capture and start/stop preserve the dedupe key", async () => {
  history.replaceState({}, "", "/lifecycle")
  const original = history.pushState
  const { client, mock, events } = fixture({ autoStart: false, autocapture: { sessions: false } })
  expect(history.pushState).toBe(original)
  expect(client.stats.queued).toBe(0)
  client.start()
  client.stop()
  await client.flush()
  client.start()
  await client.flush()
  expect(events()).toHaveLength(1)
  client.stop()
  await client.flush()
  const before = mock.requests.length
  history.pushState({}, "", "/paused")
  await nextNavigation()
  expect(mock.requests).toHaveLength(before)
  client.start()
  history.pushState({}, "", "/resumed")
  await nextNavigation()
  await client.flush()
  expect(events().at(-1)!.properties.path).toBe("/resumed")
})

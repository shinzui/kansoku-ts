import { expect, spyOn, test } from "bun:test"

import { render, renderHook } from "@testing-library/react"
import type { KansokuClient } from "kansoku-js"
import { memo, StrictMode } from "react"

import { KansokuProvider, useKansoku } from "../src/index.js"
import { fixture } from "./helpers.js"

test("provider creates a shared client from options and stops on unmount", async () => {
  const { config, mock } = fixture()
  const original = history.pushState
  let client!: KansokuClient
  function Consumer() {
    client = useKansoku()
    return <span>ready</span>
  }
  const view = render(
    <KansokuProvider options={{ ...config, autocapture: { sessions: false } }}>
      <Consumer />
    </KansokuProvider>,
  )
  expect(history.pushState).not.toBe(original)
  client.track("hello")
  view.unmount()
  expect(history.pushState).toBe(original)
  await client.flush()
  expect(
    mock.requests
      .flatMap((request) => request.body as Array<{ eventName: string }>)
      .map((event) => event.eventName),
  ).toEqual(["page_view", "hello"])
  expect(client.getAnonymousId()).not.toBe("")
})
test("provider leaves an external client's lifecycle untouched", async () => {
  const { client, wrapper, mock } = fixture()
  const start = spyOn(client, "start"),
    stop = spyOn(client, "stop"),
    shutdown = spyOn(client, "shutdown")
  const view = renderHook(() => useKansoku(), { wrapper })
  expect(view.result.current).toBe(client)
  view.unmount()
  expect(start).not.toHaveBeenCalled()
  expect(stop).not.toHaveBeenCalled()
  expect(shutdown).not.toHaveBeenCalled()
  expect(mock.requests).toHaveLength(0)
  start.mockRestore()
  stop.mockRestore()
  shutdown.mockRestore()
  await client.shutdown()
})
test("StrictMode restarts the owned client and records one initial page view", async () => {
  const { config, mock } = fixture()
  let client!: KansokuClient
  function Consumer() {
    client = useKansoku()
    return null
  }
  const original = history.pushState
  const view = render(
    <StrictMode>
      <KansokuProvider options={{ ...config, autocapture: { sessions: false } }}>
        <Consumer />
      </KansokuProvider>
    </StrictMode>,
  )
  client.track("after-restart")
  await client.flush()
  const events = mock.requests.flatMap((request) => request.body as Array<{ eventName: string }>)
  expect(events.filter((event) => event.eventName === "page_view")).toHaveLength(1)
  expect(events.filter((event) => event.eventName === "after-restart")).toHaveLength(1)
  expect(history.pushState).not.toBe(original)
  view.unmount()
  expect(history.pushState).toBe(original)
})
test("context value remains stable when the provider rerenders", () => {
  const { client } = fixture()
  let renders = 0
  const Consumer = memo(function Consumer() {
    useKansoku()
    renders++
    return null
  })
  const view = render(
    <KansokuProvider client={client}>
      <Consumer />
    </KansokuProvider>,
  )
  view.rerender(
    <KansokuProvider client={client}>
      <Consumer />
    </KansokuProvider>,
  )
  expect(renders).toBe(1)
})
test("useKansoku throws outside a provider in the browser", () => {
  expect(() => renderHook(() => useKansoku())).toThrow(
    "useKansoku must be used inside <KansokuProvider>",
  )
})

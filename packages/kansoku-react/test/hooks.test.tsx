import { expect, spyOn, test } from "bun:test"

import { renderHook } from "@testing-library/react"
import { StrictMode } from "react"
import type { ReactNode } from "react"

import {
  KansokuProvider,
  useExperiment,
  useIdentify,
  useIdentifyOnce,
  usePageView,
  useTrack,
} from "../src/index.js"
import { fixture } from "./helpers.js"

test("manual page-view hooks emit once under StrictMode", async () => {
  const { client, events } = fixture()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <KansokuProvider client={client}>{children}</KansokuProvider>
    </StrictMode>
  )
  renderHook(() => usePageView("/strict"), { wrapper })
  await client.flush()
  expect(events()).toHaveLength(1)
})

test("identifying the same user after logout restores the cleared identity", async () => {
  const { client, events, wrapper } = fixture()
  const hook = renderHook(({ id }: { id: string | undefined }) => useIdentify(id), {
    wrapper,
    initialProps: { id: "same-user" as string | undefined },
  })
  client.reset()
  hook.rerender({ id: undefined })
  hook.rerender({ id: "same-user" })
  await client.flush()
  expect(events().filter((event) => event.eventName === "identify")).toHaveLength(2)
  expect(client.getUserId()).toBe("same-user")
})

test("useTrack sends events and keeps a stable function reference", async () => {
  const { client, events, wrapper } = fixture()
  const hook = renderHook(() => useTrack(), { wrapper })
  const first = hook.result.current
  first("clicked", { cta: "pricing" })
  hook.rerender()
  expect(hook.result.current).toBe(first)
  await client.flush()
  expect(events()[0]).toMatchObject({ eventName: "clicked", properties: { cta: "pricing" } })
})
test("usePageView emits on mount and only when its key changes", async () => {
  const { client, events, wrapper } = fixture()
  const hook = renderHook(({ page }) => usePageView(page), {
    initialProps: { page: "/a" },
    wrapper,
  })
  hook.rerender({ page: "/a" })
  hook.rerender({ page: "/b" })
  await client.flush()
  expect(events().map((event) => event.eventName)).toEqual(["page_view", "page_view"])
  expect(events()[0]!.properties.url).toBe(location.href)
})
test("usePageView warns once when automatic page capture is enabled", () => {
  const { wrapper } = fixture({ autocapture: { pageViews: true, sessions: false } })
  const warn = spyOn(console, "warn").mockImplementation(() => {})
  try {
    const first = renderHook(() => usePageView("a"), { wrapper })
    first.unmount()
    const second = renderHook(() => usePageView("b"), { wrapper })
    second.unmount()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain("autocapture.pageViews")
  } finally {
    warn.mockRestore()
  }
})
test("useIdentify follows user IDs and ignores traits object identity", async () => {
  const { client, events, wrapper } = fixture()
  const hook = renderHook(
    ({ id }: { id: string | undefined }) => useIdentify(id, { plan: "team" }),
    { initialProps: { id: undefined as string | undefined }, wrapper },
  )
  hook.rerender({ id: "user_1" })
  hook.rerender({ id: "user_1" })
  hook.rerender({ id: "user_2" })
  hook.rerender({ id: undefined })
  await client.flush()
  expect(events().map((event) => event.userId)).toEqual(["user_1", "user_2"])
  expect(events()[0]!.properties).toEqual({ plan: "team" })
  expect(client.getUserId()).toBe("user_2")
})
test("useExperiment relies on core dedupe under StrictMode and follows variant changes", async () => {
  const { client, events } = fixture()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <KansokuProvider client={client}>{children}</KansokuProvider>
    </StrictMode>
  )
  const hook = renderHook(({ variant }) => useExperiment("checkout_copy", variant), {
    initialProps: { variant: "b" },
    wrapper,
  })
  hook.rerender({ variant: "c" })
  await client.flush()
  expect(events().map((event) => event.properties.variant)).toEqual(["b", "c"])
})

test("identifyOnce follows user/client lifecycle without duplicate StrictMode capture", async () => {
  const { client, events } = fixture()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StrictMode>
      <KansokuProvider client={client}>{children}</KansokuProvider>
    </StrictMode>
  )
  const hook = renderHook(
    ({ id }: { id: string | undefined }) => useIdentifyOnce(id, { initial_plan: "starter" }),
    { wrapper, initialProps: { id: "same" as string | undefined } },
  )
  hook.rerender({ id: "same" })
  await client.flush()
  expect(events().filter((event) => event.eventName === "identify_once")).toHaveLength(1)
  expect(client.getUserId()).toBe("same")
  client.reset()
  hook.rerender({ id: undefined })
  hook.rerender({ id: "same" })
  await client.flush()
  expect(events().filter((event) => event.eventName === "identify_once")).toHaveLength(2)
})

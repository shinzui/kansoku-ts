import { expect, spyOn, test } from "bun:test"

import {
  cookieStorage,
  localStorageAdapter,
  memoryStorage,
  sessionStorageAdapter,
} from "../src/storage.js"

test("all adapters round-trip and remove values", () => {
  for (const adapter of [
    memoryStorage(),
    localStorageAdapter(),
    sessionStorageAdapter(),
    cookieStorage(),
  ]) {
    adapter.set("storage-test", "hello=world")
    expect(adapter.get("storage-test")).toBe("hello=world")
    adapter.remove("storage-test")
    expect(adapter.get("storage-test")).toBeNull()
  }
})
test("blocked browser storage falls back to memory", () => {
  const spy = spyOn(localStorage, "setItem").mockImplementation(() => {
    throw new Error("blocked")
  })
  try {
    const adapter = localStorageAdapter()
    adapter.set("fallback", "works")
    expect(adapter.get("fallback")).toBe("works")
  } finally {
    spy.mockRestore()
  }
})

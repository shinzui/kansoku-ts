import { expect, test } from "bun:test"

test("browser globals, navigation, and both storage areas work", () => {
  expect(typeof document).toBe("object")
  expect(location.origin).toBe("http://localhost:3000")
  const previous = location.href
  history.pushState({}, "", "/pricing")
  expect(location.pathname).toBe("/pricing")
  history.replaceState({}, "", previous)
  for (const storage of [localStorage, sessionStorage]) {
    storage.setItem("harness-probe", "ok")
    expect(storage.getItem("harness-probe")).toBe("ok")
    storage.removeItem("harness-probe")
  }
})

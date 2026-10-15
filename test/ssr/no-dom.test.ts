import { describe, expect, test } from "bun:test"

describe.skipIf(typeof document !== "undefined")("native environment", () => {
  test("keeps the native fetch without browser globals", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
    expect(globalThis.fetch.toString()).toContain("native code")
  })
})

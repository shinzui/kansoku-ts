import { describe, expect, test } from "bun:test"

describe.skipIf(typeof document !== "undefined")("native environment", () => {
  test("keeps the native fetch without browser globals", () => {
    expect(typeof window).toBe("undefined")
    expect(typeof document).toBe("undefined")
    expect(globalThis.fetch.toString()).toContain("native code")
  })
})

describe.skipIf(typeof document !== "undefined")("optional capture under SSR", () => {
  test("both options install and load nothing without a document", async () => {
    const { createKansoku } = await import("../../packages/kansoku-js/src/index.js")
    const { measurementLoader } = await import("../../packages/kansoku-js/src/vitals-capture.js")
    const original = measurementLoader.load
    let loads = 0
    measurementLoader.load = () => {
      loads++
      throw new Error("SSR must not load measurements")
    }
    try {
      const client = createKansoku({
        baseUrl: "https://analytics.test",
        writeKey: "test",
        storage: "memory",
        persistQueue: false,
        autocapture: { clientErrors: true, webVitals: true },
      })
      client.stop()
      client.start()
      client.page()
      await client.shutdown()
      expect(client.stats.queued).toBe(0)
      expect(loads).toBe(0)
    } finally {
      measurementLoader.load = original
    }
  })
})

import { describe } from "bun:test"

export const baseUrl = process.env.KANSOKU_LIVE_BASE_URL?.replace(/\/+$/, "") ?? ""
export const writeKey = process.env.KANSOKU_LIVE_WRITE_KEY ?? ""
export const serviceToken = process.env.KANSOKU_LIVE_SERVICE_TOKEN
export const live = Boolean(baseUrl && writeKey)
if (live && typeof window !== "undefined")
  throw new Error(
    "Live tests require KANSOKU_TEST_NO_DOM=1; happy-dom must not replace native fetch",
  )
if (!live)
  console.log(
    "live tests skipped: set KANSOKU_LIVE_BASE_URL and KANSOKU_LIVE_WRITE_KEY (and optionally KANSOKU_LIVE_SERVICE_TOKEN) to run them",
  )
export const describeLive = live ? describe : describe.skip

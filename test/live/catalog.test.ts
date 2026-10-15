import { expect, test } from "bun:test"

import catalog from "../../contracts/events.json"
import { baseUrl, describeLive } from "./env.js"

describeLive("live catalog", () => {
  test("GET /v1/schemas equals the pinned catalog", async () => {
    const response = await fetch(`${baseUrl}/v1/schemas`)
    expect(response.status).toBe(200)
    const actual = await response.json()
    if (JSON.stringify(actual) !== JSON.stringify(catalog)) {
      // Object ordering is irrelevant; the final assertion performs a structural comparison.
      console.log(
        "Catalog mismatch? Check contracts/KANSOKU_COMMIT; review just sync-contracts and just generate-schema, or run the pinned server commit.",
      )
    }
    expect(actual).toEqual(catalog)
  })
})

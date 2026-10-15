import { expect, test } from "bun:test"

import {
  validateEvent,
  validateExperimentName,
  validateIdentifiers,
} from "../src/contract/validate.js"
import { buildEvent } from "../src/envelope.js"

const valid = () =>
  buildEvent(
    {
      identity: { anonymousId: "anon" },
      sessionId: "session",
      config: { now: () => 0, schemaVersions: {} },
    },
    "custom",
  )
test("rejects invalid structure and schema version boundaries", () => {
  expect(validateEvent(valid())).toEqual([])
  for (const schemaVersion of [0, 65536, 1.5, NaN])
    expect(validateEvent({ ...valid(), schemaVersion }).length).toBeGreaterThan(0)
  for (const schemaVersion of [1, 65535])
    expect(validateEvent({ ...valid(), schemaVersion })).toEqual([])
  expect(validateEvent({ ...valid(), eventName: "" }).length).toBeGreaterThan(0)
  expect(
    validateEvent({ ...valid(), properties: [] as unknown as Record<string, unknown> }).length,
  ).toBeGreaterThan(0)
})
test("enforces the closed identity vocabulary and printable non-space ASCII", () => {
  expect(
    validateIdentifiers({
      cookie: "abc",
      device: "a".repeat(256),
      fingerprint: "!~",
      email_sha256: "123",
    }),
  ).toEqual([])
  for (const value of [
    { other: "abc" },
    { device: "" },
    { device: "has space" },
    { device: "é" },
    { device: "a".repeat(257) },
    null,
  ])
    expect(validateIdentifiers(value).length).toBeGreaterThan(0)
  expect(validateExperimentName("checkout_copy:b-1")).toBe(true)
  expect(validateExperimentName("Checkout Copy")).toBe(false)
})

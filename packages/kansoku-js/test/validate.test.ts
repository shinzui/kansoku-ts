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
      email_hmac: "v1:opaque",
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

test("governed traits validate exact versions, presence and scalar types while v1 stays identity-only", () => {
  const base = { ...valid(), eventName: "identify", schemaVersion: 2, userId: "user" }
  expect(validateEvent({ ...base, properties: { plan: "", company_size: 0 } })).toEqual([])
  expect(validateEvent({ ...base, properties: { unknown: { arbitrary: true } } })).toEqual([])
  for (const company_size of [null, -1, 1.5, NaN, Infinity, "2"])
    expect(validateEvent({ ...base, properties: { company_size } }).length).toBeGreaterThan(0)
  for (const plan of [null, 2, false, []])
    expect(validateEvent({ ...base, properties: { plan } }).length).toBeGreaterThan(0)
  expect(validateEvent({ ...base, userId: undefined }).length).toBeGreaterThan(0)
  expect(validateEvent({ ...base, schemaVersion: 1, properties: { plan: null } })).toEqual([])
  expect(validateEvent({ ...base, eventName: "identify_once", schemaVersion: 1 })).toEqual([])
  expect(
    validateEvent({ ...base, eventName: "identify_once", schemaVersion: 2 }).length,
  ).toBeGreaterThan(0)
})

import { expect, test } from "bun:test"

import catalog from "../../../contracts/events.json"
import api from "../../../contracts/openapi.json"
import type {
  AnalyticsEvent,
  BatchAck,
  ErrorEnvelopeWire,
  RejectedEvent,
} from "../src/contract/wire.js"

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T]
const requiredKeys: Equal<
  RequiredKeys<AnalyticsEvent>,
  "eventId" | "eventName" | "source" | "occurredAt" | "receivedAt" | "properties" | "context"
> = true
const ackType: Equal<BatchAck, { accepted: number; rejected: RejectedEvent[] }> = true
const retryable: Equal<ErrorEnvelopeWire["retryable"], boolean> = true

test("wire types match the required event and response shapes", () => {
  expect([requiredKeys, ackType, retryable]).toEqual([true, true, true])
  expect(api.components.schemas.AnalyticsEvent.required).toEqual([
    "eventId",
    "eventName",
    "source",
    "occurredAt",
    "receivedAt",
    "properties",
    "context",
  ])
  for (const name of [
    "AnalyticsEvent",
    "BatchAck",
    "RejectedEvent",
    "ErrorEnvelopeWire",
    "SchemaCatalog",
    "EventVersions",
    "VersionedEventSchema",
    "ContractProperty",
    "EventSource",
    "IngestAck",
  ]) {
    expect(api.components.schemas).toHaveProperty(name)
  }
})
test("catalog and source pin carry the governed contract", async () => {
  expect(catalog.catalogVersion).toBe(1)
  expect(catalog.service).toBe("kansoku")
  expect(Object.keys(catalog.events)).toEqual([
    "experiment_viewed",
    "feature_used",
    "identify",
    "page_view",
    "payment_completed",
    "session_start",
    "subscription_started",
    "user_registered",
  ])
  expect(catalog.events.page_view.versions[0]?.properties).toContainEqual(
    expect.objectContaining({ name: "url", required: true, type: "string" }),
  )
  expect(
    await Bun.file(new URL("../../../contracts/KANSOKU_COMMIT", import.meta.url)).text(),
  ).toMatch(/^[0-9a-f]{40}\n$/)
})

import { expect, test } from "bun:test"

import catalog from "../../../contracts/events.json"
import api from "../../../contracts/openapi.json"
import { BUILT_IN_SCHEMA_VERSIONS, IDENTIFIER_KINDS } from "../src/contract/events.js"
import type {
  AnalyticsEvent,
  BatchAck,
  MetricPoint,
  paths,
  ProblemDetails,
  RejectedEvent,
  SchemaCatalog,
} from "../src/contract/wire.js"
import { buildEvent } from "../src/envelope.js"

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T]
const requiredKeys: Equal<
  RequiredKeys<AnalyticsEvent>,
  "eventId" | "eventName" | "source" | "occurredAt" | "receivedAt" | "properties" | "context"
> = true
const ackType: Equal<BatchAck, { accepted: number; rejected: RejectedEvent[] }> = true
const governedCatalog: SchemaCatalog = catalog
const retryable: Equal<ProblemDetails["retryable"], boolean> = true
const nullableGroup: Equal<MetricPoint["group"][string], string | null> = true
const repeatableFilters: Equal<
  paths["/metrics/events"]["get"]["parameters"]["query"]["filter"],
  string[] | undefined
> = true

type AcquisitionQuery = paths["/metrics/acquisition"]["get"]["parameters"]["query"]
const acquisitionMeasure: Equal<AcquisitionQuery["measure"], "sessions" | "users" | undefined> =
  true
const acquisitionBots: Equal<AcquisitionQuery["includeBots"], boolean | undefined> = true
const pageViewBots: Equal<
  paths["/metrics/page-views"]["get"]["parameters"]["query"]["includeBots"],
  boolean | undefined
> = true

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
    "ProblemDetails",
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
test("metric contracts preserve missing groups and repeatable filters", () => {
  expect([nullableGroup, repeatableFilters]).toEqual([true, true])
  const point: MetricPoint = {
    bucket: null,
    group: { source: "web", "prop:plan": null, "prop:empty": "" },
    value: 1,
  }
  expect(JSON.parse(JSON.stringify(point))).toEqual(point)
  expect(api.components.schemas.MetricPoint.properties.group.additionalProperties.type).toEqual([
    "string",
    "null",
  ])
})

test("acquisition and web queries expose explicit bot and population controls", () => {
  expect([acquisitionMeasure, acquisitionBots, pageViewBots]).toEqual([true, true, true])
  const query: AcquisitionQuery = {
    from: "2026-07-01",
    to: "2026-07-03",
    groupBy: "channel,browser_family",
    measure: "users",
    includeBots: true,
    filter: ['{"dimension":"country_code","op":"eq","value":"GB"}'],
  }
  expect(query.measure).toBe("users")
})

test("catalog and source pin carry the governed contract", async () => {
  expect(catalog.catalogVersion).toBe(3)
  expect([...IDENTIFIER_KINDS] as string[]).toEqual(catalog.identifierKinds)
  expect(catalog.service).toBe("kansoku")
  expect(Object.keys(catalog.events)).toEqual([
    "alias",
    "experiment_viewed",
    "feature_used",
    "group",
    "identify",
    "page_leave",
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

test("built-in pinned events satisfy catalog requirements", () => {
  const samples = {
    page_view: { url: "https://example.test" },
    session_start: { sessionId: "session" },
    experiment_viewed: { experiment: "checkout_copy", variant: "b" },
  }
  for (const name of Object.keys(samples) as Array<keyof typeof samples>) {
    const event = buildEvent(
      {
        identity: { anonymousId: "anon" },
        sessionId: "session",
        config: { now: () => 0, schemaVersions: BUILT_IN_SCHEMA_VERSIONS },
      },
      name,
      samples[name],
    )
    const schema = governedCatalog.events[name]!.versions.find(
      (candidate) => candidate.version === event.schemaVersion,
    )!
    expect(schema).toBeDefined()
    for (const property of schema.properties) {
      if (property.required) expect(event.properties).toHaveProperty(property.name)
      expect(String(typeof event.properties[property.name])).toEqual(property.type)
      if (property.pattern)
        expect(String(event.properties[property.name])).toMatch(
          new RegExp(`^(?:${property.pattern})$`),
        )
    }
  }
})

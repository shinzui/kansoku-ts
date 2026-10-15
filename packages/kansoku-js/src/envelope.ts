import type { AnalyticsEvent, JsonObject } from "./contract/wire.js"
import type { IdentifierKind, TrackOptions } from "./types.js"

export interface IdentitySnapshot {
  anonymousId: string
  userId?: string
  organizationId?: string
  identifiers?: Partial<Record<IdentifierKind, string>>
}
export type WebFields = Pick<
  AnalyticsEvent,
  "url" | "referrer" | "utmSource" | "utmMedium" | "utmCampaign" | "utmContent" | "utmTerm"
>
export interface EnvelopeDependencies {
  identity: IdentitySnapshot
  sessionId: string
  config: {
    sourceService?: string
    schemaVersions: Readonly<Record<string, number>>
    now: () => number
  }
  baseContext?: JsonObject
}
export function randomId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join("")}`
  )
}
export function buildEvent(
  deps: EnvelopeDependencies,
  eventName: string,
  properties: JsonObject = {},
  options: TrackOptions = {},
  webFields: WebFields = {},
  ids: { anonymousId?: string; userId?: string } = {},
): AnalyticsEvent {
  const date = new Date(options.occurredAt ?? deps.config.now())
  const occurredAt = Number.isFinite(date.getTime()) ? date.toISOString() : ""
  const schemaVersion = options.schemaVersion ?? deps.config.schemaVersions[eventName]
  return {
    eventId: randomId(),
    eventName,
    source: "web",
    occurredAt,
    receivedAt: occurredAt,
    properties,
    context: { ...deps.baseContext, ...options.context },
    ...deps.identity,
    sessionId: deps.sessionId,
    ...webFields,
    ...(ids.anonymousId === undefined ? {} : { anonymousId: ids.anonymousId }),
    ...(ids.userId === undefined ? {} : { userId: ids.userId }),
    ...(deps.config.sourceService ? { sourceService: deps.config.sourceService } : {}),
    ...(schemaVersion === undefined ? {} : { schemaVersion }),
  }
}

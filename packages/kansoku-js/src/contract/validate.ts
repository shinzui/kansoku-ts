import {
  EXPERIMENT_NAME_PATTERN,
  IDENTIFIER_KINDS,
  MAX_SCHEMA_VERSION,
  MIN_SCHEMA_VERSION,
} from "./events.js"
import type { AnalyticsEvent } from "./wire.js"

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
export function validateIdentifiers(value: unknown): string[] {
  if (!isPlainObject(value)) return ["identifiers must be an object"]
  const errors: string[] = []
  for (const [kind, identifier] of Object.entries(value)) {
    if (!(IDENTIFIER_KINDS as readonly string[]).includes(kind))
      errors.push(`unknown identifier kind: ${kind}`)
    if (typeof identifier !== "string" || !/^[\x21-\x7e]{1,256}$/.test(identifier))
      errors.push(`invalid identifier value: ${kind}`)
  }
  return errors
}
export function validateExperimentName(value: unknown): boolean {
  return typeof value === "string" && EXPERIMENT_NAME_PATTERN.test(value)
}
export function validateEvent(event: AnalyticsEvent): string[] {
  const errors: string[] = []
  if (typeof event.eventId !== "string" || !event.eventId.length)
    errors.push("eventId must not be empty")
  if (typeof event.eventName !== "string" || !event.eventName.length)
    errors.push("eventName must not be empty")
  if (!isPlainObject(event.properties)) errors.push("properties must be an object")
  if (!isPlainObject(event.context)) errors.push("context must be an object")
  if (
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    !Number.isFinite(Date.parse(event.receivedAt))
  )
    errors.push("invalid timestamp")
  if (
    event.schemaVersion !== undefined &&
    (!Number.isInteger(event.schemaVersion) ||
      event.schemaVersion < MIN_SCHEMA_VERSION ||
      event.schemaVersion > MAX_SCHEMA_VERSION)
  )
    errors.push("schemaVersion must be an integer in 1..65535")
  if (event.identifiers !== undefined) errors.push(...validateIdentifiers(event.identifiers))
  try {
    JSON.stringify(event)
  } catch {
    errors.push("event must be serializable JSON")
  }
  return errors
}

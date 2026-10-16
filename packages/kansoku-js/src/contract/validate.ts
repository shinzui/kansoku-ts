import { GOVERNED_TRAIT_VERSIONS, USER_TRAIT_TYPES } from "../generated/trait-schema.js"
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
  errors.push(...validateGovernedTraits(event))
  try {
    JSON.stringify(event)
  } catch {
    errors.push("event must be serializable JSON")
  }
  return errors
}

export function validateGovernedTraits(
  event: Pick<AnalyticsEvent, "eventName" | "schemaVersion" | "userId" | "properties">,
): string[] {
  const errors: string[] = []
  if (event.eventName === "identify" || event.eventName === "identify_once") {
    const version = event.schemaVersion ?? 1
    const governed = GOVERNED_TRAIT_VERSIONS[event.eventName]
    if (version !== governed && !(event.eventName === "identify" && version === 1))
      errors.push("unknown identity schema version")
    if (version === governed) {
      if (typeof event.userId !== "string" || !event.userId.length)
        errors.push("governed trait operations require userId")
      if (isPlainObject(event.properties)) {
        for (const [name, type] of Object.entries(USER_TRAIT_TYPES)) {
          if (!Object.prototype.hasOwnProperty.call(event.properties, name)) continue
          const value = event.properties[name]
          if (value === undefined) continue
          if (
            type === "string"
              ? typeof value !== "string"
              : typeof value !== "number" ||
                !Number.isFinite(value) ||
                !Number.isInteger(value) ||
                value < 0
          )
            errors.push(`invalid governed trait: ${name}`)
        }
      }
    }
  }
  return errors
}

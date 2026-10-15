import { validateEvent } from "./contract/validate.js"
import type { AnalyticsEvent } from "./contract/wire.js"

export const jsonBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength
export function createQueue(capacity: number) {
  let events: AnalyticsEvent[] = []
  return {
    get size() {
      return events.length
    },
    enqueue(event: AnalyticsEvent) {
      if (events.length >= capacity) return false
      events.push(event)
      return true
    },
    peekBatch(maxEvents: number, maxBytes: number) {
      const batch: AnalyticsEvent[] = []
      for (const event of events.slice(0, maxEvents)) {
        if (batch.length && jsonBytes([...batch, event]) > maxBytes) break
        batch.push(event)
      }
      return batch
    },
    remove(ids: ReadonlySet<string>) {
      const removed = events.filter((event) => ids.has(event.eventId))
      events = events.filter((event) => !ids.has(event.eventId))
      return removed
    },
    toJSON() {
      return [...events]
    },
    restore(value: unknown) {
      if (!Array.isArray(value)) return
      const ids = new Set(events.map((e) => e.eventId))
      for (const event of value) {
        if (
          event &&
          typeof event === "object" &&
          validateEvent(event).length === 0 &&
          !ids.has(event.eventId) &&
          events.length < capacity
        ) {
          events.push(event)
          ids.add(event.eventId)
        }
      }
    },
  }
}

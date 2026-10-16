import type { AnalyticsEvent } from "./contract/wire.js"
import { classifyResponse } from "./retry.js"
import type { DeliveryOutcome } from "./retry.js"
import type { ResolvedKansokuOptions } from "./types.js"

// A transport copy gets a fresh clock stamp; queued producer data stays immutable.
export function serializeBatch(
  config: ResolvedKansokuOptions,
  events: AnalyticsEvent[],
  beacon = false,
): string {
  const sentAt = new Date(config.now()).toISOString()
  const batch = events.map((event) => ({ ...event, sentAt }))
  return JSON.stringify(beacon ? { writeKey: config.writeKey, batch } : batch)
}

// Every client instance in this document shares the same conservative allowance.
// Beacon offers no completion callback, so its reservation lives for the document.
const exitBudgets = new WeakMap<Document, { bytes: number }>()
export function exitBudget(): { bytes: number } {
  if (typeof document === "undefined") return { bytes: 61440 }
  let budget = exitBudgets.get(document)
  if (!budget) {
    budget = { bytes: 0 }
    exitBudgets.set(document, budget)
  }
  return budget
}

export async function sendBatch(
  config: ResolvedKansokuOptions,
  events: AnalyticsEvent[],
  { keepalive = false, serialized }: { keepalive?: boolean; serialized?: string } = {},
): Promise<DeliveryOutcome> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const request = async (): Promise<DeliveryOutcome> => {
    try {
      const response = await config.fetch(`${config.baseUrl}/v1/batch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": config.writeKey,
        },
        body: serialized ?? serializeBatch(config, events),
        keepalive,
        ...(!keepalive ? { signal: controller.signal } : {}),
      })
      return await classifyResponse(response, events.length)
    } catch (error) {
      return { kind: "retryable", detail: String(error) }
    }
  }
  try {
    if (keepalive) return await request()
    return await Promise.race([
      request(),
      new Promise<DeliveryOutcome>((resolve) => {
        timeout = config.timers.setTimeout(() => {
          controller.abort()
          resolve({ kind: "retryable", detail: "request timeout" })
        }, config.requestTimeoutMs)
      }),
    ])
  } finally {
    if (timeout !== undefined) config.timers.clearTimeout(timeout)
  }
}

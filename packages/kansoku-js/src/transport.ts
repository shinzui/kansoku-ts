import type { AnalyticsEvent } from "./contract/wire.js"
import { classifyResponse } from "./retry.js"
import type { DeliveryOutcome } from "./retry.js"
import type { ResolvedKansokuOptions } from "./types.js"

export async function sendBatch(
  config: ResolvedKansokuOptions,
  events: AnalyticsEvent[],
  { keepalive = false } = {},
): Promise<DeliveryOutcome> {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const request = async (): Promise<DeliveryOutcome> => {
    try {
      const response = await config.fetch(`${config.baseUrl}/v1/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": config.writeKey },
        body: JSON.stringify(events),
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

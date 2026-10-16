import type { BatchAck, ProblemDetails } from "./contract/wire.js"
export type DeliveryOutcome =
  | { kind: "accepted"; ack: BatchAck }
  | { kind: "permanent"; status: number; envelope?: ProblemDetails }
  | { kind: "too_large" }
  | { kind: "retryable"; detail?: string; retryAfterMs?: number }
export function backoffDelayMs(
  attempt: number,
  baseMs: number,
  random: () => number = Math.random,
): number {
  return random() * Math.min(30000, baseMs * 2 ** attempt)
}
export async function classifyResponse(
  response: Response,
  count: number,
): Promise<DeliveryOutcome> {
  if (response.status === 429) {
    const value = response.headers.get("Retry-After")
    const seconds = value && /^[0-9]+$/.test(value) ? Number(value) : NaN
    return {
      kind: "retryable",
      detail: "HTTP 429",
      ...(Number.isSafeInteger(seconds) && seconds > 0 ? { retryAfterMs: seconds * 1000 } : {}),
    }
  }
  if (response.status === 413)
    return count > 1 ? { kind: "too_large" } : { kind: "permanent", status: 413 }
  if ([400, 401, 403, 404].includes(response.status))
    return { kind: "permanent", status: response.status }
  try {
    const body = await response.json()
    if (
      response.status === 202 &&
      body &&
      Number.isInteger(body.accepted) &&
      body.accepted >= 0 &&
      Array.isArray(body.rejected)
    ) {
      const indices = new Set<number>()
      for (const rejection of body.rejected) {
        if (
          !rejection ||
          !Number.isInteger(rejection.index) ||
          rejection.index < 0 ||
          rejection.index >= count ||
          indices.has(rejection.index) ||
          !Array.isArray(rejection.errors) ||
          rejection.errors.some((error: unknown) => typeof error !== "string")
        )
          return { kind: "retryable", detail: "malformed acknowledgement" }
        indices.add(rejection.index)
      }
      if (body.accepted + indices.size === count) return { kind: "accepted", ack: body }
    }
    if (response.status === 503 && body?.retryable === false)
      return { kind: "permanent", status: 503, envelope: body }
  } catch {
    /* Unknown outcomes are safe to retry with the same event IDs. */
  }
  return { kind: "retryable", detail: `HTTP ${response.status}` }
}

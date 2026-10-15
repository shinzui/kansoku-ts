import type { BatchAck, RejectedEvent } from "../../packages/kansoku-js/src/contract/wire.js"

export interface RecordedRequest {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
  keepalive: boolean
}
export type ScriptedResponse = () => Promise<Response>
export interface FetchMock {
  fetch: typeof globalThis.fetch
  requests: RecordedRequest[]
  respondWith(...responses: ScriptedResponse[]): void
}

export function ack(accepted: number, rejected: RejectedEvent[] = []): ScriptedResponse {
  const body: BatchAck = { accepted, rejected }
  return async () => Response.json(body, { status: 202 })
}
export function envelope(
  statusCode: 400 | 404 | 413 | 503,
  code: string,
  retryable: boolean,
  message = code,
): ScriptedResponse {
  return async () => Response.json({ code, retryable, message }, { status: statusCode })
}
export function status(code: number): ScriptedResponse {
  return async () => new Response(null, { status: code })
}
export function networkError(message = "network error"): ScriptedResponse {
  return async () => {
    throw new TypeError(message)
  }
}
export function hang(): ScriptedResponse {
  return () => new Promise<Response>(() => {})
}
export function createFetchMock(): FetchMock {
  const requests: RecordedRequest[] = []
  const responses: ScriptedResponse[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined
    const raw = init?.body ?? (request ? await request.clone().text() : null)
    let body: unknown = raw
    if (typeof raw === "string") {
      try {
        body = JSON.parse(raw)
      } catch {
        /* non-JSON requests are recorded verbatim */
      }
    }
    requests.push({
      url: request?.url ?? String(input),
      method: init?.method ?? request?.method ?? "GET",
      headers: Object.fromEntries(
        Array.from(new Headers(init?.headers ?? request?.headers), ([key, value]) => [
          key.toLowerCase(),
          value,
        ]),
      ),
      body,
      keepalive: init?.keepalive ?? request?.keepalive ?? false,
    })
    return (responses.shift() ?? ack(Array.isArray(body) ? body.length : 1))()
  }) as typeof globalThis.fetch
  return { fetch, requests, respondWith: (...next) => responses.push(...next) }
}

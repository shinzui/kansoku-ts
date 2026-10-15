import { createKansoku } from "../../packages/kansoku-js/src/index.js"
import type {
  AnalyticsEvent,
  DropInfo,
  KansokuOptions,
} from "../../packages/kansoku-js/src/types.js"
import { baseUrl, writeKey } from "./env.js"

export function liveClient(options: Partial<KansokuOptions> = {}) {
  const requests: Array<{ body: AnalyticsEvent[]; status: number; response: unknown }> = []
  const drops: DropInfo[] = []
  const client = createKansoku({
    baseUrl,
    writeKey,
    autoStart: false,
    storage: "memory",
    persistQueue: false,
    autocapture: { pageViews: false, sessions: false },
    maxRetries: 0,
    now: () => Date.now() - 1000,
    onDrop: (info) => drops.push(info),
    // page() requires a DOM. Match its top-level URL when exercising the same
    // governed event through track() in the native live-test process.
    beforeSend: (event) =>
      event.eventName === "page_view" && typeof event.properties.url === "string"
        ? { ...event, url: event.properties.url }
        : event,
    fetch: (async (input, init) => {
      const response = await fetch(input, init)
      let body: unknown
      try {
        body = await response.clone().json()
      } catch {
        body = null
      }
      requests.push({
        body: JSON.parse(String(init?.body)),
        status: response.status,
        response: body,
      })
      return response
    }) as typeof fetch,
    ...options,
  })
  return { client, requests, drops }
}
export function pageProperties(path: string) {
  return { url: `https://live.test${path}`, path }
}

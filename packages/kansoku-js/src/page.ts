import { readAttribution } from "./attribution.js"
import type { InternalClient } from "./client.js"
import type { JsonObject, TrackOptions } from "./types.js"

export function buildPageView(
  client: InternalClient,
  properties?: JsonObject,
  options?: TrackOptions,
) {
  const attribution = readAttribution(location, document.referrer)
  return client.buildEvent(
    "page_view",
    { url: location.href, path: location.pathname, title: document.title, ...properties },
    options,
    attribution,
  )
}

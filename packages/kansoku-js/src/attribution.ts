import type { WebFields } from "./envelope.js"

export function readAttribution(
  loc: { href: string; search: string },
  referrer: string,
): WebFields {
  const result: WebFields = { url: loc.href, ...(referrer ? { referrer } : {}) }
  const params = new URLSearchParams(loc.search)
  for (const [query, field] of [
    ["utm_source", "utmSource"],
    ["utm_medium", "utmMedium"],
    ["utm_campaign", "utmCampaign"],
    ["utm_content", "utmContent"],
    ["utm_term", "utmTerm"],
  ] as const) {
    const value = params.get(query)
    if (value) result[field] = value
  }
  return result
}

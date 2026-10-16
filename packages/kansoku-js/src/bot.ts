// Handwritten synthetic matcher v1; no third-party rule database.
// It is an input hint; the server independently classifies its actual request UA.
export function isBot(userAgent: string): boolean {
  return /bot\b|crawler|spider|headlesschrome|facebookexternalhit|bingpreview|curl\/|wget\/|python-requests|go-http-client/i.test(
    userAgent.slice(0, 2048),
  )
}

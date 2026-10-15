import type { JsonObject } from "./contract/wire.js"

export function collectContext(version: string): JsonObject {
  const context: JsonObject = { library: { name: "kansoku-js", version } }
  try {
    if (typeof navigator !== "undefined") context.locale = navigator.language
  } catch {
    /* Optional browser context. */
  }
  try {
    context.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    /* Optional browser context. */
  }
  try {
    if (typeof screen !== "undefined")
      context.screen = { width: screen.width, height: screen.height }
  } catch {
    /* Optional browser context. */
  }
  try {
    if (typeof window !== "undefined")
      context.viewport = { width: window.innerWidth, height: window.innerHeight }
  } catch {
    /* Optional browser context. */
  }
  try {
    if (typeof navigator !== "undefined") context.userAgent = navigator.userAgent
  } catch {
    /* Optional browser context. */
  }
  return context
}
export function isDoNotTrackEnabled(): boolean {
  try {
    const nav =
      typeof navigator === "undefined"
        ? undefined
        : (navigator as Navigator & { msDoNotTrack?: string })
    const win =
      typeof window === "undefined" ? undefined : (window as Window & { doNotTrack?: string })
    return nav?.doNotTrack === "1" || nav?.msDoNotTrack === "1" || win?.doNotTrack === "1"
  } catch {
    return false
  }
}
export function isGlobalPrivacyControlEnabled(): boolean {
  try {
    return (
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
    )
  } catch {
    return false
  }
}

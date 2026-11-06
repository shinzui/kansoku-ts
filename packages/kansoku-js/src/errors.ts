import type { InternalClient } from "./client.js"
import type { AnalyticsEvent, JsonObject } from "./types.js"

function truncate(value: string, limit: number) {
  let result = ""
  for (const point of value) {
    if (!limit--) break
    result += point
  }
  return result
}

// Only scan a bounded prefix; never stringify rejected values or read their stack.
export function errorProperties(
  value: unknown,
  rejection = false,
  crossOrigin = false,
): JsonObject {
  let type = rejection ? "UnhandledRejection" : "Error"
  let message = rejection
    ? "Non-error promise rejection"
    : crossOrigin
      ? "Script error."
      : "Uncaught error"
  try {
    if (value && typeof value === "object") {
      const { name, message: label } = value as { name?: unknown; message?: unknown }
      if (typeof name === "string" && typeof label === "string") {
        if (name.length <= 128 && /^[A-Za-z][A-Za-z0-9_.]*$/.test(name)) type = name
        const prefix = label.slice(0, 1024).split(/[\r\n]/, 1)[0]!
        message =
          truncate(
            prefix
              .replace(/\b(?:[a-z][a-z0-9+.-]{0,31}:\/\/|www\.)[^\s]+/gi, "<url>")
              .replace(/[^\s@]+@[^\s@]+/g, "<email>")
              .replace(/\b[0-9a-f]{16,}\b/gi, "<id>")
              .replace(/\d{6,}/g, "<number>")
              .replace(/\s+/g, " ")
              .trim(),
            256,
          ) || "Uncaught error"
        // A prefix slice can end on half an astral character.
        message = message.replace(/[\uD800-\uDBFF]$/, "") || "Uncaught error"
      }
    }
  } catch {
    /* Hostile getters and proxies get fixed labels. */
  }
  return { message, type, handled: false }
}

export function createErrorCapture(
  core: InternalClient,
  snapshot: () => AnalyticsEvent | undefined,
  copy: (original: AnalyticsEvent, name: string, properties: JsonObject) => AnalyticsEvent,
) {
  const seen = new WeakSet<object>()
  const labels = new Map<string, number>()
  let times: number[] = []
  let count = 0
  let running = false
  core.onStart(() => {
    if (typeof window === "undefined") return
    const report = (event: Event) => {
      if (running || count >= 10) return
      running = true
      try {
        const now = core.config.now()
        times = times.filter((time) => now - time < 60000)
        if (times.length >= 30) return
        const rejection = event.type === "unhandledrejection"
        if (!rejection && !(event instanceof ErrorEvent)) return
        const value: unknown = rejection
          ? (event as PromiseRejectionEvent).reason
          : (event as ErrorEvent).error
        if (value && typeof value === "object" && seen.has(value)) return
        for (const [key, time] of labels) if (now - time >= 1000) labels.delete(key)
        if (core.isSuppressed()) return
        const properties = errorProperties(
          value,
          rejection,
          (event as ErrorEvent).message === "Script error.",
        )
        const key = `${properties.type}:${properties.message}`
        if (labels.has(key)) return
        if (value && typeof value === "object") seen.add(value)
        labels.set(key, now)
        count++
        times.push(now)
        const original = snapshot()
        core.enqueueBuilt(
          original
            ? copy(original, "client_error", properties)
            : core.buildEvent("client_error", properties, undefined, { url: location.href }),
        )
      } catch {
        /* Capture must never escape into the application's failure path. */
      } finally {
        running = false
      }
    }
    window.addEventListener("error", report)
    window.addEventListener("unhandledrejection", report)
    return () => {
      window.removeEventListener("error", report)
      window.removeEventListener("unhandledrejection", report)
    }
  })
  return () => {
    count = 0
  }
}
